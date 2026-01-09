import path from 'path';
import fs from 'fs';
import axios from 'axios';
import crypto from 'crypto';
import { parseFile } from 'music-metadata';

// Create artwork cache directory
const artworkCacheDir = path.join(process.cwd(), 'artwork_cache');
if (!fs.existsSync(artworkCacheDir)) {
  fs.mkdirSync(artworkCacheDir, { recursive: true });
}

/**
 * Extract artist and album from file path (folder-based)
 * Supports multiple music library paths:
 * - MUSIC_PATH from .env (e.g., /mnt/UNO/Music_lib)
 * - downloads/organized folder structure
 */
export function extractArtistAndAlbum(filePath) {
  let folderArtist = 'Unknown Artist';
  let folderAlbum = 'Unknown Album';

  if (filePath) {
    const pathParts = filePath.split('/');

    // PRIORITY 1: Check if this is from downloads/organized structure
    const organizedIndex = pathParts.indexOf('organized');
    if (organizedIndex !== -1 && pathParts.length > organizedIndex + 2) {
      // Path: .../downloads/organized/Artist/Album/song.mp3
      folderArtist = pathParts[organizedIndex + 1];
      folderAlbum = pathParts[pathParts.length - 2];
      
      // Clean folder name: remove artist prefix, year prefix, brackets, and tags
      folderAlbum = folderAlbum
        .replace(new RegExp(`^${folderArtist}\\s*-\\s*`, 'i'), '') // Remove "Artist - " prefix
        .replace(/^\d{4}\s*-\s*/, '')  // Remove "2019 - "
        .replace(/\s*\[.*?\]/g, '')     // Remove [WEB], [FLAC], etc.
        .replace(/\s*\(.*?Edition.*?\)/gi, '') // Remove (Deluxe Edition), etc.
        .trim();
      
      return { folderArtist, folderAlbum };
    }

    // PRIORITY 2: Check standard music library paths (MUSIC_PATH)
    const musicBasePath = process.env.MUSIC_PATH || 'music';
    const musicFolderName = musicBasePath.split('/').pop(); // Extract last folder name

    // Find the music base folder in the path (try multiple common names)
    const musicIndex = pathParts.findIndex(part =>
      part === musicFolderName ||
      part === 'music' ||
      part === 'Music' ||
      part === 'Music_lib' ||
      part === 'MusicLibrary'
    );

    if (musicIndex !== -1) {
      // Artist folder is right after the base music folder
      if (pathParts[musicIndex + 1]) folderArtist = pathParts[musicIndex + 1];

      // Album folder is the second-to-last folder (right before the filename)
      if (pathParts.length >= 3) {
        folderAlbum = pathParts[pathParts.length - 2];
        // Clean folder name: remove artist prefix, year prefix, brackets, and tags
        folderAlbum = folderAlbum
          .replace(new RegExp(`^${folderArtist}\\s*-\\s*`, 'i'), '') // Remove "Artist - " prefix
          .replace(/^\d{4}\s*-\s*/, '')  // Remove "2019 - "
          .replace(/\s*\[.*?\]/g, '')     // Remove [WEB], [FLAC], etc.
          .replace(/\s*\(.*?Edition.*?\)/gi, '') // Remove (Deluxe Edition), etc.
          .trim();
      }
    }
  }

  return { folderArtist, folderAlbum };
}

/**
 * Download and cache artwork locally
 */
export async function downloadAndCacheArtwork(url, type, identifier) {
  try {
    if (!url) return null;

    // Create safe filename
    const safeIdentifier = identifier.replace(/[^a-zA-Z0-9]/g, '_');
    const ext = path.extname(url) || '.jpg';
    const filename = `${type}_${safeIdentifier}${ext}`;
    const filepath = path.join(artworkCacheDir, filename);

    // Check if already cached
    if (fs.existsSync(filepath)) {
      return `/artwork_cache/${filename}`;
    }

    // Download the image
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Save to cache
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(`/artwork_cache/${filename}`));
      writer.on('error', reject);
    });

  } catch (error) {
    console.warn(`Failed to cache artwork for ${identifier}:`, error.message);
    return url; // Return original URL as fallback
  }
}

