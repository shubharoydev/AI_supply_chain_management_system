import dotenv from 'dotenv';
dotenv.config();

import redis from '../config/redis.js';

function parseArgs(argv) {
  const args = { minutes: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--delivery' || a === '-d') args.deliveryId = argv[++i];
    else if (a === '--minutes' || a === '-m') args.minutes = Number(argv[++i]);
    else if (a === '--off') args.off = true;
    else if (a === '--on') args.on = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const ttlSec = Math.max(30, Math.floor((Number.isFinite(args.minutes) ? args.minutes : 10) * 60));

const key = args.deliveryId
  ? `demo:delivery:${args.deliveryId}:force_high_risk`
  : 'demo:force_high_risk';

if (args.off && args.on) {
  console.error('Use either --on or --off (not both).');
  process.exit(1);
}

try {
  if (args.off) {
    await redis.del(key);
    console.log(`Demo high-risk OFF: ${key}`);
  } else {
    await redis.setex(key, ttlSec, '1');
    console.log(`Demo high-risk ON for ${Math.round(ttlSec / 60)} min: ${key}`);
  }
} catch (e) {
  console.error('Failed to toggle demo high-risk:', e?.message || e);
  process.exit(1);
} finally {
  try {
    await redis.quit();
  } catch {
    // ignore
  }
}
