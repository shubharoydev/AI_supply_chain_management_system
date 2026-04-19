import Delivery from '../models/Delivery.js';
import { io } from '../sockets/index.js';
import { predictDelay } from './ml.service.js';
import { config } from '../config/env.js';
import redis from '../config/redis.js';
import {
  buildMlPayload,
  trafficForTick,
  weatherStressFromClock,
} from './mlFeatures.service.js';
import { handleRiskFromPrediction } from './optimization.service.js';
import { detectAndPreventCascade } from './cascading.service.js';
import { weatherService } from './weather.service.js';
import { trafficService } from './traffic.service.js';
import { remainingRouteKm } from '../utils/geo.js';
import {
  clampExtraDelayMinutes,
  computeEtaFromRemaining,
  computeRiskBreakdown,
  baselineTravelMinutes,
} from '../utils/logisticsMetrics.js';
import { persistSocketEvent } from './socketsDb.service.js';

const timers = new Map();

export function isSimulationRunning(deliveryId) {
  return timers.has(String(deliveryId));
}

export function stopSimulation(deliveryId) {
  const id = String(deliveryId);
  const t = timers.get(id);
  if (t) clearInterval(t);
  timers.delete(id);
  // Optionally clear redis state
  redis.del(`sim:${id}:state`).catch(() => {});
}

export function startSimulationLoop(deliveryId) {
  const id = String(deliveryId);
  if (timers.has(id)) return;

  const interval = setInterval(() => {
    tick(id).catch((err) => console.error('Simulation tick error:', err));
  }, config.simulationIntervalMs);

  timers.set(id, interval);
}

async function getSimulationState(deliveryId) {
  const key = `sim:${deliveryId}:state`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) return null;

  const state = delivery.toObject();
  await redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(state));
  return state;
}

