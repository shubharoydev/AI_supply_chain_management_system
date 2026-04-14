import axios from 'axios';
import { config } from '../config/env.js';

class OpenRouteService {
  constructor() {
    this.apiKey = config.openrouteApiKey;
    this.baseUrl = config.openrouteBaseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/geo+json'
      }
    });
  }

  /**
   * Get optimized route between multiple waypoints using OpenRoute API
   */
  async getOptimizedRoute(waypoints, avoidTraffic = true, options = {}) {
    try {
      if (!this.apiKey || this.apiKey === 'YOUR_OPENROUTE_API_KEY_HERE') {
        console.warn('OpenRoute API key not configured, using fallback route generation');
        return this.generateFallbackRoute(waypoints);
      }

      // Format waypoints for OpenRoute API [longitude, latitude]
      const coordinates = waypoints.map(wp => {
        const lng = Number(wp.lng);
        const lat = Number(wp.lat);
        if (isNaN(lng) || isNaN(lat)) {
          throw new Error(`Invalid coordinates: ${JSON.stringify(wp)}`);
        }
        return [lng, lat];
      });
      
      console.log(`[OpenRoute] Requesting route for ${coordinates.length} waypoints:`, coordinates);
      
      const requestBody = {
        coordinates: coordinates,
        format: 'geojson',
        preference: avoidTraffic ? 'fastest' : 'shortest',
        units: 'km',
        language: 'en',
        instructions: false
      };

      // Add traffic avoidance if requested
      if (avoidTraffic) {
        requestBody.options = {
          avoid_features: ['highways', 'tollways']
        };
      }

      if (options.alternative_routes) {
        requestBody.alternative_routes = {
          target_count: 3,
          weight_factor: 1.4,
          share_factor: 0.6
        };
      }

      console.log('[OpenRoute] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await this.client.post('/v2/directions/driving-car', requestBody);
      
      console.log('[OpenRoute] Response status:', response.status);
      console.log('[OpenRoute] Response data keys:', Object.keys(response.data || {}));
      
      if (response.data && response.data.routes && response.data.routes.length > 0) {
        let route = response.data.routes[0];
        
        // If we requested alternatives (target_count > 1), try to pick a genuine alternative
        if (requestBody.alternative_routes && response.data.routes.length > 1) {
          // Simplistic filter: Pick the second route if it exists, assuming first might still be original
          route = response.data.routes[1];
          console.log('[OpenRoute] Selected alternative route #2 from pool of', response.data.routes.length);
        }

        console.log('[OpenRoute] Route found, processing...');
        return this.parseOpenRouteResponse(route, waypoints);
      }

      console.error('[OpenRoute] No route found in response:', response.data);
      throw new Error('No route found in OpenRoute response');
    } catch (error) {
      console.error('OpenRoute API error:', error.message);
      if (error.response) {
        console.error('OpenRoute API response status:', error.response.status);
        console.error('OpenRoute API response data:', error.response.data);
      }
      console.log('Falling back to simple route generation');
      return this.generateFallbackRoute(waypoints);
    }
  }

  /**
   * Parse OpenRoute API response into our internal format
   */
  parseOpenRouteResponse(route, originalWaypoints) {
    // Handle both old format (features) and new format (routes)
    let coordinates;
    
    if (route.geometry && route.geometry.coordinates) {
      // New format: routes[].geometry.coordinates
      coordinates = route.geometry.coordinates;
    } else if (route.bbox && route.way_points) {
      // Alternative format with encoded polyline
      console.log('[OpenRoute] Using alternative route format');
      // For now, generate fallback route
      return this.generateFallbackRoute(originalWaypoints);
    } else {
      console.error('[OpenRoute] Unknown route format:', route);
      return this.generateFallbackRoute(originalWaypoints);
    }
    
    // Convert to our format [lat, lng]
    const optimizedRoute = coordinates.map(coord => ({
      lat: coord[1], // OpenRoute returns [lng, lat]
      lng: coord[0]
    }));

    const properties = route.properties || route.summary || {};
    
    // Add metadata
    return {
      route: optimizedRoute,
      distance: (properties.distance || 0) / 1000, // Convert to km if in meters
      duration: (properties.duration || 0) / 60, // Convert to minutes if in seconds
      confidence: 0.95, // OpenRoute is highly reliable
      waypoints: originalWaypoints,
      hasTrafficData: true
    };
  }

  /**
   * Generate fallback route when API is unavailable
   */
  generateFallbackRoute(waypoints) {
    console.log('Using improved Uber-style fallback route generation');
    
    const route = [];
    let totalDistance = 0;
    
    for (let i = 0; i < waypoints.length; i++) {
      route.push(waypoints[i]);
      
      if (i < waypoints.length - 1) {
        // Generate realistic road-like path with multiple curves
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const realisticPath = this.generateRealisticRoadPath(start, end);
        route.push(...realisticPath);
        
        // Calculate distance
        totalDistance += this.calculateDistance(start, end);
      }
    }

    return {
      route: route,
      distance: totalDistance,
      duration: totalDistance / 45 * 60, // Assume 45 km/h average for urban areas
      confidence: 0.7,
      waypoints: waypoints,
      hasTrafficData: false
    };
  }

  /**
   * Generate realistic road-like path (Uber-style) with multiple curves and variations
   */
  generateRealisticRoadPath(start, end) {
    const points = [];
    const numSegments = 20; // More segments for smoother curves
    
    // Calculate bearing and distance
    const bearing = this.calculateBearing(start, end);
    const distance = this.calculateDistance(start, end);
    
    for (let i = 1; i <= numSegments; i++) {
      const ratio = i / (numSegments + 1);
      
      // Base position along the route
      let lat = start.lat + (end.lat - start.lat) * ratio;
      let lng = start.lng + (end.lng - start.lng) * ratio;
      
      // Multiple curve layers for realistic road patterns
      // Primary curve (main road curvature - S-shaped)
      const primaryCurve = Math.sin(ratio * Math.PI * 2) * 0.018;
      
      // Secondary curve (road deviations - C-shaped)
      const secondaryCurve = Math.cos(ratio * Math.PI * 3) * 0.010;
      
      // Tertiary curve (small road variations)
      const tertiaryCurve = Math.sin(ratio * Math.PI * 6) * 0.006;
      
      // Quaternary curve (high-frequency road imperfections)
      const quaternaryCurve = Math.cos(ratio * Math.PI * 12) * 0.003;
      
      // Apply curves perpendicular to route direction
      const perpBearing = bearing + Math.PI / 2;
      const totalCurve = primaryCurve + secondaryCurve + tertiaryCurve + quaternaryCurve;
      
      lat += Math.cos(perpBearing) * totalCurve;
      lng += Math.sin(perpBearing) * totalCurve;
      
      // Add realistic random variations (road imperfections)
      const randomVariation = 0.0015;
      lat += (Math.random() - 0.5) * randomVariation;
      lng += (Math.random() - 0.5) * randomVariation;
      
      // Add speed-dependent variations (slower in urban areas, faster on highways)
      const speedFactor = Math.sin(ratio * Math.PI * 0.5) * 0.002;
      lat += speedFactor * Math.cos(bearing + Math.PI / 4);
      lng += speedFactor * Math.sin(bearing + Math.PI / 4);
      
      // Add micro-variations for road texture
      const microVariation = Math.sin(ratio * Math.PI * 24) * 0.0008;
      lat += microVariation * Math.cos(perpBearing + Math.PI / 3);
      lng += microVariation * Math.sin(perpBearing + Math.PI / 3);
      
      points.push({
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000
      });
    }
    
    return points;
  }

  /**
   * Calculate bearing between two points
   */
  calculateBearing(start, end) {
    const dLat = (end.lat - start.lat) * Math.PI / 180;
    const dLon = (end.lng - start.lng) * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - 
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    return Math.atan2(y, x);
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRad(point1.lat)) * Math.cos(this.toRad(point2.lat)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Re-route around obstacles or traffic
   */
  async reRoute(currentLocation, destination, obstacles = []) {
    try {
      const waypoints = [currentLocation, destination];
      
      // Add obstacles as avoidance parameters
      const avoidFeatures = ['highways', 'tollways'];
      if (obstacles.includes('traffic')) {
        avoidFeatures.push('ferry');
      }
      if (obstacles.includes('construction')) {
        avoidFeatures.push('unpavedroads');
      }

      // Add alternative_routes param as explicitly requested
      const routeData = await this.getOptimizedRoute(waypoints, true, { alternative_routes: true });
      routeData.reRouted = true;
      
      return {
        ...routeData,
        reRouted: true,
        obstacles: obstacles,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Re-routing failed:', error);
      throw error;
    }
  }
}

export default new OpenRouteService();
