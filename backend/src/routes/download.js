import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sanitize from 'sanitize-filename';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
// Import artwork functions (now organized in artworkService but re-exported from library for compatibility)
import { fetchAlbumArt, fetchArtistImage, downloadAndCacheArtwork } from './library.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Database instance
let database = null;

export const setDatabase = (db) => {
  database = db;
};

// Add download
router.post('/add', async (req, res) => {
  try {
    const { title, artist, album, playlistId } = req.body;
    
    // Get user from token (if available)
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      // Extract user ID from token (simple implementation)
      const userIdMatch = token.match(/token_(\d+)/);
      if (userIdMatch) {
        userId = parseInt(userIdMatch[1]);
      }
    }
    
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist required' });
    }
    
    console.log(`📥 Adding download: ${artist} - ${title} (userId: ${userId}, playlistId: ${playlistId || 'none'})`);

    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Check for existing downloads to prevent duplicates
    const existingDownloads = await database.getDownloads();
    const duplicateDownload = existingDownloads.find(d => 
      d.title.toLowerCase() === title.toLowerCase() && 
      d.artist.toLowerCase() === artist.toLowerCase() &&
      (d.status === 'downloading' || d.status === 'completed' || d.status === 'searching')
    );
    
    if (duplicateDownload) {
      console.log('⚠️ Duplicate download detected:', duplicateDownload.id, duplicateDownload.status);

      if (playlistId) {
        try {
          const existingMusic = await database.findMusicByArtistAndTitle(artist, title);
          if (existingMusic) {
            console.log(`🎯 Song already downloaded. Adding music_id ${existingMusic.id} to playlist ${playlistId}.`);
            await database.addTrackToPlaylist(playlistId, existingMusic.id, null, userId);
            return res.json({
              success: true,
              message: `"${title}" is already downloaded. Added to playlist successfully.`,
              downloadId: duplicateDownload.id,
              addedToPlaylist: true
            });
          }
        } catch (playlistError) {
          console.error('Failed to add existing track to playlist:', playlistError.message);
          return res.status(400).json({
            error: 'Playlist add failed',
            message: playlistError.message
          });
        }
      }
      
      return res.status(400).json({ 
        error: 'Download already exists',
        message: `"${title}" by ${artist} is already ${duplicateDownload.status}`,
        existingDownload: duplicateDownload
      });
    }

    // Check if song already exists in music library
    const existingInLibrary = await database.findMusicByArtistAndTitle(artist, title);
    if (existingInLibrary) {
      if (playlistId) {
        try {
          console.log(`🎯 Song already in library. Adding music_id ${existingInLibrary.id} to playlist ${playlistId}.`);
          await database.addTrackToPlaylist(playlistId, existingInLibrary.id, null, userId);
          return res.json({
            success: true,
            message: `"${title}" is already in your library. Added to playlist successfully.`,
            musicId: existingInLibrary.id,
            addedToPlaylist: true
          });
        } catch (playlistError) {
          console.error('Failed to add existing library track to playlist:', playlistError.message);
          return res.status(400).json({
            error: 'Playlist add failed',
            message: playlistError.message
          });
        }
      }

      return res.status(400).json({ 
        error: 'Song already in library',
        message: `"${title}" by ${artist} is already in your music library`,
        existingMusic: existingInLibrary
      });
    }

    // Create download entry IMMEDIATELY so user sees feedback
    const downloadId = `dl_${Date.now()}`; // Unique ID
    const initialDownload = {
      id: downloadId,
      userId: userId,
      playlistId: playlistId || null,
      title: title,
      artist: artist,
      album: album,
      status: 'searching', // Show "searching" status immediately
      progress: 0,
      created_at: new Date().toISOString()
    };

    await database.addDownload(initialDownload);
    console.log('✅ Download created with searching status:', downloadId, `(playlist: ${playlistId || 'none'})`);

    // Return immediately so user sees the download in the list
    res.json({ success: true, downloadId, message: 'Starting music download...' });

    // Start spotdl download AFTER responding (async, in background)
    (async () => {
      try {
        console.log('🎵 Starting music download for:', `${artist} - ${title}`, `(playlistId: ${playlistId || 'none'})`);
        
        // Update status to downloading
        await database.updateDownloadStatus(downloadId, 'downloading', 0);
        
        // Start spotdl download (pass playlistId for auto-add)
        await downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId);
        
        console.log('✅ Music download completed:', downloadId);
      } catch (error) {
        console.error('Music download error:', error);
        await database.updateDownloadStatus(downloadId, 'failed', 0);
      }
    })();
  } catch (error) {
    console.error('Download add error:', error);
    res.status(500).json({ error: 'Failed to start download', message: error.message });
  }
});

// Get downloads for current user only
router.get('/list', async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get user from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const userIdMatch = token.match(/token_(\d+)/);
      if (userIdMatch) {
        userId = parseInt(userIdMatch[1]);
      }
    }
    
    // Filter downloads by user - each user sees only their own downloads
    const downloads = await database.getDownloads(userId);
    res.json({ success: true, downloads });
  } catch (error) {
    console.error('Get downloads error:', error);
    res.status(500).json({ error: 'Failed to retrieve downloads', message: error.message });
  }
});

// Get download status (user can only check their own downloads)
router.get('/status/:downloadId', async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get user from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const userIdMatch = token.match(/token_(\d+)/);
      if (userIdMatch) {
        userId = parseInt(userIdMatch[1]);
      }
    }

    const downloads = await database.getDownloads(userId);
    const download = downloads.find(d => d.id === downloadId);

    if (!download) {
      return res.status(404).json({ error: 'Download not found' });
    }

    res.json(download);
  } catch (error) {
    console.error('Get download status error:', error);
    res.status(500).json({ error: 'Failed to get status', message: error.message });
  }
});

// Cancel download
router.delete('/cancel/:downloadId', async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Update status to cancelled
    await database.updateDownloadStatus(downloadId, 'cancelled');
    res.json({ success: true, message: 'Download cancelled' });
  } catch (error) {
    console.error('Cancel download error:', error);
    res.status(500).json({ error: 'Failed to cancel', message: error.message });
  }
});

// Delete download
router.delete('/delete/:downloadId', async (req, res) => {
  try {
    const { downloadId } = req.params;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Remove from database
    await database.deleteDownload(downloadId);
    res.json({ success: true, message: 'Download deleted' });
  } catch (error) {
    console.error('Delete download error:', error);
    res.status(500).json({ error: 'Failed to delete', message: error.message });
  }
});

