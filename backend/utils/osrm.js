/**
 * @returns {Promise<Array<{lat:number,lng:number}>|null>}
 */
export async function fetchDrivingRoute(start, end) {
  if (
    start?.lat == null ||
    end?.lat == null ||
    typeof start.lng !== 'number' ||
    typeof end.lng !== 'number'
  ) {
    return null;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(to);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      return null;
    }
    const coords = data.routes[0].geometry.coordinates;
    return coords.map(([lng, lat]) => ({
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
    }));
  } catch {
    return null;
  }
}

/** Straight-line densified fallback when OSRM fails */
export function interpolateStraightLine(start, end, steps = 24) {
  const a = { lat: start.lat, lng: start.lng };
  const b = { lat: end.lat, lng: end.lng };
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({
      lat: Math.round((a.lat + (b.lat - a.lat) * t) * 1e6) / 1e6,
      lng: Math.round((a.lng + (b.lng - a.lng) * t) * 1e6) / 1e6,
    });
  }
  return out;
}
