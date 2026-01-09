import express from 'express';

const router = express.Router();
let database = null;

export function setDatabase(db) {
  database = db;
}

// Admin authentication middleware (reuse from admin.js)
const ADMIN_USERNAME = 'tokyo_houseparty';
const ADMIN_PASSWORD = 'Roberto.2528';

const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  req.admin = { username };
  next();
};

// Helper to parse date range from query
function getDateRange(req) {
  const { range, start, end } = req.query;
  const now = new Date();
  let startDate = null;
  let endDate = null;

  switch (range) {
    case 'today':
      startDate = now.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0] + ' 23:59:59';
      break;
    case '7d':
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = now.toISOString();
      break;
    case '30d':
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = now.toISOString();
      break;
    case 'custom':
      startDate = start || null;
      endDate = end || null;
      break;
    default:
      // Default to last 30 days
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = now.toISOString();
  }

  return { startDate, endDate };
}

// ==================== OVERVIEW ENDPOINTS ====================

// GET /api/analytics/overview - Main dashboard overview
router.get('/overview', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const overview = await database.getAnalyticsOverview(startDate, endDate);
    
    // Get listen time data
    const listenTimeData = await database.getAvgListenTimePerDay(startDate, endDate);
    const totalListenTime = listenTimeData.reduce((sum, d) => sum + (d.total_listen_time || 0), 0);
    const avgListenTimePerUserPerDay = listenTimeData.length > 0
      ? Math.round(listenTimeData.reduce((sum, d) => sum + (d.avg_per_user || 0), 0) / listenTimeData.length)
      : 0;

    res.json({
      ...overview,
      avgListenTimePerUserPerDay,
      totalListenTime,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to get analytics overview', message: error.message });
  }
});

// GET /api/analytics/dau-trend - DAU trend over time
router.get('/dau-trend', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const trend = await database.getDAUTrend(days);
    res.json({ trend, days });
  } catch (error) {
    console.error('DAU trend error:', error);
    res.status(500).json({ error: 'Failed to get DAU trend', message: error.message });
  }
});

// ==================== ACQUISITION ENDPOINTS ====================

// GET /api/analytics/acquisition - User acquisition breakdown
router.get('/acquisition', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    
    const [sources, countries, detailed] = await Promise.all([
      database.getUserAcquisition(startDate, endDate),
      database.getCountryBreakdown(startDate, endDate),
      database.getDetailedSourceBreakdown(startDate, endDate)
    ]);

    // Map sources to friendly names
    const sourceMapping = {
      'direct': 'Direct / Organic',
      'organic': 'Direct / Organic',
      'social': 'Social Media',
      'referral': 'Referral',
      'search': 'Search Engine',
      'unknown': 'Unknown'
    };

    const formattedSources = sources.map(s => ({
      source: sourceMapping[s.source] || s.source,
      count: s.count,
      percentage: 0 // Will calculate below
    }));

    const totalUsers = formattedSources.reduce((sum, s) => sum + s.count, 0);
    formattedSources.forEach(s => {
      s.percentage = totalUsers > 0 ? Math.round((s.count / totalUsers) * 100) : 0;
    });

    res.json({
      sources: formattedSources,
      countries,
      totalUsers,
      // Detailed breakdown by domain and UTM source
      topReferrers: detailed.domains,
      topUtmSources: detailed.utmSources,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Acquisition analytics error:', error);
    res.status(500).json({ error: 'Failed to get acquisition data', message: error.message });
  }
});

// ==================== ENGAGEMENT ENDPOINTS ====================

