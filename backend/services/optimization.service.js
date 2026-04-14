import Delivery from '../models/Delivery.js';
import User from '../models/User.js';
import { findOptimalRoute } from '../utils/pathfinder.js';
import { buildWaypoints, buildOptimizedRoute, reRouteWithOpenRoute } from './route.service.js';
import { io } from '../sockets/index.js';
import { config } from '../config/env.js';
import redis from '../config/redis.js';
import { sendRiskAlertEmail } from './email.service.js';
import { persistSocketEvent } from './socketsDb.service.js';

async function acquireRerouteCooldown(deliveryId) {
  const id = String(deliveryId);
  const key = `cooldown:reroute:${id}`;
  const ttlSeconds = 15 * 60;
  try {
    // SET key value NX EX ttl
    const ok = await redis.set(key, String(Date.now()), 'NX', 'EX', ttlSeconds);
    return ok === 'OK';
  } catch {
    // If Redis is unavailable, fail open (still allow reroute) rather than deadlock.
    return true;
  }
}

async function setShortRerouteCooldown(deliveryId) {
  try {
    const id = String(deliveryId);
    const key = `cooldown:reroute:${id}`;
    // 1-minute cooldown if no distinct route found
    await redis.set(key, String(Date.now()), 'EX', 60);
  } catch {
    // ignore
  }
}

/**
 * Initial route after POST /deliveries — no ML required; optional cache warm.
 */
export async function computeInitialRoute(delivery) {
  const waypoints = await buildWaypoints(delivery.origin, delivery.destinations);
  const route = await buildOptimizedRoute(waypoints, []);
  return route;
}

/**
 * When risk is high: recompute path with obstacles, persist, notify clients.
 */
export async function optimizeAndReRoute(deliveryId, obstacles = []) {
  const allowed = await acquireRerouteCooldown(deliveryId);
  if (!allowed) {
    // Silenced cooldown log to prevent terminal spam
    return { reRouted: false, reason: 'cooldown' };
  }

  const doc = await Delivery.findById(deliveryId);
  const key = `sim:${deliveryId}:state`;
  const cachedStr = await redis.get(key);
  if (!doc && !cachedStr) return { reRouted: false };
  const state = cachedStr ? JSON.parse(cachedStr) : doc.toObject();
  const deliveryIdStr = String(state?._id || doc?._id || deliveryId);
  const truckId = state?.truckId || doc?.truckId;

  const obs = [...new Set([...(state.activeObstacles || []), ...obstacles])];
  const waypoints = await buildWaypoints(state.origin, state.destinations);
  const start = state.currentLocation?.lat != null ? state.currentLocation : waypoints[0];
  const end = waypoints[waypoints.length - 1];

  // Try OpenRoute API for re-routing first
  const openRouteResult = await reRouteWithOpenRoute(start, end, obs);

  let merged;
  let reRouted = false;

  if (openRouteResult && openRouteResult.optimizedRoute) {
    // We only take the new path from the current location onwards!
    merged = [];
    for (const p of openRouteResult.optimizedRoute) {
      const last = merged[merged.length - 1];
      if (last && last.lat === p.lat && last.lng === p.lng) continue;
      merged.push(p);
    }
    reRouted = true;

    console.log(`🚀 OpenRoute re-routing successful for delivery ${deliveryId}`);
  } else {
    // Fallback to original pathfinder logic but explicitly enforce origin cut block!
    const newTail = await findOptimalRoute(start, end, obs);
    merged = [];
    for (const p of newTail) {
      const last = merged[merged.length - 1];
      if (last && last.lat === p.lat && last.lng === p.lng) continue;
      merged.push(p);
    }
    reRouted = true;

    console.log(`🔄 Fallback re-routing for delivery ${deliveryId}`);
  }

  if (reRouted && state.optimizedRoute) {
    const rp = Math.max(0, state.routeProgressIndex ?? 0);
    const existingRemPoints = state.optimizedRoute.slice(rp);
    const newRemPoints = merged;
    let isDifferent = false;
    
    // Compare waypoints
    for (let i = 5; i < Math.min(existingRemPoints.length, newRemPoints.length); i += 5) {
      const p1 = existingRemPoints[i];
      const p2 = newRemPoints[i];
      const distSq = Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2);
      if (distSq > Math.pow(0.005, 2)) {
        isDifferent = true;
        break;
      }
    }
    
    if (!isDifferent) {
      console.log('🔄 Re-route exactly matches original route. Discarding.');
      reRouted = false;
    }
  }

  if (!reRouted) {
    io.emit('route-updated', {
      deliveryId: deliveryIdStr,
      truckId,
      optimizedRoute: state.optimizedRoute,
      originalRoute: state.originalRoute,
      reRouted: false,
      alert: "No re-route found. Trying again soon.",
      timestamp: new Date().toISOString()
    });
    await setShortRerouteCooldown(deliveryId);
    return { reRouted: false, reason: 'no_distinct_route' };
  }

  if (reRouted) {
    const key = `sim:${deliveryId}:state`;
    const cached = await redis.get(key);
    let state = cached ? JSON.parse(cached) : doc.toObject();

    if (!state.originalRoute || state.originalRoute.length === 0) {
      state.originalRoute = state.optimizedRoute;
    }

    // Stage the candidate route instead of instantly overwriting!
    const lookahead = 0;
    state.rerouteRoute = merged;
    state.rerouteSwitchIndex = (state.routeProgressIndex ?? 0) + lookahead;
    state.rerouteIsCut = true; // Signal simulation tick to reset tracking index

    state.activeObstacles = obs;
    state.lastReroutedAt = new Date();

    await redis.setex(key, 60 * 60, JSON.stringify(state));

    io.emit('route-updated', {
      deliveryId: deliveryIdStr,
      truckId,
      optimizedRoute: state.optimizedRoute,
      originalRoute: state.originalRoute,
      rerouteRoute: state.rerouteRoute,
      rerouteSwitchIndex: state.rerouteSwitchIndex,
      obstacles: obs,
      reRouted: true,
      alert: "Heavy traffic detected. Stage alternate route.",
      timestamp: new Date().toISOString()
    });
    persistSocketEvent('route-updated', {
      deliveryId: deliveryIdStr,
      truckId,
      optimizedRoute: state.optimizedRoute,
      originalRoute: state.originalRoute,
      obstacles: obs,
      reRouted: reRouted,
      timestamp: new Date().toISOString(),
    });
  }

  return { reRouted, rerouteRoute: merged, obstacles: obs };
}

