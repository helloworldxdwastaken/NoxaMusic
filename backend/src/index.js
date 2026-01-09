import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import Database from './database.js';
import MusicScanner from './musicScanner.js';
import { authLimiter, signupLimiter, generalLimiter } from './middleware/rateLimiter.js';
import activityLogger from './middleware/activityLogger.js';
// import WebSocketManager from './websocket.js'; // Disabled - device sync removed
import musicRoutes from './routes/music.js';
import downloadRoutes, { setDatabase as setDownloadDatabase, downloadMusicWithSpotdl, moveSingleFileToLibrary } from './routes/download.js';
import spotifyPlaylistRoutes, { setDatabase as setSpotifyDatabase, setDownloadFunction } from './routes/spotify-playlist.js';
import youtubeMusicPlaylistRoutes, { setDatabase as setYouTubeMusicDatabase, setDownloadFunction as setYouTubeMusicDownloadFunction } from './routes/youtube-music-playlist.js';
import urlDownloadRoutes, { setDatabase as setUrlDownloadDatabase, setMoveToLibraryFunction } from './routes/url-download.js';
import libraryRoutes from './routes/library.js';
import authRoutes, { setDatabase as setAuthDatabase } from './routes/auth.js';
import adminRoutes, { setDatabase as setAdminDatabase } from './routes/admin.js';
import playlistRoutes, { setDatabase as setPlaylistDatabase } from './routes/playlists.js';
import { setDatabase as setLibraryDatabase, setMusicScanner as setLibraryScanner } from './routes/library.js';
import fileManagerRoutes from './routes/fileManager.js';
import userRoutes, { setDatabase as setUserDatabase } from './routes/user.js';
import loggerRoutes from './routes/logger.js';
import analyticsRoutes, { setDatabase as setAnalyticsDatabase } from './routes/analytics.js';
import lyricsRoutes from './routes/lyrics.js';
import { setAccessLoggerDatabase } from './utils/accessLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
// Force restart 2025-12-24 attempt 2

// Initialize database and music scanner
let database = null;
let musicScanner = null;

async function initializeApp() {
  try {
    // Initialize database
    database = new Database();
    await database.init();

    // Initialize music scanner
    musicScanner = new MusicScanner(database);

    // Set music directories to scan - Use MUSIC_PATH from .env or default to backend/music
    const backendMusicPath = process.env.MUSIC_PATH || path.resolve(path.join(__dirname, '..', 'music'));
    const downloadsPath = path.resolve(path.join(__dirname, '..', 'downloads', 'organized'));
    const musicPaths = [backendMusicPath, downloadsPath];

    musicScanner.setScanPaths(musicPaths);

    // Inject dependencies into routes
    setAuthDatabase(database);
    setLibraryDatabase(database);
    setAdminDatabase(database);
    setDownloadDatabase(database);
    setSpotifyDatabase(database);
    setDownloadFunction(downloadMusicWithSpotdl);  // Pass download function to Spotify route
    setYouTubeMusicDatabase(database);
    setYouTubeMusicDownloadFunction(downloadMusicWithSpotdl);  // Pass download function to YouTube Music route
    setUrlDownloadDatabase(database);
    setMoveToLibraryFunction(moveSingleFileToLibrary);  // Pass move function to URL download route
    setPlaylistDatabase(database);
    setUserDatabase(database);
    setLibraryScanner(musicScanner);
    setAccessLoggerDatabase(database);
    setAnalyticsDatabase(database);

    console.log('✅ Database and music scanner initialized');
    console.log(`📁 Music paths: ${musicPaths.join(', ')}`);

  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    process.exit(1);
  }
}

