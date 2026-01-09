// YouTube Music Playlist Import Route
// Handles YouTube Music playlist extraction and downloading logic

import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserIdFromToken as jwtGetUserIdFromToken } from '../middleware/jwtAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Will be set by index.js
let database = null;
let downloadMusicFunction = null;

export const setDatabase = (db) => {
  database = db;
};

export const setDownloadFunction = (fn) => {
  downloadMusicFunction = fn;
};

// Helper function to extract user ID from token using JWT
function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  // Use proper JWT verification
  return jwtGetUserIdFromToken(req);
}

// Normalize string for comparison (lowercase, trim, remove special chars)
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

// Main YouTube Music playlist import endpoint
router.post('/import', async (req, res) => {
  try {
    const { playlistUrl, playlistName } = req.body;
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL required' });
    }
    
    // Extract user ID from authorization token
    const userId = getUserIdFromToken(req);
    console.log('🔐 YouTube Music playlist import - User ID:', userId || 'Not authenticated');
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Clean URL - remove &si= tracking parameter
    const cleanUrl = playlistUrl.split('&si=')[0];
    console.log('🎵 Extracting YouTube Music playlist:', cleanUrl);
    
    // Extract playlist using yt-dlp
    const result = await extractYouTubeMusicPlaylist(cleanUrl);
    
    if (!result || !result.tracks || result.tracks.length === 0) {
      return res.status(500).json({
        error: true,
        message: 'Failed to extract playlist. No tracks found.'
      });
    }
    
    console.log(`✅ Extracted ${result.tracks.length} tracks from YouTube Music`);
    console.log(`📋 Playlist name: "${result.playlistName}"`);
    
    // Use provided playlist name, or extracted name, or fallback to generic
    const finalPlaylistName = playlistName || result.playlistName || 'YouTube Music Import';
    const tracks = result.tracks;
    
    // Start background download process
    startPlaylistDownload(finalPlaylistName, tracks, userId);
    
    // Calculate time estimate (1 minute per track)
    const minutes = Math.ceil(tracks.length * 1);
    const timeEstimate = minutes === 1 ? '1 minute' : `${minutes} minutes`;
    
    // Send response immediately
    res.json({
      success: true,
      playlistName: finalPlaylistName,
      trackCount: tracks.length,
      message: `Found ${tracks.length} songs!\n\nStarting sequential scan automatically to avoid rate limits.`,
      sequentialMode: true,
      timeEstimate: timeEstimate
    });
    
  } catch (error) {
    console.error('❌ YouTube Music playlist import error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error: ' + error.message
    });
  }
});

