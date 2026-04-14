import redis from '../config/redis.js';

export const getJson = async (key) => {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
};

export const setJson = async (key, value, ttlSeconds = 600) => {
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
};

export const invalidate = async (keyPattern) => {
  const keys = await redis.keys(keyPattern);
  if (keys.length > 0) await redis.del(keys);
};