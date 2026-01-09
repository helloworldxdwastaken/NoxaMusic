import express from 'express';
import { generateToken, verifyToken } from '../middleware/jwtAuth.js';
import { validatePassword, validateUsername } from '../utils/passwordValidator.js';
import { logUserAccess } from '../utils/accessLogger.js';

const router = express.Router();

// Database will be injected from main app
let database = null;

export const setDatabase = (db) => {
  database = db;
};

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Validate user credentials
    const user = await database.validatePassword(username, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await database.updateLastLogin(user.id);

    // Don't send password back
    const { password_hash, ...userWithoutPassword } = user;

    // Generate secure JWT token
    const token = generateToken(user);
    
    await logUserAccess(req, user, { force: true });

    res.json({
      success: true,
      user: userWithoutPassword,
      token: token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password, referrer, utmSource, utmMedium, utmCampaign } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ 
        error: 'Invalid username', 
        details: usernameValidation.errors 
      });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ 
        error: 'Weak password', 
        details: passwordValidation.errors 
      });
    }

    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Check if user exists
    const existingUser = await database.getUserByUsername(username);

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Parse referral source from referrer URL and UTM params
    const referralSource = parseReferralSource(referrer, utmSource);
    const referralData = {
      referrer: referrer || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      signup_ip: req.headers['x-forwarded-for']?.split(',')[0] || req.ip,
      signup_country: req.headers['cf-ipcountry'] || null,
      signup_device: req.headers['user-agent'] || null
    };

    // Create new user with referral info
    const newUser = await database.createUser(username, password, referralSource, referralData);

    // Generate secure JWT token
    const token = generateToken(newUser);
    
    await logUserAccess(req, newUser, { force: true });

    res.json({
      success: true,
      user: newUser,
      token: token
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Signup failed', message: error.message });
  }
});

// Parse referral source from referrer URL and UTM params
function parseReferralSource(referrer, utmSource) {
  // UTM source takes priority if provided
  if (utmSource) {
    const source = utmSource.toLowerCase();
    if (['reddit', 'twitter', 'x', 'facebook', 'instagram', 'tiktok', 'discord', 'youtube'].includes(source)) {
      return 'social';
    }
    if (['google', 'bing', 'duckduckgo', 'yahoo', 'baidu'].includes(source)) {
      return 'search';
    }
    return 'referral';
  }

  // Parse from referrer URL
  if (!referrer || referrer === '') {
    return 'direct';
  }

  try {
    const url = new URL(referrer);
    const hostname = url.hostname.toLowerCase();

    // Social media platforms
    const socialDomains = [
      'reddit.com', 'www.reddit.com', 'old.reddit.com',
      'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
      'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com',
      'instagram.com', 'www.instagram.com',
      'tiktok.com', 'www.tiktok.com',
      'discord.com', 'discord.gg',
      'youtube.com', 'www.youtube.com', 'youtu.be',
      'linkedin.com', 'www.linkedin.com',
      'threads.net', 'www.threads.net'
    ];

    // Search engines
    const searchDomains = [
      'google.com', 'www.google.com', 'google.co.uk', 'google.ca',
      'bing.com', 'www.bing.com',
      'duckduckgo.com', 'www.duckduckgo.com',
      'yahoo.com', 'search.yahoo.com',
      'baidu.com', 'www.baidu.com',
      'ecosia.org', 'www.ecosia.org'
    ];

    if (socialDomains.some(d => hostname.includes(d.replace('www.', '')))) {
      return 'social';
    }

    if (searchDomains.some(d => hostname.includes(d.replace('www.', '')))) {
      return 'search';
    }

    // Any other external referrer
    return 'referral';
  } catch (e) {
    // Invalid URL
    return 'direct';
  }
}


// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify JWT token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }


    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Get fresh user data from database
    const user = await database.getUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { password_hash, ...userWithoutPassword } = user;
    await logUserAccess(req, user);
    res.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

export default router;
