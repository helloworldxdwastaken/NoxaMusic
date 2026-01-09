import express from 'express';
import * as playlistCleanup from '../services/playlistCleanup.js';
import { getUserIdFromToken as jwtGetUserIdFromToken } from '../middleware/jwtAuth.js';

const router = express.Router();

// Database instance
let database = null;

export const setDatabase = (db) => {
  database = db;
};

// Helper function to convert file system paths to URL paths for frontend
function convertArtworkPathToURL(artworkPath) {
  if (!artworkPath) return null;
  
  let urlPath = artworkPath;
  
  // Convert full file system path to URL path first
  const musicLibPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
  
  if (artworkPath.startsWith(musicLibPath)) {
    // Convert: /mnt/UNO/Music_lib/Artist/Album/cover.jpg → /music_lib/Artist/Album/cover.jpg
    urlPath = artworkPath.replace(musicLibPath, '/music_lib');
  }
  
  // URL-encode the path to handle spaces, parentheses, brackets, etc.
  // Split by / to preserve path structure, encode each segment, then rejoin
  const segments = urlPath.split('/');
  const encodedSegments = segments.map(segment => 
    encodeURIComponent(segment).replace(/%2F/g, '/')
  );
  
  return encodedSegments.join('/');
}

// Helper function to extract user ID from token using JWT
function getUserIdFromToken(req) {
  const authHeader = req.headers.authorization;
  console.log('🔐 [Playlists Auth] Authorization header:', authHeader ? `Present (${authHeader.substring(0, 30)}...)` : 'Missing');
  
  if (!authHeader) {
    console.log('❌ [Playlists Auth] No authorization header found');
    return null;
  }
  
  // Use proper JWT verification
  const userId = jwtGetUserIdFromToken(req);
  
  if (userId) {
    console.log('✅ [Playlists Auth] JWT authentication successful, user ID:', userId);
    return userId;
  } else {
    console.log('❌ [Playlists Auth] JWT authentication failed');
    return null;
  }
}

// Middleware to authenticate user
const authenticateUser = (req, res, next) => {
  console.log(`🔒 [Playlists Auth] Authenticating request to ${req.method} ${req.path}`);
  const userId = getUserIdFromToken(req);
  if (userId === null || userId === undefined) {
    console.log('❌ [Playlists Auth] Authentication failed - no valid user ID');
    return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required. Please log in.' });
  }
  console.log('✅ [Playlists Auth] Authentication successful, user ID:', userId);
  req.userId = userId;
  next();
};

// Create a new playlist
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.userId;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const playlist = await database.createPlaylist(userId, name.trim(), description || '');
    
    res.status(201).json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        track_count: 0,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Failed to create playlist', message: error.message });
  }
});

// Get all playlists for user
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Now returns playlists with track_count already included (no N+1 query)
    const allPlaylists = await database.getPlaylists(userId);
    
    // Filter out auto-generated "Made for You" playlists
    // These should only appear on the homepage, not in the user's playlist library
    const generatedPlaylistNames = [
      'Daily Mix',
      'Recommended for You',
      'Best of Rock',
      'Best of Alternative',
      'Best of Metal',
      'Best of EDM',
      'Best of Dubstep'
    ];
    
    // Also check for emoji-prefixed versions (for legacy playlists)
    const isGeneratedPlaylist = (name) => {
      // Remove emoji prefix if present
      const normalizedName = name.replace(/^[\u{1F300}-\u{1F9FF}]\s+/u, '');
      return generatedPlaylistNames.includes(normalizedName);
    };
    
    const playlists = allPlaylists.filter(p => !isGeneratedPlaylist(p.name));
    
    // Convert artwork paths to URLs for frontend
    const playlistsWithConvertedArtwork = playlists.map(p => ({
      ...p,
      artwork: convertArtworkPathToURL(p.artwork)
    }));
    
    res.json({
      success: true,
      playlists: playlistsWithConvertedArtwork
    });
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists', message: error.message });
  }
});