async function tick(deliveryId) {
  let state = await getSimulationState(deliveryId);
  if (!state || state.status === 'delivered') {
    stopSimulation(deliveryId);
    return;
  }

  if (state.status === 'pending') return;

  let route = state.optimizedRoute || [];
  if (!route.length) {
    stopSimulation(deliveryId);
    return;
  }

  let idx = (state.routeProgressIndex ?? 0) + 1;
  idx = Math.min(idx, Math.max(0, route.length - 1));

  // If a reroute has been staged, switch only when we reach a safe point.
  // This avoids the marker "teleporting" and matches the simulation requirement:
  // show reroute in grey first, then switch when the truck gets a chance.
  // IMPORTANT: Only switch if rerouteIsApplied is not already true (prevent repeated application)
  if (Array.isArray(state.rerouteRoute) && state.rerouteRoute.length > 1 && !state.rerouteIsApplied) {
    const switchAt = Number.isFinite(state.rerouteSwitchIndex) ? state.rerouteSwitchIndex : idx;
    console.log(`[Reroute Switch] Delivery:${deliveryId} idx:${idx} switchAt:${switchAt} shouldSwitch:${idx >= switchAt} rerouteIsApplied:${state.rerouteIsApplied}`);
    if (idx >= switchAt) {
      console.log(`[Reroute Switch] APPLYING reroute for delivery ${deliveryId} - setting rerouteIsApplied=true`);
      const prevRoute = state.optimizedRoute;
      state.originalRoute = Array.isArray(state.originalRoute) && state.originalRoute.length
        ? state.originalRoute
        : prevRoute;
      state.optimizedRoute = state.rerouteRoute;
      state.rerouteRoute = null;
      state.rerouteSwitchIndex = null;
      state.lastReroutedAt = new Date();
      state.rerouteIsApplied = true; // Mark as applied to prevent any further switches

      route = state.optimizedRoute || [];
      // Don't reset idx - the reroute route already starts from current location
      // Just ensure idx is within bounds of the new route
      idx = Math.min(idx, Math.max(0, route.length - 1));
      state.rerouteIsCut = false;

      io.emit('route-updated', {
        deliveryId: state._id.toString(),
        truckId: state.truckId,
        optimizedRoute: state.optimizedRoute,
        originalRoute: state.originalRoute,
        rerouteRoute: null, // Explicitly send null to clear frontend reroute
        rerouteSwitchIndex: null,
        reRouted: true,
        applied: true,
        timestamp: new Date().toISOString(),
      });
      persistSocketEvent('route-updated', {
        deliveryId: state._id.toString(),
        truckId: state.truckId,
        optimizedRoute: state.optimizedRoute,
        originalRoute: state.originalRoute,
        reRouted: true,
        applied: true,
        timestamp: new Date().toISOString(),
      });

      // CRITICAL: Save state to Redis immediately after applying reroute
      // This ensures rerouteIsApplied flag persists and prevents re-staging
      await redis.setex(`sim:${deliveryId}:state`, 60 * 60, JSON.stringify(state));
    }
  }

  const currentLocation = route[idx];
  const simTick = (state.simulationTick || 0) + 1;

  let t, w;
  
  // Demo mode: force high risk via traffic + weather, without changing real APIs.
  let demoForceHighRisk = false;
  try {
    const per = await redis.get(`demo:delivery:${deliveryId}:force_high_risk`);
    const global = await redis.get('demo:force_high_risk');
    demoForceHighRisk = config.demoForceHighRisk || per === '1' || global === '1';
  } catch {
    demoForceHighRisk = config.demoForceHighRisk;
  }

  const mlCacheKey = `cache:ml_state:${deliveryId}`;
  let cachedMlStateStr = null;
  try {
    cachedMlStateStr = await redis.get(mlCacheKey);
  } catch(err) {}

  let prediction;
  let riskBreakdown;
  let trafficDesc = 'Free Flow';
  let weatherDesc = 'Clear';
  let weatherTemp = 25;

  if (cachedMlStateStr && !demoForceHighRisk) {
    const cachedMlState = JSON.parse(cachedMlStateStr);
    t = cachedMlState.t;
    w = cachedMlState.w;
    prediction = cachedMlState.prediction;
    riskBreakdown = cachedMlState.riskBreakdown || computeRiskBreakdown(t, w, state.historicalDelayBaseline || 10);
    trafficDesc = cachedMlState.trafficDesc || 'Free Flow';
    weatherDesc = cachedMlState.weatherDesc || 'Clear';
    weatherTemp = cachedMlState.weatherTemp || 25;
    state.lastTraffic = t;
    state.lastWeather = w;
  } else {
    // Need to fetch API and call ML (or demo)
    if (demoForceHighRisk) {
      t = Math.max(0, Math.min(100, config.demoTrafficRisk));
      w = Math.max(0, Math.min(100, config.demoWeatherRisk));
    } else {
      const start = route[0];
      const end = route[route.length - 1];

      try {
        const trafficData = await trafficService.getTrafficData(start, end);
        t = trafficService.getTrafficRiskFactor(trafficData);
        trafficDesc = trafficData.trafficCondition;
      } catch {
        t = trafficForTick(state.truckId, simTick);
      }

      try {
        const w1 = await weatherService.getCurrentWeather(start.lat, start.lng);
        const w2 = await weatherService.getCurrentWeather(end.lat, end.lng);
        const r1 = weatherService.getWeatherRiskFactor(w1);
        const r2 = weatherService.getWeatherRiskFactor(w2);
        w = Math.round((r1 + r2) / 2);
        weatherDesc = w1.condition;
        weatherTemp = w1.temperature;
      } catch {
        w = weatherStressFromClock();
      }
    }

    state.lastTraffic = t;
    state.lastWeather = w;

    const payload = await buildMlPayload({ ...state, currentLocation, routeProgressIndex: idx }, idx, t, w);
    payload.deliveryId = String(state._id || deliveryId);
    
    if (demoForceHighRisk) {
      payload.traffic = Math.max(payload.traffic || 0, t);
      payload.weather = Math.max(payload.weather || 0, w);
    }

    try {
      prediction = await predictDelay(payload);
    } catch {
      prediction = { delay_probability: 0.3, expected_delay_minutes: 20, risk_score: 25 };
    }

    if (demoForceHighRisk) {
      prediction = {
        ...prediction,
        risk_score: Math.max(prediction.risk_score || 0, 78),
        delay_probability: Math.max(prediction.delay_probability || 0, 0.82),
        expected_delay_minutes: Math.max(prediction.expected_delay_minutes || 0, 35),
      };
    }

    riskBreakdown = computeRiskBreakdown(payload.traffic, payload.weather, payload.historical_delay);
    
    // Log for user's requested API visibility
    console.log(`[ML Factors] Traffic Factor: ${t}% | Weather Factor: ${w}% | Breakdown -> Traffic: ${riskBreakdown.trafficPct}% Weather: ${riskBreakdown.weatherPct}% Ops/History: ${riskBreakdown.operationsPct}%`);

    // Save to cache for 2 minutes (120 seconds) only if not demo
    if (!demoForceHighRisk) {
      await redis.setex(mlCacheKey, 120, JSON.stringify({ t, w, prediction, riskBreakdown, trafficDesc, weatherDesc, weatherTemp }));
    }
  }

  const remKm = remainingRouteKm(route, idx);
  const extraDelay = clampExtraDelayMinutes(prediction.expected_delay_minutes, remKm);
  prediction = { ...prediction, expected_delay_minutes: extraDelay };

  const highRisk =
    prediction.risk_score >= config.riskScoreThreshold ||
    prediction.delay_probability >= config.delayProbabilityThreshold;

  // Handle high risk logic
  if (highRisk) {
    await handleRiskFromPrediction(deliveryId, prediction);
    if (prediction.risk_score >= config.riskScoreThreshold && !state.cascadeMitigated) {
       // Re-fetch to see if we need cascade
       const fresh = await Delivery.findById(deliveryId);
       if (fresh && !fresh.cascadeMitigated) {
         await Delivery.updateOne({ _id: deliveryId }, { $set: { cascadeMitigated: true } });
         await detectAndPreventCascade(fresh);
       }
    }
    // CRITICAL: optimization.service.js may have just re-routed and written new state to Redis!
    // We must refresh our local state variable before applying updates, otherwise we overwrite the re-route!
    const refreshed = await redis.get(`sim:${deliveryId}:state`);
    if (refreshed) {
      const oldRerouteApplied = state.rerouteIsApplied;
      state = JSON.parse(refreshed);
      console.log(`[Sim] Refreshed state from Redis for ${deliveryId} - rerouteIsApplied: ${oldRerouteApplied} -> ${state.rerouteIsApplied}`);
    }
  } else {
    // Just update at-risk status if needed
    if (state.status === 'at-risk' || state.status === 'delayed') {
       await handleRiskFromPrediction(deliveryId, prediction);
       const refreshedStateRaw = await redis.get(`sim:${deliveryId}:state`);
       if (refreshedStateRaw) Object.assign(state, JSON.parse(refreshedStateRaw));
    }
  }


  // Final Update for this tick
  const updateData = {
    currentLocation,
    routeProgressIndex: idx,
    simulationTick: simTick,
    riskScore: prediction.risk_score,
    delayPrediction: {
      probability: prediction.delay_probability,
      minutes: prediction.expected_delay_minutes,
      historicalBaseline: state.historicalDelayBaseline,
      riskBreakdown,
      trafficDesc,
      weatherDesc,
      weatherTemp,
    },
    ETA: computeEtaFromRemaining(remKm, prediction.expected_delay_minutes),
  };

  const isDelivered = idx >= route.length - 1;
  if (isDelivered) {
    updateData.status = 'delivered';
  }

  // Apply updates to state
  Object.assign(state, updateData);

  // Update Redis cache for next tick (store for 7 days TTL)
  await redis.setex(`sim:${deliveryId}:state`, 7 * 24 * 60 * 60, JSON.stringify(state));

  // IF delivered, update DB
  let dbDoc = state;
  if (isDelivered) {
    dbDoc = await Delivery.findOneAndUpdate(
      { _id: deliveryId },
      { $set: updateData },
      { returnDocument: 'after' }
    );
  }

  // Socket emit completely replaces DB frequent querying
  io.emit('location-update', {
    deliveryId: state._id.toString(),
    truckId: state.truckId,
    currentLocation: state.currentLocation,
    routeProgressIndex: state.routeProgressIndex,
    ETA: state.ETA,
    delayPrediction: state.delayPrediction,
    riskScore: state.riskScore,
    status: state.status,
    optimizedRoute: state.optimizedRoute,
    originalRoute: state.originalRoute,
    rerouteRoute: state.rerouteRoute,
    rerouteSwitchIndex: state.rerouteSwitchIndex,
  });

  // Permanent storage (sqlite) sampling to avoid unbounded growth.
  if (simTick % 10 === 0) {
    persistSocketEvent('location-update', {
      deliveryId: state._id.toString(),
      truckId: state.truckId,
      currentLocation: state.currentLocation,
      routeProgressIndex: state.routeProgressIndex,
      ETA: state.ETA,
      riskScore: state.riskScore,
      status: state.status,
    });
  }

  if (isDelivered) {
    stopSimulation(deliveryId);
    io.emit('delivery-completed', {
      deliveryId: state._id.toString(),
      truckId: state.truckId,
      completedAt: new Date().toISOString(),
    });
  }
}
