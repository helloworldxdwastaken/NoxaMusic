import express from 'express';
import axios from 'axios';

const router = express.Router();

// Deezer API (No API key needed!)
const deezerAPI = axios.create({
  baseURL: 'https://api.deezer.com',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
  },
  timeout: 10000
});

// Search music on Deezer
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'track', limit = 30 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    console.log(`🔍 Deezer search: type=${type}, query="${q}", limit=${limit}`);
    const response = await deezerAPI.get(`/search/${type}`, {
      params: { q, limit }
    });
    console.log(`✅ Deezer returned ${response.data.data?.length || 0} results`);

    const results = response.data.data.map(item => {
      // Handle different types (track, artist, album)
      if (type === 'artist') {
        return {
          id: item.id,
          title: item.name,
          artist: item.name,
          album: null,
          image: item.picture_medium || item.picture,
          duration: null,
          preview: null,
          source: 'deezer',
          type: 'artist'
        };
      } else if (type === 'album') {
        return {
          id: item.id,
          title: item.title,
          artist: item.artist?.name || 'Unknown',
          album: item.title,
          image: item.cover_medium || item.cover,
          duration: item.duration,
          preview: null,
          source: 'deezer',
          type: 'album'
        };
      } else {
        // Default: track
        return {
          id: item.id,
          title: item.title || item.name,
          artist: item.artist?.name || 'Unknown',
          album: item.album?.title,
          image: item.album?.cover_medium || item.picture_medium,
          duration: item.duration,
          preview: item.preview,
          source: 'deezer',
          type: 'track'
        };
      }
    });

    res.json(results);
  } catch (error) {
    console.error('❌ Deezer search error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    res.status(500).json({ 
      error: 'Search failed', 
      message: error.message,
      status: error.response?.status 
    });
  }
});

// Get trending/chart music
router.get('/trending', async (req, res) => {
  try {
    const { limit = 12, type = 'mixed' } = req.query;
    
    let results = [];
    
    if (type === 'mixed') {
      // Mix different chart types for variety
      const chartTypes = [
        '/chart/0/tracks',      // Global chart
        '/chart/1/tracks',      // Alternative chart
        '/chart/2/tracks',      // Rock chart
        '/chart/3/tracks',      // Pop chart
        '/chart/4/tracks',      // Hip-Hop chart
        '/chart/5/tracks',      // Electronic chart
        '/chart/6/tracks',      // R&B chart
        '/chart/7/tracks',      // Country chart
        '/chart/8/tracks',      // Jazz chart
        '/chart/9/tracks'       // Classical chart
      ];
      
      // Randomly select 2-3 chart types
      const selectedCharts = chartTypes.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      for (const chartType of selectedCharts) {
        try {
          const response = await deezerAPI.get(chartType, {
            params: { limit: Math.ceil(limit / selectedCharts.length) }
          });
          
          const chartResults = response.data.data.map(item => ({
            id: item.id,
            title: item.title,
            artist: item.artist.name,
            album: item.album.title,
            image: item.album.cover_medium,
            duration: item.duration,
            preview: item.preview,
            source: 'deezer',
            chart_type: chartType
          }));
          
          results = results.concat(chartResults);
        } catch (chartError) {
          console.warn(`Failed to fetch chart ${chartType}:`, chartError.message);
        }
      }
      
      // Shuffle and limit results
      results = results.sort(() => 0.5 - Math.random()).slice(0, limit);
      
    } else {
      // Single chart type
      const chartType = `/chart/${type}/tracks`;
      const response = await deezerAPI.get(chartType, {
        params: { limit }
      });

      results = response.data.data.map(item => ({
        id: item.id,
        title: item.title,
        artist: item.artist.name,
        album: item.album.title,
        image: item.album.cover_medium,
        duration: item.duration,
        preview: item.preview,
        source: 'deezer',
        chart_type: chartType
      }));
    }

    res.json(results);
  } catch (error) {
    console.error('Trending fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending', message: error.message });
  }
});

// Get track details
router.get('/track/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const response = await deezerAPI.get(`/track/${id}`);
    const track = response.data;

    res.json({
      id: track.id,
      title: track.title,
      artist: track.artist.name,
      album: track.album.title,
      image: track.album.cover_big,
      duration: track.duration,
      preview: track.preview,
      releaseDate: track.release_date,
      source: 'deezer'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get track', message: error.message });
  }
});