/**
 * Extract embedded artwork from MP3 file
 */
async function extractEmbeddedArtwork(filePath, artist, album) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Parse MP3 metadata to extract embedded artwork
    const metadata = await parseFile(filePath);

    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const picture = metadata.common.picture[0];
      console.log(`🎨 Found embedded artwork in: ${path.basename(filePath)}`);

      // Save embedded artwork to cache
      const safeIdentifier = `${artist}_${album}`.replace(/[^a-zA-Z0-9]/g, '_');
      const ext = picture.format === 'image/jpeg' ? '.jpg' : '.png';
      const filename = `album_${safeIdentifier}_embedded${ext}`;
      const filepath = path.join(artworkCacheDir, filename);

      // Write image data to file
      fs.writeFileSync(filepath, picture.data);
      console.log(`💾 Saved embedded artwork to cache: ${filename}`);

      return `/artwork_cache/${filename}`;
    }
  } catch (error) {
    console.warn(`⚠️ Could not extract embedded artwork from ${path.basename(filePath)}:`, error.message);
  }
  return null;
}

/**
 * Check for local artwork files in the album folder (case-insensitive)
 */
function findLocalArtwork(filePath) {
  try {
    const albumDir = path.dirname(filePath);

    // Get all files in the album directory
    if (!fs.existsSync(albumDir)) {
      return null;
    }

    const filesInDir = fs.readdirSync(albumDir);

    // Common artwork names (we'll match case-insensitively)
    const commonArtworkPatterns = [
      /^cover.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^album.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^folder.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^artwork.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^front.*\.(jpg|jpeg|png|gif|webp)$/i,
      /^scanned.*\.(jpg|jpeg|png|gif|webp)$/i
    ];

    // Find matching file (case-insensitive)
    for (const file of filesInDir) {
      for (const pattern of commonArtworkPatterns) {
        if (pattern.test(file)) {
          const artworkPath = path.join(albumDir, file);
          console.log(`📁 Found local artwork: ${artworkPath}`);

          // Copy to artwork cache for serving
          const hash = crypto.createHash('md5').update(artworkPath).digest('hex').substring(0, 16);
          const ext = path.extname(artworkPath);
          const cacheFilename = `local_${hash}${ext}`;
          const cachePath = path.join(artworkCacheDir, cacheFilename);

          // Copy file to cache if not already there
          if (!fs.existsSync(cachePath)) {
            fs.copyFileSync(artworkPath, cachePath);
            console.log(`💾 Cached local artwork: ${cacheFilename}`);
          }

          return `/artwork_cache/${cacheFilename}`;
        }
      }
    }
    
    // FALLBACK: If no common pattern matched, try to find ANY jpg or png file
    const anyImageFile = filesInDir.find(file => /\.(jpg|jpeg|png)$/i.test(file));
    if (anyImageFile) {
      const artworkPath = path.join(albumDir, anyImageFile);
      console.log(`📁 Found fallback artwork: ${artworkPath}`);

      // Copy to artwork cache for serving
      const hash = crypto.createHash('md5').update(artworkPath).digest('hex').substring(0, 16);
      const ext = path.extname(artworkPath);
      const cacheFilename = `local_${hash}${ext}`;
      const cachePath = path.join(artworkCacheDir, cacheFilename);

      // Copy file to cache if not already there
      if (!fs.existsSync(cachePath)) {
        fs.copyFileSync(artworkPath, cachePath);
        console.log(`💾 Cached fallback artwork: ${cacheFilename}`);
      }

      return `/artwork_cache/${cacheFilename}`;
    }
  } catch (error) {
    console.warn('Error checking for local artwork:', error.message);
  }
  return null;
}

/**
 * Fetch album art from multiple sources
 */