// Extract Spotify playlist tracks (using spotdl) - FAST method
router.post('/spotify-playlist', async (req, res) => {
  try {
    const { playlistUrl } = req.body;
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL required' });
    }
    
    // Clean URL - remove tracking parameters (?si=...)
    const cleanUrl = playlistUrl.split('?')[0];
    console.log('🎵 Extracting Spotify playlist:', cleanUrl);
    
    // Create temp file for playlist info  
    const tempFile = path.join(__dirname, '..', '..', `playlist_${Date.now()}.spotdl`);
    
    // Use spotdl to list playlist songs - just get the track list without downloading
    const spotdl = spawn('python3', [
      '-m', 'spotdl',
      'save',
      cleanUrl,
      '--print-errors',
      '--save-file', tempFile  // Save track list to file
    ].filter(Boolean));
    
    let output = '';
    let errorOutput = '';
    let completed = false;
    
    // Set timeout - Kill after getting song list (20 seconds to allow file writing)
    const timeout = setTimeout(() => {
      if (!completed) {
        console.log('⏰ Got playlist info - killing spotdl to avoid downloads');
        spotdl.kill('SIGTERM'); // Graceful kill
        setTimeout(() => {
          if (!completed) spotdl.kill('SIGKILL'); // Force if needed
        }, 3000);
      }
    }, 20000);
    
    const songList = [];
    
    spotdl.stdout.on('data', (data) => {
      output += data.toString();
      const text = data.toString();
      console.log('spotdl:', text.trim());
      
      // Parse song info from spotdl output - look for track information
      const lines = text.split('\n');
      for (const line of lines) {
        // Look for "Artist - Title" format in various contexts
        const songMatch = line.match(/^\s*(.+?)\s+-\s+(.+?)(?:\s*$|\s+\(|$)/);
        if (songMatch && !line.includes('Found') && !line.includes('Processing') && !line.includes('spotdl:') && !line.includes('Downloaded')) {
          const artist = songMatch[1].trim();
          const title = songMatch[2].trim();
          
          // Avoid duplicates
          const exists = songList.some(song => song.artist === artist && song.title === title);
          if (!exists) {
            songList.push({
              artist: artist,
              title: title,
              album: 'Import'
            });
            console.log(`📝 Found song: ${artist} - ${title}`);
          }
        }
      }
      
      // Kill early once we have all songs
      const playlistMatch = output.match(/Found (\d+) songs/);
      if (playlistMatch && songList.length >= parseInt(playlistMatch[1])) {
        console.log(`✅ Got all ${songList.length} songs - killing spotdl`);
        spotdl.kill('SIGTERM');
      }
    });
    
    spotdl.stderr.on('data', (data) => {
      errorOutput += data.toString();
      
      // Check for rate limiting
      if (data.toString().includes('rate/request limit') || data.toString().includes('rate limit')) {
        console.warn('⚠️ SPOTIFY RATE LIMIT DETECTED!');
        console.warn('💡 You need to wait 10-15 minutes before trying again');
      }
    });
    
    spotdl.on('close', async (code) => {
      clearTimeout(timeout);
      completed = true;
      
      try {
        let playlistName = 'Imported Playlist';
        
        // Extract playlist name (handle multi-line names with special chars)
        const playlistMatch = output.match(/Found (\d+) songs in (.+?)\s*\(Playlist\)/s);
        if (playlistMatch) {
          const trackCount = parseInt(playlistMatch[1]);
          playlistName = playlistMatch[2].replace(/\n/g, '').trim();
          console.log(`📋 Playlist: "${playlistName}" with ${trackCount} tracks`);
        }
        
        // Check if we parsed songs from stdout
        if (songList.length > 0) {
          console.log(`✅ Successfully parsed ${songList.length} songs from spotdl output`);
          
          // Start sequential download process immediately
          startSequentialPlaylistDownload(playlistName, songList, req.user?.id);
          
          res.json({
            success: true,
            playlistName: playlistName,
            trackCount: songList.length,
            message: `Starting sequential download of ${songList.length} tracks (1 per minute to avoid rate limits)`,
            sequentialMode: true
          });
          return;
        }
        
        // Read the generated .spotdl file
        console.log('Checking for file:', tempFile);
        
        // Wait for file to be written - check multiple times
        let fileExists = false;
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (fs.existsSync(tempFile)) {
            fileExists = true;
            break;
          }
          console.log(`Waiting for file... attempt ${i + 1}/10`);
        }
        
        if (fileExists) {
          try {
            const fileContent = fs.readFileSync(tempFile, 'utf8');
            console.log('File content length:', fileContent.length);
            
            if (fileContent.trim().length > 0) {
            tracks = JSON.parse(fileContent);
            
            // Clean up temp file
            fs.unlinkSync(tempFile);
            
            console.log(`✅ Extracted ${tracks.length} tracks from .spotdl file`);
            
            // Convert tracks to the format expected by sequential download
            const formattedTracks = tracks.map(t => ({
              title: t.name || t.title,
              artist: t.artists ? (Array.isArray(t.artists) ? t.artists.join(', ') : t.artists) : 'Unknown',
              album: t.album_name || t.album || 'Unknown',
              duration: t.duration
            }));
            
            // Start sequential download process immediately
            startSequentialPlaylistDownload(playlistName, formattedTracks, req.user?.id);
            
            res.json({
              success: true,
              playlistName: playlistName,
              trackCount: formattedTracks.length,
              message: `Starting sequential download of ${formattedTracks.length} tracks (1 per minute to avoid rate limits)`,
              sequentialMode: true
            });
            return;
            } else {
              console.warn('⚠️ .spotdl file is empty');
            }
          } catch (parseError) {
            console.error('Failed to parse .spotdl file:', parseError.message);
          }
        } else {
          console.warn('⚠️ .spotdl file not found, trying to parse from output...');
        }
        
        // Parse track names from console output (fallback method)
        const trackMatches = output.match(/Found (\d+) songs/);
        if (trackMatches) {
          const trackCount = parseInt(trackMatches[1]);
          console.log(`Parsing ${trackCount} tracks from console output...`);
          console.log('Full output for debugging:', output.substring(0, 500));
          
          // Check if we got individual track names or just the count
          const extractedTracks = [];
          const lines = output.split('\n');
          
          for (const line of lines) {
            // Look for "Artist - Title" patterns, excluding metadata lines
            const match = line.match(/^\s*(.+?)\s+-\s+(.+?)(?:\s*$|\s+\(|$)/);
            if (match && 
                !line.includes('Found') && 
                !line.includes('Processing') && 
                !line.includes('spotdl:') &&
                !line.includes('Playlist') &&
                !line.includes('Songs') &&
                line.trim().length > 0) {
              
              const artist = match[1].trim();
              const title = match[2].trim();
              
              // Skip if it looks like metadata rather than a song
              if (artist.length > 0 && title.length > 0 && 
                  !artist.match(/^\d+$/) && // Not just numbers
                  !title.match(/^\d+$/) && // Not just numbers
                  artist.length < 100 && title.length < 100) { // Reasonable length
                
                extractedTracks.push({
                  artist: artist,
                  title: title,
                  album: 'Import'
                });
              }
            }
          }
          
          if (extractedTracks.length > 0) {
            console.log(`✅ Extracted ${extractedTracks.length} tracks from console output`);
            
            // Start sequential download process immediately
            startSequentialPlaylistDownload(playlistName, extractedTracks, req.user?.id);
            
            res.json({
              success: true,
              playlistName: playlistName,
              trackCount: extractedTracks.length,
              message: `Starting sequential download of ${extractedTracks.length} tracks (1 per minute to avoid rate limits)`,
              sequentialMode: true
            });
            return;
          }
          
          // If we only got the count but no individual tracks, go straight to sequential scan
          console.log(`⚠️ Only got track count (${trackCount}), no individual track names. Starting sequential scan immediately.`);
          
          // Start sequential scan directly instead of offering options
          startSequentialPlaylistScan(playlistUrl, playlistName, trackCount, req.user?.id);
          
          res.json({
            success: true,
            playlistName: playlistName,
            trackCount: trackCount,
            message: `Found "${playlistName}" with ${trackCount} songs!\n\nStarting sequential scan automatically to avoid rate limits.`,
            sequentialMode: true,
            timeEstimate: `${Math.ceil(trackCount * 10 / 60)} minutes`
          });
          return;
        } else {
          console.error('No playlist found in output');
          
          // Check if this is a rate limit issue
          const isRateLimited = output.includes('rate limit') || output.includes('rate/request') || errorOutput.includes('rate limit');
          
          if (isRateLimited) {
            console.error('❌ Spotify rate limit detected - user needs to wait');
            res.status(429).json({
              error: 'Spotify Rate Limit Reached',
              message: 'You\'ve imported too many playlists too quickly!',
              rateLimited: true,
              waitTime: 15,
              hint: 'Wait 15-20 minutes before trying again, or paste song names manually below'
            });
            return;
          }
          
        // Try one more fallback - extract any "Artist - Title" patterns from output
        const fallbackTracks = [];
        const lines = output.split('\n');
        for (const line of lines) {
          // More flexible pattern matching
          const match = line.match(/^\s*(.+?)\s+-\s+(.+?)(?:\s*$|\s+\(|$)/);
          if (match && !line.includes('Found') && !line.includes('Processing') && !line.includes('spotdl:') && !line.includes('Downloaded')) {
            const artist = match[1].trim();
            const title = match[2].trim();
            
            // Avoid duplicates
            const exists = fallbackTracks.some(track => track.artist === artist && track.title === title);
            if (!exists) {
              fallbackTracks.push({
                artist: artist,
                title: title,
                album: 'Import'
              });
            }
          }
        }
          
          if (fallbackTracks.length > 0) {
            console.log(`✅ Extracted ${fallbackTracks.length} tracks via fallback pattern matching`);
            
            // Start sequential download process immediately
            startSequentialPlaylistDownload(playlistName || 'Imported Playlist', fallbackTracks, req.user?.id);
            
            res.json({
              success: true,
              playlistName: playlistName || 'Imported Playlist',
              trackCount: fallbackTracks.length,
              message: `Starting sequential download of ${fallbackTracks.length} tracks (1 per minute to avoid rate limits)`,
              sequentialMode: true
            });
            return;
          }
          
          res.status(500).json({
            error: 'Could not extract playlist information',
            message: 'No playlist found. Please check the URL and try again.',
            hint: 'Try pasting song names manually: "Artist - Song Title" (one per line)'
          });
          return;
        }
      } catch (error) {
        console.error('Failed to parse playlist:', error);
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Failed to parse playlist',
            message: error.message
          });
        }
      }
    });
    
    spotdl.on('error', (error) => {
      console.error('spotdl spawn error:', error);
      res.status(500).json({ 
        error: 'Failed to run spotdl',
        message: error.message
      });
    });
    
  } catch (error) {
    console.error('Spotify playlist extract error:', error);
    res.status(500).json({ error: 'Failed to extract playlist', message: error.message });
  }
});

