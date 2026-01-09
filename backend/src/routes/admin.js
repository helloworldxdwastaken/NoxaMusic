import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

let database = null;

export const setDatabase = (db) => {
  database = db;
};

// Hardcoded admin credentials
const ADMIN_USERNAME = 'tokyo_houseparty';
const ADMIN_PASSWORD = 'Roberto.2528';

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Decode Basic Auth
  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.admin = { username };
  next();
};

// Get all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const users = await database.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users', message: error.message });
  }
});

// Get user status (who was connected today, who is online now)
router.get('/user-status', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Get users who were active today (from access_logs)
    const todayUsers = await new Promise((resolve, reject) => {
      database.db.all(
        `SELECT DISTINCT user_id FROM access_logs 
         WHERE DATE(accessed_at) = DATE('now')`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Get all users with their last activity from access_logs (with online status calculated in SQL)
    const allUsers = await database.getAllUsers();
    const usersWithStatus = await Promise.all(allUsers.map(async (user) => {
      // Get last activity for this user from access_logs with online status calculated in SQL
      const lastActivityRow = await new Promise((resolve, reject) => {
        database.db.get(
          `SELECT 
            MAX(accessed_at) as last_activity, 
            country, 
            device,
            CASE WHEN MAX(accessed_at) >= datetime('now', '-5 minutes') THEN 1 ELSE 0 END as is_online
           FROM access_logs WHERE user_id = ?`,
          [user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row || {});
          }
        );
      });

      const lastActivity = lastActivityRow?.last_activity || null;
      
      // Check if user was active today
      const wasActiveToday = todayUsers.some(tu => tu.user_id === user.id);
      
      // Online status from SQL calculation (more reliable than JS date parsing)
      const isOnline = lastActivityRow?.is_online === 1;

      return {
        ...user,
        last_activity: lastActivity,
        country: lastActivityRow?.country || null,
        device: lastActivityRow?.device || null,
        was_active_today: wasActiveToday,
        is_online: isOnline
      };
    }));

    res.json({
      users: usersWithStatus,
      summary: {
        total_users: usersWithStatus.length,
        active_today: usersWithStatus.filter(u => u.was_active_today).length,
        online_now: usersWithStatus.filter(u => u.is_online).length
      }
    });
  } catch (error) {
    console.error('Error getting user status:', error);
    res.status(500).json({ error: 'Failed to get user status', message: error.message });
  }
});

// Get admin dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Use the proper database method that includes file sizes
    const stats = await database.getMusicStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to get admin stats', message: error.message });
  }
});

// Get user statistics (music count per user)
router.get('/user-stats', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const users = await database.getAllUsers();
    
    // Get music count for each user (unique songs in their playlists)
    const userStats = await Promise.all(users.map(async (user) => {
      const musicCount = await new Promise((resolve, reject) => {
        database.db.get(
          `SELECT COUNT(DISTINCT pt.music_id) as count 
           FROM playlist_tracks pt 
           JOIN playlists p ON pt.playlist_id = p.id 
           WHERE p.user_id = ?`,
          [user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          }
        );
      });
      
      return {
        ...user,
        music_count: musicCount
      };
    }));
    
    res.json(userStats);
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ error: 'Failed to get user stats', message: error.message });
  }
});

// Get access logs and activity summary
router.get('/access-logs', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const hours = Math.min(parseInt(req.query.hours || '24', 10), 168); // cap at 7 days
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

    const [recentUsers, logs] = await Promise.all([
      database.getRecentAccessSummary(hours),
      database.getLatestAccessLogs(limit)
    ]);

    const aggregateCounts = (items, key) => {
      return Object.entries(
        items.reduce((acc, item) => {
          const label = item[key] || 'Unknown';
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        }, {})
      )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
    };

    const countryStats = aggregateCounts(recentUsers, 'country');
    const deviceStats = aggregateCounts(recentUsers, 'device');

    res.json({
      summary: {
        hours,
        active_users: recentUsers.length,
        top_country: countryStats[0]?.label || 'Unknown',
        top_device: deviceStats[0]?.label || 'Unknown',
        countries: countryStats.slice(0, 5),
        devices: deviceStats.slice(0, 5),
        sample_size: logs.length
      },
      recentUsers,
      logs
    });
  } catch (error) {
    console.error('Error getting access logs:', error);
    res.status(500).json({ error: 'Failed to get access logs', message: error.message });
  }
});

