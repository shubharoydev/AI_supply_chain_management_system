import Delivery from '../models/Delivery.js';
import redis from '../config/redis.js';
import { generateBriefing, evaluateScenario } from '../services/gemini.service.js';
import { remainingRouteKm } from '../utils/geo.js';
import { clampExtraDelayMinutes, baselineTravelMinutes } from '../utils/logisticsMetrics.js';

export const getBriefing = async (req, res) => {
  try {
    const deliveries = await Delivery.find({ status: { $ne: 'delivered' } }).lean();
    
    // Inject real-time Redis state for accurate context
    const enrichedDeliveries = await Promise.all(deliveries.map(async (d) => {
        const cached = await redis.get(`sim:${d._id}:state`);
        if (cached) {
            const state = JSON.parse(cached);
            const route = state.optimizedRoute || [];
            const idx = state.routeProgressIndex ?? 0;
            const remKm = remainingRouteKm(route, idx);
            const rawExtra = state.delayPrediction?.minutes;
            const extraDelay = clampExtraDelayMinutes(rawExtra, remKm);
            const travelMin = Math.round(baselineTravelMinutes(remKm));
            return {
                truckId: d.truckId,
                cargoType: state.cargoType || d.cargoType || 'general',
                origin: d.origin,
                destinations: d.destinations,
                status: state.status || d.status,
                riskScore: state.riskScore,
                approxRemainingKm: Math.round(remKm * 10) / 10,
                estimatedBaselineTravelMinutes: travelMin,
                expectedExtraDelayMinutes: extraDelay,
                delayProbability: state.delayPrediction?.probability,
                riskDriversPercent: state.delayPrediction?.riskBreakdown,
                currentLocation: state.currentLocation,
            };
        }
        return {
            truckId: d.truckId,
            cargoType: d.cargoType || 'general',
            origin: d.origin,
            destinations: d.destinations,
            status: d.status
        };
    }));

    const briefingResponse = await generateBriefing(enrichedDeliveries);
    res.json({ briefing: briefingResponse });
  } catch (error) {
    console.error('getBriefing error:', error);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
};

export const askAdvisor = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    const deliveries = await Delivery.find({ status: { $ne: 'delivered' } }).lean();
    
    const enrichedDeliveries = await Promise.all(deliveries.map(async (d) => {
        const cached = await redis.get(`sim:${d._id}:state`);
        if (cached) {
            const state = JSON.parse(cached);
            const route = state.optimizedRoute || [];
            const idx = state.routeProgressIndex ?? 0;
            const remKm = remainingRouteKm(route, idx);
            const extraDelay = clampExtraDelayMinutes(state.delayPrediction?.minutes, remKm);
            return {
                truckId: d.truckId,
                cargoType: state.cargoType || d.cargoType || 'general',
                origin: d.origin,
                status: state.status || d.status,
                riskScore: state.riskScore,
                approxRemainingKm: Math.round(remKm * 10) / 10,
                estimatedBaselineTravelMinutes: Math.round(baselineTravelMinutes(remKm)),
                expectedExtraDelayMinutes: extraDelay,
                riskDriversPercent: state.delayPrediction?.riskBreakdown,
            };
        }
        return { truckId: d.truckId, cargoType: d.cargoType || 'general', status: d.status };
    }));

    const answer = await evaluateScenario(question, enrichedDeliveries);
    res.json({ answer });
  } catch (error) {
    console.error('askAdvisor error:', error);
    res.status(500).json({ error: 'Failed to process scenario' });
  }
};
