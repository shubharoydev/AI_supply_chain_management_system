import { remainingRouteKm } from '../utils/geo.js';

/**
 * Build ML input aligned with the FastAPI /predict schema.
 * IMPORTANT: This function must be side-effect free (no external API calls).
 * Provide route-level traffic/weather from the simulation loop (cached).
 */
export async function buildMlPayload(delivery, routeProgressIndex, simulatedTraffic, weatherStress) {
  const route = delivery.optimizedRoute || [];
  const idx = Math.min(routeProgressIndex, Math.max(0, route.length - 1));
  const remKm = remainingRouteKm(route, idx);
  
  // Divide by 2.0 to bring long-haul distances into the model's 10-60min 'sweet spot'.
  const distanceMinutes = Math.max(5, Math.min(65, ((remKm / 85) * 60) / 2.0));
  const weather = weatherStress;
  const traffic = simulatedTraffic;

  const historical =
    typeof delivery.delayPrediction?.historicalBaseline === 'number'
      ? delivery.delayPrediction.historicalBaseline
      : Number(delivery.historicalDelayBaseline) || 35;

  return {
    distance: Math.round(distanceMinutes * 10) / 10,
    traffic: Math.max(0, Math.min(100, traffic)),
    weather: Math.max(0, Math.min(100, weather)),
    historical_delay: Math.round(historical * 10) / 10,
  };
}

/** Seeded pseudo-random traffic 0–100 for simulation (fallback when live API unavailable) */
export function trafficForTick(truckId, tick) {
  let h = 0;
  const s = `${truckId}|${tick}`;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h % 101);
}

/** Hour-of-day congestion / weather stress proxy (fallback when live API unavailable) */
export function weatherStressFromClock(date = new Date()) {
  const hour = date.getHours();
  const lunch = Math.exp(-0.5 * ((hour - 12) / 2.5) ** 2);
  const dinner = Math.exp(-0.5 * ((hour - 19) / 2.2) ** 2);
  return Math.min(100, 38 * lunch + 48 * dinner + 8);
}

/**
 * Get live weather risk factor for current location
 */
export async function getLiveWeatherRiskFactor(location) {
  try {
    const weatherData = await weatherService.getCurrentWeather(location.lat, location.lng);
    return weatherService.getWeatherRiskFactor(weatherData);
  } catch (error) {
    console.error('Failed to get live weather risk:', error);
    return weatherStressFromClock();
  }
}

/**
 * Get live traffic risk factor for current route segment
 */
export async function getLiveTrafficRiskFactor(currentLocation, nextLocation) {
  try {
    const trafficData = await trafficService.getTrafficData(currentLocation, nextLocation);
    return trafficService.getTrafficRiskFactor(trafficData);
  } catch (error) {
    console.error('Failed to get live traffic risk:', error);
    return 30; // Default moderate traffic
  }
}
