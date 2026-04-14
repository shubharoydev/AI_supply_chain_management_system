import express from 'express';
import { register, login, refreshToken, logout, getMe } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {arcjetRateLimiter} from '../middleware/rateLimit.middleware.js';

const router = express.Router();
const rateLimiter = arcjetRateLimiter();

// Public routes
router.post('/register', rateLimiter, register);
router.post('/login', rateLimiter, login);
router.post('/refresh', rateLimiter, refreshToken);

// Protected routes
router.post('/logout', rateLimiter, logout);
router.get('/me', rateLimiter, authenticate, getMe);

export default router;