// Extract YouTube Music playlist metadata using yt-dlp
async function extractYouTubeMusicPlaylist(playlistUrl) {
  return new Promise((resolve, reject) => {
    console.log(`📡 Using yt-dlp to extract YouTube Music playlist...`);
    console.log(`📝 URL: ${playlistUrl}`);
    
    // Use yt-dlp to extract playlist metadata
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      '--playlist-end', '1000', // Limit to 1000 songs max
      playlistUrl
    ], {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        LC_ALL: 'en_US.UTF-8',
        LANG: 'en_US.UTF-8'
      }
    });
    
    let output = '';
    let errorOutput = '';
    let completed = false;
    const tracks = [];
    let playlistTitle = null;
    
    // Add error handler immediately after spawn
    ytdlp.on('error', (error) => {
      if (!completed) {
        clearTimeout(timeout);
        completed = true;
        console.error('❌ yt-dlp spawn error:', error.message);
        reject(new Error(`Failed to start yt-dlp: ${error.message}`));
      }
    });
    
    // Timeout for extraction - 10 minutes
    const timeout = setTimeout(() => {
      if (!completed) {
        console.log('\n⏰ 10-minute timeout reached - killing yt-dlp');
        ytdlp.kill('SIGTERM');
        setTimeout(() => {
          if (!completed) ytdlp.kill('SIGKILL');
        }, 2000);
      }
    }, 600000);
    
    // Parse JSON output line by line
    ytdlp.stdout.on('data', (data) => {
      const text = data.toString('utf8');
      output += text;
      
      // Each line should be a JSON object for a track
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const trackData = JSON.parse(line);
          
          // Extract playlist title from first entry (if available)
          if (!playlistTitle && trackData.playlist_title) {
            playlistTitle = trackData.playlist_title;
            console.log(`\n📋 Playlist name: "${playlistTitle}"`);
          }
          
          // Also try to get playlist title from playlist field
          if (!playlistTitle && trackData.playlist) {
            playlistTitle = trackData.playlist;
            console.log(`\n📋 Playlist name: "${playlistTitle}"`);
          }
          
          if (trackData.title) {
            tracks.push(trackData);
            process.stdout.write('.');
          }
        } catch (e) {
          // Not a JSON line, skip
        }
      }
    });
    
    ytdlp.stderr.on('data', (data) => {
      const text = data.toString('utf8');
      errorOutput += text;
      
      if (text.includes('rate limit') || text.includes('429')) {
        console.warn('\n⚠️  RATE LIMIT DETECTED!');
      }
    });
    
    ytdlp.on('close', async (code) => {
      clearTimeout(timeout);
      completed = true;
      
      try {
        console.log(`\n📋 Found ${tracks.length} tracks in playlist`);
        
        if (tracks.length === 0) {
          if (errorOutput.includes('rate limit') || errorOutput.includes('429')) {
            reject(new Error('Rate limit reached. Please wait a few minutes and try again.'));
          } else if (code !== 0) {
            reject(new Error(`yt-dlp failed with exit code: ${code}\n${errorOutput}`));
          } else {
            reject(new Error('No tracks found in playlist'));
          }
          return;
        }
        
        // Format tracks for our system
        const formattedTracks = tracks.map(t => {
          // Try to extract artist from title (YouTube format is usually "Artist - Title")
          let artist = 'Unknown Artist';
          let title = t.title || 'Unknown';
          
          if (title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          }
          
          // Use uploader as artist if we couldn't extract from title
          if (artist === 'Unknown Artist' && t.uploader) {
            artist = t.uploader.replace(' - Topic', '').trim();
          }
          
          return {
            title: title,
            artist: artist,
            album: 'YouTube Music Import',
            duration: t.duration || 0,
            url: t.url || `https://www.youtube.com/watch?v=${t.id}`
          };
        });
        
        // Use extracted playlist title or fallback to generic name
        const finalPlaylistName = playlistTitle || 'YouTube Music Import';
        
        resolve({
          playlistName: finalPlaylistName,
          tracks: formattedTracks
        });
        
      } catch (error) {
        console.error('❌ Error parsing playlist data:', error);
        reject(error);
      }
    });
    
    // Error handler already added above (duplicate removed)
  });
}

