import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import redis from '../config/redis.js';
import { v4 as uuidv4 } from 'uuid';
import { jwtConfig } from '../config/jwt.js';
import bcrypt from 'bcryptjs';

// Generate access token (short-lived)
const generateAccessToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      username: user.username, 
      role: user.role 
    },
    jwtConfig.secret,
    { expiresIn: '15m' } // Short-lived access token
  );
};

// Store refresh token in Redis with expiration
const storeRefreshTokenInRedis = async (userId, refreshToken, deviceId) => {
  const key = `refresh_token:${userId}:${deviceId}`;
  await redis.setex(key, 7 * 24 * 60 * 60, refreshToken); // 7 days TTL
  await redis.setex(`refresh_token_rev:${refreshToken}`, 7 * 24 * 60 * 60, userId); // map token back to user
};

// Get refresh token from Redis
const getRefreshTokenFromRedis = async (userId, deviceId) => {
  const key = `refresh_token:${userId}:${deviceId}`;
  return await redis.get(key);
};

// Remove refresh token from Redis
const removeRefreshTokenFromRedis = async (userId, deviceId) => {
  const key = `refresh_token:${userId}:${deviceId}`;
  await redis.del(key);
};

export const register = async (req, res) => {
  try {
    const { username, password, email, role = 'manager' } = req.body;

    // Validate input
    if (!username || !password || !email) {
      return res.status(400).json({ message: 'Username, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({ 
      username, 
      email,
      password: hashedPassword, 
      role 
    });
    await user.save();

    res.status(201).json({ 
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Registration failed', 
      error: error.message 
    });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const deviceId = req.headers['user-agent'] || 'unknown-device'; // Use user-agent as device identifier

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatched = await user.comparePassword(password);
    if (!isMatched) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = uuidv4();

    // Store refresh token in Redis for fast lookup
    await storeRefreshTokenInRedis(user._id.toString(), refreshToken, deviceId);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Login failed', 
      error: error.message 
    });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const deviceId = req.headers['user-agent'] || 'unknown-device';

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    // Find user by parsing token if needed, or assume deviceId has token.
    // Instead of querying DB for refresh token, we expect the front-end to just send the token.
    // However, the previous logic found the user via DB. Since we no longer save in DB,
    // we need the user ID. We can decode the expired access token if provided, but let's 
    // fetch the user if the token exists in Redis. Wait, Redis key is user_id:deviceId.
    // We can use a backward mapping or search keys if needed.
    // Actually, getting all keys is slow. Let's assume the client sends userId in payload or we just check DB if needed.
    // Wait, the client only sends refreshToken. So let's store token -> userId in Redis too!
    const userId = await redis.get(`refresh_token_rev:${refreshToken}`);
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Verify refresh token in Redis as well
    const storedToken = await getRefreshTokenFromRedis(user._id.toString(), deviceId);
    if (storedToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token only (refresh token stays the same)
    const accessToken = generateAccessToken(user);

    res.json({ accessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      message: 'Token refresh failed', 
      error: error.message 
    });
  }
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const deviceId = req.headers['user-agent'] || 'unknown-device';

    if (refreshToken) {
      const userId = await redis.get(`refresh_token_rev:${refreshToken}`);
      if (userId) {
        // Remove from Redis (both mappings)
        await removeRefreshTokenFromRedis(userId, deviceId);
        await redis.del(`refresh_token_rev:${refreshToken}`);
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      message: 'Logout failed', 
      error: error.message 
    });
  }
};

export const getMe = async (req, res) => {
  try {
    // User is already attached to request by auth middleware
    const user = await User.findById(req.user.id).select('-password -refreshTokens');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      message: 'Failed to get user', 
      error: error.message 
    });
  }
};