// Start sequential playlist scanning
router.post('/sequential-scan', async (req, res) => {
  try {
    const { playlistUrl, playlistName, trackCount } = req.body;
    
    if (!playlistUrl || !playlistName || !trackCount) {
      return res.status(400).json({ error: 'Playlist URL, name, and track count required' });
    }
    
    // Start sequential scan process
    startSequentialPlaylistScan(playlistUrl, playlistName, trackCount, req.user?.id);
    
    res.json({
      success: true,
      message: `Starting sequential scan of ${trackCount} tracks (10 seconds between scans)`,
      playlistName: playlistName,
      trackCount: trackCount,
      timeEstimate: `${Math.ceil(trackCount * 10 / 60)} minutes`
    });
    
  } catch (error) {
    console.error('Sequential scan error:', error);
    res.status(500).json({ error: 'Failed to start sequential scan', message: error.message });
  }
});

// Start sequential playlist download
router.post('/sequential-playlist', async (req, res) => {
  try {
    const { playlistName, tracks } = req.body;
    
    if (!playlistName || !tracks || !Array.isArray(tracks)) {
      return res.status(400).json({ error: 'Playlist name and tracks array required' });
    }
    
    // Start sequential download process
    startSequentialPlaylistDownload(playlistName, tracks, req.user?.id);
    
    res.json({
      success: true,
      message: `Starting sequential download of ${tracks.length} tracks (1 per minute to avoid rate limits)`,
      playlistName: playlistName,
      trackCount: tracks.length
    });
    
  } catch (error) {
    console.error('Sequential playlist download error:', error);
    res.status(500).json({ error: 'Failed to start sequential download', message: error.message });
  }
});

// Cleanup completed, failed, and stalled downloads from download history
// NOTE: This ONLY removes download logs from the Downloads page
// It does NOT delete the actual downloaded music files from your library
router.post('/cleanup', async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Get user from token - users can only clean up their own downloads
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const userIdMatch = token.match(/token_(\d+)/);
      if (userIdMatch) {
        userId = parseInt(userIdMatch[1]);
      }
    }

    const downloads = await database.getDownloads(userId);
    const now = new Date();
    
    let cleanedCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let stalledCount = 0;
    const downloadsToClean = [];

    for (const download of downloads) {
      const downloadTime = new Date(download.created_at);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
      const isOld = downloadTime < fiveMinutesAgo;
      
      // Identify different types of downloads to clean
      const isCompleted = download.status === 'completed';
      const isFailed = download.status === 'failed';
      const isStuckAtZero = download.status === 'downloading' && download.progress === 0 && isOld;
      const isStuckInProgress = download.status === 'downloading' && isOld && download.progress < 100 && download.progress > 0;
      const isCancelled = download.status === 'cancelled';
      
      if (isCompleted || isFailed || isStuckAtZero || isStuckInProgress || isCancelled) {
        downloadsToClean.push(download);
        cleanedCount++;
        
        if (isCompleted) completedCount++;
        else if (isFailed) failedCount++;
        else if (isStuckAtZero || isStuckInProgress) stalledCount++;
      }
    }

    // Remove download logs from database (NOT the actual music files!)
    for (const download of downloadsToClean) {
      await database.deleteDownload(download.id);
      console.log(`🧹 Cleaned up download log: ${download.title} (${download.status})`);
    }
    
    console.log(`🧹 Cleanup summary: ${completedCount} completed, ${failedCount} failed, ${stalledCount} stalled`);

    res.json({ 
      success: true, 
      message: `Cleaned up ${cleanedCount} download logs (keeps your music files safe)`,
      cleanedCount,
      details: {
        completed: completedCount,
        failed: failedCount,
        stalled: stalledCount
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup', message: error.message });
  }
});

// ========================================
// SPOTIFY URL DOWNLOAD - Extract metadata from Spotify, download via YouTube
// ========================================

// Helper: Extract Spotify ID and type from URL
function parseSpotifyUrl(url) {
  // Formats:
  // https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT
  // https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy
  // spotify:track:4cOdK2wGLETKBW3PvgPWqT
  
  const urlMatch = url.match(/spotify\.com\/(track|album)\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    return { type: urlMatch[1], id: urlMatch[2] };
  }
  
  const uriMatch = url.match(/spotify:(track|album):([a-zA-Z0-9]+)/);
  if (uriMatch) {
    return { type: uriMatch[1], id: uriMatch[2] };
  }
  
  return null;
}

// Helper: Get metadata from Spotify using oEmbed API (no auth required!)
async function getSpotifyMetadata(url) {
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      throw new Error(`oEmbed failed: ${response.status}`);
    }
    
    const data = await response.json();
    // oEmbed returns: title, thumbnail_url, provider_name, etc.
    // For tracks: title is "Song Name - Artist Name"
    // For albums: title is "Album Name - Artist Name"
    
    return data;
  } catch (error) {
    console.error('Failed to get Spotify oEmbed:', error);
    return null;
  }
}

