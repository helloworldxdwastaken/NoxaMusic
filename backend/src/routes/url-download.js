// URL Download Routes - Download songs directly from Spotify/YouTube URLs
// Handles single song URLs and YouTube playlist URLs

import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserIdFromToken as jwtGetUserIdFromToken } from '../middleware/jwtAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Database and download function will be injected
let database = null;
let moveToLibraryFunction = null;

export const setDatabase = (db) => {
  database = db;
};

export const setMoveToLibraryFunction = (fn) => {
  moveToLibraryFunction = fn;
};

// Helper function to extract user ID from token using JWT
function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  // Use proper JWT verification
  return jwtGetUserIdFromToken(req);
}

// Download single song from Spotify or YouTube URL
router.post('/song', async (req, res) => {
  try {
    const { url, playlistId } = req.body;
    const userId = getUserIdFromToken(req);
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    // Validate URL format
    const isSpotify = url.includes('spotify.com/track/');
    const isYoutube = url.includes('youtube.com/watch') || url.includes('youtu.be/');
    
    if (!isSpotify && !isYoutube) {
      return res.status(400).json({ 
        error: 'Invalid URL', 
        message: 'Please provide a Spotify track URL or YouTube video URL' 
      });
    }
    
    console.log(`📥 Download single song from ${isSpotify ? 'Spotify' : 'YouTube'}: ${url}`);
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const downloadId = `url_${Date.now()}`;
    
    // Return immediately
    res.json({ 
      success: true, 
      downloadId, 
      message: `Starting download from ${isSpotify ? 'Spotify' : 'YouTube'}...`,
      source: isSpotify ? 'spotify' : 'youtube'
    });
    
    // Process in background
    (async () => {
      try {
        const tempOutputDir = path.join(__dirname, '..', '..', 'downloads', `dl_${downloadId}`);
        if (!fs.existsSync(tempOutputDir)) {
          fs.mkdirSync(tempOutputDir, { recursive: true });
        }
        
        // Create initial download entry
        await database.addDownload({
          id: downloadId,
          title: 'Extracting...',
          artist: 'Processing URL...',
          album: 'URL Download',
          status: 'searching',
          progress: 0,
          created_at: new Date().toISOString(),
          user_id: userId,
          playlist_id: playlistId || null
        });
        
        // Use spotdl to download from URL
        const spotdl = spawn('python3', [
          '-m', 'spotdl',
          'download',
          url,
          '--output', tempOutputDir,
          '--format', 'mp3',
          '--bitrate', '320k',
          '--overwrite', 'skip',
          '--print-errors'
        ]);
        
        let output = '';
        
        spotdl.stdout.on('data', (data) => {
          output += data.toString();
          console.log('spotdl:', data.toString().trim());
        });
        
        spotdl.stderr.on('data', (data) => {
          const text = data.toString();
          console.log('spotdl stderr:', text.trim());
          
          // Update progress if we can detect it
          if (text.includes('%')) {
            const progressMatch = text.match(/(\d+)%/);
            if (progressMatch) {
              const progress = parseInt(progressMatch[1]);
              database.updateDownloadStatus(downloadId, 'downloading', progress).catch(() => {});
            }
          }
        });
        
        spotdl.on('close', async (code) => {
          try {
            if (code !== 0) {
              throw new Error(`Download failed with code ${code}`);
            }
            
            // Find downloaded file
            const files = fs.readdirSync(tempOutputDir);
            const mp3File = files.find(f => f.endsWith('.mp3'));
            
            if (!mp3File) {
              throw new Error('No MP3 file found after download');
            }
            
            const fullPath = path.join(tempOutputDir, mp3File);
            
            // Extract metadata from filename (spotdl format: "Artist - Title.mp3")
            const filenameParts = mp3File.replace('.mp3', '').split(' - ');
            const artist = filenameParts.length >= 2 ? filenameParts[0].trim() : 'Unknown Artist';
            const title = filenameParts.length >= 2 ? filenameParts.slice(1).join(' - ').trim() : mp3File.replace('.mp3', '');
            
            console.log(`✅ Downloaded: ${artist} - ${title}`);
            
            // Update download entry with actual metadata (need to update fields individually)
            await new Promise((resolve, reject) => {
              database.db.run(
                'UPDATE downloads SET title = ?, artist = ?, status = ?, progress = ? WHERE id = ?',
                [title, artist, 'downloading', 95, downloadId],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            
            // Move to library
            if (moveToLibraryFunction) {
              const musicId = await moveToLibraryFunction(fullPath, title, artist, 'Singles', userId);
              
              // Mark as completed
              await database.updateDownloadStatus(downloadId, 'completed', 100);
              
              // Auto-add to playlist if specified
              if (playlistId && musicId) {
                try {
                  await database.addTrackToPlaylist(playlistId, musicId);
                  console.log(`✅ Auto-added to playlist ${playlistId}`);
                } catch (err) {
                  if (!err.message.includes('UNIQUE')) {
                    console.warn('Could not add to playlist:', err.message);
                  }
                }
              }
              
              console.log(`✅ URL download completed: ${artist} - ${title}`);
            }
            
            // Cleanup temp directory
            fs.rmSync(tempOutputDir, { recursive: true, force: true });
            
          } catch (error) {
            console.error('Error processing download:', error);
            await database.updateDownloadStatus(downloadId, 'failed', 0);
            
            // Cleanup on error
            if (fs.existsSync(tempOutputDir)) {
              fs.rmSync(tempOutputDir, { recursive: true, force: true });
            }
          }
        });
        
      } catch (error) {
        console.error('URL download error:', error);
        await database.updateDownloadStatus(downloadId, 'failed', 0);
      }
    })();
    
  } catch (error) {
    console.error('Download URL endpoint error:', error);
    res.status(500).json({ error: 'Failed to start download', message: error.message });
  }
});

// Download YouTube playlist
router.post('/youtube-playlist', async (req, res) => {
  try {
    const { url, playlistName } = req.body;
    const userId = getUserIdFromToken(req);
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }
    
    // Validate YouTube playlist URL
    const isYouTubePlaylist = url.includes('youtube.com/playlist') || url.includes('youtube.com/watch');
    
    if (!isYouTubePlaylist) {
      return res.status(400).json({ 
        error: 'Invalid URL', 
        message: 'Please provide a YouTube playlist URL' 
      });
    }
    
    console.log(`📥 YouTube playlist import: ${url}`);
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Return immediately
    res.json({ 
      success: true, 
      message: 'Extracting YouTube playlist... This may take a moment.',
      sequentialMode: true
    });
    
    // Process in background
    (async () => {
      try {
        const tempFile = path.join('/tmp', `yt_playlist_${Date.now()}.spotdl`);
        
        console.log(`🎵 Extracting YouTube playlist with spotdl...`);
        
        // Use spotdl to extract playlist info
        const spotdl = spawn('python3', [
          '-m', 'spotdl',
          'save',
          url,
          '--save-file', tempFile,
          '--print-errors'
        ]);
        
        let output = '';
        let completed = false;
        
        const timeout = setTimeout(() => {
          if (!completed) {
            spotdl.kill('SIGTERM');
            setTimeout(() => spotdl.kill('SIGKILL'), 2000);
          }
        }, 180000); // 3 minutes
        
        spotdl.stdout.on('data', (data) => {
          output += data.toString();
          console.log('spotdl:', data.toString().trim());
        });
        
        spotdl.stderr.on('data', (data) => {
          console.log('spotdl stderr:', data.toString().trim());
        });
        
        spotdl.on('close', async (code) => {
          clearTimeout(timeout);
          completed = true;
          
          try {
            // Wait for file to be written
            let fileExists = false;
            for (let i = 0; i < 10; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              if (fs.existsSync(tempFile)) {
                fileExists = true;
                break;
              }
            }
            
            if (!fileExists) {
              throw new Error('Playlist file not created');
            }
            
            const fileContent = fs.readFileSync(tempFile, 'utf8');
            const tracks = JSON.parse(fileContent);
            fs.unlinkSync(tempFile);
            
            console.log(`✅ Extracted ${tracks.length} tracks from YouTube playlist`);
            
            const formattedTracks = tracks.map(t => ({
              title: t.name || t.title || 'Unknown',
              artist: Array.isArray(t.artists) ? t.artists.join(', ') : (t.artist || 'Unknown'),
              album: t.album_name || t.album || 'YouTube',
              duration: t.duration || 0
            }));
            
            const finalPlaylistName = playlistName || 'YouTube Playlist ' + new Date().toLocaleDateString();
            
            // Import using existing sequential download logic
            const { startSequentialPlaylistDownload } = await import('./download.js');
            startSequentialPlaylistDownload(finalPlaylistName, formattedTracks, userId);
            
            console.log(`✅ YouTube playlist import started: ${formattedTracks.length} tracks`);
            
          } catch (error) {
            console.error('YouTube playlist extraction error:', error);
          }
        });
        
      } catch (error) {
        console.error('YouTube playlist import error:', error);
      }
    })();
    
  } catch (error) {
    console.error('YouTube playlist endpoint error:', error);
    res.status(500).json({ error: 'Failed to import playlist', message: error.message });
  }
});

// Download song by search query (artist - title)
// Uses yt-dlp to search YouTube directly (no Spotify API needed)
router.post('/search', async (req, res) => {
  try {
    const { artist, title, album } = req.body;
    const userId = getUserIdFromToken(req);
    
    if (!artist || !title) {
      return res.status(400).json({ error: 'Artist and title required' });
    }
    
    const searchQuery = `${artist} - ${title}`;
    console.log(`📥 Download by search (YouTube): ${searchQuery}`);
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const downloadId = `yt_${Date.now()}`;
    
    // Return immediately
    res.json({ 
      success: true, 
      downloadId, 
      message: `Searching YouTube for "${title}" by ${artist}...`
    });
    
    // Process in background using yt-dlp (no Spotify API needed)
    (async () => {
      try {
        const tempOutputDir = path.join(__dirname, '..', '..', 'downloads', `dl_${downloadId}`);
        if (!fs.existsSync(tempOutputDir)) {
          fs.mkdirSync(tempOutputDir, { recursive: true });
        }
        
        // Create initial download entry
        await database.addDownload({
          id: downloadId,
          title: title,
          artist: artist,
          album: album || 'Unknown Album',
          status: 'searching',
          progress: 0,
          created_at: new Date().toISOString(),
          user_id: userId
        });
        
        const outputTemplate = path.join(tempOutputDir, '%(artist)s - %(title)s.%(ext)s');
        
        // Use yt-dlp to search YouTube and download audio
        const ytdlp = spawn('yt-dlp', [
          `ytsearch1:${searchQuery}`,  // Search YouTube, get first result
          '-x',                         // Extract audio
          '--audio-format', 'mp3',
          '--audio-quality', '0',       // Best quality
          '-o', outputTemplate,
          '--embed-thumbnail',
          '--add-metadata',
          '--no-playlist',
          '--progress'
        ]);
        
        let output = '';
        let hasStartedDownload = false;
        
        ytdlp.stdout.on('data', (data) => {
          output += data.toString();
          const text = data.toString();
          console.log('yt-dlp:', text.trim());
          
          // Update status when download starts
          if (text.includes('[download]') && !hasStartedDownload) {
            hasStartedDownload = true;
            database.updateDownloadStatus(downloadId, 'downloading', 10).catch(() => {});
          }
          
          // Parse progress
          const progressMatch = text.match(/(\d+\.?\d*)%/);
          if (progressMatch) {
            const progress = Math.min(95, Math.round(parseFloat(progressMatch[1])));
            database.updateDownloadStatus(downloadId, 'downloading', progress).catch(() => {});
          }
        });
        
        ytdlp.stderr.on('data', (data) => {
          const text = data.toString();
          console.log('yt-dlp stderr:', text.trim());
        });
        
        ytdlp.on('close', async (code) => {
          try {
            if (code !== 0) {
              throw new Error(`yt-dlp failed with code ${code}`);
            }
            
            // Find downloaded file
            const files = fs.readdirSync(tempOutputDir);
            const mp3File = files.find(f => f.endsWith('.mp3'));
            
            if (!mp3File) {
              throw new Error('No MP3 file found after download');
            }
            
            const fullPath = path.join(tempOutputDir, mp3File);
            console.log(`✅ Downloaded from YouTube: ${mp3File}`);
            
            // Move to library with proper metadata
            if (moveToLibraryFunction) {
              await moveToLibraryFunction(fullPath, title, artist, album || 'Singles', userId);
            }
            
            await database.updateDownloadStatus(downloadId, 'completed', 100, `Downloaded: ${title}`);
            
            // Cleanup temp folder
            fs.rmSync(tempOutputDir, { recursive: true, force: true });
            
          } catch (error) {
            console.error('YouTube download processing error:', error);
            await database.updateDownloadStatus(downloadId, 'failed', 0, error.message);
            try { fs.rmSync(tempOutputDir, { recursive: true, force: true }); } catch {}
          }
        });
        
        ytdlp.on('error', async (error) => {
          console.error('yt-dlp process error:', error);
          await database.updateDownloadStatus(downloadId, 'failed', 0, error.message);
        });
        
      } catch (error) {
        console.error('YouTube search download error:', error);
        await database.updateDownloadStatus(downloadId, 'failed', 0, error.message);
      }
    })();
    
  } catch (error) {
    console.error('Search download endpoint error:', error);
    res.status(500).json({ error: 'Failed to start download', message: error.message });
  }
});

export default router;

