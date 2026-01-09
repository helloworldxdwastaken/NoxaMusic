// Dedicated Spotify Playlist Import Route
// Handles all Spotify playlist extraction and downloading logic

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

// Main playlist import endpoint
router.post('/import', async (req, res) => {
  try {
    const { playlistUrl } = req.body;
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL required' });
    }
    
    // Extract user ID from authorization token
    const userId = getUserIdFromToken(req);
    console.log('🔐 Spotify playlist import - User ID:', userId || 'Not authenticated');
    
    // Clean URL - remove tracking parameters
    const cleanUrl = playlistUrl.split('?')[0];
    console.log('🎵 Extracting Spotify playlist:', cleanUrl);
    
    // Create temp file for playlist info with UTF-8 support
    const tempFile = path.join('/tmp', `playlist_${Date.now()}.spotdl`);
    
    // Use spotdl to extract playlist to file
    const spotdl = spawn('python3', [
      '-m', 'spotdl',
      'save',
      cleanUrl,
      '--print-errors',
      '--save-file', tempFile
    ], {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',  // Force UTF-8 encoding
        LC_ALL: 'en_US.UTF-8',
        LANG: 'en_US.UTF-8'
      }
    });
    
    let output = '';
    let errorOutput = '';
    let completed = false;
    let playlistName = 'Imported Playlist';
    let trackCount = 0;
    
    // Set timeout - kill after file is written (3 minutes for large playlists)
    const timeout = setTimeout(() => {
      if (!completed) {
        console.log('⏰ Timeout reached - killing spotdl');
        spotdl.kill('SIGTERM');
        setTimeout(() => {
          if (!completed) spotdl.kill('SIGKILL');
        }, 2000);
      }
    }, 180000); // 3 minutes - handles playlists up to 200+ songs
    
    // Add error handler immediately after spawn
    spotdl.on('error', (error) => {
      if (!completed) {
        clearTimeout(timeout);
        completed = true;
        console.error('❌ spotdl spawn error:', error.message);
        res.status(500).json({
          error: true,
          message: `Failed to start spotdl: ${error.message}. Make sure spotdl is installed.`
        });
      }
    });
    
    spotdl.stdout.on('data', (data) => {
      const text = data.toString('utf8'); // Explicit UTF-8 decoding
      output += text;
      console.log('spotdl:', text.trim());
    });
    
    spotdl.stderr.on('data', (data) => {
      const text = data.toString('utf8'); // Explicit UTF-8 decoding
      errorOutput += text;
      
      // Check for rate limiting
      if (text.includes('rate/request limit') || text.includes('rate limit')) {
        console.warn('⚠️ SPOTIFY RATE LIMIT DETECTED!');
      }
    });
    
    spotdl.on('close', async (code) => {
      clearTimeout(timeout);
      completed = true;
      
      try {
        // Extract playlist name and track count from output
        const playlistMatch = output.match(/Found (\d+) songs in (.+?)\s*\(Playlist\)/s);
        if (playlistMatch) {
          trackCount = parseInt(playlistMatch[1]);
          playlistName = playlistMatch[2].replace(/\n/g, '').trim();
          console.log(`📋 Playlist: "${playlistName}" with ${trackCount} tracks`);
        }
        
        // Wait for .spotdl file to be written
        let fileExists = false;
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (fs.existsSync(tempFile)) {
            fileExists = true;
            console.log(`✅ Found .spotdl file after ${i + 1} seconds`);
            break;
          }
        }
        
        if (!fileExists) {
          // Handle rate limiting
          if (errorOutput.includes('rate limit')) {
            return res.status(429).json({
              error: true,
              rateLimited: true,
              message: 'Spotify rate limit reached. Please wait 15-20 minutes.',
              waitTime: 15
            });
          }
          
          return res.status(500).json({
            error: true,
            message: 'Failed to extract playlist. No tracks found.'
          });
        }
        
        // Read and parse the .spotdl file with UTF-8 encoding
        const fileContent = fs.readFileSync(tempFile, { encoding: 'utf8' });
        console.log('📄 File size:', fileContent.length, 'bytes');
        
        if (fileContent.trim().length === 0) {
          fs.unlinkSync(tempFile);
          return res.status(500).json({
            error: true,
            message: 'Playlist file is empty. Please try again.'
          });
        }
        
        let tracks = [];
        try {
          tracks = JSON.parse(fileContent);
          console.log(`✅ Parsed ${tracks.length} tracks from .spotdl file`);
        } catch (parseError) {
          console.error('❌ Failed to parse JSON:', parseError.message);
          fs.unlinkSync(tempFile);
          return res.status(500).json({
            error: true,
            message: 'Failed to parse playlist data. Please try again.'
          });
        }
        
        // Clean up temp file
        fs.unlinkSync(tempFile);
        
        if (tracks.length === 0) {
          return res.status(500).json({
            error: true,
            message: 'No tracks found in playlist.'
          });
        }
        
        // Format tracks with proper character encoding
        const formattedTracks = tracks.map(t => ({
          title: t.name || t.title || 'Unknown',
          artist: Array.isArray(t.artists) ? t.artists.join(', ') : (t.artist || 'Unknown'),
          album: t.album_name || t.album || 'Import',
          duration: t.duration || 0
        }));
        
        console.log('📝 Sample track:', formattedTracks[0]);
        
        // Start background download process
        startPlaylistDownload(playlistName, formattedTracks, userId);
        
        // Calculate time estimate (1 minute per track)
        const minutes = Math.ceil(formattedTracks.length * 1);
        const timeEstimate = minutes === 1 ? '1 minute' : `${minutes} minutes`;
        
        // Send response immediately
        res.json({
          success: true,
          playlistName: playlistName,
          trackCount: formattedTracks.length,
          message: `Found "${playlistName}" with ${formattedTracks.length} songs!\n\nStarting sequential scan automatically to avoid rate limits.`,
          sequentialMode: true,
          timeEstimate: timeEstimate
        });
        
      } catch (error) {
        console.error('❌ Error processing playlist:', error);
        res.status(500).json({
          error: true,
          message: 'Failed to process playlist: ' + error.message
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Playlist import error:', error);
    res.status(500).json({
      error: true,
      message: 'Server error: ' + error.message
    });
  }
});

// Background download function
async function startPlaylistDownload(playlistName, tracks, userId) {
  console.log(`🎵 Starting background download for "${playlistName}" with ${tracks.length} tracks`);
  
  // Check if playlist with same name already exists for this user
  let playlistId = null;
  if (database) {
    try {
      const existingPlaylists = await database.getPlaylists(userId);
      const existingPlaylist = existingPlaylists.find(p => p.name === playlistName);
      
      if (existingPlaylist) {
        playlistId = existingPlaylist.id;
        console.log(`📋 Found existing playlist "${playlistName}" (ID: ${playlistId}) - will add missing songs`);
        
        // Get songs already in this playlist
        const existingTracks = await database.getPlaylistTracks(playlistId, userId);
        const existingSongKeys = new Set(
          existingTracks.map(t => `${t.artist?.toLowerCase()}_${t.title?.toLowerCase()}`)
        );
        
        console.log(`   Playlist already has ${existingTracks.length} songs`);
        
        // Filter out songs that are already in the playlist
        const originalCount = tracks.length;
        tracks = tracks.filter(track => {
          const key = `${track.artist?.toLowerCase()}_${track.title?.toLowerCase()}`;
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
        const playlist = await database.createPlaylist(userId, playlistName, `Imported from Spotify - ${tracks.length} tracks`);
        playlistId = playlist.id;
        console.log(`📝 Created new playlist "${playlistName}" (ID: ${playlistId})`);
      }
    } catch (error) {
      console.error('❌ Failed to handle playlist:', error);
    }
  }
  
  // Download tracks sequentially (1 per minute to avoid rate limits)
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const delay = i * 60000; // 1 minute delay
    
    setTimeout(() => {
      // Wrap async operations in a proper promise chain to catch all errors
      (async () => {
        try {
          console.log(`🎵 [${i + 1}/${tracks.length}] Processing: ${track.artist} - ${track.title}`);
          
          if (!downloadMusicFunction) {
            console.error('❌ Download function not available');
            return;
          }
          
          if (!database) {
            console.error('❌ Database not available');
            return;
          }
          
          // Check if song already exists in library
          const existingInLibrary = await database.findMusicByArtistAndTitle(track.artist, track.title);
          
          if (existingInLibrary) {
            console.log(`   ⏭️ Song already in library (ID: ${existingInLibrary.id}) - adding to playlist`);
            
            // Add existing song to playlist
            try {
              await database.addTrackToPlaylist(playlistId, existingInLibrary.id);
              console.log(`   ✅ Added existing song to playlist`);
            } catch (playlistError) {
              if (!playlistError.message.includes('UNIQUE')) {
                console.warn(`   ⚠️ Could not add to playlist:`, playlistError.message);
              } else {
                console.log(`   ℹ️ Song already in playlist, skipping`);
              }
            }
            return;
          }
          
          // Song not in library - download it
          console.log(`   📥 Song not in library - downloading...`);
          
          const downloadId = `playlist_${Date.now()}_${i}`;
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
        console.error(`❌ CRITICAL ERROR in Spotify playlist download [${i + 1}/${tracks.length}]:`, err);
        console.error(`   Stack:`, err.stack);
      });
    }, delay);
  }
  
  console.log(`⏰ Scheduled ${tracks.length} downloads over ${Math.ceil(tracks.length)} minutes`);
}

export default router;




