import { Router } from 'express';

import {
  getShipments,
  getShipmentById,
  createShipment,
  startDelivery,
  stopShipment,
  deleteShipment,
  getShipmentByTruckId,
} from '../controllers/delivery.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateShipment } from '../middleware/validation.middleware.js';
import { arcjetRateLimiter } from '../middleware/rateLimit.middleware.js';
import { predictDelay } from '../services/ml.service.js';

const router = Router();

router.get('/', authenticate, getShipments);

router.get('/:id', authenticate, getShipmentById);

router.post('/', authenticate, validateShipment, arcjetRateLimiter(), createShipment);

router.post('/create', authenticate, validateShipment, arcjetRateLimiter(), createShipment);

router.post('/:id/start', authenticate, arcjetRateLimiter(), startDelivery);
router.post('/:id/stop', authenticate, arcjetRateLimiter(), stopShipment);
router.delete('/:id', authenticate, arcjetRateLimiter(), deleteShipment);
router.post('/simulate/:id', authenticate, arcjetRateLimiter(), startDelivery);

router.post('/driver/truck', authenticate, arcjetRateLimiter(), getShipmentByTruckId);

router.post('/predict', arcjetRateLimiter({ tokens: 10 }), async (req, res, next) => {
  try {
    const result = await predictDelay(req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
