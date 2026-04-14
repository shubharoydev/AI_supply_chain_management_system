import axios from 'axios';
import { config } from '../config/env.js';
import redis from '../config/redis.js';

class TrafficService {
  constructor() {
    this.apiKey = config.trafficApiKey;
    this.baseUrl = config.trafficBaseUrl;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
  }

  /**
   * Get current traffic data for a route using TomTom API
   */
  async getTrafficData(origin, destination) {
    try {
      if (!this.apiKey || this.apiKey === 'YOUR_TRAFFIC_API_KEY_HERE') {
        console.warn('TomTom Traffic API key not configured, using simulated traffic');
        return this.getSimulatedTraffic();
      }

      const cacheKey = `${origin.lat},${origin.lng}-${destination.lat},${destination.lng}`;
      const redisKey = `cache:traffic:${cacheKey}`;
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

      const locations = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
      
      const response = await axios.get(`${this.baseUrl}/routing/1/calculateRoute/${locations}/json`, {
        params: {
          key: this.apiKey,
          traffic: 'true',
          travelMode: 'car',
          routeType: 'fastest',
          routeRepresentation: 'polyline'
        },
        timeout: 5000
      });

      const trafficData = this.parseTomTomResponse(response.data);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: trafficData,
        timestamp: Date.now()
      });
      try {
        await redis.setex(redisKey, Math.ceil(this.cacheTimeout / 1000), JSON.stringify(trafficData));
      } catch {
        // ignore
      }

