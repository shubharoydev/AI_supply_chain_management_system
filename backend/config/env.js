import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI,
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key',
  mlUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  mlKey: process.env.ML_API_KEY || '',
  nodeEnv: process.env.NODE_ENV,
  /** ML risk_score is 0–100; alert when above this */
  riskScoreThreshold: Number(process.env.RISK_SCORE_THRESHOLD) || 70,
  /** Also treat high delay_probability as risk */
  delayProbabilityThreshold: Number(process.env.DELAY_PROBABILITY_THRESHOLD) || 0.7,
  simulationIntervalMs: Number(process.env.SIMULATION_INTERVAL_MS) || 3000,
  /** When to switch from main route to candidate reroute (points ahead) */
  rerouteSwitchLookaheadPoints: Number(process.env.REROUTE_SWITCH_LOOKAHEAD_POINTS) || 4,
  /** OpenRoute API Configuration */
  openrouteApiKey: process.env.OPENROUTE_API_KEY || '',
  openrouteBaseUrl: process.env.OPENROUTE_BASE_URL || 'https://api.openrouteservice.org',
  /** Weather API Configuration */
  weatherApiKey: process.env.WEATHER_API_KEY || '',
  weatherBaseUrl: process.env.WEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5',
  /** Traffic API Configuration */
  trafficApiKey: process.env.TRAFFIC_API_KEY || '',
  trafficBaseUrl: process.env.TRAFFIC_BASE_URL || 'https://traffic.googleapis.com',
  /** Gemini AI Advisor API Key */
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  /** Email alert service (Gmail App Password) */
  emailUser: process.env.EMAIL_USER?.trim() || '',
  emailPass: process.env.EMAIL_PASS?.trim() || '',

  /** Demo controls (optional) */
  demoForceHighRisk: String(process.env.DEMO_FORCE_HIGH_RISK || '').toLowerCase() === 'true',
  demoTrafficRisk: Number(process.env.DEMO_TRAFFIC_RISK) || 92,
  demoWeatherRisk: Number(process.env.DEMO_WEATHER_RISK) || 88,
};
