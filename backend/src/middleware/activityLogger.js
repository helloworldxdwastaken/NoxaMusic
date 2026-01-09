import { verifyToken } from './jwtAuth.js';
import { logUserAccess } from '../utils/accessLogger.js';

const activityLogger = (req, res, next) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.replace('Bearer ', '')
      : null;

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        Promise.resolve(logUserAccess(req, decoded)).catch((error) => {
          console.warn('Activity logger failed:', error?.message || error);
        });
      }
    }
  } catch (error) {
    // Ignore invalid tokens for logging purposes
  }

  next();
};

export default activityLogger;