/**
 * Background check: if ML says risk above threshold, mark at-risk and re-route.
 */
export async function handleRiskFromPrediction(deliveryId, prediction) {
  const threshold = Number(config.riskScoreThreshold) || 70;
  const highRisk = prediction.risk_score >= threshold;
  console.log(`[AI-Risk] ID:${deliveryId} Risk:${prediction.risk_score}% Threshold:${threshold}%`);

  if (!highRisk) {
    await Delivery.updateOne(
      { _id: deliveryId, status: { $in: ['at-risk', 'delayed'] } },
      { $set: { status: 'in-transit' } }
    );
    return { alerted: false };
  }

  const status = prediction.risk_score >= 90 ? 'delayed' : 'at-risk';
  const updated = await Delivery.findOneAndUpdate(
    { _id: deliveryId },
    {
      $set: {
        status,
        riskScore: prediction.risk_score,
        delayPrediction: {
          probability: prediction.delay_probability,
          minutes: prediction.expected_delay_minutes,
        },
      },
    },
    { returnDocument: 'after' }
  );

  const lockKey = `cooldown:alert:${deliveryId}`;
  const recentlyAlerted = await redis.get(lockKey);

  if (!recentlyAlerted) {
    io.emit('delay-alert', {
      deliveryId: deliveryId.toString(),
      truckId: updated?.truckId,
      risk: prediction,
      message: `🚨 AI Risk Alert (${prediction.risk_score}%) — Initiating smart re-routing`,
    });
    persistSocketEvent('delay-alert', {
      deliveryId: deliveryId.toString(),
      truckId: updated?.truckId,
      risk: prediction,
      message: `🚨 AI Risk Alert (${prediction.risk_score}%) — Initiating smart re-routing`,
    });
    await redis.setex(lockKey, 60, '1'); // Suppress identical UI alerts for 1 minute
  }

  // console.log(`[Optimization] Triggering intelligent re-route for ${deliveryId}`);
  const rerouteInfo = await optimizeAndReRoute(deliveryId, ['ai-predicted-congestion', 'delay-signal', 'traffic-avoidance']);

  // Email alert: Only send if we actually performed a real re-route calculation
  if (rerouteInfo && rerouteInfo.reRouted) {
    (async () => {
      try {
        const doc = await Delivery.findById(deliveryId).populate('createdBy', 'email username').lean();
        const managerEmail = doc?.createdBy?.email;
        if (managerEmail) {
          const deliveryState = {
            ...doc,
            ...(updated?.toObject?.() || {}),
            currentLocation: updated?.currentLocation || doc?.currentLocation,
          };
          await sendRiskAlertEmail(deliveryState, prediction, managerEmail, rerouteInfo);
        }
      } catch (emailErr) {
        console.error('[Email] Alert resolution failed:', emailErr.message);
      }
    })();
  }

  return { alerted: true };
}
