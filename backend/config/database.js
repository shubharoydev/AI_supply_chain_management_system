import mongoose from 'mongoose';
import { config } from './env.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    console.log(' MongoDB connected + indexed');
    // Production indexing
    mongoose.model('Delivery').createIndexes();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};