import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for authentication endpoints (login/signup)
 * Prevents brute force attacks by limiting login attempts
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login attempts per 15 minutes
  message: {
    error: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  skipFailedRequests: false
});

/**
 * Stricter rate limiter for signup endpoint
 * Prevents spam account creation
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 signups per hour
  message: {
    error: 'Too many accounts created from this IP, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * General API rate limiter
 * Protects against DDoS and abuse - relaxed for development/normal usage
 */
export const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 2000, // Limit each IP to 2000 requests per minute (very relaxed for dev)
  message: {
    error: 'Too many requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for static files and common assets
  skip: (req) => {
    const path = req.path.toLowerCase();
    return path.startsWith('/artwork_cache') || 
           path.startsWith('/music_lib') ||
           path.startsWith('/images') ||
           path.startsWith('/icons') ||
           path.endsWith('.css') || 
           path.endsWith('.js') ||
           path.endsWith('.html') ||
           path.endsWith('.png') ||
           path.endsWith('.jpg') ||
           path.endsWith('.jpeg') ||
           path.endsWith('.svg') ||
           path.endsWith('.ico') ||
           path.endsWith('.woff') ||
           path.endsWith('.woff2');
  }
});

export default {
  authLimiter,
  signupLimiter,
  generalLimiter
};

