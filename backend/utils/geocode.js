import { stringToCoords } from './geo.js';

const KNOWN = [
  { test: (s) => /kolkata/i.test(s), lat: 22.5726, lng: 88.3639 },
  { test: (s) => /siliguri/i.test(s), lat: 26.7271, lng: 88.3953 },
  { test: (s) => /howrah/i.test(s), lat: 22.5958, lng: 88.2636 },
  { test: (s) => /durgapur/i.test(s), lat: 23.5204, lng: 87.3119 },
  { test: (s) => /asansol/i.test(s), lat: 23.6739, lng: 86.9524 },
  { test: (s) => /darjeeling/i.test(s), lat: 27.036, lng: 88.2627 },
  { test: (s) => /guwahati/i.test(s), lat: 26.1445, lng: 91.7362 },
  { test: (s) => /patna/i.test(s), lat: 25.5941, lng: 85.1376 },
  { test: (s) => /\bdelhi\b/i.test(s) || /^new delhi/i.test(s), lat: 28.6139, lng: 77.209 },
  { test: (s) => /mumbai/i.test(s), lat: 19.076, lng: 72.8777 },
  { test: (s) => /bangalore|bengaluru/i.test(s), lat: 12.9716, lng: 77.5946 },
];

const nominatimCache = new Map();
let lastNominatimMs = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function nominatimGeocode(query) {
  const key = query.toLowerCase().trim();
  if (nominatimCache.has(key)) return nominatimCache.get(key);

  const elapsed = Date.now() - lastNominatimMs;
  if (elapsed < 1100) await sleep(1100 - elapsed);

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    query
  )}`;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SmartSupplyChain/1.0 (student demo; contact local)',
      Accept: 'application/json',
    },
    signal: ac.signal,
  });
  clearTimeout(to);

  lastNominatimMs = Date.now();

  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.[0]) return null;

  const pos = {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
  nominatimCache.set(key, pos);
  return pos;
}

export async function geocodePlace(name) {
  const raw = String(name || '').trim();
  if (!raw) return stringToCoords('unknown');

  for (const k of KNOWN) {
    if (k.test(raw)) return { lat: k.lat, lng: k.lng };
  }

  const indiaQuery = raw.toLowerCase().includes('india') ? raw : `${raw}, India`;

  try {
    const n = await nominatimGeocode(indiaQuery);
    if (n && !Number.isNaN(n.lat) && !Number.isNaN(n.lng)) return n;
  } catch {
    /* fall through */
  }

  return stringToCoords(raw);
}