      console.log(`[TomTom] Live traffic factor: ${trafficData.congestionLevel} (${trafficData.delayMinutes}min delay)`);
      return trafficData;

    } catch (error) {
      console.error('TomTom Traffic API error:', error.message);
      if (error.response) {
        console.error('TomTom API response status:', error.response.status);
        console.error('TomTom API response data:', JSON.stringify(error.response.data, null, 2));
      }
      return this.getSimulatedTraffic();
    }
  }

  /**
   * Get optimized route between multiple waypoints using TomTom API
   */
  async getOptimizedRoute(waypoints, options = {}) {
    try {
      if (!this.apiKey || this.apiKey === 'YOUR_TRAFFIC_API_KEY_HERE') {
        return null;
      }

      const cacheKey = waypoints.map(wp => `${wp.lat},${wp.lng}`).join(':') + (options.routeType ? `:${options.routeType}` : '');
      const redisKey = `cache:route:tomtom:${cacheKey}`;
      try {
        const r = await redis.get(redisKey);
        if (r) return JSON.parse(r);
      } catch {
        // ignore
      }

      const locations = waypoints.map(wp => `${wp.lat},${wp.lng}`).join(':');
      
      const response = await axios.get(`${this.baseUrl}/routing/1/calculateRoute/${locations}/json`, {
        params: {
          key: this.apiKey,
          traffic: 'true',
          travelMode: 'car',
          routeType: options.routeType || 'fastest',
          routeRepresentation: 'polyline'
        },
        timeout: 8000
      });

      if (!response.data || !response.data.routes || response.data.routes.length === 0) {
        return null;
      }

      const route = response.data.routes[0];
      const summary = route.summary;
      
      let routePoints = [];
      if (route.legs) {
        route.legs.forEach(leg => {
          if (leg.points) {
            leg.points.forEach(p => {
              routePoints.push({
                lat: p.latitude,
                lng: p.longitude
              });
            });
          }
        });
      }

      const result = {
        route: routePoints,
        distance: summary.lengthInMeters / 1000,
        duration: summary.travelTimeInSeconds / 60,
        hasTrafficData: true
      };

      try {
        // Cache optimized route briefly to reduce API calls
        await redis.setex(redisKey, 5 * 60, JSON.stringify(result));
      } catch {
        // ignore
      }

      return result;

    } catch (error) {
      console.error('TomTom Routing API error:', error.message);
      return null;
    }
  }

  /**
   * Parse TomTom Routing API response
   */
  parseTomTomResponse(data) {
    const route = data.routes?.[0];
    if (!route) {
      throw new Error('No route found in TomTom response');
    }

    const summary = route.summary;
    const trafficInfo = route.traffic || {};
    
    // Extract polyline points if present
    let routePoints = [];
    if (route.legs && route.legs[0] && route.legs[0].points) {
      routePoints = route.legs[0].points.map(p => ({
        lat: p.latitude,
        lng: p.longitude
      }));
    }
    
    // Calculate delay from traffic
    const travelTimeInSeconds = summary.travelTimeInSeconds || 0;
    const baseTravelTimeInSeconds = summary.baseTravelTimeInSeconds || travelTimeInSeconds;
    const delaySeconds = Math.max(0, travelTimeInSeconds - baseTravelTimeInSeconds);
    const delayMinutes = delaySeconds / 60;
    
    // Calculate congestion level (0-100)
    const congestionPercentage = baseTravelTimeInSeconds > 0 ? (delaySeconds / baseTravelTimeInSeconds) * 100 : 0;
    
    return {
      baseDurationMinutes: baseTravelTimeInSeconds / 60,
      actualDurationMinutes: travelTimeInSeconds / 60,
      delayMinutes: delayMinutes,
      congestionLevel: Math.min(100, Math.round(congestionPercentage)),
      trafficCondition: this.getTrafficCondition(congestionPercentage),
      distanceKm: summary.lengthInMeters / 1000,
      routePoints: routePoints,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get traffic condition based on congestion percentage
   */
  getTrafficCondition(congestionPercentage) {
    if (congestionPercentage < 10) return 'Free Flow';
    if (congestionPercentage < 25) return 'Light';
    if (congestionPercentage < 50) return 'Moderate';
    if (congestionPercentage < 75) return 'Heavy';
    return 'Severe';
  }

  /**
   * Get simulated traffic data when API is unavailable
   */
  getSimulatedTraffic() {
    const hour = new Date().getHours();
    
    // Rush hour simulation
    let baseCongestion = 20;
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      baseCongestion = 40 + Math.random() * 20; // 40-60% during rush hour
    } else if (hour >= 10 && hour <= 16) {
      baseCongestion = 25 + Math.random() * 15; // 25-40% during day
    } else if (hour >= 20 || hour <= 6) {
      baseCongestion = 10 + Math.random() * 10; // 10-20% during night
    }

    // Add random variations
    const congestionLevel = Math.min(100, Math.max(0, baseCongestion + (Math.random() - 0.5) * 10));
    const delayMinutes = (congestionLevel / 100) * 15; // Max 15 minutes delay

    return {
      baseDurationMinutes: 30,
      actualDurationMinutes: 30 + delayMinutes,
      delayMinutes: delayMinutes,
      congestionLevel: Math.round(congestionLevel),
      trafficCondition: this.getTrafficCondition(congestionLevel),
      timestamp: new Date().toISOString(),
      simulated: true
    };
  }

  /**
   * Get traffic risk factor (0-100)
   */
  getTrafficRiskFactor(trafficData) {
    const { congestionLevel, delayMinutes, trafficCondition } = trafficData;
    
    let risk = congestionLevel;

    // Additional risk based on delay
    if (delayMinutes > 20) risk += 20;
    else if (delayMinutes > 15) risk += 15;
    else if (delayMinutes > 10) risk += 10;
    else if (delayMinutes > 5) risk += 5;

    // Condition-based adjustments
    const highRiskConditions = ['Severe', 'Heavy'];
    const mediumRiskConditions = ['Moderate'];
    
    if (highRiskConditions.includes(trafficCondition)) risk += 15;
    else if (mediumRiskConditions.includes(trafficCondition)) risk += 8;

    return Math.min(100, Math.max(0, risk));
  }

  /**
   * Get traffic for specific coordinates (area-based)
   */
  async getAreaTraffic(lat, lng) {
    try {
      if (!this.apiKey || this.apiKey === 'YOUR_TRAFFIC_API_KEY_HERE') {
        return this.getSimulatedTraffic();
      }

      // TomTom Traffic Flow API for area-based traffic
      const response = await axios.get(`${this.baseUrl}/traffic/services/4/flowSegmentData`, {
        params: {
          key: this.apiKey,
          point: `${lat},${lng}`,
          zoom: 12,
          thickness: 5,
          openLR: 'true'
        },
        timeout: 5000
      });

      const flowData = response.data?.flowSegmentData?.[0];
      if (!flowData) {
        return this.getSimulatedTraffic();
      }

      const currentSpeed = flowData.currentSpeed || 30;
      const freeFlowSpeed = flowData.freeFlowSpeed || 50;
      const congestionPercentage = ((freeFlowSpeed - currentSpeed) / freeFlowSpeed) * 100;

      return {
        baseDurationMinutes: 30,
        actualDurationMinutes: 30 + (congestionPercentage / 100) * 15,
        delayMinutes: (congestionPercentage / 100) * 15,
        congestionLevel: Math.round(Math.min(100, Math.max(0, congestionPercentage))),
        trafficCondition: this.getTrafficCondition(congestionPercentage),
        timestamp: new Date().toISOString(),
        simulated: false
      };

    } catch (error) {
      console.error('TomTom Area Traffic API error:', error.message);
      return this.getSimulatedTraffic();
    }
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

// Cleanup cache every 2 minutes
setInterval(() => {
  trafficService.cleanupCache();
}, 2 * 60 * 1000);

export const trafficService = new TrafficService();
export default trafficService;