// Background download function
async function startPlaylistDownload(playlistName, tracks, userId) {
  console.log(`🎵 Starting background download for "${playlistName}" with ${tracks.length} tracks`);
  
  // Check if playlist with same name already exists for this user
  let playlistId = null;
  if (database) {
    try {
      const existingPlaylists = await database.getPlaylists(userId);
      const existingPlaylist = existingPlaylists.find(p => 
        p.name.toLowerCase() === playlistName.toLowerCase()
      );
      
      if (existingPlaylist) {
        playlistId = existingPlaylist.id;
        console.log(`📋 Found existing playlist "${playlistName}" (ID: ${playlistId}) - will add missing songs`);
        
        // Get songs already in this playlist
        const existingTracks = await database.getPlaylistTracks(playlistId, userId);
        const existingSongKeys = new Set(
          existingTracks.map(t => `${normalizeString(t.artist)}_${normalizeString(t.title)}`)
        );
        
        console.log(`   Playlist already has ${existingTracks.length} songs`);
        
        // Filter out songs that are already in the playlist
        const originalCount = tracks.length;
        tracks = tracks.filter(track => {
          const key = `${normalizeString(track.artist)}_${normalizeString(track.title)}`;
          return !existingSongKeys.has(key);
        });
        
        const skipped = originalCount - tracks.length;
        if (skipped > 0) {
          console.log(`   ⏭️ Skipping ${skipped} songs already in playlist`);
        }
        console.log(`   📥 Will download ${tracks.length} new songs`);
        
        if (tracks.length === 0) {
          console.log('✅ All songs already in playlist - nothing to download!');
          return;
        }
      } else {
        // Create new playlist
        const playlist = await database.createPlaylist(userId, playlistName, `Imported from YouTube Music - ${tracks.length} tracks`);
        playlistId = playlist.id;
        console.log(`📝 Created new playlist "${playlistName}" (ID: ${playlistId})`);
      }
    } catch (error) {
      console.error('❌ Failed to handle playlist:', error);
    }
  }
  
  // Get all songs in library to check for duplicates
  const existingLibrary = await database.getMusicLibrary(null, 0, userId);
  const libraryMap = new Map();
  existingLibrary.forEach(song => {
    const key = `${normalizeString(song.artist)}_${normalizeString(song.title)}`;
    libraryMap.set(key, song);
  });
  console.log(`📚 Found ${existingLibrary.length} songs in library`);
  
  // Download tracks sequentially (1 per minute to avoid rate limits)
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const delay = i * 60000; // 1 minute delay
    
    setTimeout(() => {
      // Wrap async operations in a proper promise chain to catch all errors
      (async () => {
        try {
          console.log(`🎵 [${i + 1}/${tracks.length}] Processing: ${track.artist} - ${track.title}`);
          
          const trackKey = `${normalizeString(track.artist)}_${normalizeString(track.title)}`;
          const existingInLibrary = libraryMap.get(trackKey);
          
          if (existingInLibrary) {
            console.log(`   ⏭️ Song already in library (ID: ${existingInLibrary.id}) - adding to playlist`);
            
            // Add existing song to playlist
            try {
              if (database) {
                await database.addTrackToPlaylist(playlistId, existingInLibrary.id, null, userId);
                console.log(`   ✅ Added existing song to playlist`);
              }
            } catch (playlistError) {
              if (!playlistError.message.includes('UNIQUE') && !playlistError.message.includes('already in playlist')) {
                console.warn(`   ⚠️ Could not add to playlist:`, playlistError.message);
              } else {
                console.log(`   ℹ️ Song already in playlist, skipping`);
              }
            }
            return;
          }
          
          // Song not in library - download it
          console.log(`   📥 Song not in library - downloading...`);
          
          if (!downloadMusicFunction) {
            console.error('❌ Download function not available');
            return;
          }
          
          if (!database) {
            console.error('❌ Database not available');
            return;
          }
          
          const downloadId = `ytmusic_import_${Date.now()}_${i}`;
          await database.addDownload({
            id: downloadId,
            title: track.title,
            artist: track.artist,
            album: track.album,
            status: 'queued',
            progress: 0,
            created_at: new Date().toISOString(),
            user_id: userId,
            playlist_id: playlistId
          });
          
          // Start download
          await downloadMusicFunction(track.title, track.artist, track.album, downloadId, userId, playlistId);
          
          console.log(`✅ [${i + 1}/${tracks.length}] Completed: ${track.artist} - ${track.title}`);
          
        } catch (error) {
          console.error(`❌ [${i + 1}/${tracks.length}] Failed: ${track.artist} - ${track.title}`);
          console.error(`   Error details:`, error.message);
          console.error(`   Stack:`, error.stack);
        }
      })().catch(err => {
        // Catch any unhandled errors from the async function
        console.error(`❌ CRITICAL ERROR in YouTube Music download [${i + 1}/${tracks.length}]:`, err);
        console.error(`   Stack:`, err.stack);
      });
    }, delay);
  }
  
  console.log(`⏰ Scheduled ${tracks.length} downloads over ${Math.ceil(tracks.length)} minutes`);
}

export default router;

