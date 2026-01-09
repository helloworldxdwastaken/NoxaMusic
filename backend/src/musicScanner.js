import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseFile } from 'music-metadata';
import { fileURLToPath } from 'url';
import * as artworkService from './services/artworkService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MusicScanner {
  constructor(database) {
    this.db = database;
    this.supportedFormats = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];
    this.scanPaths = [];
  }

  // Set music directories to scan
  setScanPaths(paths) {
    this.scanPaths = Array.isArray(paths) ? paths : [paths];
  }

  // Extract artist and album from folder path (authoritative source)
  extractArtistAlbumFromPath(filePath) {
    const pathParts = filePath.split('/');
    
    // Check if this is from downloads/organized
    const organizedIndex = pathParts.indexOf('organized');
    if (organizedIndex !== -1 && pathParts[organizedIndex + 1]) {
      const folderArtist = pathParts[organizedIndex + 1];
      const folderAlbum = pathParts[pathParts.length - 2];
      return { artist: folderArtist, album: folderAlbum };
    }

    // Check if this is from main music library (Music_lib, music, etc.)
    const musicIndex = pathParts.findIndex(part =>
      part === 'Music_lib' ||
      part === 'music' ||
      part === 'Music' ||
      part === 'MusicLibrary'
    );

    if (musicIndex !== -1 && pathParts[musicIndex + 1]) {
      const folderArtist = pathParts[musicIndex + 1];
      const folderAlbum = pathParts[pathParts.length - 2];
      return { artist: folderArtist, album: folderAlbum };
    }

    // Fallback: unable to extract from path
    return { artist: null, album: null };
  }

  // Determine if a song should be replaced based on metadata quality
  shouldReplaceSong(existingSong, newSong) {
    // Prefer songs in the main music directory over downloads
    const existingPath = existingSong.file_path || existingSong.filePath || '';
    const newPath = newSong.file_path || newSong.filePath || '';

    const existingInMain = existingPath.includes('/music/') && !existingPath.includes('/downloads/');
    const newInMain = newPath.includes('/music/') && !newPath.includes('/downloads/');

    const existingInYTImport = existingPath.includes('YouTube Music Import');
    const newInYTImport = newPath.includes('YouTube Music Import');

    // Prefer NON-YouTube Music Import paths
    if (existingInYTImport && !newInYTImport) {
      console.log(`🔄 Replacing YouTube Music Import version with regular file: ${newPath}`);
      return true;
    }

    if (!existingInYTImport && newInYTImport) {
      console.log(`空 Keeping regular file over YouTube Music Import version: ${existingPath}`);
      return false;
    }

    if (newInMain && !existingInMain) {
      return true; // New song is in main directory, existing is in downloads
    }

    if (existingInMain && !newInMain) {
      return false; // Existing song is in main directory, new is in downloads
    }

    // If both are in same type of directory, prefer higher quality formats and larger file sizes
    const existingExt = path.extname(existingPath).toLowerCase();
    const newExt = path.extname(newPath).toLowerCase();

    // Quality preference: flac > m4a > mp3 > other
    const qualityOrder = { '.flac': 4, '.m4a': 3, '.mp3': 2, '.aac': 2, '.ogg': 1, '.wav': 1 };
    const existingQuality = qualityOrder[existingExt] || 0;
    const newQuality = qualityOrder[newExt] || 0;

    // Get file sizes for quality comparison
    const existingSize = existingSong.fileSize || 0;
    const newSize = newSong.fileSize || 0;

    // Prefer higher quality format first
    if (newQuality > existingQuality) {
      console.log(`🔄 Replacing ${existingExt} (${(existingSize / 1024 / 1024).toFixed(1)}MB) with higher quality ${newExt} (${(newSize / 1024 / 1024).toFixed(1)}MB)`);
      return true;
    }

    if (existingQuality > newQuality) {
      console.log(`⏭️ Keeping higher quality ${existingExt} (${(existingSize / 1024 / 1024).toFixed(1)}MB) over ${newExt} (${(newSize / 1024 / 1024).toFixed(1)}MB)`);
      return false;
    }

    // If same format quality, prefer larger file size (better bitrate/quality)
    if (newSize > existingSize && newSize > 0) {
      console.log(`🔄 Replacing ${existingExt} (${(existingSize / 1024 / 1024).toFixed(1)}MB) with larger ${newExt} (${(newSize / 1024 / 1024).toFixed(1)}MB)`);
      return true;
    }

    if (existingSize > newSize && existingSize > 0) {
      console.log(`⏭️ Keeping larger ${existingExt} (${(existingSize / 1024 / 1024).toFixed(1)}MB) over ${newExt} (${(newSize / 1024 / 1024).toFixed(1)}MB)`);
      return false;
    }

    // If same quality, prefer the one with more complete metadata
    const existingCompleteness = this.getMetadataCompleteness(existingSong);
    const newCompleteness = this.getMetadataCompleteness(newSong);

    if (newCompleteness > existingCompleteness) {
      console.log(`🔄 Replacing with better metadata (${newCompleteness} vs ${existingCompleteness})`);
      return true;
    }

    console.log(`⏭️ Keeping existing song (same quality, metadata: ${existingCompleteness})`);
    return false;
  }

  // Calculate metadata completeness score
  getMetadataCompleteness(song) {
    let score = 0;
    if (song.title && song.title !== 'Unknown Title') score += 1;
    if (song.artist && song.artist !== 'Unknown Artist') score += 1;
    if (song.album && song.album !== 'Unknown Album') score += 1;
    if (song.year) score += 1;
    if (song.genre) score += 1;
    if (song.duration && song.duration > 0) score += 1;
    if (song.bitrate && song.bitrate > 0) score += 1;
    return score;
  }

  // Scan all configured directories
  async scanAllDirectories(userId = null) {
    console.log(`🎵 Starting comprehensive music library scan... (User: ${userId || 'system'})`);
    let totalScanned = 0;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalRemoved = 0;

    // First, get all current files in database
    const existingFiles = await this.db.getAllMusicFiles();
    const existingPaths = new Set(existingFiles.map(f => f.file_path));

    // Track all files found during scan
    const foundFiles = new Set();

    // Track which scan paths were accessible
    let allPathsAccessible = true;

    for (const scanPath of this.scanPaths) {
      if (!fs.existsSync(scanPath)) {
        console.warn(`⚠️ Path does not exist: ${scanPath}`);
        console.warn(`⚠️ SKIPPING cleanup - scan path unavailable (drive may be unmounted)`);
        allPathsAccessible = false;
        continue;
      }

      console.log(`📁 Scanning: ${scanPath}`);
      const result = await this.scanDirectory(scanPath, foundFiles, userId);
      totalScanned += result.scanned;
      totalAdded += result.added;
      totalUpdated += result.updated;
    }

    // REFRESH DB State: This is CRITICAL. 
    // We re-fetch files because many paths may have been updated/relinked during the scan.
    const currentDbFiles = await this.db.getAllMusicFiles();

    // Only remove orphaned files if ALL scan paths were accessible AND if specifically requested
    // This prevents data loss when external drives are temporarily unmounted
    const forceCleanup = process.env.FORCE_CLEANUP === 'true';

    if (!allPathsAccessible) {
      console.warn(`⚠️ SKIPPED orphan cleanup - not all scan paths were accessible`);
      console.warn(`⚠️ Database preserved to prevent data loss from unmounted drives`);
    } else if (!forceCleanup) {
      // Find files that were deleted/moved (exist in DB but not in filesystem)
      const orphanedFiles = currentDbFiles.filter(f => !foundFiles.has(f.file_path));
      if (orphanedFiles.length > 0) {
        console.log(`ℹ️ Found ${orphanedFiles.length} files that are currently unavailable/missing.`);
        console.log(`ℹ️ Safety Lock: Automatic cleanup is DISABLED. These songs will stay in your library.`);
        console.log(`ℹ️ To permanently remove missing files, run manual cleanup from the Admin Panel.`);
      }
    } else {
      // Find files that were deleted/moved (exist in DB but not in filesystem)
      const orphanedFiles = currentDbFiles.filter(f => !foundFiles.has(f.file_path));

      if (orphanedFiles.length > 0) {
        console.log(`🗑️ Found ${orphanedFiles.length} orphaned files (deleted/moved)`);
        for (const orphaned of orphanedFiles) {
          console.log(`   Removing: ${orphaned.file_path}`);
          await this.db.deleteMusicById(orphaned.id);
          totalRemoved++;
        }
      }
    }

    // Handle potential folder renames/moves (using refreshed state)
    const folderRenameResult = await this.handleFolderRenames(currentDbFiles, foundFiles);
    totalUpdated += folderRenameResult.updated;

    console.log(`✅ Scan complete: ${totalScanned} files scanned, ${totalAdded} new files added, ${totalUpdated} files updated, ${totalRemoved} files removed`);
    return { scanned: totalScanned, added: totalAdded, updated: totalUpdated, removed: totalRemoved };
  }

  // Handle folder renames and moves
  async handleFolderRenames(existingFiles, foundFiles) {
    let updated = 0;

    // Group existing files by folder structure
    const existingByFolder = {};
    existingFiles.forEach(file => {
      const folderPath = path.dirname(file.file_path);
      if (!existingByFolder[folderPath]) existingByFolder[folderPath] = [];
      existingByFolder[folderPath].push(file);
    });

    // Group found files by folder structure
    const foundByFolder = {};
    foundFiles.forEach(filePath => {
      const folderPath = path.dirname(filePath);
      if (!foundByFolder[folderPath]) foundByFolder[folderPath] = [];
      foundByFolder[folderPath].push(filePath);
    });

    // Check for potential folder renames
    for (const [oldFolder, oldFiles] of Object.entries(existingByFolder)) {
      if (foundByFolder[oldFolder]) continue; // Folder still exists

      // Look for a folder with similar files
      for (const [newFolder, newFiles] of Object.entries(foundByFolder)) {
        if (oldFolder === newFolder) continue;

        // Check if this looks like a folder rename (same number of files, similar names)
        if (oldFiles.length === newFiles.length && this.isLikelyFolderRename(oldFiles, newFiles)) {
          console.log(`📁 Detected folder rename: ${oldFolder} → ${newFolder}`);

          // Update all files in the old folder to point to the new folder
          for (let i = 0; i < oldFiles.length; i++) {
            const oldFile = oldFiles[i];
            const newFile = newFiles[i];

            // Update the file path in database
            try {
              await this.db.updateMusicFilePath(oldFile.id, newFile);
              console.log(`   Updated: ${path.basename(oldFile.file_path)} → ${path.basename(newFile)}`);
              updated++;
            } catch (err) {
              if (err.message.includes('UNIQUE constraint failed')) {
                console.warn(`   ⚠️ Skip: Path already exists in DB: ${newFile}`);
              } else {
                console.error(`   ❌ Failed to update path: ${err.message}`);
              }
            }
          }

          // Remove the old folder from found files since we've handled it
          delete foundByFolder[newFolder];
          break;
        }
      }
    }

    return { updated };
  }

  // Check if two sets of files are likely from a renamed folder
  isLikelyFolderRename(oldFiles, newFiles) {
    if (oldFiles.length !== newFiles.length) return false;

    // Sort both arrays by filename for comparison
    const oldNames = oldFiles.map(f => path.basename(f.file_path)).sort();
    const newNames = newFiles.map(f => path.basename(f)).sort();

    // Check if most filenames match (allowing for some differences)
    let matches = 0;
    for (let i = 0; i < oldNames.length; i++) {
      if (oldNames[i] === newNames[i]) matches++;
    }

    // Consider it a rename if at least 80% of filenames match
    return matches >= oldNames.length * 0.8;
  }

  // Scan a single directory recursively
  async scanDirectory(dirPath, foundFiles = new Set(), userId = null) {
    let scanned = 0;
    let added = 0;
    let updated = 0;

    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        // Ignore hidden files and macOS metadata files (e.g. .DS_Store, ._Filename)
        if (item.startsWith('.')) continue;

        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Recursively scan subdirectories
          const result = await this.scanDirectory(fullPath, foundFiles, userId);
          scanned += result.scanned;
          added += result.added;
          updated += result.updated;
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (this.supportedFormats.includes(ext)) {
            scanned++;
            foundFiles.add(fullPath); // Track this file as found

            const result = await this.scanMusicFile(fullPath, userId);
            if (result.added) added++;
            if (result.updated) updated++;
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error.message);
    }

    return { scanned, added, updated };
  }

  // Scan a single music file
  async scanMusicFile(filePath, userId = null) {
    try {
      // Parse metadata first
      const metadata = await parseFile(filePath);
      const stat = fs.statSync(filePath);

      // Check if file already exists in database
      const existing = await this.db.getMusicByPath(filePath);
      if (existing) {
        let needsUpdate = false;
        const updates = {};

        // Only update if file size changed (file was actually modified)
        if (stat.size !== existing.file_size) {
          needsUpdate = true;
        }

        // OPTIMIZATION: If missing artwork, try to find it now!
        if (!existing.album_cover) {
          try {
            const albumDir = path.dirname(filePath);
            const filesInDir = fs.readdirSync(albumDir);
            const artworkFile = filesInDir.find(f =>
              /^(cover|folder|album|artwork|front)\.(jpg|jpeg|png|webp|gif)$/i.test(f)
            );

            if (artworkFile) {
              const artworkPath = path.join(albumDir, artworkFile);
              // Store the full file system path
              updates.album_cover = artworkPath;
              needsUpdate = true;
            }
          } catch (e) {
            // Suppress errors for artwork detection during optimization, it's not critical
          }
        }

        if (needsUpdate) {
          console.log(`🔄 Updating existing file (fixing metadata/artwork): ${filePath}`);
          
          // Extract artist and album from FOLDER PATH (authoritative)
          const folderData = this.extractArtistAlbumFromPath(filePath);
          
          const finalMetadata = {
            title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
            // Use folder name for artist/album (authoritative), fallback to existing data
            artist: folderData.artist || existing.artist || metadata.common.artist || 'Unknown Artist',
            album: folderData.album || existing.album || metadata.common.album || 'Unknown Album',
            year: metadata.common.year || null,
            genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
            duration: Math.round(metadata.format.duration || 0),
            fileSize: stat.size,
            bitrate: metadata.format.bitrate || null,
            ...updates
          };
          await this.db.updateMusicFile(existing.id, filePath, finalMetadata);
          return { added: false, updated: true };
        }
        return { added: false, updated: false }; // No changes needed
      }

      // Extract artist and album from FOLDER PATH (authoritative)
      const folderData = this.extractArtistAlbumFromPath(filePath);
      
      // Extract relevant information first (needed for duplicate checking)
      // Use folder name for artist/album, fallback to ID3 metadata if folder extraction fails
      const musicData = {
        title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
        artist: folderData.artist || metadata.common.artist || 'Unknown Artist',
        album: folderData.album || metadata.common.album || 'Unknown Album',
        year: metadata.common.year || null,
        genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
        duration: Math.round(metadata.format.duration || 0),
        fileSize: stat.size,
        bitrate: metadata.format.bitrate || null
      };

      // Metadata-based relinking for moved files or better quality replacements
      const manualMode = process.env.MANUAL_MODE === 'true';
      const allowDuplicates = process.env.ALLOW_DUPLICATES === 'true';
      const autoRelink = process.env.AUTO_RELINK === 'true';

      if (metadata.common.title && metadata.common.artist) {
        const potentialMatch = await this.db.findMusicByArtistAndTitle(metadata.common.artist, metadata.common.title);

        if (potentialMatch) {
          // Check if the original file path still exists
          const originalExists = fs.existsSync(potentialMatch.file_path);

          if (!originalExists && !manualMode && autoRelink) {
            // OLD BEHAVIOR: Auto-relink (only if manual mode disabled)
            console.log(`🔗 Missing file found at new path! Relinking...`);
            console.log(`   Old: ${potentialMatch.file_path}`);
            console.log(`   New: ${filePath}`);
            await this.updateMusicFile(potentialMatch.id, filePath, metadata, stat);
            return { added: false, updated: true };
          } else if (!originalExists && manualMode) {
            // NEW BEHAVIOR: Suggest relink, don't auto-relink
            console.log(`🔗 Relink suggestion: ${potentialMatch.original_title || potentialMatch.title} by ${potentialMatch.original_artist || potentialMatch.artist}`);
            console.log(`   Original: ${potentialMatch.original_file_path || potentialMatch.file_path}`);
            console.log(`   Found at: ${filePath}`);
            console.log(`   ID: ${potentialMatch.stable_id || potentialMatch.id}`);
            
            // Store suggestion for Manual Action Center
            try {
              await this.db.addRelinkSuggestion(
                potentialMatch.stable_id || `song_${potentialMatch.id}`,
                filePath,
                {
                  original_artist: potentialMatch.original_artist || potentialMatch.artist,
                  original_title: potentialMatch.original_title || potentialMatch.title,
                  original_album: potentialMatch.original_album || potentialMatch.album,
                  original_path: potentialMatch.original_file_path || potentialMatch.file_path
                },
                'high'
              );
            } catch (e) {
              console.warn('Could not store relink suggestion:', e.message);
            }
            
            // Mark old song as unavailable
            if (potentialMatch.stable_id) {
              try {
                await this.db.markAsUnavailable(potentialMatch.stable_id);
              } catch (e) {
                console.warn('Could not mark as unavailable:', e.message);
              }
            }
            
            // Continue to add as new entry (duplicate)
          } else if (originalExists && !manualMode && this.shouldReplaceSong(potentialMatch, { ...metadata.common, file_path: filePath, fileSize: stat.size })) {
            // OLD BEHAVIOR: Auto-replace with better quality
            console.log(`🔄 Better version found at new path! Replacing duplicate...`);
            console.log(`   Old: ${potentialMatch.file_path}`);
            console.log(`   New: ${filePath}`);
            await this.updateMusicFile(potentialMatch.id, filePath, metadata, stat);
            return { added: false, updated: true };
          } else if (originalExists && manualMode && allowDuplicates && potentialMatch.file_path !== filePath) {
            // NEW BEHAVIOR: Keep both as duplicates
            console.log(`🔄 Duplicate found:`);
            console.log(`   Existing: ${potentialMatch.original_title || potentialMatch.title} (ID: ${potentialMatch.stable_id || potentialMatch.id})`);
            console.log(`   New file: ${filePath}`);
            console.log(`   Adding as separate entry for manual review`);
            
            // Mark as potential duplicate (will be added below with this flag)
            musicData.is_potential_duplicate = true;
            musicData.duplicate_of_stable_id = potentialMatch.stable_id;
          } else if (potentialMatch.file_path !== filePath && !allowDuplicates) {
            // Skip adding duplicate if not allowed
            console.log(`⏭️ Skipping duplicate: ${filePath}`);
            return { added: false, updated: false };
          }
        }
      }

      // Try to find local artwork immediately for new files
      let foundLocalArtwork = false;
      try {
        const albumDir = path.dirname(filePath);
        const filesInDir = fs.readdirSync(albumDir);
        const artworkFile = filesInDir.find(f =>
          /^(cover|folder|album|artwork|front)\.(jpg|jpeg|png|webp|gif)$/i.test(f)
        );

        if (artworkFile) {
          const artworkPath = path.join(albumDir, artworkFile);
          // Store the full file system path in database
          musicData.album_cover = artworkPath;
          foundLocalArtwork = true;
        }
      } catch (e) {
        console.warn('Local artwork detection failed:', e.message);
      }

      // Fallback: Fetch from external APIs if no local artwork
      if (!foundLocalArtwork && musicData.artist && musicData.album) {
        try {
          console.log(`🌐 Fetching artwork from APIs for: ${musicData.artist} - ${musicData.album}`);
          const albumArt = await artworkService.fetchAlbumArt(musicData.artist, musicData.album, filePath);
          
          if (albumArt) {
            // Download and cache artwork (saves to artwork_cache folder with proper permissions)
            const cachedPath = await artworkService.downloadAndCacheArtwork(albumArt, 'album', `${musicData.artist}_${musicData.album}`);
            musicData.album_cover = cachedPath || albumArt;
          }
        } catch (apiError) {
          console.warn('API album artwork fetch failed:', apiError.message);
        }
      }

      // Check for local artist image first
      if (musicData.artist && !musicData.artist_image) {
        try {
          const albumDir = path.dirname(filePath);
          const artistDir = path.dirname(albumDir);
          const artistImagePath = path.join(artistDir, 'artist.jpg');
          
          // Check if artist.jpg exists
          if (fs.existsSync(artistImagePath)) {
            // Store the full file system path
            musicData.artist_image = artistImagePath;
          }
        } catch (e) {
          console.warn('Local artist image check failed:', e.message);
        }
      }

      // Fetch artist image from APIs if still not exists
      if (musicData.artist && !musicData.artist_image) {
        try {
          const artistImage = await artworkService.fetchArtistImage(musicData.artist);
          
          if (artistImage) {
            // Download and cache artwork (saves to artwork_cache folder with proper permissions)
            const cachedPath = await artworkService.downloadAndCacheArtwork(artistImage, 'artist', musicData.artist);
            musicData.artist_image = cachedPath || artistImage;
          }
        } catch (apiError) {
          console.warn('API artist image fetch failed:', apiError.message);
        }
      }

      // Add to database with user ownership
      // Pass both folder-based metadata AND original ID3 metadata
      const metadataWithOriginal = {
        ...musicData,
        // Preserve ID3 metadata as original
        original_artist: metadata.common.artist || musicData.artist,
        original_title: metadata.common.title || musicData.title,
        original_album: metadata.common.album || musicData.album
      };
      
      await this.db.addMusicToLibrary(filePath, metadataWithOriginal, userId);
      console.log(`➕ Added: ${musicData.artist} - ${musicData.title} (User: ${userId || 'global'})`);

      return { added: true, updated: false };
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error.message);
      return { added: false, updated: false };
    }
  }

  // Update an existing music file
  async updateMusicFile(id, filePath, metadata, stat) {
    // Extract artist and album from FOLDER PATH (authoritative)
    const folderData = this.extractArtistAlbumFromPath(filePath);
    
    const musicData = {
      title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
      artist: folderData.artist || metadata.common.artist || 'Unknown Artist',
      album: folderData.album || metadata.common.album || 'Unknown Album',
      year: metadata.common.year || null,
      genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
      duration: Math.round(metadata.format.duration || 0),
      fileSize: stat.size,
      bitrate: metadata.format.bitrate || null
    };

    // Try to find local artwork during update
    let foundLocalArtwork = false;
    try {
      const albumDir = path.dirname(filePath);
      const filesInDir = fs.readdirSync(albumDir);
      const artworkFile = filesInDir.find(f =>
        /^(cover|folder|album|artwork|front)\.(jpg|jpeg|png|webp|gif)$/i.test(f)
      );

      if (artworkFile) {
        const artworkPath = path.join(albumDir, artworkFile);
        // Store the full file system path
        musicData.album_cover = artworkPath;
        foundLocalArtwork = true;
      }
    } catch (e) {
      console.warn('Local artwork detection failed during update:', e.message);
    }

    // Fallback: Fetch from APIs if no local artwork
    if (!foundLocalArtwork && musicData.artist && musicData.album) {
      try {
        console.log(`🌐 Fetching artwork from APIs for: ${musicData.artist} - ${musicData.album}`);
        const albumArt = await artworkService.fetchAlbumArt(musicData.artist, musicData.album, filePath);
        
        if (albumArt) {
          // Download and cache artwork (saves to artwork_cache folder with proper permissions)
          const cachedPath = await artworkService.downloadAndCacheArtwork(albumArt, 'album', `${musicData.artist}_${musicData.album}`);
          musicData.album_cover = cachedPath || albumArt;
        }
      } catch (apiError) {
        console.warn('API album artwork fetch failed:', apiError.message);
      }
    }

    // Check for local artist image
    if (musicData.artist && !musicData.artist_image) {
      try {
        const albumDir = path.dirname(filePath);
        const artistDir = path.dirname(albumDir);
        const artistImagePath = path.join(artistDir, 'artist.jpg');
        
        if (fs.existsSync(artistImagePath)) {
          musicData.artist_image = artistImagePath;
        }
      } catch (e) {
        console.warn('Local artist image check failed:', e.message);
      }
    }

    // Fetch artist image from APIs if still not exists
    if (musicData.artist && !musicData.artist_image) {
      try {
        const artistImage = await artworkService.fetchArtistImage(musicData.artist);
        
        if (artistImage) {
          // Download and cache artwork (saves to artwork_cache folder with proper permissions)
          const cachedPath = await artworkService.downloadAndCacheArtwork(artistImage, 'artist', musicData.artist);
          musicData.artist_image = cachedPath || artistImage;
        }
      } catch (apiError) {
        console.warn('API artist image fetch failed:', apiError.message);
      }
    }

    await this.db.updateMusicFile(id, filePath, musicData);
    console.log(`🔄 Updated: ${musicData.artist} - ${musicData.title}`);
  }

  // Get music by file path
  async getMusicByPath(filePath) {
    return new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT * FROM music_library WHERE file_path = ?',
        [filePath],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Search music in library
  async searchLibrary(query, type = 'all', limit = 50) {
    try {
      const results = await this.db.searchMusic(query, type, limit);
      return results;
    } catch (error) {
      console.error('Search error:', error);
      return { songs: [], artists: [], albums: [] };
    }
  }

  // Get recently added music
  async getRecentMusic(limit = 20) {
    try {
      return await this.db.getMusicLibrary(limit, 0);
    } catch (error) {
      console.error('Error getting recent music:', error);
      return [];
    }
  }

  // Get music by artist
  async getMusicByArtist(artist, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        'SELECT * FROM music_library WHERE artist LIKE ? ORDER BY album, title LIMIT ?',
        [`%${artist}%`, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get music by album
  async getMusicByAlbum(album, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        'SELECT * FROM music_library WHERE album LIKE ? ORDER BY title LIMIT ?',
        [`%${album}%`, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get all artists
  async getAllArtists() {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        'SELECT DISTINCT artist, COUNT(*) as track_count FROM music_library GROUP BY artist ORDER BY artist',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Get all albums
  async getAllAlbums() {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        'SELECT DISTINCT album, artist, COUNT(*) as track_count FROM music_library GROUP BY album, artist ORDER BY album',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Update play count
  async updatePlayCount(musicId) {
    return new Promise((resolve, reject) => {
      this.db.db.run(
        'UPDATE music_library SET play_count = play_count + 1, last_played = CURRENT_TIMESTAMP WHERE id = ?',
        [musicId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Get file stream for playing
  getFileStream(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    return fs.createReadStream(filePath);
  }

  // Get file info
  getFileInfo(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    const stat = fs.statSync(filePath);
    return {
      size: stat.size,
      modified: stat.mtime,
      exists: true
    };
  }
}

export default MusicScanner;
