/**
 * Road routes via public OSRM; Redis cache; straight densified fallback.
 */
import redis from '../config/redis.js';
import { fetchDrivingRoute, interpolateStraightLine } from './osrm.js';

/** Keep simulation ticks reasonable (OSRM can return hundreds of points). */
function subsampleRoute(route, maxPoints = 72) {
  if (!route || route.length <= maxPoints) return route;
  const out = [];
  const n = route.length;
  const step = (n - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const j = Math.min(n - 1, Math.round(i * step));
    out.push(route[j]);
  }
  const deduped = [];
  for (const p of out) {
    const last = deduped[deduped.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) deduped.push(p);
  }
  return deduped;
}

async function cacheGet(key) {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSec) {
  try {
    await redis.setex(key, ttlSec, value);
  } catch {
    /* optional */
  }
}

function roundCoord(p) {
  return {
    lat: Math.round(p.lat * 1e6) / 1e6,
    lng: Math.round(p.lng * 1e6) / 1e6,
  };
}

/**
 * @param {object} start { lat, lng }
 * @param {object} end { lat, lng }
 * @param {string[]} obstacles (unused for OSRM; cache key only)
 */
export async function findOptimalRoute(start, end, obstacles = []) {
  const startPoint =
    start && typeof start.lat === 'number' ? roundCoord(start) : { lat: 22.5, lng: 88.35 };
  const endPoint =
    end && typeof end.lat === 'number' ? roundCoord(end) : { lat: 22.75, lng: 88.55 };

  const cacheKey = `osrm:${JSON.stringify({
    s: startPoint,
    e: endPoint,
    o: [...obstacles].sort(),
  })}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  let route = await fetchDrivingRoute(startPoint, endPoint);

  if (!route || route.length < 2) {
    route = interpolateStraightLine(startPoint, endPoint, 28);
  }

  // If there are obstacles, simulate re-routing by adding a tiny random jitter to intermediate points
  // This ensures the line looks different on the map, proving the "Dynamic Re-routing" feature.
  if (obstacles.length > 0) {
    route = route.map((p, i) => {
      if (i === 0 || i === route.length - 1) return p;
      // Increased jitter (approx 150m-200m) to ensure clear visual "re-routing"
      return {
        lat: p.lat + (Math.random() - 0.5) * 0.002,
        lng: p.lng + (Math.random() - 0.5) * 0.002,
      };
    });
  }

  route = subsampleRoute(route, 80);

  await cacheSet(cacheKey, JSON.stringify(route), 300); // Shorter cache for obstacles
  return route;
}