// GET /api/analytics/engagement - Engagement metrics
router.get('/engagement', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    
    const [sessionStats, listenTimeData, skipsData, searchData] = await Promise.all([
      database.getAvgSessionLength(startDate, endDate),
      database.getAvgListenTimePerDay(startDate, endDate),
      database.getSkipsPerSession(startDate, endDate),
      database.getSearchesPerUser(startDate, endDate)
    ]);

    // Calculate averages
    const avgListenTimePerDay = listenTimeData.length > 0
      ? Math.round(listenTimeData.reduce((sum, d) => sum + (d.avg_per_user || 0), 0) / listenTimeData.length)
      : 0;

    res.json({
      avgSessionLength: sessionStats.avgDuration,
      avgSessionLengthFormatted: formatDuration(sessionStats.avgDuration),
      totalSessions: sessionStats.totalSessions,
      avgListenTimePerDay,
      avgListenTimeFormatted: formatDuration(avgListenTimePerDay),
      listenTimeTrend: listenTimeData,
      skipsPerSession: skipsData.avgSkipsPerSession,
      totalSkips: skipsData.totalSkips,
      searchesPerUser: searchData.avgSearchesPerUser,
      totalSearches: searchData.totalSearches,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Engagement analytics error:', error);
    res.status(500).json({ error: 'Failed to get engagement data', message: error.message });
  }
});

// GET /api/analytics/listen-time-trend - Listen time over time
router.get('/listen-time-trend', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const trend = await database.getAvgListenTimePerDay(startDate, endDate);
    res.json({ trend, dateRange: { startDate, endDate } });
  } catch (error) {
    console.error('Listen time trend error:', error);
    res.status(500).json({ error: 'Failed to get listen time trend', message: error.message });
  }
});

// ==================== RETENTION ENDPOINTS ====================

// GET /api/analytics/retention - Retention rates
router.get('/retention', adminAuth, async (req, res) => {
  try {
    const rates = await database.getRetentionRates();
    res.json(rates);
  } catch (error) {
    console.error('Retention analytics error:', error);
    res.status(500).json({ error: 'Failed to get retention data', message: error.message });
  }
});

// GET /api/analytics/retention/cohorts - Cohort-based retention
router.get('/retention/cohorts', adminAuth, async (req, res) => {
  try {
    const cohortType = req.query.type || 'daily';
    const cohorts = await database.getRetentionCohorts(cohortType);
    res.json({ cohorts, type: cohortType });
  } catch (error) {
    console.error('Cohort retention error:', error);
    res.status(500).json({ error: 'Failed to get cohort data', message: error.message });
  }
});

// ==================== TRAFFIC SOURCES ====================

// GET /api/analytics/traffic-sources - Where users come from
router.get('/traffic-sources', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const sources = await database.getTrafficSources(days);
    
    // Calculate totals
    const totalVisits = sources.reduce((sum, s) => sum + s.visits, 0);
    const totalUniqueUsers = sources.reduce((sum, s) => sum + s.unique_users, 0);
    
    // Add percentages
    const sourcesWithPercent = sources.map(s => ({
      ...s,
      percentage: totalVisits > 0 ? Math.round((s.visits / totalVisits) * 100) : 0
    }));
    
    res.json({
      sources: sourcesWithPercent,
      totalVisits,
      totalUniqueUsers,
      days
    });
  } catch (error) {
    console.error('Traffic sources error:', error);
    res.status(500).json({ error: 'Failed to get traffic sources', message: error.message });
  }
});

// ==================== TOP CONTENT ENDPOINTS ====================

// GET /api/analytics/top-songs - Most played songs
router.get('/top-songs', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const limit = parseInt(req.query.limit) || 20;
    const songs = await database.getMostPlayedSongs(limit);
    res.json({ songs, dateRange: { startDate, endDate } });
  } catch (error) {
    console.error('Top songs error:', error);
    res.status(500).json({ error: 'Failed to get top songs', message: error.message });
  }
});

// GET /api/analytics/top-artists - Most played artists
router.get('/top-artists', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const limit = parseInt(req.query.limit) || 20;
    const artists = await database.getMostPlayedArtists(limit, startDate, endDate);
    res.json({ artists, dateRange: { startDate, endDate } });
  } catch (error) {
    console.error('Top artists error:', error);
    res.status(500).json({ error: 'Failed to get top artists', message: error.message });
  }
});

// ==================== SESSIONS PER USER (Hidden Metric) ====================