// Update yt-dlp
router.post('/update-ytdlp', adminAuth, async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    
    console.log('🔄 Updating yt-dlp...');
    
    const updateProcess = spawn('pip3', ['install', '--upgrade', 'yt-dlp', '--break-system-packages'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    updateProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    updateProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    updateProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ yt-dlp updated successfully');
        res.json({ 
          success: true, 
          message: 'yt-dlp updated successfully',
          output: output
        });
      } else {
        console.error('❌ Failed to update yt-dlp:', errorOutput);
        res.status(500).json({ 
          error: 'Failed to update yt-dlp', 
          message: errorOutput 
        });
      }
    });
    
    updateProcess.on('error', (error) => {
      console.error('❌ Update process error:', error);
      res.status(500).json({ 
        error: 'Update process failed', 
        message: error.message 
      });
    });
    
  } catch (error) {
    console.error('Update yt-dlp error:', error);
    res.status(500).json({ error: 'Failed to update yt-dlp', message: error.message });
  }
});

// Update spotdl
router.post('/update-spotdl', adminAuth, async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    
    console.log('🔄 Updating spotdl...');
    
    const updateProcess = spawn('pip3', ['install', '--upgrade', 'spotdl', '--break-system-packages'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    updateProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    updateProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    updateProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ spotdl updated successfully');
        res.json({ 
          success: true, 
          message: 'spotdl updated successfully',
          output: output
        });
      } else {
        console.error('❌ Failed to update spotdl:', errorOutput);
        res.status(500).json({ 
          error: 'Failed to update spotdl', 
          message: errorOutput 
        });
      }
    });
    
    updateProcess.on('error', (error) => {
      console.error('❌ Update process error:', error);
      res.status(500).json({ 
        error: 'Update process failed', 
        message: error.message 
      });
    });
    
  } catch (error) {
    console.error('Update spotdl error:', error);
    res.status(500).json({ error: 'Failed to update spotdl', message: error.message });
  }
});

// Check tool versions
router.get('/check-versions', adminAuth, async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    
    console.log('🔍 Checking tool versions...');
    
    const versions = {};
    
    // Check yt-dlp version
    try {
      const ytdlpProcess = spawn('yt-dlp', ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let ytdlpOutput = '';
      
      ytdlpProcess.stdout.on('data', (data) => {
        ytdlpOutput += data.toString();
      });
      
      await new Promise((resolve, reject) => {
        ytdlpProcess.on('close', (code) => {
          if (code === 0) {
            versions.ytdlp = ytdlpOutput.trim();
            resolve();
          } else {
            versions.ytdlp = 'Unknown';
            resolve();
          }
        });
        
        ytdlpProcess.on('error', () => {
          versions.ytdlp = 'Not installed';
          resolve();
        });
      });
    } catch (error) {
      versions.ytdlp = 'Error checking';
    }
    
    // Check spotdl version
    try {
      const spotdlProcess = spawn('python3', ['-m', 'spotdl', '--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let spotdlOutput = '';
      
      spotdlProcess.stdout.on('data', (data) => {
        spotdlOutput += data.toString();
      });
      
      await new Promise((resolve, reject) => {
        spotdlProcess.on('close', (code) => {
          if (code === 0) {
            versions.spotdl = spotdlOutput.trim();
            resolve();
          } else {
            versions.spotdl = 'Unknown';
            resolve();
          }
        });
        
        spotdlProcess.on('error', () => {
          versions.spotdl = 'Not installed';
          resolve();
        });
      });
    } catch (error) {
      versions.spotdl = 'Error checking';
    }
    
    console.log('✅ Version check completed:', versions);
    res.json({ 
      success: true, 
      versions: versions
    });
    
  } catch (error) {
    console.error('Check versions error:', error);
    res.status(500).json({ error: 'Failed to check versions', message: error.message });
  }
});

// Get user by ID
router.get('/users/:userId', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const user = await database.getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to get user', message: error.message });
  }
});

// Get music library stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const stats = await database.getMusicStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// Get disk usage information
router.get('/disk-usage', adminAuth, async (req, res) => {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Get disk usage for the music directory
    const musicPath = process.env.MUSIC_PATH || '/home/tokyo/Desktop/music_app/backend/music';
    const { stdout } = await execAsync(`df -h "${musicPath}"`);
    const lines = stdout.trim().split('\n');
    const dataLine = lines[1]; // Second line contains the data
    const parts = dataLine.split(/\s+/);
    
    // Parse disk usage (format: Filesystem Size Used Avail Use% Mounted-on)
    const totalSize = parts[1]; // e.g., "300G"
    const usedSize = parts[2];  // e.g., "34G"
    const availableSize = parts[3]; // e.g., "266G"
    const usagePercent = parseInt(parts[4].replace('%', '')); // e.g., 12
    
    res.json({
      total: totalSize,
      used: usedSize,
      available: availableSize,
      usagePercent: usagePercent
    });
  } catch (error) {
    console.error('Error getting disk usage:', error);
    res.status(500).json({ error: 'Failed to get disk usage', message: error.message });
  }
});