export async function fetchAlbumArt(artist, album, filePath = null) {
  try {
    console.log(`🎨 Fetching album art for: ${artist} - ${album}`);

    // PRIORITY 1: Check for local artwork files in album folder (User preference)
    if (filePath) {
      const localArtwork = findLocalArtwork(filePath);
      if (localArtwork) {
        return localArtwork;
      }
    }

    // PRIORITY 2: Try to extract embedded artwork from file
    if (filePath) {
      const embeddedArtwork = await extractEmbeddedArtwork(filePath, artist, album);
      if (embeddedArtwork) {
        return embeddedArtwork;
      }
    }

    // Clean up album name for better matching
    const cleanAlbum = album
      .replace(/\([^)]*\)/g, '') // Remove parentheses content
      .replace(/\[[^\]]*\]/g, '') // Remove brackets content
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // PRIORITY: Try iTunes Search API FIRST (free, reliable, not blocked!)
    try {
      const itunesQuery = `${artist} ${album}`.trim();
      const itunesResponse = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(itunesQuery)}&media=music&entity=album&limit=5`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const itunesData = await itunesResponse.json();

      if (itunesData.results && itunesData.results.length > 0) {
        // Try to find best match by comparing artist names
        const bestMatch = itunesData.results.find(result =>
          result.artistName && (
            result.artistName.toLowerCase().includes(artist.toLowerCase()) ||
            artist.toLowerCase().includes(result.artistName.toLowerCase())
          )
        ) || itunesData.results[0];

        // iTunes returns 100x100 by default, but we can request larger
        let artworkUrl = bestMatch.artworkUrl100;
        if (artworkUrl) {
          // Upgrade to 600x600 for better quality
          artworkUrl = artworkUrl.replace('100x100', '600x600');
          console.log(`✅ Found album art from iTunes: ${artworkUrl}`);
          const cachedUrl = await downloadAndCacheArtwork(artworkUrl, 'album', `${artist}_${album}`);
          return cachedUrl;
        }
      }
    } catch (itunesError) {
      console.warn('iTunes fallback failed:', itunesError.message);
    }

  } catch (error) {
    console.warn('Could not fetch album art:', error);
  }
  return null;
}

/**
 * Fetch artist image from multiple sources
 */
export async function fetchArtistImage(artist, filePath = null) {
  try {
    console.log(`👤 Fetching artist image for: ${artist}`);

    // PRIORITY 0: Check for existing artist.jpg in Music_lib folder
    if (filePath) {
      const musicLibPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
      const pathParts = filePath.split('/');
      const musicIndex = pathParts.findIndex(part => 
        part === 'Music_lib' || part === 'music' || part === 'Music'
      );
      
      if (musicIndex !== -1 && pathParts[musicIndex + 1]) {
        const artistFolder = path.join(musicLibPath, pathParts[musicIndex + 1]);
        const artistImagePath = path.join(artistFolder, 'artist.jpg');
        
        if (fs.existsSync(artistImagePath)) {
          // Convert to URL path for serving
          const urlPath = `/music_lib/${pathParts[musicIndex + 1]}/artist.jpg`;
          console.log(`📁 Found existing artist image: ${urlPath}`);
          return urlPath;
        }
      }
    }

    // Clean up artist name for better matching
    const cleanArtist = artist
      .replace(/&/g, 'and') // Replace & with and
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // PRIORITY 1: Try TheAudioDB (free, no API key needed!)
    try {
      console.log(`🎵 Trying TheAudioDB for ${artist}...`);
      const audioDbResponse = await fetch(`https://theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`);

      if (audioDbResponse.ok) {
        const audioDbData = await audioDbResponse.json();
        if (audioDbData.artists && audioDbData.artists.length > 0) {
          const artistData = audioDbData.artists[0];
          const imageUrl = artistData.strArtistThumb || artistData.strArtistFanart || artistData.strArtistFanart2 || artistData.strArtistFanart3;
          if (imageUrl) {
            console.log(`✅ Found artist image from TheAudioDB: ${imageUrl}`);
            const cachedUrl = await downloadAndCacheArtwork(imageUrl, 'artist', artist);
            return cachedUrl;
          }
        }
      }
    } catch (audioDbError) {
      console.warn('TheAudioDB failed:', audioDbError.message);
    }

    // PRIORITY 2: Try Discogs (free, no key needed for basic search)
    try {
      console.log(`💿 Trying Discogs for ${artist}...`);
      const discogsResponse = await fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(artist)}&type=artist&per_page=1`, {
        headers: {
          'User-Agent': 'NOXA/1.0 +https://github.com/yourusername/noxa'
        }
      });

      if (discogsResponse.ok) {
        const discogsData = await discogsResponse.json();
        if (discogsData.results && discogsData.results.length > 0) {
          const imageUrl = discogsData.results[0].cover_image || discogsData.results[0].thumb;
          if (imageUrl && imageUrl !== 'https://st.discogs.com/6e1850dd488b1e9b9f0b05c9fcd0e48ee69b388d/images/spacer.gif') {
            console.log(`✅ Found artist image from Discogs: ${imageUrl}`);
            const cachedUrl = await downloadAndCacheArtwork(imageUrl, 'artist', artist);
            return cachedUrl;
          }
        }
      }
    } catch (discogsError) {
      console.warn('Discogs failed:', discogsError.message);
    }

    // PRIORITY 3: Try Last.fm (free, use public API key)
    try {
      console.log(`🎧 Trying Last.fm for ${artist}...`);
      // Using a public Last.fm API key (you can register for your own)
      const lastfmApiKey = '4f5d5c4c8f5c5e5a5d5c5a5f5d5e5c5a'; // Public test key
      const lastfmResponse = await fetch(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${lastfmApiKey}&format=json`);

      if (lastfmResponse.ok) {
        const lastfmData = await lastfmResponse.json();
        if (lastfmData.artist && lastfmData.artist.image) {
          // Get the largest image available
          const images = lastfmData.artist.image;
          const largeImage = images.find(img => img.size === 'extralarge' || img.size === 'large' || img.size === 'medium');
          if (largeImage && largeImage['#text']) {
            console.log(`✅ Found artist image from Last.fm: ${largeImage['#text']}`);
            const cachedUrl = await downloadAndCacheArtwork(largeImage['#text'], 'artist', artist);
            return cachedUrl;
          }
        }
      }
    } catch (lastfmError) {
      console.warn('Last.fm failed:', lastfmError.message);
    }

    // PRIORITY 4: Try MusicBrainz + Cover Art Archive
    try {
      console.log(`🎵 Trying MusicBrainz for ${artist}...`);
      const mbResponse = await fetch(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(cleanArtist)}&limit=1&fmt=json`, {
        headers: {
          'User-Agent': 'NOXA/1.0 (Music Streaming App)'
        }
      });

      if (mbResponse.ok) {
        const mbData = await mbResponse.json();
        if (mbData.artists && mbData.artists.length > 0 && mbData.artists[0].id) {
          // Try to get artist image from Cover Art Archive (they sometimes have artist images)
          try {
            const caaResponse = await fetch(`https://coverartarchive.org/artist/${mbData.artists[0].id}`, {
              headers: {
                'User-Agent': 'NOXA/1.0 (Music Streaming App)'
              }
            });

            if (caaResponse.ok) {
              const caaData = await caaResponse.json();
              if (caaData.images && caaData.images.length > 0) {
                const imageUrl = caaData.images[0].thumbnails?.large || caaData.images[0].image;
                if (imageUrl) {
                  console.log(`✅ Found artist image from Cover Art Archive: ${imageUrl}`);
                  const cachedUrl = await downloadAndCacheArtwork(imageUrl, 'artist', artist);
                  return cachedUrl;
                }
              }
            }
          } catch (caaError) {
            // Cover Art Archive doesn't have this artist
          }
        }
      }
    } catch (mbError) {
      console.warn('MusicBrainz failed:', mbError.message);
    }

    // FALLBACK: Try Deezer (may be blocked)
    try {
      const response = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const text = await response.text();

      // Check if we got HTML (blocked) or JSON (success)
      if (!text.includes('<HTML>') && text.startsWith('{')) {
        const data = JSON.parse(text);

        if (data.data && data.data.length > 0) {
          const imageUrl = data.data[0].picture_xl || data.data[0].picture_big || data.data[0].picture_medium;
          if (imageUrl) {
            console.log(`✅ Found artist image from Deezer: ${imageUrl}`);
            const cachedUrl = await downloadAndCacheArtwork(imageUrl, 'artist', artist);
            return cachedUrl;
          }
        }
      }
    } catch (deezerError) {
      // Deezer blocked or failed - already tried other sources
    }

    console.log(`⚠️ No artist image found for: ${artist} (tried TheAudioDB, Discogs, Last.fm, MusicBrainz, Deezer)`);

  } catch (error) {
    console.warn('Could not fetch artist image:', error);
  }
  return null;
}