// GET /api/analytics/sessions-per-user - Sessions per user per day
router.get('/sessions-per-user', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req);
    const data = await database.getSessionsPerUserPerDay(startDate, endDate);
    
    const avgSessionsPerUser = data.length > 0
      ? Math.round((data.reduce((sum, d) => sum + d.sessions_per_user, 0) / data.length) * 100) / 100
      : 0;

    res.json({
      trend: data,
      avgSessionsPerUser,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Sessions per user error:', error);
    res.status(500).json({ error: 'Failed to get sessions per user data', message: error.message });
  }
});

// ==================== TRACKING ENDPOINTS (for frontend to call) ====================

// POST /api/analytics/session/start - Start a session
router.post('/session/start', async (req, res) => {
  try {
    const { userId, sessionToken } = req.body;
    if (!userId || !sessionToken) {
      return res.status(400).json({ error: 'userId and sessionToken required' });
    }

    // Get client info
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'Unknown';
    const userAgent = req.headers['user-agent'] || '';
    const country = req.headers['cf-ipcountry'] || 'Unknown'; // Cloudflare header
    const device = parseDevice(userAgent);

    const session = await database.createSession(userId, sessionToken, ipAddress, country, device, userAgent);
    res.json({ success: true, sessionId: session.id });
  } catch (error) {
    console.error('Session start error:', error);
    res.status(500).json({ error: 'Failed to start session', message: error.message });
  }
});

// POST /api/analytics/session/heartbeat - Keep session alive
router.post('/session/heartbeat', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ error: 'sessionToken required' });
    }
    await database.updateSessionHeartbeat(sessionToken);
    res.json({ success: true });
  } catch (error) {
    console.error('Session heartbeat error:', error);
    res.status(500).json({ error: 'Failed to update session', message: error.message });
  }
});

// POST /api/analytics/session/end - End a session
router.post('/session/end', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ error: 'sessionToken required' });
    }
    await database.endSession(sessionToken);
    res.json({ success: true });
  } catch (error) {
    console.error('Session end error:', error);
    res.status(500).json({ error: 'Failed to end session', message: error.message });
  }
});

// POST /api/analytics/listen/start - Start listening to a track
router.post('/listen/start', async (req, res) => {
  try {
    const { userId, musicId, sessionId } = req.body;
    if (!userId || !musicId) {
      return res.status(400).json({ error: 'userId and musicId required' });
    }
    const event = await database.logListenStart(userId, musicId, sessionId || null);
    res.json({ success: true, listenEventId: event.id });
  } catch (error) {
    console.error('Listen start error:', error);
    res.status(500).json({ error: 'Failed to log listen start', message: error.message });
  }
});

// POST /api/analytics/listen/end - End listening (with duration/skip info)
router.post('/listen/end', async (req, res) => {
  try {
    const { listenEventId, durationListened, completed, skipped, skipPosition } = req.body;
    if (!listenEventId) {
      return res.status(400).json({ error: 'listenEventId required' });
    }
    await database.logListenEnd(
      listenEventId,
      durationListened || 0,
      completed || false,
      skipped || false,
      skipPosition || null
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Listen end error:', error);
    res.status(500).json({ error: 'Failed to log listen end', message: error.message });
  }
});

// POST /api/analytics/search - Log a search
router.post('/search', async (req, res) => {
  try {
    const { userId, query, resultsCount } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query required' });
    }
    await database.logSearch(userId || null, query, resultsCount || 0);
    res.json({ success: true });
  } catch (error) {
    console.error('Search log error:', error);
    res.status(500).json({ error: 'Failed to log search', message: error.message });
  }
});

// ==================== HELPER FUNCTIONS ====================

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function parseDevice(userAgent) {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return 'iOS';
  } else if (ua.includes('android')) {
    return 'Android';
  } else if (ua.includes('windows')) {
    return 'Windows';
  } else if (ua.includes('macintosh') || ua.includes('mac os')) {
    return 'macOS';
  } else if (ua.includes('linux')) {
    return 'Linux';
  }
  
  return 'Other';
}

export default router;






