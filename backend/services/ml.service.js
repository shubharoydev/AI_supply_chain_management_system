import axios from 'axios';
import { config } from '../config/env.js';

// Risk smoothing cache to prevent volatility
const riskHistory = new Map();
const MAX_HISTORY_SIZE = 8;

export const predictDelay = async (payload) => {
  try {
    const { data } = await axios.post(`${config.mlUrl}/predict`, payload, {
      headers: { 'X-API-Key': config.mlKey },
      timeout: 5000 // Ensure we don't hang for more than 5 seconds
    });
    
    // Ensure ML service returns reasonable values
    if (data && typeof data.risk_score === 'number') {
      let riskScore = Math.min(95, Math.max(5, Math.round(data.risk_score)));
      
      // Enforce realistic boundaries: if traffic and weather are perfectly fine, the model shouldn't predict disaster.
      if ((payload.traffic || 0) <= 20 && (payload.weather || 0) <= 35) {
        riskScore = Math.min(riskScore, 35);
      }
      
      // Apply risk smoothing to prevent volatility
      riskScore = smoothRiskScore(payload.deliveryId || 'default', riskScore);
      
      return {
        delay_probability: Math.min(0.95, Math.max(0.05, data.delay_probability || 0.3)),
        expected_delay_minutes: Math.min(120, Math.max(5, data.expected_delay_minutes || 20)),
        risk_score: riskScore
      };
    }
    
    throw new Error('Invalid ML response');
  } catch (e) {
    // console.log('ML service down; using improved fallback model');
    
    // Get normalized input values
    const trafficFactor = Math.min(1, Math.max(0, (payload.traffic || 0) / 100));
    const weatherFactor = Math.min(1, Math.max(0, (payload.weather || 0) / 100));
    const historicalFactor = Math.min(1, Math.max(0, (payload.historical_delay || 35) / 100));
    
    // Balanced risk calculation for stability
    const baseRisk = (trafficFactor * 0.4 + weatherFactor * 0.3 + historicalFactor * 0.3) * 100;
    
    const hour = new Date().getHours();
    const rushHourMultiplier = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.15 : 1.0;
    
    let riskScore = Math.max(10, Math.min(90, baseRisk * rushHourMultiplier));
    
    // Apply smoothing
    riskScore = smoothRiskScore(payload.deliveryId || 'default', riskScore);
    
    const delayProb = Math.min(0.9, Math.max(0.1, riskScore / 100));
    const delayMin = Math.round(5 + (riskScore / 100) * 45);
    
    return {
      delay_probability: Math.round(delayProb * 100) / 100,
      expected_delay_minutes: delayMin,
      risk_score: Math.round(riskScore)
    };
  }
};

/**
 * Smooth risk scores to prevent sudden jumps
 */
function smoothRiskScore(deliveryId, newRiskScore) {
  const history = riskHistory.get(deliveryId) || [];
  
  if (history.length === 0) {
    const initialHistory = [newRiskScore];
    riskHistory.set(deliveryId, initialHistory);
    return newRiskScore;
  }

  // Calculate previous average accurately
  const prevAvg = history.reduce((a, b) => a + b, 0) / history.length;
  
  // Constrain based on previous average (limit jumps to 10% per tick)
  const maxJump = 10;
  let constrainedScore = newRiskScore;
  
  if (newRiskScore > prevAvg + maxJump) {
    constrainedScore = prevAvg + maxJump;
  } else if (newRiskScore < prevAvg - maxJump) {
    constrainedScore = prevAvg - maxJump;
  }

  // Add to history
  history.push(constrainedScore);
  if (history.length > MAX_HISTORY_SIZE) {
    history.shift();
  }
  riskHistory.set(deliveryId, history);
  
  // Return weighted average of history for maximum smoothness
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < history.length; i++) {
    const weight = i + 1;
    weightedSum += history[i] * weight;
    totalWeight += weight;
  }
  
  return Math.round(weightedSum / totalWeight);
}