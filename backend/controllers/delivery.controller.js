import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';
import { computeInitialRoute } from '../services/optimization.service.js';
import { startSimulationLoop, isSimulationRunning, stopSimulation } from '../services/simulation.service.js';
import { io } from '../sockets/index.js';
import redis from '../config/redis.js';

async function resolveHistoricalBaseline(origin) {
  try {
    const agg = await Delivery.aggregate([
      { $match: { origin, 'delayPrediction.minutes': { $exists: true } } },
      { $group: { _id: null, avg: { $avg: '$delayPrediction.minutes' } } },
    ]);
    const v = agg[0]?.avg;
    const n = typeof v === 'number' ? v : Number(v);
    return !Number.isNaN(n) ? Math.round(n * 10) / 10 : 40;
  } catch {
    return 40;
  }
}

/** Avoid duplicate key if MongoDB still has a legacy unique index on truckId */
async function ensureUniqueTruckId(requested) {
  const base = (requested || '').trim() || `TRK-${Date.now()}`;
  let truckId = base;
  let n = 0;
  while (n < 50 && (await Delivery.exists({ truckId }))) {
    n += 1;
    truckId = `${base}-${n}`;
  }
  return truckId;
}

/**
 * POST /deliveries — persist pending shipment, compute optimized route (Redis-backed cache), no simulation yet.
 */
export const createShipment = async (req, res) => {
  try {
    const historicalDelayBaseline = await resolveHistoricalBaseline(req.body.origin);
    const truckId = await ensureUniqueTruckId(req.body.truckId);

    const cargoType = ['essential', 'pharma', 'general'].includes(req.body.cargoType)
      ? req.body.cargoType
      : 'general';

    const delivery = await Delivery.create({
      origin: req.body.origin,
      destinations: req.body.destinations,
      truckId,
      cargoType,
      cargoValue: req.body.cargoValue || 50000,
      status: 'pending',
      historicalDelayBaseline,
      createdBy: req.user?.id || null,
    });

    const optimizedRoute = await computeInitialRoute(delivery);
    delivery.currentLocation = optimizedRoute[0];
    delivery.routeProgressIndex = 0;
    delivery.ETA = new Date(Date.now() + 45 * 60 * 1000);
    // Explicitly doing NOT save optimizedRoute to DB!
    await delivery.save();

    const state = delivery.toObject();
    state.optimizedRoute = optimizedRoute;
    // Store frequently used data strictly in Redis instead of MongoDB (7 Day TTL)
    await redis.setex(`sim:${delivery._id}:state`, 7 * 24 * 60 * 60, JSON.stringify(state));

    res.status(201).json({
      message: 'Delivery created — route optimized. Start delivery when ready.',
      delivery: state,
    });
  } catch (err) {
    console.error('Error creating shipment:', err);
    if (err.name === 'ValidationError') {
      const fields = Object.fromEntries(
        Object.entries(err.errors || {}).map(([k, e]) => [k, e.message])
      );
      return res.status(400).json({
        error: 'Validation failed',
        details: err.message,
        fields,
      });
    }
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'Duplicate truck or route identifier',
        details: err.message,
      });
    }
    res.status(500).json({
      error: 'Failed to create shipment',
      details: err.message,
    });
  }
};

export const getShipments = async (req, res) => {
  try {
    const deliveries = await Delivery.find().sort({ createdAt: -1 });
    const enriched = await Promise.all(deliveries.map(async (d) => {
      const cached = await redis.get(`sim:${d._id}:state`);
      if (cached) {
        return { ...d.toObject(), ...JSON.parse(cached) }; // Inject redis state
      }
      return d.toObject();
    }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shipments' });
  }
};

export const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid delivery id' });
    }
    const d = await Delivery.findById(id);
    if (!d) return res.status(404).json({ error: 'Not found' });
    
    // Inject Redis simulation state (includes optimizedRoute)
    const cached = await redis.get(`sim:${d._id}:state`);
    const finalDoc = cached ? { ...d.toObject(), ...JSON.parse(cached) } : d.toObject();
    
    res.json(finalDoc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch shipment' });
  }
};

/**
 * POST /deliveries/:id/start — move to in-transit, emit delivery-started, begin Socket.IO simulation loop.
 */
export const startDelivery = async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    if (delivery.status === 'delivered') {
      return res.status(400).json({ error: 'Delivery already completed' });
    }
    if (delivery.status === 'in-transit' || delivery.status === 'at-risk') {
      if (isSimulationRunning(delivery._id)) {
        return res.json({
          message: 'Simulation already running',
          delivery,
        });
      }
    }

    const cached = await redis.get(`sim:${delivery._id}:state`);
    const state = cached ? JSON.parse(cached) : delivery.toObject();

    // Completely bypass DB update for real-time status transitions
    state.status = 'in-transit';
    
    // Extend TTL to 7 Days
    await redis.setex(`sim:${delivery._id}:state`, 7 * 24 * 60 * 60, JSON.stringify(state));

    io.emit('delivery-started', {
      deliveryId: delivery._id.toString(),
      truckId: delivery.truckId,
      origin: delivery.origin,
      destinations: delivery.destinations,
      optimizedRoute: state.optimizedRoute,
      status: 'in-transit',
      startedAt: new Date().toISOString(),
    });

    startSimulationLoop(delivery._id);

    res.json({
      message: 'Delivery started — live tracking active',
      delivery,
    });
  } catch (err) {
    console.error('startDelivery:', err);
    res.status(500).json({ error: 'Failed to start delivery', details: err.message });
  }
};

/**
 * POST /deliveries/:id/stop — stop simulation, set status back to pending or keep as is.
 */
export const stopShipment = async (req, res) => {
  try {
    const { id } = req.params;
    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ error: 'Not found' });

    stopSimulation(id);

    // If it was already delivered, keep it delivered. Otherwise, maybe 'pending' or 'cancelled'?
    // User requested "stop simulating", let's just stop the loop and update status if not delivered.
    if (delivery.status !== 'delivered') {
      // By-pass DB entirely; status resets to pending in Redis
      const cached = await redis.get(`sim:${id}:state`);
      if (cached) {
        const state = JSON.parse(cached);
        state.status = 'pending';
        // Overwrite the Redis cache, wait until delivery starts again, 7 days TTL
        await redis.setex(`sim:${id}:state`, 7 * 24 * 60 * 60, JSON.stringify(state));
      }
    }

    io.emit('delivery-stopped', {
      deliveryId: id,
      truckId: delivery.truckId,
      status: delivery.status,
    });

    res.json({ message: 'Simulation stopped', delivery });
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop simulation' });
  }
};

/**
 * DELETE /deliveries/:id
 */
export const deleteShipment = async (req, res) => {
  try {
    const { id } = req.params;
    stopSimulation(id);
    await Delivery.findByIdAndDelete(id);
    io.emit('delivery-deleted', { deliveryId: id });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
};

export const getShipmentByTruckId = async (req, res) => {
  try {
    const { truckId } = req.body;
    if (!truckId) return res.status(400).json({ error: 'Truck ID is required' });

    const d = await Delivery.findOne({ truckId });
    if (!d) return res.status(404).json({ error: 'Truck not found' });

    const cached = await redis.get(`sim:${d._id}:state`);
    if (!cached) return res.status(400).json({ error: 'Truck is not currently active' });

    const finalDoc = { ...d.toObject(), ...JSON.parse(cached) };
    if (finalDoc.status === 'delivered') return res.status(400).json({ error: 'Truck is already delivered' });

    res.json(finalDoc);
  } catch (e) {
    res.status(500).json({ error: 'Failed to access truck data' });
  }
};
