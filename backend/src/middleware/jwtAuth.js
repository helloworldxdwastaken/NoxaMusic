import jwt from 'jsonwebtoken';
import { logUserAccess } from '../utils/accessLogger.js';

// JWT Secret - in production, use a strong random secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days default

/**
 * Generate JWT token for a user
 * @param {Object} user - User object with id and username
 * @returns {String} JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username
  };
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'noxa-music-app'
  });
}

/**
 * Verify JWT token and extract user data
 * @param {String} token - JWT token
 * @returns {Object|null} Decoded user data or null if invalid
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
}

/**
 * Express middleware to protect routes with JWT authentication
 * Usage: router.get('/protected', authenticateJWT, (req, res) => { ... })
 */
export function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  // Attach user data to request
  req.user = decoded;
  Promise.resolve(logUserAccess(req, decoded)).catch((error) => {
    console.warn('Activity logging error:', error?.message || error);
  });
  next();
}

/**
 * Get user ID from JWT token in request
 * @param {Object} req - Express request object
 * @returns {String|null} User ID or null
 */
export function getUserIdFromToken(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    
    const decoded = verifyToken(token);
    return decoded ? decoded.id : null;
  } catch (error) {
    return null;
  }
}

export default {
  generateToken,
  verifyToken,
  authenticateJWT,
  getUserIdFromToken
};
