import express from 'express';
import axios from 'axios';

const router = express.Router();

// LRCLIB API base URL
const LRCLIB_BASE = 'https://lrclib.net/api';

// Albums to ignore (placeholder/generic names that confuse LRCLIB)
const IGNORED_ALBUMS = [
  'youtube music import',
  'unknown album',
  'unknown',
  'downloads',
  'imported',
  'music library',
  'my music'
];

// Helper to fetch from LRCLIB
async function fetchFromLRCLIB(artist, track, album = null, duration = null) {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: track
  });

  if (album) params.append('album_name', album);
  if (duration) params.append('duration', duration);

  const url = `${LRCLIB_BASE}/get?${params.toString()}`;
  
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'User-Agent': 'MusicStream/1.0'
    }
  });

  return response.data;
}

/**
 * GET /api/lyrics
 * Fetch lyrics from LRCLIB
 * Query params: artist, track, album (optional), duration (optional)
 */
router.get('/', async (req, res) => {
  try {
    const { artist, track, album, duration } = req.query;

    if (!artist || !track) {
      return res.status(400).json({ 
        error: 'Missing required parameters: artist and track' 
      });
    }

    // Check if album should be ignored
    const cleanAlbum = album && !IGNORED_ALBUMS.includes(album.toLowerCase().trim()) 
      ? album 
      : null;

    console.log(`🎤 Fetching lyrics: ${artist} - ${track}${cleanAlbum ? ` (${cleanAlbum})` : ''}`);

    let data = null;

    // Try with album first (if valid)
    if (cleanAlbum) {
      try {
        data = await fetchFromLRCLIB(artist, track, cleanAlbum, duration);
      } catch (err) {
        // If 404, will retry without album
        if (err.response?.status !== 404) throw err;
        console.log(`🎤 Not found with album, retrying without...`);
      }
    }

    // Fallback: try without album
    if (!data) {
      try {
        data = await fetchFromLRCLIB(artist, track, null, duration);
      } catch (err) {
        if (err.response?.status === 404) {
          return res.json({ 
            success: false, 
            error: 'No lyrics found for this track' 
          });
        }
        throw err;
      }
    }

    if (data) {
      return res.json({
        success: true,
        id: data.id,
        name: data.name || track,
        artist: data.artistName || artist,
        album: data.albumName || album,
        duration: data.duration,
        syncedLyrics: data.syncedLyrics || null,
        plainLyrics: data.plainLyrics || null,
        instrumental: data.instrumental || false
      });
    }

    return res.json({ 
      success: false, 
      error: 'No lyrics found' 
    });

  } catch (error) {
    console.error('❌ Lyrics fetch error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch lyrics' 
    });
  }
});

/**
 * GET /api/lyrics/search
 * Search for lyrics
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const url = `${LRCLIB_BASE}/search?q=${encodeURIComponent(q)}`;
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'MusicStream/1.0'
      }
    });

    return res.json({
      success: true,
      results: response.data || []
    });

  } catch (error) {
    console.error('❌ Lyrics search error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to search lyrics' 
    });
  }
});

export default router;