// Generate or get daily playlists (Daily Mix, Recommended, Best of Genre playlists)
// NOTE: This MUST come BEFORE /:playlistId to avoid "generated" being treated as an ID
router.get('/generated', authenticateUser, async (req, res) => {
  try {
    if (!database || !database.db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    const userId = req.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log('🎵 [Generated Playlists] Request from user:', userId, 'Date:', today);

    // Define playlist configurations
    const playlistConfigs = [
      { name: 'Daily Mix', description: 'Your daily personalized mix', icon: '🎧', image: '/images/playlists/daily-mix.webp' },
      { name: 'Recommended for You', description: 'Curated just for you', icon: '✨', image: '/images/playlists/recommended.webp' },
      { name: 'Best of Rock', description: 'Top rock hits from your library', icon: '🎸', image: '/images/playlists/best-of-rock.webp', genres: ['rock', 'classic rock', 'hard rock', 'rock & roll'] },
      { name: 'Best of Alternative', description: 'Alternative classics', icon: '🎭', image: '/images/playlists/best-of-alternative.webp', genres: ['alternative', 'alternative rock', 'indie', 'indie rock'] },
      { name: 'Best of Metal', description: 'Heavy metal collection', icon: '🤘', image: '/images/playlists/best-of-metal.webp', genres: ['metal', 'metalcore', 'nu metal', 'heavy metal', 'deathcore', 'melodic metalcore'] },
      { name: 'Best of EDM', description: 'Electronic dance music', icon: '🎵', image: '/images/playlists/best-of-edm.webp', genres: ['edm', 'electronic', 'house', 'trance', 'techno', 'dance', 'electro house', 'progressive house', 'psytrance', 'electronica', 'progressive trance', 'melodic house'], excludeGenres: ['rock', 'metal', 'punk', 'hardcore', 'nu metal', 'alternative', 'rap', 'hip hop'] },
      { name: 'Best of Dubstep', description: 'Heavy bass & wobbles', icon: '🔊', image: '/images/playlists/best-of-dubstep.webp', genres: ['dubstep', 'drum and bass', 'drum & bass', 'brostep'] }
    ];

    // Check existing playlists (using callback-based sqlite3, not better-sqlite3)
    // Also search for playlists with emoji prefixes to handle legacy playlists
    const existingPlaylists = await new Promise((resolve, reject) => {
      // Build list of all possible name variations (with and without emojis)
      const nameVariations = [];
      playlistConfigs.forEach(config => {
        nameVariations.push(config.name); // "Best of Rock"
        nameVariations.push(`${config.icon} ${config.name}`); // "🎸 Best of Rock"
      });
      
      const placeholders = nameVariations.map(() => '?').join(',');
      database.db.all(
        `SELECT p.*, COUNT(pt.music_id) as track_count 
         FROM playlists p 
         LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id 
         WHERE p.user_id = ? AND p.name IN (${placeholders})
         GROUP BY p.id`,
        [userId, ...nameVariations],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Map playlists by normalized name (remove emoji prefix if present)
    const existingMap = {};
    existingPlaylists.forEach(p => {
      // Normalize the name by removing emoji prefix
      const normalizedName = p.name.replace(/^[\u{1F300}-\u{1F9FF}]\s+/u, '');
      
      // Keep track of all variations for deletion
      if (!existingMap[normalizedName]) {
        existingMap[normalizedName] = [];
      }
      existingMap[normalizedName].push(p);
    });

    // Check if regeneration needed
    const needsRegeneration = playlistConfigs.some(config => {
      const existingVariations = existingMap[config.name];
      if (!existingVariations || existingVariations.length === 0) return true;
      
      // Regenerate if ANY existing variation needs regeneration (not ALL)
      // This handles cases where duplicates exist with different states
      return existingVariations.some(p => {
        if (p.track_count === 0) return true;
        
        // Use updated_at if available, otherwise fall back to created_at
        const dateStr = p.updated_at || p.created_at;
        if (!dateStr) return true;
        
        // Extract date part (handles both "2026-01-07T..." and "2026-01-07 ..." formats)
        const playlistDate = dateStr.split(/[T ]/)[0];
        return playlistDate !== today;
      });
    });

    if (needsRegeneration) {
      console.log('🔄 [Generated Playlists] Regenerating playlists for user', userId);
      
      // Delete old generated playlists for this user (including all emoji variations)
      for (const config of playlistConfigs) {
        const existingVariations = existingMap[config.name];
        if (existingVariations) {
          for (const playlist of existingVariations) {
            await database.deletePlaylist(playlist.id, userId);
            console.log(`🗑️ Deleted old playlist: "${playlist.name}" (ID: ${playlist.id})`);
          }
        }
      }

      // Get user's music library (with large limit to get all tracks)
      const userTracks = await database.getMusicLibrary(100000, 0, userId);
      // Shuffle tracks for randomness
      userTracks.sort(() => Math.random() - 0.5);
      
      if (userTracks.length === 0) {
        console.log('⚠️ [Generated Playlists] No tracks found for user', userId);
        return res.json({ success: true, playlists: [] });
      }

      const resultPlaylists = [];

      for (const config of playlistConfigs) {
        let tracks;
        
        if (config.genres) {
          // Genre-specific playlist - use smart matching to avoid false positives
          tracks = userTracks.filter(track => {
            if (!track.genre) return false;
            
            // Split genre string by common separators (;, comma, etc.)
            const trackGenres = track.genre.toLowerCase().split(/[;,]+/).map(g => g.trim());
            
            // Check if track has any excluded genres (blacklist)
            if (config.excludeGenres) {
              const excludeGenresLower = config.excludeGenres.map(g => g.toLowerCase());
              const hasExcludedGenre = trackGenres.some(trackGenre =>
                excludeGenresLower.some(excludeGenre => {
                  // Exact match
                  if (trackGenre === excludeGenre) return true;
                  // Word boundary matching (same logic as genre matching)
                  const wordBoundaryRegex = new RegExp(`(^|\\s)${excludeGenre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
                  if (wordBoundaryRegex.test(trackGenre)) return true;
                  // Substring match for compound genres (e.g., "electronic rock" contains "rock")
                  if (excludeGenre.length >= 3 && trackGenre.includes(excludeGenre)) return true;
                  return false;
                })
              );
              if (hasExcludedGenre) return false; // Skip this track
            }
            
            // Check if ANY of the track's genres match ANY of the config genres
            return trackGenres.some(trackGenre => 
              config.genres.some(configGenre => {
                // Exact match (handles single-word genres like "rock" === "rock")
                if (trackGenre === configGenre) return true;
                
                // Word boundary matching for multi-word genres
                // Check if configGenre appears as a whole word in trackGenre
                // Use word boundaries: start of string, space, or end of string
                const wordBoundaryRegex = new RegExp(`(^|\\s)${configGenre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
                if (wordBoundaryRegex.test(trackGenre)) return true;
                
                // Also check if trackGenre contains configGenre as a substring (for compound genres)
                // For 3+ char genres to avoid false positives (handles "edm", "pop", "rap", etc.)
                if (configGenre.length >= 3 && trackGenre.includes(configGenre)) return true;
                
                return false;
              })
            );
          });
          
          // If not enough tracks for this genre, skip it
          if (tracks.length < 10) {
            console.log(`⚠️ [Generated Playlists] Skipping "${config.name}" - only ${tracks.length} tracks`);
            continue;
          }
        } else {
          // Daily Mix / Recommended - very random selection
          // Shuffle the array more thoroughly and take random slice
          const shuffled = [...userTracks].sort(() => Math.random() - 0.5);
          // Limit to 100 tracks max
          const maxTracks = Math.min(100, shuffled.length);
          const randomStart = Math.floor(Math.random() * Math.max(1, shuffled.length - maxTracks));
          tracks = shuffled.slice(randomStart, randomStart + maxTracks);
        }

        // Limit all playlists to 100 tracks max
        tracks = tracks.slice(0, 100);

        // Create playlist
        const playlist = await database.createPlaylist(userId, config.name, config.description);
        
        // Add tracks using BATCH INSERT (much faster than one-by-one)
        if (tracks.length > 0) {
          // Build parameterized query for safety
          const placeholders = tracks.map(() => '(?, ?, ?)').join(',');
          const params = [];
          tracks.forEach((track, index) => {
            params.push(playlist.id, track.id, index);
          });
          
          await new Promise((resolve, reject) => {
            database.db.run(
              `INSERT INTO playlist_tracks (playlist_id, music_id, position) VALUES ${placeholders}`,
              params,
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        console.log(`✅ [Generated Playlists] Created "${config.name}" with ${tracks.length} tracks`);

        // Get the full playlist with track count
        const fullPlaylist = await database.getPlaylistById(playlist.id, userId);
        
        // Add image, icon, and generated flag info for frontend
        fullPlaylist.image = config.image;
        fullPlaylist.artwork = config.image; // Frontend expects 'artwork' field
        fullPlaylist.icon = config.icon;
        fullPlaylist.is_generated = true;
        fullPlaylist.track_count = tracks.length;
        resultPlaylists.push(fullPlaylist);
      }

      console.log('📦 [Generated Playlists] Returning NEW:', resultPlaylists.map(p => ({ name: p.name, artwork: p.artwork, image: p.image })));

      res.json({
        success: true,
        playlists: resultPlaylists
      });

    } else {
      console.log('✅ [Generated Playlists] Using existing playlists from today');
      
      // Add image and icon info to existing playlists
      // Use only one playlist per config (prefer non-emoji version)
      const result = [];
      playlistConfigs.forEach(config => {
        const existingVariations = existingMap[config.name];
        if (existingVariations && existingVariations.length > 0) {
          // Prefer playlist without emoji in name
          const playlist = existingVariations.find(p => p.name === config.name) || existingVariations[0];
          result.push({
            ...playlist,
            image: config.image,
            artwork: config.image, // Frontend expects 'artwork' field
            icon: config.icon,
            is_generated: true
          });
        }
      });
      
      console.log('📦 [Generated Playlists] Returning existing:', result.map(p => ({ name: p.name, artwork: p.artwork, image: p.image })));
      
      res.json({
        success: true,
        playlists: result
      });
    }

  } catch (error) {
    console.error('❌ [Generated Playlists] Error:', error);
    res.status(500).json({ error: 'Failed to generate playlists', message: error.message });
  }
});

// Get specific playlist by ID
router.get('/:playlistId', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const playlist = await database.getPlaylistById(parseInt(playlistId), userId);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Get tracks for this playlist
    const tracks = await database.getPlaylistTracks(parseInt(playlistId), userId);
    
    // Convert artwork paths to URLs for frontend
    const tracksWithConvertedArtwork = tracks.map(track => ({
      ...track,
      album_cover: convertArtworkPathToURL(track.album_cover),
      artist_image: convertArtworkPathToURL(track.artist_image)
    }));
    
    res.json({
      success: true,
      playlist: {
        ...playlist,
        artwork: convertArtworkPathToURL(playlist.artwork),
        tracks: tracksWithConvertedArtwork
      }
    });
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ error: 'Failed to get playlist', message: error.message });
  }
});

// Get tracks for a specific playlist
router.get('/:playlistId/tracks', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const tracks = await database.getPlaylistTracks(parseInt(playlistId), userId);
    
    // Convert artwork paths to URLs for frontend
    const tracksWithConvertedArtwork = tracks.map(track => ({
      ...track,
      album_cover: convertArtworkPathToURL(track.album_cover),
      artist_image: convertArtworkPathToURL(track.artist_image)
    }));
    
    res.json({
      success: true,
      tracks: tracksWithConvertedArtwork
    });
  } catch (error) {
    console.error('Get playlist tracks error:', error);
    res.status(500).json({ error: 'Failed to get playlist tracks', message: error.message });
  }
});

// Add track to playlist
router.post('/:playlistId/tracks', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { musicId, position } = req.body;
    const userId = req.userId;
    
    if (!musicId) {
      return res.status(400).json({ error: 'Music ID is required' });
    }
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    // Verify the track exists
    const track = await database.getMusicById(musicId);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Add track to playlist
    const result = await database.addTrackToPlaylist(
      parseInt(playlistId), 
      parseInt(musicId), 
      position ? parseInt(position) : null, 
      userId
    );
    
    res.status(201).json({
      success: true,
      message: 'Track added to playlist',
      playlist_track_id: result.id
    });
  } catch (error) {
    console.error('Add track to playlist error:', error);
    
    if (error.message === 'Track already in playlist') {
      return res.status(409).json({ error: 'Track is already in this playlist' });
    }
    
    res.status(500).json({ error: 'Failed to add track to playlist', message: error.message });
  }
});

// Remove track from playlist
router.delete('/:playlistId/tracks/:musicId', authenticateUser, async (req, res) => {
  try {
    const { playlistId, musicId } = req.params;
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const success = await database.removeTrackFromPlaylist(
      parseInt(playlistId), 
      parseInt(musicId), 
      userId
    );
    
    if (!success) {
      return res.status(404).json({ error: 'Track not found in playlist' });
    }
    
    res.json({
      success: true,
      message: 'Track removed from playlist'
    });
  } catch (error) {
    console.error('Remove track from playlist error:', error);
    res.status(500).json({ error: 'Failed to remove track from playlist', message: error.message });
  }
});

// Update playlist (name, description)
router.put('/:playlistId', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { name, description } = req.body;
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const updates = {};
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Playlist name cannot be empty' });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    const success = await database.updatePlaylist(parseInt(playlistId), updates, userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json({
      success: true,
      message: 'Playlist updated successfully'
    });
  } catch (error) {
    console.error('Update playlist error:', error);
    res.status(500).json({ error: 'Failed to update playlist', message: error.message });
  }
});

