import Database from '../src/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from 'music-metadata';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseUpdater {
    constructor(database) {
        this.db = database;
        this.supportedFormats = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];
        this.stats = {
            filesScanned: 0,
            pathsUpdated: 0,
            newFilesAdded: 0,
            albumCoversUpdated: 0,
            artistImagesUpdated: 0,
            artworkDownloaded: 0
        };
        this.orphanedEntries = new Map(); // Store orphaned DB entries
    }

    // Find local artwork in album folder
    findLocalArtwork(albumDir) {
        try {
            const files = fs.readdirSync(albumDir);
            const artworkFile = files.find(f =>
                /^(cover|folder|album|artwork|front)\.(jpg|jpeg|png|webp|gif)$/i.test(f)
            );
            if (artworkFile) {
                const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', path.join(albumDir, artworkFile));
                return `/music_lib/${relativePath}`;
            }
        } catch (e) {
            // Ignore errors
        }
        return null;
    }

    // Find local artist image by walking up directories
    findLocalArtistImage(filePath) {
        try {
            let currentDir = path.dirname(filePath);
            const musicLibPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';

            while (currentDir.startsWith(musicLibPath) && currentDir !== musicLibPath) {
                const artistImagePath = path.join(currentDir, 'artist.jpg');
                if (fs.existsSync(artistImagePath)) {
                    const relativePath = path.relative(musicLibPath, artistImagePath);
                    return `/music_lib/${relativePath}`;
                }
                currentDir = path.dirname(currentDir);
            }
        } catch (e) {
            // Ignore errors
        }
        return null;
    }

    // Download artwork from Deezer
    async downloadFromDeezer(artist, album, type = 'album') {
        try {
            const searchQuery = type === 'album' 
                ? `${artist} ${album}`.trim() 
                : artist;
            const endpoint = type === 'album' ? 'album' : 'artist';
            
            const response = await axios.get(`https://api.deezer.com/search/${endpoint}`, {
                params: { q: searchQuery },
                timeout: 5000
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const result = response.data.data[0];
                
                if (type === 'album' && result.cover_xl) {
                    return result.cover_xl;
                } else if (type === 'artist' && result.picture_xl) {
                    return result.picture_xl;
                }
            }
        } catch (error) {
            // Silently fail
        }
        return null;
    }

    // Load all orphaned entries (files in DB that don't exist on disk)
    async loadOrphanedEntries() {
        const allTracks = await this.db.getAllMusicFiles();
        console.log(`📊 Checking ${allTracks.length} database entries...`);
        
        let orphanCount = 0;
        for (const track of allTracks) {
            if (!fs.existsSync(track.file_path)) {
                // Create a key based on metadata for matching
                const key = `${track.artist}|||${track.album}|||${track.title}`.toLowerCase();
                this.orphanedEntries.set(key, track);
                orphanCount++;
            }
        }
        
        console.log(`❌ Found ${orphanCount} orphaned entries (files don't exist)`);
        console.log(`✅ ${allTracks.length - orphanCount} entries have valid files`);
    }

    // Try to match a new file with an orphaned entry
    matchOrphanedEntry(metadata, filePath) {
        const artist = metadata.common.artist || metadata.common.artists?.[0] || 'Unknown Artist';
        const album = metadata.common.album || 'Unknown Album';
        const title = metadata.common.title || path.basename(filePath, path.extname(filePath));
        
        const key = `${artist}|||${album}|||${title}`.toLowerCase();
        
        if (this.orphanedEntries.has(key)) {
            return this.orphanedEntries.get(key);
        }
        
        return null;
    }

    // Scan directory recursively
    async scanDirectory(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            
            if (file.isDirectory()) {
                await this.scanDirectory(fullPath);
            } else if (file.isFile()) {
                const ext = path.extname(file.name).toLowerCase();
                if (this.supportedFormats.includes(ext)) {
                    await this.processFile(fullPath);
                }
            }
        }
    }

    // Process a single music file
    async processFile(filePath) {
        this.stats.filesScanned++;
        
        if (this.stats.filesScanned % 100 === 0) {
            console.log(`📂 Scanned ${this.stats.filesScanned} files...`);
        }

        try {
            // Check if file is already in database with correct path
            const existingTrack = await this.db.db.get(
                'SELECT * FROM music_library WHERE file_path = ?',
                [filePath]
            );

            if (existingTrack) {
                // File exists in DB with correct path, just update artwork if needed
                await this.updateArtwork(existingTrack, filePath);
                return;
            }

            // Parse metadata
            const metadata = await parseFile(filePath);
            
            // Try to match with orphaned entry
            const orphanedTrack = this.matchOrphanedEntry(metadata, filePath);
            
            if (orphanedTrack) {
                // Update the orphaned entry with new path
                await this.updateTrackPath(orphanedTrack, filePath, metadata);
            } else {
                // This is a completely new file, add it
                await this.addNewFile(filePath, metadata);
            }

        } catch (error) {
            console.error(`❌ Error processing ${filePath}:`, error.message);
        }
    }

    // Update an orphaned track's path
    async updateTrackPath(orphanedTrack, newPath, metadata) {
        const albumDir = path.dirname(newPath);
        
        // Find artwork
        let albumCover = this.findLocalArtwork(albumDir);
        if (!albumCover && orphanedTrack.album_cover) {
            // Keep existing Deezer artwork if no local file
            albumCover = orphanedTrack.album_cover;
        } else if (!albumCover) {
            albumCover = await this.downloadFromDeezer(orphanedTrack.artist, orphanedTrack.album, 'album');
            if (albumCover) this.stats.artworkDownloaded++;
        }

        // Find artist image
        let artistImage = this.findLocalArtistImage(newPath);
        if (!artistImage && orphanedTrack.artist_image) {
            artistImage = orphanedTrack.artist_image;
        } else if (!artistImage) {
            artistImage = await this.downloadFromDeezer(orphanedTrack.artist, null, 'artist');
            if (artistImage) this.stats.artworkDownloaded++;
        }

        // Update database entry
        await this.db.db.run(`
            UPDATE music_library 
            SET file_path = ?,
                album_cover = ?,
                artist_image = ?
            WHERE id = ?
        `, [newPath, albumCover, artistImage, orphanedTrack.id]);

        this.stats.pathsUpdated++;
        console.log(`🔄 Updated path: ${path.basename(orphanedTrack.file_path)} → ${path.basename(newPath)}`);
    }

    // Add a completely new file
    async addNewFile(filePath, metadata) {
        const artist = metadata.common.artist || metadata.common.artists?.[0] || 'Unknown Artist';
        const album = metadata.common.album || 'Unknown Album';
        const title = metadata.common.title || path.basename(filePath, path.extname(filePath));
        const albumDir = path.dirname(filePath);
        
        // Find artwork
        let albumCover = this.findLocalArtwork(albumDir);
        if (!albumCover) {
            albumCover = await this.downloadFromDeezer(artist, album, 'album');
            if (albumCover) this.stats.artworkDownloaded++;
        }

        // Find artist image
        let artistImage = this.findLocalArtistImage(filePath);
        if (!artistImage) {
            artistImage = await this.downloadFromDeezer(artist, null, 'artist');
            if (artistImage) this.stats.artworkDownloaded++;
        }

        const trackData = {
            title: title,
            artist: artist,
            album: album,
            year: metadata.common.year || null,
            duration: metadata.format.duration || 0,
            genre: metadata.common.genre?.[0] || null,
            file_path: filePath,
            album_cover: albumCover,
            artist_image: artistImage,
            track_number: metadata.common.track?.no || null,
            disc_number: metadata.common.disk?.no || null
        };

        await this.db.addMusicToLibrary(trackData);
        this.stats.newFilesAdded++;
        console.log(`➕ Added new file: ${artist} - ${title}`);
    }

    // Update artwork for existing track
    async updateArtwork(track, filePath) {
        let updated = false;
        const albumDir = path.dirname(filePath);
        
        // Check if album cover needs updating
        if (!track.album_cover || track.album_cover === '') {
            let albumCover = this.findLocalArtwork(albumDir);
            if (!albumCover) {
                albumCover = await this.downloadFromDeezer(track.artist, track.album, 'album');
                if (albumCover) this.stats.artworkDownloaded++;
            }
            
            if (albumCover) {
                await this.db.db.run(
                    'UPDATE music_library SET album_cover = ? WHERE id = ?',
                    [albumCover, track.id]
                );
                this.stats.albumCoversUpdated++;
                updated = true;
            }
        }

        // Check if artist image needs updating
        if (!track.artist_image || track.artist_image === '') {
            let artistImage = this.findLocalArtistImage(filePath);
            if (!artistImage) {
                artistImage = await this.downloadFromDeezer(track.artist, null, 'artist');
                if (artistImage) this.stats.artworkDownloaded++;
            }
            
            if (artistImage) {
                await this.db.db.run(
                    'UPDATE music_library SET artist_image = ? WHERE id = ?',
                    [artistImage, track.id]
                );
                this.stats.artistImagesUpdated++;
                updated = true;
            }
        }

        if (updated && this.stats.filesScanned % 50 === 0) {
            console.log(`🎨 Updated artwork for: ${track.artist} - ${track.title}`);
        }
    }

    // Main update function
    async update() {
        const musicPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
        
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔄 Database Update & Artwork Fix');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📁 Music directory: ${musicPath}`);
        console.log();

        // Step 1: Load orphaned entries
        console.log('📊 Step 1: Loading database entries...');
        await this.loadOrphanedEntries();
        console.log();

        // Step 2: Scan all files
        console.log('🔍 Step 2: Scanning music files...');
        await this.scanDirectory(musicPath);
        console.log();

        // Step 3: Report
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Update Complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📂 Files scanned: ${this.stats.filesScanned}`);
        console.log(`🔄 Paths updated: ${this.stats.pathsUpdated}`);
        console.log(`➕ New files added: ${this.stats.newFilesAdded}`);
        console.log(`🎨 Album covers updated: ${this.stats.albumCoversUpdated}`);
        console.log(`👤 Artist images updated: ${this.stats.artistImagesUpdated}`);
        console.log(`⬇️  Artwork downloaded: ${this.stats.artworkDownloaded}`);
        console.log(`🔒 No entries deleted - all data preserved`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
}

// Run the updater
async function run() {
    const db = new Database();
    await db.init();

    const updater = new DatabaseUpdater(db);
    await updater.update();

    await db.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
}

run().catch(console.error);

