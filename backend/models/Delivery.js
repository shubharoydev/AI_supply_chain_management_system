import mongoose from 'mongoose';
import crypto from 'crypto';

const deliverySchema = new mongoose.Schema(
  {
    origin: { type: String, required: true, index: true },
    destinations: [{ type: String }],
    /** Fingerprint for cascading detection (same corridor / lane) */
    routeHash: { type: String, index: true },
    optimizedRoute: [{ lat: Number, lng: Number }],
    currentLocation: { lat: Number, lng: Number },
    routeProgressIndex: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'in-transit', 'at-risk', 'delayed', 'delivered'],
      default: 'pending',
      index: true,
    },
    ETA: { type: Date },
    delayPrediction: {
      probability: Number,
      minutes: Number,
      historicalBaseline: Number,
    },
    historicalDelayBaseline: { type: Number, default: 40 },
    riskScore: { type: Number, default: 0, index: true },
    truckId: { type: String, required: true, index: true },
    cargoType: {
      type: String,
      enum: ['general', 'essential', 'pharma'],
      default: 'general',
      index: true,
    },
    cargoValue: {
      type: Number,
      default: 50000,
    },
    simulationTick: { type: Number, default: 0 },
    /** Fire cascading mitigation once when risk spikes */
    cascadeMitigated: { type: Boolean, default: false },
    activeObstacles: [{ type: String }],
    /** Manager who created this delivery (for email alerts) */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

deliverySchema.index({ status: 1, riskScore: -1 });
deliverySchema.index({ routeHash: 1, status: 1 });

deliverySchema.pre('validate', function () {
  if (!this.routeHash && this.origin && this.destinations?.length) {
    const key = `${this.origin}|${this.destinations[0]}`;
    this.routeHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }
});

export default mongoose.model('Delivery', deliverySchema);