// Reorder tracks in playlist
router.put('/:playlistId/reorder', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { trackOrders } = req.body;
    const userId = req.userId;
    
    if (!trackOrders || !Array.isArray(trackOrders)) {
      return res.status(400).json({ error: 'trackOrders array is required' });
    }
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const success = await database.reorderPlaylistTracks(
      parseInt(playlistId), 
      trackOrders, 
      userId
    );
    
    if (!success) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json({
      success: true,
      message: 'Playlist tracks reordered successfully'
    });
  } catch (error) {
    console.error('Reorder playlist tracks error:', error);
    res.status(500).json({ error: 'Failed to reorder playlist tracks', message: error.message });
  }
});

// Delete playlist
router.delete('/:playlistId', authenticateUser, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const success = await database.deletePlaylist(parseInt(playlistId), userId);
    
    if (!success) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });
  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: 'Failed to delete playlist', message: error.message });
  }
});

// Clean up duplicate playlists (keep newest)
router.post('/cleanup-duplicates', authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    console.log(`🧹 Cleaning up duplicate playlists for user ${userId}`);
    
    const playlists = await database.getPlaylists(userId);
    
    // Group by name
    const playlistsByName = {};
    playlists.forEach(playlist => {
      if (!playlistsByName[playlist.name]) {
        playlistsByName[playlist.name] = [];
      }
      playlistsByName[playlist.name].push(playlist);
    });
    
    // Find duplicates
    let deletedCount = 0;
    for (const [name, duplicates] of Object.entries(playlistsByName)) {
      if (duplicates.length > 1) {
        // Sort by created_at DESC (newest first)
        duplicates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Keep the first (newest), delete the rest
        for (let i = 1; i < duplicates.length; i++) {
          await database.deletePlaylist(duplicates[i].id, userId);
          console.log(`🗑️ Deleted duplicate playlist: ${name} (ID: ${duplicates[i].id})`);
          deletedCount++;
        }
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} duplicate playlists`,
      deletedCount
    });
  } catch (error) {
    console.error('Cleanup duplicates error:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicates', message: error.message });
  }
});

// Cleanup orphaned playlist tracks (tracks that reference deleted music files)
router.post('/cleanup-orphaned', async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    console.log('🔄 Manual playlist cleanup requested');
    
    const result = await playlistCleanup.cleanupOrphanedPlaylistTracks(database);
    
    res.json({
      success: true,
      message: `Playlist cleanup: ${result.reconnected} tracks reconnected, ${result.removed} removed`,
      reconnected: result.reconnected,
      removed: result.removed,
      total: result.total,
      byPlaylist: result.byPlaylist
    });
  } catch (error) {
    console.error('Playlist cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup playlists', message: error.message });
  }
});

// Get orphaned tracks statistics
router.get('/orphaned-stats', async (req, res) => {
  try {
    if (!database) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    const stats = await playlistCleanup.getOrphanedTracksStats(database);
    
    res.json(stats);
  } catch (error) {
    console.error('Get orphaned stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

export default router;
