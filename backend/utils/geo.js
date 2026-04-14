/**
 * Deterministic pseudo-coordinates from place names (demo geocoding).
 * Keeps the map stable for the same origin/destination strings.
 */
export function stringToCoords(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const lat = 22.4 + (Math.abs(h % 10000) / 10000) * 1.8;
  const lng = 88.2 + (Math.abs((h >> 8) % 10000) / 10000) * 1.6;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Haversine distance in km */
export function haversineKm(a, b) {
  if (!a?.lat || !b?.lat) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Remaining path length (km) along polyline from startIndex to end */
export function remainingRouteKm(route, startIndex) {
  if (!route?.length) return 0;
  let km = 0;
  for (let i = Math.max(0, startIndex); i < route.length - 1; i++) {
    km += haversineKm(route[i], route[i + 1]);
  }
  return km;
}

/** Resamples route so points are consistently spaced (approx stepKm apart), regardless of original density. */
export function densifyRoute(route, stepKm = 0.05) {
  if (!route || route.length < 2) return route;
  
  const normalized = [route[0]];
  let accumulatedDist = 0;
  
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const dist = haversineKm(a, b);
    
    // If points are identically stacked, skip
    if (dist < 0.0001) continue;

    if (accumulatedDist + dist >= stepKm) {
      let remainingToSegment = stepKm - accumulatedDist;
      let walkDist = remainingToSegment;
      
      while (walkDist <= dist) {
        const ratio = walkDist / dist;
        normalized.push({
          lat: a.lat + (b.lat - a.lat) * ratio,
          lng: a.lng + (b.lng - a.lng) * ratio
        });
        walkDist += stepKm;
      }
      accumulatedDist = dist - (walkDist - stepKm);
    } else {
      accumulatedDist += dist;
    }
  }
  normalized.push(route[route.length - 1]);
  return normalized;
}