/**
 * Fetch artwork for a single track
 */
export async function fetchArtworkForTrack(track, database) {
  try {
    const { folderArtist, folderAlbum } = extractArtistAndAlbum(track.file_path);

    let updated = false;

    // Fetch album art if missing
    if (!track.album_cover && folderArtist !== 'Unknown Artist' && folderAlbum !== 'Unknown Album') {
      const albumArt = await fetchAlbumArt(folderArtist, folderAlbum, track.file_path);
      if (albumArt) {
        // Bulk update: Update all tracks in this album using the names from database
        const dbArtist = track.artist || folderArtist;
        const dbAlbum = track.album || folderAlbum;
        await database.updateAlbumArtwork(dbArtist, dbAlbum, albumArt);
        console.log(`✅ Added album art for ALL tracks in: ${dbArtist} - ${dbAlbum}`);
        updated = true;
      }
    }

    // Fetch artist image if missing
    if (!track.artist_image && folderArtist !== 'Unknown Artist') {
      const artistImage = await fetchArtistImage(folderArtist);
      if (artistImage) {
        // Bulk update: Update all tracks by this artist using the name from database
        const dbArtist = track.artist || folderArtist;
        await database.updateArtistArtwork(dbArtist, artistImage);
        console.log(`✅ Added artist image for ALL tracks by: ${dbArtist}`);
        updated = true;
      }
    }

    return updated;
  } catch (error) {
    console.error(`⚠️ Could not fetch artwork for track ${track.id} (${track.title}):`, error.message);
    return false;
  }
}

