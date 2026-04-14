import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import mongoose from 'mongoose';

import { requestLogger } from './middleware/logger.middleware.js';
import deliveryRoutes from './routes/delivery.routes.js';
import authRoutes from './routes/auth.routes.js';
import advisoryRoutes from './routes/advisory.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { initSockets } from './sockets/index.js';
import Delivery from './models/Delivery.js';
import { initSocketsDbAsync } from './services/socketsDb.service.js';

/** Older schema versions used unique: true on truckId; drop so repeat dispatches work. */
async function dropLegacyTruckIdUniqueIndex() {
  try {
    const coll = Delivery.collection;
    const indexes = await coll.indexes();
    for (const idx of indexes) {
      if (idx.key?.truckId === 1 && idx.unique) {
        await coll.dropIndex(idx.name);
        console.log(`Dropped legacy unique index on truckId (${idx.name})`);
      }
    }
  } catch (e) {
    console.warn('Index cleanup skipped:', e.message);
  }
}

const app = express();
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(helmet());
app.use(express.json());

app.use(requestLogger);

app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/advisory', advisoryRoutes);

app.get('/health', (req, res) => res.json({ status: 'Smart Supply Backend v1.0 • Scalable & AI-ready' }));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.IO
initSockets(server);

if (process.env.NODE_ENV !== 'test') {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-supply';
  mongoose
    .connect(MONGO_URI)
    .then(async () => {
      console.log('Connected to MongoDB');
      await dropLegacyTruckIdUniqueIndex();
      await initSocketsDbAsync();
      server.listen(PORT, () => {
        console.log(`Backend running on port ${PORT}`);
      });
    })
    .catch((err) => console.error('MongoDB connection error:', err));
}

export { app };