// Helper: Fetch metadata from Spotify page (scraping OG tags)
async function getSpotifyPageMetadata(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract og:title
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
    const title = titleMatch ? titleMatch[1] : null;
    
    // Extract og:description
    const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    const description = descMatch ? descMatch[1] : null;
    
    // Extract og:type
    const typeMatch = html.match(/<meta\s+property="og:type"\s+content="([^"]+)"/);
    const type = typeMatch ? typeMatch[1] : null;
    
    // Extract og:image (cover art)
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    const image = imageMatch ? imageMatch[1] : null;
    
    return { title, description, type, image };
  } catch (error) {
    console.error('Failed to fetch Spotify page:', error.message);
    return null;
  }
}

// Helper: Parse Spotify track metadata from OG tags
function parseSpotifyTrackMeta(ogData) {
  if (!ogData || !ogData.title) return null;
  
  const result = {
    name: ogData.title,
    artist: 'Unknown',
    album: ogData.title,
    year: null
  };
  
  // Description format: "Artist · Album · Song · Year"
  if (ogData.description) {
    const parts = ogData.description.split(' · ');
    if (parts.length >= 1) result.artist = parts[0].trim();
    if (parts.length >= 2) result.album = parts[1].trim();
    if (parts.length >= 4) result.year = parts[3].trim();
  }
  
  return result;
}

// Helper: Parse Spotify album metadata from OG tags
function parseSpotifyAlbumMeta(ogData) {
  if (!ogData || !ogData.title) return null;
  
  // Title format: "Album Name - Album by Artist | Spotify"
  const titleMatch = ogData.title.match(/^(.+?)\s*-\s*Album by\s+(.+?)\s*\|\s*Spotify$/i);
  
  const result = {
    name: titleMatch ? titleMatch[1].trim() : ogData.title,
    artist: titleMatch ? titleMatch[2].trim() : 'Unknown',
    year: null,
    trackCount: null
  };
  
  // Description format: "Artist · album · Year · X songs"
  if (ogData.description) {
    const parts = ogData.description.split(' · ');
    if (parts.length >= 1 && result.artist === 'Unknown') {
      result.artist = parts[0].trim();
    }
    if (parts.length >= 3) {
      result.year = parts[2].trim();
    }
    if (parts.length >= 4) {
      const countMatch = parts[3].match(/(\d+)\s+songs?/);
      if (countMatch) result.trackCount = parseInt(countMatch[1]);
    }
  }
  
  return result;
}

