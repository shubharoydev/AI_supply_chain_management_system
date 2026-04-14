import arcjet, { tokenBucket } from "@arcjet/node";

// Create specific Arcjet instance for Gemini API routes (20 requests per day per user)
const geminiRateLimiter = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: [
    tokenBucket({
      mode: process.env.NODE_ENV === 'production' ? "LIVE" : "DRY_RUN",
      refillRate: 50,      // 20 tokens per day
      interval: 86400,     // 24 hours in seconds
      capacity: 50,        // Maximum 20 requests per day
    }),
  ],
});

// Middleware for Gemini rate limiting
const geminiRateLimit = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.ip;
    
    const decision = await geminiRateLimiter.protect(req, { 
      userId,
      requested: 1,
    });

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': 20,
      'X-RateLimit-Remaining': decision.remaining,
      'X-RateLimit-Reset': decision.resetTime,
    });

    if (decision.isDenied()) {
      return res.status(429).json({ 
        error: 'Too Many Requests',
        message: 'Daily Gemini API limit exceeded. Maximum 20 requests per day.',
        retryAfter: decision.retryAfter 
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

export { geminiRateLimit};