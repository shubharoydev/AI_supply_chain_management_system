import Delivery from '../models/Delivery.js';
import { io } from '../sockets/index.js';
import { optimizeAndReRoute } from './optimization.service.js';

/**
 * When one truck is severely delayed, bump correlated in-transit loads on the same routeHash
 * and trigger re-optimization (cascading failure prevention).
 */
export async function detectAndPreventCascade(delayedDelivery) {
  const hash = delayedDelivery.routeHash;
  if (!hash) return { affected: 0 };

  const siblings = await Delivery.find({
    routeHash: hash,
    status: { $in: ['in-transit', 'at-risk'] },
    _id: { $ne: delayedDelivery._id },
  }).limit(25);

  let count = 0;
  for (const d of siblings) {
    const newRisk = Math.min(100, (d.riskScore || 0) + 18);
    const newStatus = d.status === 'in-transit' ? 'at-risk' : d.status;

    await Delivery.updateOne(
      { _id: d._id },
      { $set: { riskScore: newRisk, status: newStatus } }
    );
    count += 1;

    io.emit('delay-alert', {
      truckId: d.truckId,
      deliveryId: d._id.toString(),
      message: `Cascading exposure from ${delayedDelivery.truckId}`,
      action: 'corridor-reoptimize',
    });

    await optimizeAndReRoute(d._id, ['cascade-from-neighbor']);
  }

  io.emit('cascade-mitigation', {
    sourceTruckId: delayedDelivery.truckId,
    adjustedDeliveries: count,
  });

  return { affected: count };
}