// Helper: Use spotdl to get detailed track list (for albums)
async function getSpotdlMetadata(url) {
  return new Promise((resolve, reject) => {
    // Use 'save' command to get track list without downloading
    const args = ['save', url, '--save-file', '/tmp/spotdl_meta.spotdl'];
    
    console.log(`🔍 Getting metadata with spotdl: ${url}`);
    
    const proc = spawn('spotdl', args, {
      cwd: '/tmp',
      timeout: 30000
    });
    
    let stderr = '';
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          // Read the saved file
          const content = fs.readFileSync('/tmp/spotdl_meta.spotdl', 'utf8');
          const metadata = JSON.parse(content);
          resolve(metadata);
        } catch (e) {
          reject(new Error('Failed to parse spotdl output'));
        }
      } else {
        reject(new Error(`spotdl metadata failed: ${stderr || 'Unknown error'}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('Metadata extraction timed out'));
    }, 30000);
  });
}

// Download single track via yt-dlp
async function downloadViaYtDlp(artist, title, album, outputDir, downloadId, database) {
  return new Promise(async (resolve, reject) => {
    const searchQuery = `ytsearch1:${artist} ${title} topic`;
    const safeArtist = sanitize(artist || 'Unknown Artist');
    const safeAlbum = sanitize(album || 'Unknown Album');
    const safeTitle = sanitize(title || 'Unknown');
    
    const artistDir = path.join(outputDir, safeArtist);
    const albumDir = path.join(artistDir, safeAlbum);
    
    // Create directories
    if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true });
    if (!fs.existsSync(albumDir)) fs.mkdirSync(albumDir, { recursive: true });
    
    const outputTemplate = path.join(albumDir, `${safeTitle}.%(ext)s`);
    
    const args = [
      searchQuery,
      '-x',                          // Extract audio
      '--audio-format', 'mp3',       // Convert to MP3
      '--audio-quality', '0',        // Best quality
      '-o', outputTemplate,
      '--no-playlist',
      '--embed-thumbnail',
      '--add-metadata',
      '--parse-metadata', `title:${title}`,
      '--parse-metadata', `artist:${artist}`,
      '--parse-metadata', `album:${album}`,
    ];
    
    console.log(`🎵 yt-dlp downloading: ${artist} - ${title}`);
    
    const proc = spawn('yt-dlp', args, {
      cwd: outputDir
    });
    
    let lastProgress = '';
    
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch && downloadId && database) {
        const progress = Math.min(parseFloat(progressMatch[1]), 99);
        if (progress.toString() !== lastProgress) {
          lastProgress = progress.toString();
          database.updateDownloadStatus(downloadId, 'downloading', progress).catch(() => {});
        }
      }
    });
    
    proc.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('ERROR')) {
        console.error(`yt-dlp error: ${output}`);
      }
    });
    
    proc.on('close', async (code) => {
      if (code === 0) {
        // Find the downloaded file
        const expectedPath = path.join(albumDir, `${safeTitle}.mp3`);
        
        if (fs.existsSync(expectedPath)) {
          console.log(`✅ Downloaded: ${expectedPath}`);
          resolve(expectedPath);
        } else {
          // Search for any audio file in the album dir
          const files = fs.readdirSync(albumDir);
          const audioFile = files.find(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.opus'));
          if (audioFile) {
            resolve(path.join(albumDir, audioFile));
          } else {
            reject(new Error('Download completed but file not found'));
          }
        }
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// POST /spotify-url - Download from Spotify URL (track or album)
router.post('/spotify-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Spotify URL is required' });
    }
    
    // Parse URL
    const parsed = parseSpotifyUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid Spotify URL. Must be a track or album link.' });
    }
    
    console.log(`🎵 Spotify URL download request: ${parsed.type} - ${parsed.id}`);
    
    // Get user ID from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      const userIdMatch = token.match(/token_(\d+)/);
      if (userIdMatch) {
        userId = parseInt(userIdMatch[1]);
      }
    }
    
    // Get basic metadata from oEmbed (always works, no rate limits)
    const oembed = await getSpotifyMetadata(url);
    if (!oembed) {
      return res.status(400).json({ error: 'Could not fetch Spotify metadata' });
    }
    
    console.log(`📋 oEmbed data: ${oembed.title}`);
    
    const musicDir = process.env.MUSIC_DIR || '/mnt/UNO/NOXA/Music';
    
    if (parsed.type === 'track') {
      // Single track download - get metadata by scraping Spotify page
      let trackName = oembed.title || 'Unknown';
      let artistName = 'Unknown';
      let albumName = trackName;
      
      // Get accurate metadata from Spotify page
      console.log(`🔍 Getting track metadata from Spotify page...`);
      const pageMeta = await getSpotifyPageMetadata(url);
      
      if (pageMeta) {
        const parsed = parseSpotifyTrackMeta(pageMeta);
        if (parsed) {
          trackName = parsed.name || trackName;
          artistName = parsed.artist || artistName;
          albumName = parsed.album || trackName;
          console.log(`📋 Got metadata: ${artistName} - ${trackName} (${albumName})`);
        }
      } else {
        // Fall back to oEmbed title
        console.log(`⚠️ Page scraping failed, using oEmbed`);
        trackName = oembed.title || 'Unknown';
      }
      
      console.log(`🎵 Downloading track: ${artistName} - ${trackName}`);
      
      // Create download entry
      const downloadId = uuidv4();
      await database.addDownload({
        id: downloadId,
        userId: userId,
        title: trackName,
        artist: artistName,
        album: albumName,
        status: 'pending',
        progress: 0,
        created_at: new Date().toISOString()
      });
      
      res.json({
        success: true,
        message: `Started downloading: ${trackName} by ${artistName}`,
        downloadId,
        type: 'track',
        track: trackName,
        artist: artistName
      });
      
      // Download in background
      (async () => {
        try {
          await database.updateDownloadStatus(downloadId, 'downloading', 5);
          
          const filePath = await downloadViaYtDlp(
            artistName,
            trackName,
            albumName,
            musicDir,
            downloadId,
            database
          );
          
          await database.updateDownloadStatus(downloadId, 'completed', 100, filePath);
          
          // Trigger library scan for the new file
          console.log(`✅ Track downloaded: ${filePath}`);
          
        } catch (error) {
          console.error(`❌ Track download failed:`, error);
          await database.updateDownloadStatus(downloadId, 'failed', 0);
        }
      })();
      
    } else if (parsed.type === 'album') {
      // Album download - get basic metadata from page, track list from spotdl
      let albumNameBasic = oembed.title || 'Unknown Album';
      let artistNameBasic = 'Unknown';
      
      // Get better metadata from Spotify page
      console.log(`🔍 Getting album metadata from Spotify page...`);
      const pageMeta = await getSpotifyPageMetadata(url);
      
      if (pageMeta) {
        const albumMeta = parseSpotifyAlbumMeta(pageMeta);
        if (albumMeta) {
          albumNameBasic = albumMeta.name || albumNameBasic;
          artistNameBasic = albumMeta.artist || artistNameBasic;
          console.log(`📋 Got album: ${albumNameBasic} by ${artistNameBasic}`);
        }
      }
      
      console.log(`💿 Downloading album: ${albumNameBasic} by ${artistNameBasic}`);
      
      let tracks = [];
      
      // Try spotdl metadata first - this gives us accurate track list and artist
      try {
        const spotdlMeta = await getSpotdlMetadata(url);
        if (Array.isArray(spotdlMeta)) {
          tracks = spotdlMeta.map(t => ({
            name: t.name || t.title,
            artist: t.artists?.[0] || t.artist || artistNameBasic,
            album: t.album_name || t.album || albumNameBasic
          }));
          // Update artist from first track if we got it
          if (tracks.length > 0 && tracks[0].artist !== 'Unknown') {
            artistNameBasic = tracks[0].artist;
          }
        } else if (spotdlMeta) {
          tracks = [{
            name: spotdlMeta.name || spotdlMeta.title,
            artist: spotdlMeta.artists?.[0] || spotdlMeta.artist || artistNameBasic,
            album: spotdlMeta.album_name || spotdlMeta.album || albumNameBasic
          }];
        }
        console.log(`📋 Found ${tracks.length} tracks from spotdl metadata`);
      } catch (metaError) {
        console.log(`⚠️ spotdl metadata failed, using oEmbed only: ${metaError.message}`);
      }
      
      // If no tracks from spotdl, we can't get individual track names
      // In this case, tell user to try individual track URLs
      if (tracks.length === 0) {
        return res.json({
          success: false,
          message: 'Could not get album track list. Spotify may be rate-limiting. Try pasting individual track URLs instead.',
          type: 'album',
          album: albumNameBasic,
          artist: artistNameBasic
        });
      }
      
      // Create download entries for all tracks
      const downloadIds = [];
      for (const track of tracks) {
        const downloadId = uuidv4();
        await database.addDownload({
          id: downloadId,
          userId: userId,
          title: track.name,
          artist: track.artist,
          album: track.album,
          status: 'queued',
          progress: 0,
          created_at: new Date().toISOString()
        });
        downloadIds.push({ id: downloadId, track });
      }
      
      res.json({
        success: true,
        message: `Queued ${tracks.length} tracks from album: ${albumNameBasic} by ${artistNameBasic}`,
        type: 'album',
        album: albumNameBasic,
        artist: artistNameBasic,
        trackCount: tracks.length,
        downloadIds: downloadIds.map(d => d.id)
      });
      
      // Download tracks sequentially in background
      (async () => {
        for (let i = 0; i < downloadIds.length; i++) {
          const { id, track } = downloadIds[i];
          
          try {
            await database.updateDownloadStatus(id, 'downloading', 5);
            
            const filePath = await downloadViaYtDlp(
              track.artist,
              track.name,
              track.album,
              musicDir,
              id,
              database
            );
            
            await database.updateDownloadStatus(id, 'completed', 100, filePath);
            
            console.log(`✅ Track ${i + 1}/${tracks.length} downloaded: ${track.name}`);
            
            // Small delay between tracks to be nice to YouTube
            await new Promise(r => setTimeout(r, 2000));
            
          } catch (error) {
            console.error(`❌ Track download failed: ${track.name}`, error);
            await database.updateDownloadStatus(id, 'failed', 0);
          }
        }
        
        console.log(`💿 Album download complete: ${albumNameBasic}`);
      })();
    }
    
  } catch (error) {
    console.error('Spotify URL download error:', error);
    res.status(500).json({ error: 'Failed to process Spotify URL', message: error.message });
  }
});

// Clean and sanitize names for files and metadata
function cleanName(name) {
  if (!name) return 'Unknown';
  
  return name
    // Remove common unwanted suffixes
    .replace(/\s*-\s*Remastered.*$/gi, '')
    .replace(/\s*-\s*Remaster.*$/gi, '')
    .replace(/\s*-\s*Remix.*$/gi, '')
    .replace(/\s*-\s*Live.*$/gi, '')
    .replace(/\s*-\s*Official.*$/gi, '')
    .replace(/\s*-\s*Music Video.*$/gi, '')
    .replace(/\s*\(.*?Remaster.*?\)/gi, '')
    .replace(/\s*\(.*?Remix.*?\)/gi, '')
    .replace(/\s*\(.*?Live.*?\)/gi, '')
    .replace(/\s*\[.*?Remaster.*?\]/gi, '')
    .replace(/\s*\[.*?Remix.*?\]/gi, '')
    .replace(/\s*\[.*?Live.*?\]/gi, '')
    // Clean up extra spaces
    .replace(/\s+/g, ' ')
    // Remove only filesystem-unsafe characters, keep Unicode letters (accents, Cyrillic, etc.)
    // Remove: / \ : * ? " < > |
    .replace(/[\/\\:*?"<>|]/g, '')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

// Move single downloaded file to library with proper metadata
export async function moveSingleFileToLibrary(filePath, title, artist, album, userId) {
  try {
    console.log(`📁 Moving file to library: ${filePath}`);
    console.log(`👤 User ID for this file: ${userId}`);
    
    // Clean and sanitize names
    const cleanArtist = cleanName(artist);
    const cleanTitle = cleanName(title);
    const cleanAlbum = album ? cleanName(album) : 'Singles';
    
    // Create proper directory structure: Artist/Album/Song.mp3
    // Use MUSIC_PATH from environment variable (defaults to /mnt/UNO/Music_lib)
    const mainMusicDir = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
    const artistDir = path.join(mainMusicDir, cleanArtist);
    const albumDir = path.join(artistDir, cleanAlbum);
    
    // Create directories
    if (!fs.existsSync(mainMusicDir)) {
      fs.mkdirSync(mainMusicDir, { recursive: true });
    }
    if (!fs.existsSync(artistDir)) {
      fs.mkdirSync(artistDir, { recursive: true });
    }
    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
    }
    
    // Create clean filename: Artist - Song.mp3
    const ext = path.extname(filePath);
    const newFileName = `${cleanArtist} - ${cleanTitle}${ext}`;
    const newFilePath = path.join(albumDir, newFileName);
    
    // Check if file already exists to avoid duplicates
    if (fs.existsSync(newFilePath)) {
      console.log(`⚠️ File already exists, skipping: ${newFileName}`);
      fs.unlinkSync(filePath); // Clean up original
      
      // Find and return existing music ID
      const existing = await database.findMusicByArtistAndTitle(artist, title);
      return existing ? existing.id : null;
    }
    
    // Copy file to new location
    // Use read+write instead of copyFileSync for NTFS compatibility
    try {
      fs.copyFileSync(filePath, newFilePath);
      console.log(`✅ File moved to: ${newFilePath}`);
    } catch (copyError) {
      if (copyError.code === 'EPERM') {
        // NTFS doesn't support copyFileSync - use read+write as fallback
        console.log('⚠️ copyFileSync failed on NTFS, using read+write fallback...');
        const fileContent = fs.readFileSync(filePath);
        fs.writeFileSync(newFilePath, fileContent);
        console.log(`✅ File moved to: ${newFilePath} (using fallback method)`);
      } else {
        throw copyError;
      }
    }
    
    // Fetch artwork before adding to database
    let albumArtwork = null;
    let artistImage = null;
    
    try {
      console.log('🎨 Fetching artwork for downloaded song...');
      
      // Check if artist image already exists in folder
      const artistImagePath = path.join(artistDir, 'artist.jpg');
      if (fs.existsSync(artistImagePath)) {
        artistImage = `/music_lib/${cleanArtist}/artist.jpg`;
        console.log(`✅ Artist image already exists: ${artistImagePath}`);
      } else {
        // Fetch artist image URL from various sources
        const fetchedArtistImage = await fetchArtistImage(cleanArtist);
        if (fetchedArtistImage) {
          try {
            // If it's a cache path, read from cache and save to artist folder
            // If it's a URL, download and save to artist folder
            let imageBuffer;
            
            if (fetchedArtistImage.startsWith('/artwork_cache/') || fetchedArtistImage.startsWith('artwork_cache/')) {
              // Read from cache file
              const cacheDir = path.join(__dirname, '..', '..', 'artwork_cache');
              const cacheFileName = path.basename(fetchedArtistImage);
              const cachePath = path.join(cacheDir, cacheFileName);
              if (fs.existsSync(cachePath)) {
                imageBuffer = fs.readFileSync(cachePath);
                console.log(`📁 Copying artist image from cache to artist folder`);
              }
            } else if (fetchedArtistImage.startsWith('http')) {
              // Download from URL
              const imageResponse = await fetch(fetchedArtistImage);
              if (imageResponse.ok) {
                imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
              }
            }
            
            if (imageBuffer) {
              fs.writeFileSync(artistImagePath, imageBuffer);
              artistImage = `/music_lib/${cleanArtist}/artist.jpg`;
              console.log(`✅ Artist image saved to: ${artistImagePath}`);
            } else {
              artistImage = fetchedArtistImage; // Use cached URL as fallback
            }
          } catch (err) {
            console.warn('⚠️ Could not save artist image:', err.message);
            artistImage = fetchedArtistImage; // Fallback to cached URL
          }
        }
      }
      
      // Check if album cover already exists in folder
      const albumCoverPath = path.join(albumDir, 'cover.jpg');
      if (fs.existsSync(albumCoverPath)) {
        albumArtwork = `/music_lib/${cleanArtist}/${cleanAlbum}/cover.jpg`;
        console.log(`✅ Album cover already exists: ${albumCoverPath}`);
      } else {
      // Search Deezer by artist + title to get album artwork (more reliable than album name)
        let albumArtUrl = null;
      try {
        const searchQuery = `${cleanArtist} ${cleanTitle}`;
        const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000
        });
        
          if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const track = data.data[0];
          if (track.album && (track.album.cover_xl || track.album.cover_big || track.album.cover_medium)) {
                albumArtUrl = track.album.cover_xl || track.album.cover_big || track.album.cover_medium;
              }
          }
        }
      } catch (searchError) {
        console.warn('⚠️ Deezer search for artwork failed:', searchError.message);
      }
      
        // Fallback to album name search if needed
        if (!albumArtUrl) {
          albumArtUrl = await fetchAlbumArt(cleanArtist, cleanAlbum);
        }
        
        // Download and save album cover to album folder
        if (albumArtUrl) {
          try {
            const imageResponse = await fetch(albumArtUrl);
            if (imageResponse.ok) {
              const imageBuffer = await imageResponse.arrayBuffer();
              fs.writeFileSync(albumCoverPath, Buffer.from(imageBuffer));
              albumArtwork = `/music_lib/${cleanArtist}/${cleanAlbum}/cover.jpg`;
              console.log(`✅ Album cover saved to: ${albumCoverPath}`);
            }
          } catch (err) {
            console.warn('⚠️ Could not save album cover:', err.message);
            albumArtwork = albumArtUrl; // Fallback to URL
          }
        }
      }
    } catch (artError) {
      console.warn('⚠️ Artwork fetch failed:', artError.message);
    }
    
    // Add to database with clean names and artwork
    const metadata = {
      title: cleanTitle,
      artist: cleanArtist,
      album: cleanAlbum,
      fileSize: fs.statSync(newFilePath).size,
      album_cover: albumArtwork,
      artist_image: artistImage
    };
    
    const result = await database.addMusicToLibrary(newFilePath, metadata, userId);
    console.log(`✅ Added to library with ID: ${result.id}`, albumArtwork ? '(with artwork)' : '(no artwork)');
    
    // Clean up original file
    fs.unlinkSync(filePath);
    console.log(`🧹 Cleaned up original file: ${filePath}`);
    
    return result.id;
    
  } catch (error) {
    console.error('Error moving file to library:', error);
    throw error;
  }
}

// Real music downloader using spotdl (Spotify/YouTube) with fallback strategies
export async function downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId = null, retryAttempt = 0) {
  return new Promise(async (resolve, reject) => {
    console.log(`🎵 Downloading: ${artist} - ${title}`, playlistId ? `(for playlist ${playlistId})` : '', retryAttempt > 0 ? `(Retry ${retryAttempt})` : '');
    console.log(`👤 Download user_id: ${userId}`);
    
    try {
    // Create unique output directory for this download to prevent conflicts
    const baseOutputDir = path.join(__dirname, '..', '..', 'downloads');
    const outputDir = path.join(baseOutputDir, `dl_${downloadId}`);
    if (!fs.existsSync(baseOutputDir)) {
      fs.mkdirSync(baseOutputDir, { recursive: true });
    }
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
      
      // Create search query variations for fallback attempts
      let searchQuery;
      let useYtDlp = false;
      
      switch (retryAttempt) {
        case 0:
          // First attempt: Full query with spotdl
          searchQuery = `${artist} ${title}`;
          break;
        case 1:
          // Second attempt: Clean up special characters with spotdl
          searchQuery = `${artist} ${title}`.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
          break;
        case 2:
          // Third attempt: Use yt-dlp with YouTube Music "topic" (auto-generated audio, no video)
          searchQuery = `ytsearch1:${artist} ${title} topic`;
          useYtDlp = true;
          break;
        case 3:
          // Fourth attempt: Use yt-dlp with audio search
          searchQuery = `ytsearch1:${artist} ${title} audio`;
          useYtDlp = true;
          break;
        case 4:
          // Fifth attempt: Use yt-dlp with clean title
          const cleanTitle = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
          searchQuery = `ytsearch1:${artist} ${cleanTitle}`;
          useYtDlp = true;
          break;
        default:
          // No more retries
          searchQuery = `${artist} ${title}`;
      }
      
      console.log(`🔍 Searching ${useYtDlp ? 'with yt-dlp' : 'with spotdl'} (attempt ${retryAttempt + 1}):`, searchQuery);
      console.log(`📁 Output directory: ${outputDir}`);
      console.log(`📂 Current working directory: ${process.cwd()}`);
      console.log(`🎯 Artist: ${artist}, Title: ${title}, Album: ${album}`);
      
      // Use spotdl or yt-dlp based on retry attempt
      let downloadProcess;
      if (useYtDlp) {
        const ytDlpArgs = [
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '320K',
          '--output', path.join(outputDir, '%(title)s.%(ext)s'),
          '--no-playlist',
          searchQuery
        ];
        console.log(`🚀 Executing: yt-dlp ${ytDlpArgs.join(' ')}`);
        downloadProcess = spawn('yt-dlp', ytDlpArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
          timeout: 60000
        });
      } else {
        const spotdlArgs = [
          '-m', 'spotdl',
          'download',
          searchQuery,
          '--output', outputDir,
          '--format', 'mp3',
          '--bitrate', '320k',
          '--overwrite', 'skip',
          '--preload'
        ];
        console.log(`🚀 Executing: python3 ${spotdlArgs.join(' ')}`);
        downloadProcess = spawn('python3', spotdlArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
          timeout: 60000
        });
      }
      
      const spotdl = downloadProcess;
      
      let downloadedFile = null;
      let errorOutput = '';
      
      spotdl.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`${useYtDlp ? 'yt-dlp' : 'spotdl'}:`, output);
        
        // Check for rate limit warnings
        if (output.includes('rate/request limit') || output.includes('429')) {
          console.warn('⚠️ Rate limit detected - spotdl will retry automatically');
        }
        
        // Extract downloaded filename based on tool used
        let match;
        if (useYtDlp) {
          // yt-dlp output parsing
          match = output.match(/\[download\] Destination: (.+\.mp3)|\[ExtractAudio\] Destination: (.+\.mp3)|(.+\.mp3)/);
        } else {
          // spotdl output parsing
          match = output.match(/Downloaded: (.+\.mp3)|Downloaded "(.+?)"/);
        }
        
        if (match) {
          downloadedFile = match[1] || match[2] || match[3];
          
          // Clean up filename if it includes full path
          if (downloadedFile) {
            downloadedFile = path.basename(downloadedFile);
          }
          
          // Ensure the filename has .mp3 extension
          if (downloadedFile && !downloadedFile.endsWith('.mp3')) {
            downloadedFile += '.mp3';
          }
          
          console.log(`📁 Captured filename: "${downloadedFile}"`);
          
          // Check if downloaded file matches artist name (basic validation)
          const artistLower = artist.toLowerCase();
          const fileLower = downloadedFile.toLowerCase();
          if (!fileLower.includes(artistLower.split(' ')[0].toLowerCase())) {
            console.warn(`⚠️ Downloaded file might be wrong: "${downloadedFile}" doesn't match artist "${artist}"`);
          }
        }
        
        // Update progress during download
        if (database) {
          if (output.includes('Processing query')) {
            database.updateDownloadStatus(downloadId, 'downloading', 10);
          } else if (output.includes('Downloaded:')) {
            database.updateDownloadStatus(downloadId, 'downloading', 90);
          }
        }
      });
      
      spotdl.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.log('spotdl error:', data.toString());
      });
      
      // Add timeout handling
      const timeoutId = setTimeout(() => {
        if (!spotdl.killed) {
          console.log(`⏰ Download timeout after 60 seconds, killing process`);
          spotdl.kill('SIGTERM');
        }
      }, 60000);

      spotdl.on('close', async (code) => {
        clearTimeout(timeoutId);
        console.log(`🔚 spotdl process exited with code: ${code}`);
        console.log(`📁 Checking directory: ${outputDir}`);
        console.log(`📂 Directory contents:`, fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : 'Directory does not exist');
        console.log(`🔍 Captured filename: "${downloadedFile}"`);
        console.log(`📝 Error output: "${errorOutput}"`);
        
        if (code === 0) {
      // Find the downloaded file - look for the specific file that was downloaded
      let mp3File = null;
      
      // First try to use the filename we captured from spotdl output
      if (downloadedFile) {
        const fullPath = path.join(outputDir, downloadedFile);
        if (fs.existsSync(fullPath)) {
          mp3File = downloadedFile;
          console.log(`✅ Found specific downloaded file: ${downloadedFile}`);
        }
      }
      
      // If we don't have the specific file, find the most recently created MP3
      // but only look for files created within the last 30 seconds to avoid conflicts
      if (!mp3File) {
        const files = fs.readdirSync(outputDir);
        const mp3Files = files.filter(file => file.endsWith('.mp3'));
        const now = Date.now();
        
        if (mp3Files.length > 0) {
          // Get the most recently created MP3 file that was created within the last 30 seconds
          const recentFiles = mp3Files.filter(file => {
            const filePath = path.join(outputDir, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtime.getTime();
            return fileAge < 30000; // 30 seconds
          });
          
          if (recentFiles.length > 0) {
            mp3File = recentFiles.reduce((latest, current) => {
              const latestPath = path.join(outputDir, latest);
              const currentPath = path.join(outputDir, current);
              return fs.statSync(currentPath).mtime > fs.statSync(latestPath).mtime ? current : latest;
            });
            console.log(`✅ Found recent file: ${mp3File}`);
          } else {
            console.log(`⚠️ No recent MP3 files found (older than 30 seconds)`);
          }
        }
      }
          
          if (mp3File) {
            const fullPath = path.join(outputDir, mp3File);
            console.log('✅ spotdl download successful:', fullPath);
            
            // Update progress to 95% before moving file
            if (database) {
              await database.updateDownloadStatus(downloadId, 'downloading', 95);
            }
            
            // Move to music library with proper metadata
            const musicId = await moveSingleFileToLibrary(fullPath, title, artist, album, userId);
            
            // Update download status to completed
            if (database) {
              await database.updateDownloadStatus(downloadId, 'completed', 100);
            }
            
            // Invalidate library cache so new song appears in searches
            try {
              const response = await fetch('http://localhost:3001/api/library/invalidate-cache', {
                method: 'POST'
              });
              console.log('🔄 Library cache invalidated after download');
            } catch (cacheError) {
              console.warn('⚠️ Could not invalidate cache:', cacheError.message);
            }
            
            // Auto-add to playlist if playlistId was provided
            if (playlistId && musicId && database) {
              try {
                await database.addTrackToPlaylist(playlistId, musicId);
                console.log(`✅ Auto-added track to playlist ${playlistId}: ${title}`);
              } catch (playlistError) {
                // Ignore if track already in playlist
                if (!playlistError.message.includes('UNIQUE constraint')) {
                  console.warn(`⚠️ Could not auto-add to playlist:`, playlistError.message);
                }
              }
            }
            
            // Clean up the unique download directory
            try {
              const files = fs.readdirSync(outputDir);
              if (files.length === 0) {
                fs.rmdirSync(outputDir);
                console.log(`🧹 Cleaned up download directory: ${outputDir}`);
              }
            } catch (error) {
              console.warn(`⚠️ Could not clean up directory: ${error.message}`);
            }
            
            resolve({ success: true, file: fullPath });
          } else {
            console.error('❌ No MP3 file found after download');
            
            // Try fallback strategies (up to 3 retries)
            if (retryAttempt < 3) {
              console.log(`🔄 Attempting fallback strategy ${retryAttempt + 1}...`);
              try {
                // Wait a bit before retry
                await new Promise(resolve => setTimeout(resolve, 2000));
                // Recursive retry with next strategy
                const result = await downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId, retryAttempt + 1);
                resolve(result);
                return;
              } catch (retryError) {
                console.error(`❌ Fallback strategy ${retryAttempt + 1} failed:`, retryError.message);
              }
            }
            
            // All retries exhausted
            console.error(`❌ All ${retryAttempt + 1} download attempts failed for: ${artist} - ${title}`);
            if (database) {
              await database.updateDownloadStatus(downloadId, 'failed', 0);
            }
            reject(new Error('No MP3 file found after download (all retries exhausted)'));
          }
        } else {
          console.error('❌ spotdl failed:', errorOutput);
          
          // Try fallback strategies (up to 3 retries)
          if (retryAttempt < 3) {
            console.log(`🔄 Attempting fallback strategy ${retryAttempt + 1}...`);
            try {
              // Wait a bit before retry
              await new Promise(resolve => setTimeout(resolve, 2000));
              // Recursive retry with next strategy
              const result = await downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId, retryAttempt + 1);
              resolve(result);
              return;
            } catch (retryError) {
              console.error(`❌ Fallback strategy ${retryAttempt + 1} failed:`, retryError.message);
            }
          }
          
          // All retries exhausted
          console.error(`❌ All ${retryAttempt + 1} download attempts failed for: ${artist} - ${title}`);
          if (database) {
            await database.updateDownloadStatus(downloadId, 'failed', 0);
          }
          reject(new Error('spotdl download failed: ' + errorOutput));
        }
      });
      
      spotdl.on('error', async (error) => {
        console.error('spotdl spawn error:', error);
        
        // Try fallback strategies (up to 3 retries)
        if (retryAttempt < 3) {
          console.log(`🔄 Attempting fallback strategy ${retryAttempt + 1}...`);
          try {
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Recursive retry with next strategy
            const result = await downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId, retryAttempt + 1);
            resolve(result);
            return;
          } catch (retryError) {
            console.error(`❌ Fallback strategy ${retryAttempt + 1} failed:`, retryError.message);
          }
        }
        
        // All retries exhausted
        console.error(`❌ All ${retryAttempt + 1} download attempts failed for: ${artist} - ${title}`);
        if (database) {
          await database.updateDownloadStatus(downloadId, 'failed', 0);
        }
        reject(error);
      });
      
    } catch (error) {
      console.error('Error in spotdl download:', error);
      
      // Try fallback strategies (up to 3 retries)
      if (retryAttempt < 3) {
        console.log(`🔄 Attempting fallback strategy ${retryAttempt + 1}...`);
        try {
          // Wait a bit before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          // Recursive retry with next strategy
          const result = await downloadMusicWithSpotdl(title, artist, album, downloadId, userId, playlistId, retryAttempt + 1);
          resolve(result);
          return;
        } catch (retryError) {
          console.error(`❌ Fallback strategy ${retryAttempt + 1} failed:`, retryError.message);
        }
      }
      
      // All retries exhausted
      console.error(`❌ All ${retryAttempt + 1} download attempts failed for: ${artist} - ${title}`);
      if (database) {
        await database.updateDownloadStatus(downloadId, 'failed', 0);
      }
      reject(error);
    }
  });
}

