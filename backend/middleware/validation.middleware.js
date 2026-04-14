import { z } from 'zod';

const createShipmentSchema = z.object({
  origin: z.string().min(3),
  destinations: z.array(z.string().min(1)).min(1),
  truckId: z.string().min(1),
});

export const validateShipment = (req, res, next) => {
  try {
    req.body = createShipmentSchema.parse(req.body);
    next();
  } catch (e) {
    const issues = e?.issues ?? e?.errors;
    res.status(400).json({ errors: issues ?? String(e) });
  }
};