// Get real-time system stats (CPU, RAM, disk, uptime)
router.get('/system-stats', adminAuth, async (req, res) => {
  try {
    const os = await import('os');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // CPU Usage - efficient calculation using os.cpus()
    const cpus = os.cpus();
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;
    
    // Memory Usage - instant read from os module
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    // Format memory in GB
    const totalMemoryGB = (totalMemory / (1024 ** 3)).toFixed(2);
    const usedMemoryGB = (usedMemory / (1024 ** 3)).toFixed(2);
    const freeMemoryGB = (freeMemory / (1024 ** 3)).toFixed(2);
    
    // Disk Usage - use cached result from /api/admin/disk-usage endpoint logic
    let diskStats = null;
    try {
      const musicPath = process.env.MUSIC_PATH || '/home/tokyo/Desktop/music_app/backend/music';
      const { stdout } = await execAsync(`df -h "${musicPath}"`);
      const lines = stdout.trim().split('\n');
      const dataLine = lines[1];
      const parts = dataLine.split(/\s+/);
      
      diskStats = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        usagePercent: parseInt(parts[4].replace('%', ''))
      };
    } catch (diskError) {
      console.error('Disk stats error:', diskError);
      diskStats = {
        total: 'N/A',
        used: 'N/A',
        available: 'N/A',
        usagePercent: 0
      };
    }
    
    // System Uptime
    const uptimeSeconds = os.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeFormatted = `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`;
    
    // CPU count
    const cpuCount = cpus.length;
    const cpuModel = cpus[0].model;
    
    // Platform info
    const platform = os.platform();
    const architecture = os.arch();
    
    res.json({
      cpu: {
        usage: parseFloat(cpuUsage.toFixed(1)),
        count: cpuCount,
        model: cpuModel,
        architecture: architecture
      },
      memory: {
        total: totalMemoryGB,
        used: usedMemoryGB,
        free: freeMemoryGB,
        usagePercent: parseFloat(memoryUsagePercent.toFixed(1))
      },
      disk: diskStats,
      system: {
        platform: platform,
        uptime: uptimeFormatted,
        uptimeSeconds: uptimeSeconds,
        hostname: os.hostname()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting system stats:', error);
    res.status(500).json({ error: 'Failed to get system stats', message: error.message });
  }
});

// Get most played songs
router.get('/most-played', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const limit = parseInt(req.query.limit) || 10;
    const songs = await database.getMostPlayedSongs(limit);
    res.json(songs);
  } catch (error) {
    console.error('Error getting most played songs:', error);
    res.status(500).json({ error: 'Failed to get most played songs', message: error.message });
  }
});

// Get all music with pagination
router.get('/music', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const music = await database.getMusicWithPagination(limit, offset);
    const total = await database.getMusicCount();

    res.json({
      music,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting music:', error);
    res.status(500).json({ error: 'Failed to get music', message: error.message });
  }
});

// Delete user
router.delete('/users/:userId', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const success = await database.deleteUser(req.params.userId);
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user', message: error.message });
  }
});

// Update user
router.put('/users/:userId', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const { username, is_active } = req.body;
    const success = await database.updateUser(req.params.userId, { username, is_active });
    
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user', message: error.message });
  }
});

// Clean up duplicate songs
router.post('/cleanup-duplicates', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const removedCount = await database.removeDuplicates();
    res.json({ 
      success: true, 
      message: `Removed ${removedCount} duplicate songs`,
      removedCount 
    });
  } catch (error) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicates', message: error.message });
  }
});

// Clean up invalid file paths
router.post('/cleanup-invalid-paths', adminAuth, async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const removedCount = await database.cleanupInvalidPaths();
    res.json({ 
      success: true, 
      message: `Removed ${removedCount} songs with invalid paths`,
      removedCount 
    });
  } catch (error) {
    console.error('Cleanup invalid paths error:', error);
    res.status(500).json({ error: 'Failed to cleanup invalid paths', message: error.message });
  }
});