// Simplified sequential playlist scanning function
async function startSequentialPlaylistScan(playlistUrl, playlistName, trackCount, userId) {
  console.log(`🔍 Starting simplified sequential approach for playlist: "${playlistName}" with ${trackCount} tracks`);
  
  // Create a playlist for tracking
  let playlistId = null;
  if (database) {
    try {
      const playlist = await database.createPlaylist(userId, playlistName);
      playlistId = playlist.id;
      console.log(`📝 Created playlist "${playlistName}" with ID: ${playlistId}`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  }
  
  // Try to extract tracks using spotdl save command with a delay
  console.log(`⏰ Waiting 30 seconds before attempting track extraction to avoid rate limits...`);
  
  setTimeout(async () => {
    try {
      const { spawn } = await import('child_process');
      const extractCommand = `python3 -m spotdl save "${playlistUrl}" --print-errors --save-file /tmp/playlist_${Date.now()}.spotdl`;
      
      console.log(`🔍 Attempting to extract tracks with: ${extractCommand}`);
      
      const extractProcess = spawn('bash', ['-c', extractCommand], {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let extractOutput = '';
      extractProcess.stdout.on('data', (data) => {
        extractOutput += data.toString();
      });
      
      extractProcess.on('close', (code) => {
        if (code === 0 && extractOutput.trim()) {
          console.log(`✅ Track extraction successful, parsing output...`);
          
          // Parse tracks from the output
          const lines = extractOutput.split('\n');
          const extractedTracks = [];
          
          for (const line of lines) {
            const match = line.match(/^\s*(.+?)\s+-\s+(.+?)(?:\s*$|\s+\(|$)/);
            if (match && !line.includes('Found') && !line.includes('Processing') && !line.includes('WARNING')) {
              const artist = match[1].trim();
              const title = match[2].trim();
              
              if (artist.length > 0 && title.length > 0) {
                extractedTracks.push({
                  artist: artist,
                  title: title,
                  album: 'Import'
                });
              }
            }
          }
          
          if (extractedTracks.length > 0) {
            console.log(`🎵 Successfully extracted ${extractedTracks.length} tracks, starting sequential download`);
            startSequentialPlaylistDownload(playlistName, extractedTracks, userId);
          } else {
            console.log(`❌ No tracks could be extracted from output`);
          }
        } else {
          console.log(`❌ Track extraction failed with code ${code}`);
        }
      });
      
    } catch (error) {
      console.error('Error during track extraction:', error);
    }
  }, 30000); // Wait 30 seconds before trying
}

// Sequential playlist download function
async function startSequentialPlaylistDownload(playlistName, tracks, userId) {
  console.log(`🎵 Starting sequential download for playlist: "${playlistName}" with ${tracks.length} tracks`);
  
  // Create a playlist for tracking
  let playlistId = null;
  if (database) {
    try {
      const playlist = await database.createPlaylist(userId, playlistName);
      playlistId = playlist.id;
      console.log(`📝 Created playlist "${playlistName}" with ID: ${playlistId}`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  }
  
  // Download tracks one by one with delays
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const delay = i * 60000; // 1 minute delay between downloads
    
    setTimeout(async () => {
      try {
        console.log(`🎵 [${i + 1}/${tracks.length}] Starting download: ${track.artist} - ${track.title}`);
        
        // Create download entry
        const downloadId = `playlist_${Date.now()}_${i}`;
        const downloadData = {
          id: downloadId,
          title: track.title,
          artist: track.artist,
          album: track.album || 'Import',
          status: 'searching',
          progress: 0,
          created_at: new Date().toISOString(),
          user_id: userId,
          playlist_id: playlistId
        };
        
        await database.addDownload(downloadData);
        
        // Start the download
        await downloadMusicWithSpotdl(track.title, track.artist, track.album, downloadId, userId, playlistId);
        
        console.log(`✅ [${i + 1}/${tracks.length}] Completed: ${track.artist} - ${track.title}`);
        
      } catch (error) {
        console.error(`❌ [${i + 1}/${tracks.length}] Failed: ${track.artist} - ${track.title}`, error);
      }
    }, delay);
  }
  
  console.log(`⏰ Sequential download scheduled: ${tracks.length} tracks over ${Math.ceil(tracks.length * 60 / 60)} minutes`);
}

export default router;
