import Delivery from '../models/Delivery.js';
import { optimizeAndReRoute } from './optimization.service.js';

export const createDelivery = async (data) => {
  const delivery = new Delivery(data);
  await delivery.save();
  await optimizeAndReRoute(delivery._id); // side-effect: may update route & risk
  return delivery;
};

export const getActiveDeliveries = async () => {
  return Delivery.find({ status: { $in: ['created', 'in-transit', 'delayed'] } })
    .sort({ createdAt: -1 })
    .limit(200);
};

export const updateLocation = async (truckId, lat, lng) => {
  return Delivery.findOneAndUpdate(
    { truckId },
    { currentLocation: { lat, lng }, updatedAt: new Date() },
    { returnDocument: 'after' }
  );
};