import { config } from './env.js';

export const jwtConfig = {
  secret: config.jwtSecret,
  expiresIn: '24h',          
  algorithm: 'HS256'
};