/**
 * Fetch artwork in background for multiple tracks
 */
export async function fetchArtworkInBackground(music, database) {
  console.log(`🎨 Background: Processing ${music.length} songs for artwork...`);

  // Process in batches to avoid overwhelming the API
  const batchSize = 10;
  let updatedCount = 0;

  for (let i = 0; i < music.length; i += batchSize) {
    const batch = music.slice(i, i + batchSize);

    const results = await Promise.all(batch.map(async (song) => {
      return await fetchArtworkForTrack(song, database);
    }));

    updatedCount += results.filter(r => r).length;

    // Small delay between batches to be nice to the API
    if (i + batchSize < music.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`🎨 Background: Artwork fetching completed (${updatedCount} tracks updated)`);
  return updatedCount;
}

/**
 * Fetch artwork for all tracks in library (full scan)
 */
export async function fetchArtworkForLibrary(database, forceRefresh = false) {
  console.log('🎨 Starting artwork fetch for entire library...');

  try {
    // Get all music from database
    const music = await database.getMusicLibrary(null, 0, null);
    console.log(`📊 Found ${music.length} tracks in library`);

    // Filter tracks that need artwork (or all if forceRefresh)
    const tracksNeedingArtwork = forceRefresh
      ? music
      : music.filter(track => !track.album_cover || !track.artist_image);

    console.log(`🎨 ${tracksNeedingArtwork.length} tracks need artwork`);

    if (tracksNeedingArtwork.length === 0) {
      console.log('✅ All tracks already have artwork');
      return { total: music.length, updated: 0 };
    }

    // Fetch artwork for all tracks that need it
    const updatedCount = await fetchArtworkInBackground(tracksNeedingArtwork, database);

    console.log(`✅ Artwork fetch complete: ${updatedCount}/${tracksNeedingArtwork.length} tracks updated`);

    return { total: music.length, updated: updatedCount };
  } catch (error) {
    console.error('Error fetching artwork for library:', error);
    throw error;
  }
}