// Stream music (proxy Deezer preview)
router.get('/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get track details to get preview URL
    const trackResponse = await deezerAPI.get(`/track/${id}`);
    const previewUrl = trackResponse.data.preview;

    if (!previewUrl) {
      return res.status(404).json({ error: 'No preview available' });
    }

    // Proxy the audio stream
    const audioResponse = await axios.get(previewUrl, {
      responseType: 'stream'
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    audioResponse.data.pipe(res);
  } catch (error) {
    console.error('Stream error:', error.message);
    res.status(500).json({ error: 'Stream failed', message: error.message });
  }
});

// ========================================
// SMART SEARCH - Returns tracks, artists, albums at once
// ========================================
router.get('/smart-search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    console.log(`🔍 Smart search: "${q}"`);
    
    // Search all three types in parallel
    const [tracksRes, artistsRes, albumsRes] = await Promise.all([
      deezerAPI.get('/search/track', { params: { q, limit } }).catch(() => ({ data: { data: [] } })),
      deezerAPI.get('/search/artist', { params: { q, limit: 5 } }).catch(() => ({ data: { data: [] } })),
      deezerAPI.get('/search/album', { params: { q, limit: 8 } }).catch(() => ({ data: { data: [] } }))
    ]);

    const results = {
      tracks: (tracksRes.data.data || []).map(item => ({
        id: item.id,
        title: item.title,
        artist: item.artist?.name || 'Unknown',
        artistId: item.artist?.id,
        album: item.album?.title,
        albumId: item.album?.id,
        image: item.album?.cover_medium || item.artist?.picture_medium,
        duration: item.duration,
        preview: item.preview,
        source: 'deezer',
        type: 'track'
      })),
      artists: (artistsRes.data.data || []).map(item => ({
        id: item.id,
        name: item.name,
        image: item.picture_medium || item.picture_big,
        fans: item.nb_fan,
        source: 'deezer',
        type: 'artist'
      })),
      albums: (albumsRes.data.data || []).map(item => ({
        id: item.id,
        title: item.title,
        artist: item.artist?.name || 'Unknown',
        artistId: item.artist?.id,
        image: item.cover_medium || item.cover_big,
        trackCount: item.nb_tracks,
        source: 'deezer',
        type: 'album'
      }))
    };

    console.log(`✅ Smart search: ${results.tracks.length} tracks, ${results.artists.length} artists, ${results.albums.length} albums`);
    res.json(results);
  } catch (error) {
    console.error('❌ Smart search error:', error.message);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// ========================================
// GET ARTIST - Returns artist info + albums
// ========================================
router.get('/artist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🎤 Getting artist: ${id}`);
    
    // Get artist info and albums in parallel
    const [artistRes, albumsRes] = await Promise.all([
      deezerAPI.get(`/artist/${id}`),
      deezerAPI.get(`/artist/${id}/albums`, { params: { limit: 50 } })
    ]);

    const artist = artistRes.data;
    const albums = albumsRes.data.data || [];

    res.json({
      id: artist.id,
      name: artist.name,
      image: artist.picture_big || artist.picture_medium,
      fans: artist.nb_fan,
      albums: albums.map(album => ({
        id: album.id,
        title: album.title,
        image: album.cover_medium || album.cover,
        releaseDate: album.release_date,
        trackCount: album.nb_tracks,
        type: album.record_type // album, single, ep, etc.
      })),
      source: 'deezer'
    });
  } catch (error) {
    console.error('❌ Get artist error:', error.message);
    res.status(500).json({ error: 'Failed to get artist', message: error.message });
  }
});

// ========================================
// GET ALBUM - Returns album info + tracks
// ========================================
router.get('/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`💿 Getting album: ${id}`);
    
    const albumRes = await deezerAPI.get(`/album/${id}`);
    const album = albumRes.data;

    res.json({
      id: album.id,
      title: album.title,
      artist: album.artist?.name || 'Unknown',
      artistId: album.artist?.id,
      image: album.cover_big || album.cover_medium,
      releaseDate: album.release_date,
      trackCount: album.nb_tracks,
      duration: album.duration,
      tracks: (album.tracks?.data || []).map(track => ({
        id: track.id,
        title: track.title,
        artist: track.artist?.name || album.artist?.name || 'Unknown',
        duration: track.duration,
        trackNumber: track.track_position,
        preview: track.preview,
        source: 'deezer',
        type: 'track'
      })),
      source: 'deezer'
    });
  } catch (error) {
    console.error('❌ Get album error:', error.message);
    res.status(500).json({ error: 'Failed to get album', message: error.message });
  }
});

export default router;