// Background music scanning (non-blocking)
async function backgroundMusicScan() {
  try {
    if (process.env.AUTO_SCAN === 'true' && musicScanner) {
      // Wait a bit for the server to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('🔄 Auto-scan enabled - Starting background music library scan...');
      const result = await musicScanner.scanAllDirectories();
      console.log(`✅ Background scan complete: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);

      // Start post-scan tasks in background (non-blocking) - Always check for missing artwork/reconnection
      setImmediate(async () => {
        try {
          // First, reconnect orphaned playlist tracks
          const { cleanupOrphanedPlaylistTracks } = await import('./services/playlistCleanup.js');
          console.log('🔗 Starting playlist cleanup after background scan...');
          const playlistResult = await cleanupOrphanedPlaylistTracks(database);
          console.log(`✅ Playlist cleanup complete: ${playlistResult.reconnected} reconnected, ${playlistResult.removed} removed`);

          // Then, fetch artwork for missing tracks
          const { fetchArtworkForLibrary } = await import('./services/artworkService.js');
          console.log('🎨 Starting artwork fetch after background scan...');
          const artworkResult = await fetchArtworkForLibrary(database, false);
          console.log(`✅ Artwork fetch complete: ${artworkResult.updated} tracks updated`);
        } catch (error) {
          console.error('⚠️ Error in post-scan tasks:', error.message);
        }
      });
    } else {
      console.log('⏸️  Auto-scan disabled - Use manual scan from Library page');
      if (process.env.MANUAL_MODE === 'true') {
        console.log('ℹ️  Manual mode active - All changes require user confirmation');
        console.log('📋 Original metadata preservation enabled');
      }
    }
  } catch (error) {
    console.error('⚠️ Background scan error:', error.message);
  }
}

// Middleware
// Trust only the first proxy (for ngrok/reverse proxies) - more secure than 'true'
app.set('trust proxy', 1);
// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now (can be configured later for production)
  crossOriginEmbedderPolicy: false // Allow embedding for music streaming
}));

// General rate limiting for all requests (prevents DDoS)
app.use(generalLimiter);

// Allow all origins for ngrok and local network access
app.use(cors({
  origin: true, // Allow any origin (for ngrok, local network, etc.)
  credentials: true
}));
// Parse JSON with UTF-8 support for special characters (ñ, á, etc.)
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(activityLogger);

// Routes
// Authentication routes with rate limiting
app.use('/api/auth/login', authLimiter);      // Rate limit login attempts
app.use('/api/auth/signup', signupLimiter);   // Rate limit signups
app.use('/api/auth', authRoutes);             // Authentication
app.use('/api/music', musicRoutes);           // Deezer music search & streaming
app.use('/api/download', downloadRoutes);     // Music downloads (spotdl)
app.use('/api/url-download', urlDownloadRoutes); // URL-based downloads (Spotify/YouTube single songs & YT playlists)
app.use('/api/spotify-playlist', spotifyPlaylistRoutes); // Spotify playlist import (dedicated)
app.use('/api/youtube-music-playlist', youtubeMusicPlaylistRoutes); // YouTube Music playlist import (dedicated)
app.use('/api/library', libraryRoutes);       // Local music library
app.use('/api/playlists', playlistRoutes);    // Playlist management
app.use('/api/admin', adminRoutes);           // Admin console
app.use('/api/files', fileManagerRoutes);     // File manager for music folder
app.use('/api/user', userRoutes);             // User preferences & settings
app.use('/api/logger', loggerRoutes);         // Frontend logging
app.use('/api/analytics', analyticsRoutes);   // Analytics & metrics
app.use('/api/lyrics', lyricsRoutes);         // Lyrics from LRCLIB

// Serve cached artwork
app.use('/artwork_cache', express.static(path.join(__dirname, '..', 'artwork_cache')));

// Serve music library files (for artwork and audio streaming)
const musicLibPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
app.use('/music_lib', express.static(musicLibPath, {
  setHeaders: (res, filePath) => {
    // Allow serving images and audio files
    if (/\.(jpg|jpeg|png|gif|webp|mp3|flac|m4a|wav)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    }
  }
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    database: database ? 'connected' : 'disconnected',
    musicScanner: musicScanner ? 'ready' : 'not ready',
    features: {
      musicSearch: true,
      downloads: true,
      localLibrary: true,
      persistentStorage: true
    }
  });
});

// Block direct access to admin.html (BEFORE static middleware)
app.get('/admin.html', (req, res) => {
  res.status(404).send('Not Found');
});

app.get('/admin', (req, res) => {
  res.status(404).send('Not Found');
});

// Admin panel on obscure URL (security through obscurity)
app.get('/itsfreeappdonthackme', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Clean URL routes (serve HTML files without .html extension)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// Serve frontend static files (AFTER API routes and blocking routes)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Redirect old .html URLs to clean versions (for bookmarks/cached links)
app.get('/login.html', (req, res) => {
  res.redirect(301, '/login');
});

app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

// Serve index.html for any non-API routes (SPA support)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/artwork_cache/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!', message: err.message });
});

// Start server
async function startServer() {
  await initializeApp();

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize WebSocket - DISABLED (device sync removed)
  // WebSocketManager.initialize(server);

  // Listen on 0.0.0.0 to allow local network and ngrok access
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on:`);
    console.log(`   - Local: http://localhost:${PORT}`);
    console.log(`   - Network: http://[your-ip]:${PORT}`);
    // console.log(`   - WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`   - Ready for ngrok!`);
    console.log(`\n🎵 Music API: Deezer (free) + Local Library`);
    console.log(`📥 Downloads: Spotify/YouTube (spotdl)`);
    console.log(`💾 Database: SQLite (persistent)`);
    console.log(`📁 Local Music: Enabled`);
    console.log(`🌐 Frontend: Served from /public`);
    // console.log(`🔌 Multi-Device: WebSocket enabled`);

    // Start background music scan (non-blocking)
    backgroundMusicScan().catch(err => {
      console.error('⚠️ Background scan failed:', err.message);
    });
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (database) {
    await database.close();
  }
  process.exit(0);
});

// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  // Don't exit - keep server running
});

startServer().catch(console.error);
