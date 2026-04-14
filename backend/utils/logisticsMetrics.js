/**
 * Clamp ML "extra delay" so urban ~10km legs never produce multi-day delays.
 * @param {number} rawMinutes - model output (additional delay, not total trip time)
 * @param {number} remainingKm
 */
export function clampExtraDelayMinutes(rawMinutes, remainingKm) {
  let m = Number(rawMinutes);
  if (!Number.isFinite(m) || m < 0) m = 0;
  const r = Math.max(0, Number(remainingKm) || 0);
  const baselineMin = Math.max(5, (r / 35) * 60); // ~35 km/h reference
  const cap = Math.min(240, Math.max(12, baselineMin * 3.5));
  return Math.round(Math.min(m, cap));
}

/** Expected free-flow travel time for remaining distance (minutes). */
export function baselineTravelMinutes(remainingKm, kmh = 35) {
  const r = Math.max(0, Number(remainingKm) || 0);
  return Math.max(5, (r / Math.max(5, kmh)) * 60);
}

export function computeEtaFromRemaining(remainingKm, extraDelayMinutes, kmh = 35) {
  const travel = baselineTravelMinutes(remainingKm, kmh);
  const extra = clampExtraDelayMinutes(extraDelayMinutes, remainingKm);
  return new Date(Date.now() + (travel + extra) * 60 * 1000);
}

/**
 * Explainable risk share (sums to ~100) from the same intuition as ML fallback weights.
 */
export function computeRiskBreakdown(traffic0to100, weather0to100, historical0to100) {
  const t = Math.min(1, Math.max(0, (Number(traffic0to100) || 0) / 100));
  const w = Math.min(1, Math.max(0, (Number(weather0to100) || 0) / 100));
  const h = Math.min(1, Math.max(0, (Number(historical0to100) || 0) / 100));
  const rawTraffic = t * 0.4;
  const rawWeather = w * 0.3;
  const rawHist = h * 0.3;
  const sum = rawTraffic + rawWeather + rawHist || 1;
  let tp = Math.round((100 * rawTraffic) / sum);
  let wp = Math.round((100 * rawWeather) / sum);
  let hp = Math.round((100 * rawHist) / sum);
  const drift = 100 - (tp + wp + hp);
  hp += drift;
  return { trafficPct: tp, weatherPct: wp, operationsPct: hp };
}
