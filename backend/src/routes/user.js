import express from 'express';

const router = express.Router();
let db = null;

export const setDatabase = (database) => {
  db = database;
};

// Extract user ID from token
const getUserIdFromToken = (req) => {
  const authHeader = req.headers.authorization;
  console.log('🔐 [User Prefs] Authorization header:', authHeader ? 'Present' : 'Missing');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ [User Prefs] Invalid authorization header format');
    return null;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer '
  console.log('🔑 [User Prefs] Token received:', token);
  
  // Token format is 'token_userId'
  if (token.startsWith('token_')) {
    const userId = parseInt(token.substring(6), 10);
    console.log('✅ [User Prefs] User ID extracted:', userId);
    return userId;
  }
  
  console.log('❌ [User Prefs] Token format invalid');
  return null;
};

// Get user preferences (including theme)
router.get('/preferences', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await db.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      theme: user.theme_preference || 'apple-glass-black',
      username: user.username
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Update user theme preference
router.post('/theme', async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    const { theme } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate theme
    const validThemes = ['apple-glass', 'apple-glass-black'];
    if (!validThemes.includes(theme)) {
      return res.status(400).json({ error: 'Invalid theme' });
    }

    // Update user theme preference
    const updated = await db.updateUser(userId, { theme_preference: theme });
    
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update theme' });
    }

    console.log(`✅ User ${userId} changed theme to: ${theme}`);
    
    res.json({ 
      success: true, 
      theme,
      message: 'Theme updated successfully'
    });
  } catch (error) {
    console.error('Error updating theme:', error);
    res.status(500).json({ error: 'Failed to update theme' });
  }
});

export default router;