// Safe library scan with streaming logs (SSE)
// Note: SSE via EventSource can't send headers, so we accept auth via query param
router.get('/scan-stream', (req, res) => {
  // Handle auth from query param (for SSE) or header (for other clients)
  let credentials = req.query.auth;
  
  if (!credentials) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      credentials = authHeader.slice(6);
    }
  }
  
  if (!credentials) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  console.log('🔍 Starting safe library scan with live streaming...');
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  sendEvent('log', '🔍 Starting safe library scan...');
  
  const scriptPath = path.resolve(__dirname, '../../scripts/manual_scan.js');
  
  const scanProcess = spawn('node', [scriptPath], {
    cwd: path.resolve(__dirname, '../../'),
    env: { ...process.env }
  });

  let fullOutput = '';

  scanProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      fullOutput += line + '\n';
      sendEvent('log', line);
    });
  });

  scanProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      fullOutput += line + '\n';
      sendEvent('error', line);
    });
  });

  scanProcess.on('close', (code) => {
    if (code === 0) {
      // Parse results from output
      const scannedMatch = fullOutput.match(/Total files scanned: (\d+)/);
      const addedMatch = fullOutput.match(/New songs added: (\d+)/);
      const pathsMatch = fullOutput.match(/Paths updated: (\d+)/);
      const artworkFoundMatch = fullOutput.match(/Album covers found: (\d+)/);
      const artworkDownloadedMatch = fullOutput.match(/Album covers downloaded: (\d+)/);
      
      const result = {
        success: true,
        scanned: scannedMatch ? parseInt(scannedMatch[1]) : 0,
        added: addedMatch ? parseInt(addedMatch[1]) : 0,
        pathsUpdated: pathsMatch ? parseInt(pathsMatch[1]) : 0,
        artworkFound: artworkFoundMatch ? parseInt(artworkFoundMatch[1]) : 0,
        artworkDownloaded: artworkDownloadedMatch ? parseInt(artworkDownloadedMatch[1]) : 0
      };

      sendEvent('complete', result);
    } else {
      sendEvent('error', `Scan failed with exit code ${code}`);
      sendEvent('complete', { success: false, error: `Process exited with code ${code}` });
    }
    res.end();
  });

  scanProcess.on('error', (error) => {
    sendEvent('error', `Failed to start scan: ${error.message}`);
    sendEvent('complete', { success: false, error: error.message });
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected from scan stream');
    scanProcess.kill();
  });
});

// Safe library scan - preserves manual metadata corrections (non-streaming fallback)
router.post('/scan', adminAuth, async (req, res) => {
  try {
    console.log('🔍 Starting safe library scan from admin panel...');
    
    const scriptPath = path.resolve(__dirname, '../../scripts/manual_scan.js');
    
    // Run the scan script as a child process
    const scanProcess = spawn('node', [scriptPath], {
      cwd: path.resolve(__dirname, '../../'),
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    scanProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    scanProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    scanProcess.on('close', (code) => {
      if (code === 0) {
        // Parse results from output
        const scannedMatch = stdout.match(/Total files scanned: (\d+)/);
        const addedMatch = stdout.match(/New songs added: (\d+)/);
        const pathsMatch = stdout.match(/Paths updated: (\d+)/);
        const artworkFoundMatch = stdout.match(/Album covers found: (\d+)/);
        const artworkDownloadedMatch = stdout.match(/Album covers downloaded: (\d+)/);
        
        const scanned = scannedMatch ? parseInt(scannedMatch[1]) : 0;
        const added = addedMatch ? parseInt(addedMatch[1]) : 0;
        const pathsUpdated = pathsMatch ? parseInt(pathsMatch[1]) : 0;
        const artworkFound = artworkFoundMatch ? parseInt(artworkFoundMatch[1]) : 0;
        const artworkDownloaded = artworkDownloadedMatch ? parseInt(artworkDownloadedMatch[1]) : 0;

        console.log(`✅ Safe scan complete: ${scanned} scanned, ${added} added, ${pathsUpdated} paths updated`);
        
        res.json({
          success: true,
          message: `Safe scan completed: ${scanned} files scanned, ${added} new songs added, ${pathsUpdated} paths updated, ${artworkFound + artworkDownloaded} artworks processed.`,
          scanned,
          added,
          pathsUpdated,
          artworkFound,
          artworkDownloaded
        });
      } else {
        console.error(`❌ Scan process exited with code ${code}`);
        res.status(500).json({ 
          error: 'Scan failed', 
          message: stderr || `Process exited with code ${code}` 
        });
      }
    });

    scanProcess.on('error', (error) => {
      console.error('Scan process error:', error);
      res.status(500).json({ error: 'Failed to start scan', message: error.message });
    });

  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ error: 'Failed to scan library', message: error.message });
  }
});

export default router;
