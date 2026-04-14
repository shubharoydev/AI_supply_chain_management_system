import axios from 'axios';
import { config } from '../config/env.js';
import redis from '../config/redis.js';

class WeatherService {
  constructor() {
    this.apiKey = config.weatherApiKey;
    this.baseUrl = config.weatherBaseUrl;
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache as requested
  }

  /**
   * Get current weather for a specific location
   */
  async getCurrentWeather(lat, lng) {
    try {
      if (!this.apiKey || this.apiKey === 'YOUR_OPENWEATHERMAP_API_KEY_HERE') {
        console.warn('Weather API key not configured, using simulated weather');
        return this.getSimulatedWeather();
      }

      const cacheKey = `${lat},${lng}`;
      const redisKey = `cache:weather:${cacheKey}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }

      try {
        const r = await redis.get(redisKey);
        if (r) {
          const parsed = JSON.parse(r);
          this.cache.set(cacheKey, { data: parsed, timestamp: Date.now() });
          return parsed;
        }
      } catch {
        // ignore redis cache errors; fall back to in-memory + live call
      }

      const response = await axios.get(`${this.baseUrl}/weather`, {
        params: {
          lat: lat,
          lon: lng,
          appid: this.apiKey,
          units: 'metric'
        },
        timeout: 5000
      });

      const weatherData = this.parseWeatherResponse(response.data);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: weatherData,
        timestamp: Date.now()
      });
      try {
        await redis.setex(redisKey, Math.ceil(this.cacheTimeout / 1000), JSON.stringify(weatherData));
      } catch {
        // ignore
      }

      console.log(`[Weather] Live weather for ${lat},${lng}: ${weatherData.condition} (${weatherData.temperature}°C)`);
      return weatherData;

    } catch (error) {
      console.error('Weather API error:', error.message);
      console.log('Using simulated weather as fallback');
      return this.getSimulatedWeather();
    }
  }

  /**
   * Parse OpenWeatherMap response into our format
   */
  parseWeatherResponse(data) {
    const main = data.main || {};
    const weather = data.weather?.[0] || {};
    const wind = data.wind || {};

    return {
      temperature: main.temp || 20,
      humidity: main.humidity || 50,
      pressure: main.pressure || 1013,
      condition: weather.main || 'Clear',
      description: weather.description || 'clear sky',
      windSpeed: wind.speed || 0,
      windDirection: wind.deg || 0,
      visibility: data.visibility || 10000,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get simulated weather when API is unavailable
   */
  getSimulatedWeather() {
    const hour = new Date().getHours();
    const conditions = ['Clear', 'Clouds', 'Rain', 'Drizzle', 'Mist'];
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    
    // Time-based temperature variation
    let baseTemp = 25;
    if (hour >= 0 && hour < 6) baseTemp = 18;
    else if (hour >= 6 && hour < 12) baseTemp = 22;
    else if (hour >= 12 && hour < 17) baseTemp = 28;
    else if (hour >= 17 && hour < 20) baseTemp = 26;
    else baseTemp = 20;

    const temperature = baseTemp + (Math.random() - 0.5) * 8;
    
    return {
      temperature: Math.round(temperature * 10) / 10,
      humidity: 40 + Math.random() * 40,
      pressure: 1000 + Math.random() * 30,
      condition: condition,
      description: condition.toLowerCase(),
      windSpeed: Math.random() * 15,
      windDirection: Math.random() * 360,
      visibility: 5000 + Math.random() * 10000,
      timestamp: new Date().toISOString(),
      simulated: true
    };
  }

  /**
   * Convert weather condition to risk factor (0-100)
   */
  getWeatherRiskFactor(weatherData) {
    const { temperature, condition, windSpeed, visibility } = weatherData;
    
    let risk = 0;

    // Temperature risks (adjusted for extreme summer climates like India)
    if (temperature < -5 || temperature > 55) risk += 30;
    else if (temperature < 0 || temperature > 52) risk += 15;
    else if (temperature < 5 || temperature > 50) risk += 5;

    // Condition risks
    const highRiskConditions = ['Rain', 'Thunderstorm', 'Snow', 'Drizzle', 'Mist', 'Fog'];
    const mediumRiskConditions = ['Clouds', 'Haze', 'Smoke'];
    
    if (highRiskConditions.includes(condition)) risk += 25;
    else if (mediumRiskConditions.includes(condition)) risk += 15;

    // Wind risks
    if (windSpeed > 20) risk += 20;
    else if (windSpeed > 15) risk += 15;
    else if (windSpeed > 10) risk += 10;

    // Visibility risks
    if (visibility < 1000) risk += 25;
    else if (visibility < 5000) risk += 15;
    else if (visibility < 10000) risk += 5;

    return Math.min(100, Math.max(0, risk));
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }
}

// Cleanup cache every 5 minutes
setInterval(() => {
  weatherService.cleanupCache();
}, 5 * 60 * 1000);

export const weatherService = new WeatherService();
export default weatherService;
