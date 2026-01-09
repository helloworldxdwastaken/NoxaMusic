import Database from '../src/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from 'music-metadata';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SafeMusicScanner {
    constructor(database) {
        this.db = database;
        this.supportedFormats = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg'];
        this.stats = {
            pathsUpdated: 0,
            artworkFound: 0,
            artworkDownloaded: 0,
            artistImagesFound: 0,
            artistImagesDownloaded: 0
        };
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

    // Find local artist image
    findLocalArtistImage(artistDir) {
        try {
            const artistImagePath = path.join(artistDir, 'artist.jpg');
            if (fs.existsSync(artistImagePath)) {
                const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', artistImagePath);
                return `/music_lib/${relativePath}`;
            }
        } catch (e) {
            // Ignore errors
        }
        return null;
    }

    // Download artwork from Deezer
    async downloadArtworkFromDeezer(artist, album, savePath) {
        try {
            const searchQuery = `${artist} ${album}`.replace(/\s+/g, '%20');
            const response = await axios.get(`https://api.deezer.com/search/album?q=${searchQuery}`, { timeout: 5000 });
            
            if (response.data && response.data.data && response.data.data.length > 0) {
                const coverUrl = response.data.data[0].cover_xl || response.data.data[0].cover_big;
                const imageResponse = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 10000 });
                
                // Ensure directory exists
                const dir = path.dirname(savePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(savePath, imageResponse.data);
                return true;
            }
        } catch (error) {
            // Silently fail, don't spam logs
        }
        return false;
    }

    // Download artist image from Deezer/TheAudioDB
    async downloadArtistImageFromDeezer(artist, savePath) {
        try {
            const searchQuery = artist.replace(/\s+/g, '%20');
            const response = await axios.get(`https://api.deezer.com/search/artist?q=${searchQuery}`, { timeout: 5000 });
            
            if (response.data && response.data.data && response.data.data.length > 0) {
                const artistImageUrl = response.data.data[0].picture_xl || response.data.data[0].picture_big;
                const imageResponse = await axios.get(artistImageUrl, { responseType: 'arraybuffer', timeout: 10000 });
                
                // Ensure directory exists
                const dir = path.dirname(savePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(savePath, imageResponse.data);
                return true;
            }
        } catch (error) {
            // Silently fail
        }
        return false;
    }

    // Scan all music files in directory
    async scanAllDirectories(paths) {
        let totalScanned = 0;
        let totalAdded = 0;
        let totalUpdated = 0;

        console.log('🔍 Starting safe scan (preserves manual metadata corrections)...\n');

        for (const scanPath of paths) {
            if (!fs.existsSync(scanPath)) {
                console.log(`⚠️  Path does not exist: ${scanPath}`);
                continue;
            }
            console.log(`📂 Scanning: ${scanPath}\n`);
            const result = await this.scanDirectory(scanPath);
            totalScanned += result.scanned;
            totalAdded += result.added;
            totalUpdated += result.updated;
        }

        return { scanned: totalScanned, added: totalAdded, updated: totalUpdated, removed: 0 };
    }

    // Recursively scan directory
    async scanDirectory(dirPath) {
        let scanned = 0;
        let added = 0;
        let updated = 0;

        try {
            const items = fs.readdirSync(dirPath);

            for (const item of items) {
                if (item.startsWith('.')) continue; // Skip hidden files

                const fullPath = path.join(dirPath, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    const result = await this.scanDirectory(fullPath);
                    scanned += result.scanned;
                    added += result.added;
                    updated += result.updated;
                } else if (stat.isFile()) {
                    const ext = path.extname(item).toLowerCase();
                    if (this.supportedFormats.includes(ext)) {
                        scanned++;
                        const result = await this.scanMusicFile(fullPath);
                        if (result.added) added++;
                        if (result.updated) updated++;
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error scanning ${dirPath}:`, error.message);
        }

        return { scanned, added, updated };
    }

    // Check if this file matches an existing song by metadata (for path updates)
    async findExistingByMetadata(filePath) {
        try {
            const metadata = await parseFile(filePath);
            if (metadata.common.title && metadata.common.artist) {
                const existing = await this.db.findMusicByArtistAndTitle(
                    metadata.common.artist,
                    metadata.common.title
                );
                if (existing && existing.file_path !== filePath) {
                    // Check if old path no longer exists
                    if (!fs.existsSync(existing.file_path)) {
                        return existing;
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    // Scan individual music file
    async scanMusicFile(filePath) {
        try {
            // Check if file already exists in database by path
            let existing = await this.db.getMusicByPath(filePath);
            
            // If not found by path, check if it's a moved file
            if (!existing) {
                existing = await this.findExistingByMetadata(filePath);
                if (existing) {
                    // Update path for moved file
                    await this.db.updateMusicFilePath(existing.id, filePath);
                    console.log(`  📁 Updated path: ${path.basename(existing.file_path)} → ${path.basename(filePath)}`);
                    this.stats.pathsUpdated++;
                }
            }
            
            if (existing) {
                // File exists - only update artwork, preserve ALL metadata
                let needsUpdate = false;
                const updates = {};
                const albumDir = path.dirname(filePath);
                const artistDir = path.dirname(albumDir);

                // Check for missing album cover
                if (!existing.album_cover || existing.album_cover === '') {
                    // Try local file first
                    let localArtwork = this.findLocalArtwork(albumDir);
                    
                    if (localArtwork) {
                        updates.album_cover = localArtwork;
                        needsUpdate = true;
                        this.stats.artworkFound++;
                        console.log(`  🎨 Found cover: ${path.basename(albumDir)}/cover.jpg`);
                    } else if (existing.artist && existing.album) {
                        // Try to download from Deezer
                        const coverPath = path.join(albumDir, 'cover.jpg');
                        const downloaded = await this.downloadArtworkFromDeezer(existing.artist, existing.album, coverPath);
                        if (downloaded) {
                            const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', coverPath);
                            updates.album_cover = `/music_lib/${relativePath}`;
                            needsUpdate = true;
                            this.stats.artworkDownloaded++;
                            console.log(`  ⬇️  Downloaded cover: ${existing.artist} - ${existing.album}`);
                        }
                    }
                }

                // Check for missing artist image
                if (!existing.artist_image || existing.artist_image === '') {
                    // Try local file first
                    let localArtistImage = this.findLocalArtistImage(artistDir);
                    
                    if (localArtistImage) {
                        updates.artist_image = localArtistImage;
                        needsUpdate = true;
                        this.stats.artistImagesFound++;
                        console.log(`  👤 Found artist image: ${path.basename(artistDir)}/artist.jpg`);
                    } else if (existing.artist) {
                        // Try to download from Deezer
                        const artistImagePath = path.join(artistDir, 'artist.jpg');
                        const downloaded = await this.downloadArtistImageFromDeezer(existing.artist, artistImagePath);
                        if (downloaded) {
                            const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', artistImagePath);
                            updates.artist_image = `/music_lib/${relativePath}`;
                            needsUpdate = true;
                            this.stats.artistImagesDownloaded++;
                            console.log(`  ⬇️  Downloaded artist image: ${existing.artist}`);
                        }
                    }
                }

                if (needsUpdate) {
                    // Only update artwork fields, preserve ALL other metadata
                    await this.db.db.run(
                        `UPDATE music_library SET album_cover = COALESCE(?, album_cover), artist_image = COALESCE(?, artist_image) WHERE id = ?`,
                        [updates.album_cover || null, updates.artist_image || null, existing.id]
                    );
                    return { added: false, updated: true };
                }
                
                return { added: false, updated: false };
            }

            // New file - parse metadata and add to database
            const metadata = await parseFile(filePath);
            const stat = fs.statSync(filePath);
            const albumDir = path.dirname(filePath);
            const artistDir = path.dirname(albumDir);

            // Extract metadata from file
            const musicData = {
                title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
                artist: metadata.common.artist || 'Unknown Artist',
                album: metadata.common.album || 'Unknown Album',
                year: metadata.common.year || null,
                genre: metadata.common.genre ? metadata.common.genre.join(', ') : null,
                duration: Math.round(metadata.format.duration || 0),
                file_size: stat.size,
                bitrate: metadata.format.bitrate || null,
                file_path: filePath
            };

            // Look for local artwork
            let localArtwork = this.findLocalArtwork(albumDir);
            if (localArtwork) {
                musicData.album_cover = localArtwork;
                this.stats.artworkFound++;
            } else if (musicData.artist && musicData.album) {
                // Try to download from Deezer
                const coverPath = path.join(albumDir, 'cover.jpg');
                const downloaded = await this.downloadArtworkFromDeezer(musicData.artist, musicData.album, coverPath);
                if (downloaded) {
                    const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', coverPath);
                    musicData.album_cover = `/music_lib/${relativePath}`;
                    this.stats.artworkDownloaded++;
                    console.log(`  ⬇️  Downloaded cover: ${musicData.artist} - ${musicData.album}`);
                }
            }

            // Look for local artist image
            let localArtistImage = this.findLocalArtistImage(artistDir);
            if (localArtistImage) {
                musicData.artist_image = localArtistImage;
                this.stats.artistImagesFound++;
            } else if (musicData.artist) {
                // Try to download from Deezer
                const artistImagePath = path.join(artistDir, 'artist.jpg');
                const downloaded = await this.downloadArtistImageFromDeezer(musicData.artist, artistImagePath);
                if (downloaded) {
                    const relativePath = path.relative(process.env.MUSIC_PATH || '/mnt/UNO/Music_lib', artistImagePath);
                    musicData.artist_image = `/music_lib/${relativePath}`;
                    this.stats.artistImagesDownloaded++;
                    console.log(`  ⬇️  Downloaded artist image: ${musicData.artist}`);
                }
            }

            // Add to database
            await this.db.addMusicToLibrary(filePath, musicData);
            console.log(`  ✅ Added: ${musicData.artist} - ${musicData.title}`);
            
            return { added: true, updated: false };

        } catch (error) {
            console.error(`  ❌ Error processing ${filePath}:`, error.message);
            return { added: false, updated: false };
        }
    }
}

async function run() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 Safe Manual Music Library Scan');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Features:');
    console.log('   ✅ Preserves ALL manual metadata corrections');
    console.log('   ✅ Updates file paths for moved files');
    console.log('   ✅ Links local artwork (cover.jpg, artist.jpg)');
    console.log('   ✅ Downloads missing artwork from Deezer');
    console.log('   ✅ Only adds NEW songs not in database');
    console.log('   🔒 Does NOT modify artist/album/title names');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const db = new Database();
    await db.init();
    
    const scanner = new SafeMusicScanner(db);
    
    // Check if specific artist/folder provided as argument
    const targetPath = process.argv[2];
    let scanPath;
    
    if (targetPath) {
        // If argument provided, use it (can be artist name or full path)
    const musicPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
        scanPath = targetPath.startsWith('/') ? targetPath : path.join(musicPath, targetPath);
        console.log(`📂 Scanning specific folder: ${scanPath}\n`);
    } else {
        // Scan entire library
        scanPath = process.env.MUSIC_PATH || '/mnt/UNO/Music_lib';
        console.log(`📂 Scanning entire library: ${scanPath}\n`);
    }
    
    if (!fs.existsSync(scanPath)) {
        console.error(`❌ Error: Path does not exist: ${scanPath}`);
        await db.close();
        process.exit(1);
    }
    
    const result = await scanner.scanAllDirectories([scanPath]);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Safe Scan Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Total files scanned: ${result.scanned || 0}`);
    console.log(`✅ New songs added: ${result.added || 0}`);
    console.log(`📁 Paths updated: ${scanner.stats.pathsUpdated || 0}`);
    console.log(`🎨 Album covers found: ${scanner.stats.artworkFound || 0}`);
    console.log(`⬇️  Album covers downloaded: ${scanner.stats.artworkDownloaded || 0}`);
    console.log(`👤 Artist images found: ${scanner.stats.artistImagesFound || 0}`);
    console.log(`⬇️  Artist images downloaded: ${scanner.stats.artistImagesDownloaded || 0}`);
    console.log(`🔒 Metadata preserved: ALL existing tracks`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    await db.close();
    process.exit(0);
}

run().catch(console.error);

