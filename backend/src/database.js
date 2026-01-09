import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Database {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '..', 'data', 'musicstream.db');
  }

  async init() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          reject(err);
        } else {
          console.log('✅ Database connected:', this.dbPath);
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const queries = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          is_active BOOLEAN DEFAULT 1
        )`,

        // Music library table (centralized - like Spotify)
        `CREATE TABLE IF NOT EXISTS music_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT UNIQUE NOT NULL,
          title TEXT,
          artist TEXT,
          album TEXT,
          year INTEGER,
          genre TEXT,
          duration INTEGER,
          file_size INTEGER,
          bitrate INTEGER,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_played DATETIME,
          play_count INTEGER DEFAULT 0
        )`,

        // User library table (which tracks each user has added)
        `CREATE TABLE IF NOT EXISTS user_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          music_id INTEGER NOT NULL,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, music_id),
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (music_id) REFERENCES music_library (id)
        )`,


        // Playlists table
        `CREATE TABLE IF NOT EXISTS playlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`,

        // Playlist tracks table
        `CREATE TABLE IF NOT EXISTS playlist_tracks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          playlist_id INTEGER,
          music_id INTEGER,
          position INTEGER,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (playlist_id) REFERENCES playlists (id),
          FOREIGN KEY (music_id) REFERENCES music_library (id)
        )`,

        // Downloads table
        `CREATE TABLE IF NOT EXISTS downloads (
          id TEXT PRIMARY KEY,
          user_id INTEGER,
          playlist_id INTEGER,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          album TEXT,
          status TEXT DEFAULT 'downloading',
          progress INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          torrent_data TEXT,
          retry_count INTEGER DEFAULT 0,
          last_retry DATETIME,
          error_log TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (playlist_id) REFERENCES playlists (id)
        )`,

        // Access logs table
        `CREATE TABLE IF NOT EXISTS access_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          username TEXT,
          ip_address TEXT,
          country TEXT,
          device TEXT,
          user_agent TEXT,
          accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`
      ];

      let completed = 0;
      queries.forEach((query, index) => {
        this.db.run(query, (err) => {
          if (err) {
            console.error(`Error creating table ${index + 1}:`, err);
            reject(err);
          } else {
            completed++;
            if (completed === queries.length) {
              console.log('✅ Database tables created');
              // Add missing columns if they don't exist
              this.addMissingColumns().then(() => resolve()).catch(reject);
            }
          }
        });
      });
    });
  }

  // Add missing columns to existing tables
  async addMissingColumns() {
    return new Promise((resolve, reject) => {
      const migrations = [
        'ALTER TABLE music_library ADD COLUMN user_id INTEGER',
        'ALTER TABLE music_library ADD COLUMN album_cover TEXT',
        'ALTER TABLE music_library ADD COLUMN artist_image TEXT',
        'ALTER TABLE downloads ADD COLUMN retry_count INTEGER DEFAULT 0',
        'ALTER TABLE downloads ADD COLUMN last_retry DATETIME',
        'ALTER TABLE downloads ADD COLUMN error_log TEXT',
        'ALTER TABLE downloads ADD COLUMN user_id INTEGER',
        'ALTER TABLE downloads ADD COLUMN playlist_id INTEGER',
        'ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT "apple-glass-black"',
        'ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0',
        'ALTER TABLE access_logs ADD COLUMN referrer TEXT',
        'ALTER TABLE access_logs ADD COLUMN referrer_domain TEXT'
      ];

      let completed = 0;
      migrations.forEach((migration, index) => {
        this.db.run(migration, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.warn(`Migration ${index + 1} failed:`, err.message);
          } else if (!err) {
            console.log(`✅ Migration ${index + 1} applied`);
          }

          completed++;
          if (completed === migrations.length) {
            console.log('✅ Database migrations completed');
            // Add indexes after migrations complete
            this.createIndexes().then(() => resolve()).catch(reject);
          }
        });
      });
    });
  }

  // Create indexes for performance
  async createIndexes() {
    return new Promise((resolve, reject) => {
      const indexes = [
        // Music library indexes
        'CREATE INDEX IF NOT EXISTS idx_music_library_user_id ON music_library(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_music_library_artist ON music_library(artist)',
        'CREATE INDEX IF NOT EXISTS idx_music_library_album ON music_library(album)',
        'CREATE INDEX IF NOT EXISTS idx_music_library_title ON music_library(title)',
        'CREATE INDEX IF NOT EXISTS idx_music_library_added_at ON music_library(added_at)',

        // User library indexes
        'CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_user_library_music_id ON user_library(music_id)',
        'CREATE INDEX IF NOT EXISTS idx_user_library_composite ON user_library(user_id, music_id)',

        // Playlist indexes
        'CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id)',

        // Playlist tracks indexes
        'CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id)',
        'CREATE INDEX IF NOT EXISTS idx_playlist_tracks_music_id ON playlist_tracks(music_id)',
        'CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON playlist_tracks(playlist_id, position)',

        // Downloads indexes
        'CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)',
        'CREATE INDEX IF NOT EXISTS idx_downloads_playlist_id ON downloads(playlist_id)'
      ];

      let completed = 0;
      indexes.forEach((indexQuery, index) => {
        this.db.run(indexQuery, (err) => {
          if (err) {
            console.warn(`⚠️ Index ${index + 1} failed:`, err.message);
          } else {
            console.log(`✅ Index ${index + 1} created`);
          }

          completed++;
          if (completed === indexes.length) {
            console.log('✅ Database indexes verified');
            resolve();
          }
        });
      });
    });
  }

  // User methods
  async createUser(username, password) {
    const hashedPassword = await bcrypt.hash(password, 10);

    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [username, '', hashedPassword],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, username, email: '' });
          }
        }
      );
    });
  }

  async getUserByUsername(username) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE username = ? AND is_active = 1',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async validatePassword(username, password) {
    const user = await this.getUserByUsername(username);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    return isValid ? user : null;
  }

  async updateLastLogin(userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Music library methods (with user ownership)
  async addMusicToLibrary(filePath, metadata, userId = null) {
    const self = this;
    return new Promise((resolve, reject) => {
      // Generate stable_id from metadata ONLY (no timestamp for true stability)
      // Same song = same stable_id every time
      const fingerprint = `${metadata.artist || 'unknown'}_${metadata.title || 'unknown'}_${metadata.album || 'unknown'}`;
      const hash = crypto.createHash('md5').update(fingerprint).digest('hex').substring(0, 8);
      const stableId = `song_${hash}`;

      // Add to music_library with stable_id and original metadata
      self.db.run(
        `INSERT OR IGNORE INTO music_library 
         (stable_id, file_path, title, artist, album, year, genre, duration, file_size, bitrate, 
          album_cover, artist_image, user_id,
          original_artist, original_title, original_album, original_file_path, first_added_at, is_available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)`,
        [
          stableId,
          filePath,
          metadata.title || 'Unknown Title',
          metadata.artist || 'Unknown Artist',
          metadata.album || 'Unknown Album',
          metadata.year,
          metadata.genre,
          metadata.duration,
          metadata.fileSize,
          metadata.bitrate,
          metadata.album_cover || null,
          metadata.artist_image || null,
          userId,
          // Original metadata from ID3 tags (preserved forever)
          metadata.original_artist || metadata.artist || 'Unknown Artist',
          metadata.original_title || metadata.title || 'Unknown Title',
          metadata.original_album || metadata.album || 'Unknown Album',
          filePath
        ],
        function (err) {
          if (err) {
            reject(err);
            return;
          }

          // Get the music_id (either just inserted or existing)
          self.db.get(
            'SELECT id, stable_id FROM music_library WHERE file_path = ? OR stable_id = ?',
            [filePath, stableId],
            (err, row) => {
              if (err) {
                reject(err);
                return;
              }

              if (!row) {
                reject(new Error('Music not found after insert'));
                return;
              }

              const musicId = row.id;
              const finalStableId = row.stable_id;

              // If artwork was provided and this is an existing track, update it
              if ((metadata.album_cover || metadata.artist_image)) {
                self.updateMusicArtwork(musicId, metadata.album_cover, metadata.artist_image)
                  .catch(err => console.warn('Could not update artwork:', err));
              }

              // If userId provided, add to their library
              if (userId) {
                self.addToUserLibrary(userId, musicId).then(() => {
                  resolve({ id: musicId, stable_id: finalStableId });
                }).catch(reject);
              } else {
                resolve({ id: musicId, stable_id: finalStableId });
              }
            }
          );
        }
      );
    });
  }

  // Check if user is admin
  async isUserAdmin(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT is_admin FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row && row.is_admin === 1);
        }
      );
    });
  }

  async getMusicLibrary(limit = null, offset = 0, userId = null) {
    return new Promise(async (resolve, reject) => {
      try {
        let query, params;

        // Check if user is admin
        const isAdmin = userId ? await this.isUserAdmin(userId) : false;

        if (userId && !isAdmin) {
          // Regular user: Show only music from their library (user_library table)
          if (limit) {
            query = `
              SELECT ml.* FROM music_library ml
              INNER JOIN user_library ul ON ml.id = ul.music_id
              WHERE ul.user_id = ?
              ORDER BY ml.added_at DESC
              LIMIT ? OFFSET ?
            `;
            params = [userId, limit, offset];
          } else {
            query = `
              SELECT ml.* FROM music_library ml
              INNER JOIN user_library ul ON ml.id = ul.music_id
              WHERE ul.user_id = ?
              ORDER BY ml.added_at DESC
            `;
            params = [userId];
          }
        } else {
          // Admin or no userId: Show ALL music
          if (limit) {
            query = `SELECT * FROM music_library ORDER BY added_at DESC LIMIT ? OFFSET ?`;
            params = [limit, offset];
          } else {
            query = `SELECT * FROM music_library ORDER BY added_at DESC`;
            params = [];
          }
        }

        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Add track to user's library (Spotify-like)
  async addToUserLibrary(userId, musicId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO user_library (user_id, music_id) VALUES (?, ?)`,
        [userId, musicId],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, id: this.lastID });
        }
      );
    });
  }

  // Remove track from user's library
  async removeFromUserLibrary(userId, musicId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM user_library WHERE user_id = ? AND music_id = ?`,
        [userId, musicId],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true });
        }
      );
    });
  }

  // Update artwork URLs for music
  async updateMusicArtwork(musicId, albumCover = null, artistImage = null) {
    return new Promise((resolve, reject) => {
      const updates = [];
      const params = [];

      if (albumCover !== null) {
        updates.push('album_cover = ?');
        params.push(albumCover);
      }

      if (artistImage !== null) {
        updates.push('artist_image = ?');
        params.push(artistImage);
      }

      if (updates.length === 0) {
        resolve({ success: true });
        return;
      }

      params.push(musicId);
      const query = `UPDATE music_library SET ${updates.join(', ')} WHERE id = ?`;

      this.db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve({ success: true, changes: this.changes });
      });
    });
  }

  // Update artwork for all tracks in an album
  async updateAlbumArtwork(artist, album, albumCover) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE music_library SET album_cover = ? WHERE artist = ? AND album = ? AND (album_cover IS NULL OR album_cover = "")',
        [albumCover, artist, album],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  // Update artwork for all tracks by an artist
  async updateArtistArtwork(artist, artistImage) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE music_library SET artist_image = ? WHERE artist = ? AND (artist_image IS NULL OR artist_image = "")',
        [artistImage, artist],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  async getMusicById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM music_library WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Find existing music by artist and title (for duplicate check)
  async findMusicByArtistAndTitle(artist, title) {
    return new Promise((resolve, reject) => {
      // Try exact match first
      this.db.get(
        `SELECT * FROM music_library 
         WHERE LOWER(TRIM(artist)) = LOWER(TRIM(?)) AND LOWER(TRIM(title)) = LOWER(TRIM(?)) 
         LIMIT 1`,
        [artist, title],
        (err, exactMatch) => {
          if (err) {
            reject(err);
            return;
          }

          if (exactMatch) {
            resolve(exactMatch);
            return;
          }

          // Try fuzzy match - check if title contains or artist contains
          this.db.get(
            `SELECT * FROM music_library 
             WHERE LOWER(TRIM(artist)) LIKE LOWER(TRIM(?)) 
             AND LOWER(TRIM(title)) LIKE LOWER(TRIM(?))
             LIMIT 1`,
            [`%${artist}%`, `%${title}%`],
            (err2, fuzzyMatch) => {
              if (err2) reject(err2);
              else resolve(fuzzyMatch || null);
            }
          );
        }
      );
    });
  }

  async searchMusic(query, type = 'all', limit = 50) {
    return new Promise(async (resolve, reject) => {
      try {
        const results = {
          songs: [],
          artists: [],
          albums: []
        };

        const limitNum = parseInt(limit) || 50;

        // 1. Search Songs (smart: searches title, artist, AND album)
        if (type === 'all' || type === 'track') {
          const songLimit = type === 'all' ? 10 : limitNum;
          results.songs = await new Promise((res, rej) => {
            this.db.all(
              `SELECT * FROM music_library 
               WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
               ORDER BY 
                 CASE 
                   WHEN title LIKE ? THEN 1
                   WHEN artist LIKE ? THEN 2
                   ELSE 3
                 END,
                 play_count DESC, added_at DESC 
               LIMIT ?`,
              [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, songLimit],
              (err, rows) => {
                if (err) rej(err);
                else res(rows || []);
              }
            );
          });
        }

        // 2. Search Artists
        if (type === 'all' || type === 'artist') {
          const artistLimit = type === 'all' ? 5 : limitNum;
          results.artists = await new Promise((res, rej) => {
            this.db.all(
              `SELECT DISTINCT artist, artist_image, COUNT(*) as track_count 
               FROM music_library 
               WHERE artist LIKE ? 
               GROUP BY artist 
               ORDER BY COUNT(*) DESC 
               LIMIT ?`,
              [`%${query}%`, artistLimit],
              (err, rows) => {
                if (err) rej(err);
                else res(rows || []);
              }
            );
          });
        }

        // 3. Search Albums (smart: searches album name AND artist)
        if (type === 'all' || type === 'album') {
          const albumLimit = type === 'all' ? 10 : limitNum;
          results.albums = await new Promise((res, rej) => {
            this.db.all(
              `SELECT DISTINCT album, artist, album_cover, COUNT(*) as track_count 
               FROM music_library 
               WHERE album LIKE ? OR artist LIKE ?
               GROUP BY album 
               ORDER BY 
                 CASE WHEN album LIKE ? THEN 1 ELSE 2 END,
                 COUNT(*) DESC 
               LIMIT ?`,
              [`%${query}%`, `%${query}%`, `%${query}%`, albumLimit],
              (err, rows) => {
                if (err) rej(err);
                else res(rows || []);
              }
            );
          });
        }

        resolve(results);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Download methods
  async addDownload(userId, title, artist, album, magnetUrl) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO downloads (user_id, title, artist, album, magnet_url)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, title, artist, album, magnetUrl],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  async getDownloads(userId = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM downloads';
      let params = [];

      if (userId) {
        query += ' WHERE user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY created_at DESC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async updateDownloadStatus(downloadId, status, progress = null, filePath = null) {
    return new Promise((resolve, reject) => {
      let query = 'UPDATE downloads SET status = ?';
      let params = [status];

      if (progress !== null) {
        query += ', progress = ?';
        params.push(progress);
      }

      if (filePath) {
        query += ', file_path = ?';
        params.push(filePath);
      }

      if (status === 'completed') {
        query += ', completed_at = CURRENT_TIMESTAMP';
      }

      query += ' WHERE id = ?';
      params.push(downloadId);

      this.db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) console.error('Error closing database:', err);
          else console.log('Database connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Admin methods
  async getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, username, email, created_at, last_login, is_active FROM users ORDER BY created_at DESC',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getMusicStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as total_songs,
          SUM(play_count) as total_plays,
          AVG(play_count) as avg_plays,
          COUNT(DISTINCT artist) as unique_artists,
          COUNT(DISTINCT album) as unique_albums,
          SUM(file_size) as total_size_bytes
        FROM music_library`,
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async getMostPlayedSongs(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM music_library ORDER BY play_count DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getMusicWithPagination(limit, offset) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM music_library ORDER BY added_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getMusicCount() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM music_library',
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  async deleteUser(userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM users WHERE id = ?',
        [userId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async updateUser(userId, updates) {
    const fields = [];
    const values = [];

    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active);
    }
    if (updates.theme_preference !== undefined) {
      fields.push('theme_preference = ?');
      values.push(updates.theme_preference);
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(userId);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async addAccessLog(entry) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO access_logs (user_id, username, ip_address, country, device, user_agent, referrer, referrer_domain, accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
          entry.userId || null,
          entry.username || null,
          entry.ipAddress || null,
          entry.country || 'Unknown',
          entry.device || 'Unknown',
          entry.userAgent || null,
          entry.referrer || null,
          entry.referrerDomain || null,
          entry.accessedAt || null
        ],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async getLatestAccessLogs(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, user_id, username, ip_address, country, device, user_agent, accessed_at
         FROM access_logs
         ORDER BY accessed_at DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  async getRecentAccessSummary(hours = 24) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          user_id,
          COALESCE(username, 'Unknown') as username,
          MAX(accessed_at) as last_access,
          ip_address,
          country,
          device
         FROM access_logs
         WHERE accessed_at >= datetime('now', ?)
         GROUP BY user_id, username
         ORDER BY last_access DESC`,
        [`-${hours} hours`],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  // Download methods
  async addDownload(download) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO downloads (id, user_id, playlist_id, title, artist, album, status, progress, created_at, torrent_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [download.id, download.userId || null, download.playlistId || null, download.title, download.artist, download.album, download.status, download.progress, download.created_at, download.torrent],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID });
          }
        }
      );
    });
  }

  // Note: getDownloads with userId filtering is defined earlier in this file (line ~692)

  async updateDownloadStatus(downloadId, status, progress = null) {
    return new Promise((resolve, reject) => {
      let query = 'UPDATE downloads SET status = ?';
      let params = [status];

      if (progress !== null) {
        query += ', progress = ?';
        params.push(progress);
      }

      query += ' WHERE id = ?';
      params.push(downloadId);

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async deleteDownload(downloadId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM downloads WHERE id = ?',
        [downloadId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async updateDownloadRetry(downloadId, retryCount, errorLog = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE downloads SET retry_count = ?, last_retry = CURRENT_TIMESTAMP, error_log = ? WHERE id = ?',
        [retryCount, errorLog, downloadId],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async getDownloadsForRetry() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM downloads WHERE status = "downloading" AND retry_count < 10 ORDER BY created_at ASC',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getMusicByPath(filePath) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM music_library WHERE file_path = ?',
        [filePath],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async getMusicById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM music_library WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async getMusicByTitleAndArtist(title, artist) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM music_library WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)',
        [title, artist],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async deleteMusicById(id) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM music_library WHERE id = ?',
        [id],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  // Remove duplicate songs (keep the one with the most complete metadata)
  async removeDuplicates() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT title, artist, COUNT(*) as count, GROUP_CONCAT(id) as ids, GROUP_CONCAT(file_path) as paths
         FROM music_library 
         GROUP BY LOWER(title), LOWER(artist) 
         HAVING COUNT(*) > 1`,
        (err, duplicates) => {
          if (err) {
            reject(err);
          } else {
            let removedCount = 0;
            const removePromises = duplicates.map(duplicate => {
              const ids = duplicate.ids.split(',');
              const paths = duplicate.paths.split(',');

              // Keep the first one, remove the rest
              const idsToRemove = ids.slice(1);

              return new Promise((resolveRemove, rejectRemove) => {
                const deleteQuery = `DELETE FROM music_library WHERE id IN (${idsToRemove.map(() => '?').join(',')})`;
                this.db.run(deleteQuery, idsToRemove, function (err) {
                  if (err) {
                    rejectRemove(err);
                  } else {
                    removedCount += this.changes;
                    console.log(`🧹 Removed ${this.changes} duplicates for: ${duplicate.title} - ${duplicate.artist}`);
                    resolveRemove();
                  }
                });
              });
            });

            Promise.all(removePromises).then(() => {
              console.log(`✅ Removed ${removedCount} duplicate songs`);
              resolve(removedCount);
            }).catch(reject);
          }
        }
      );
    });
  }

  // Clean up songs with invalid file paths
  async cleanupInvalidPaths() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM music_library',
        (err, songs) => {
          if (err) {
            reject(err);
          } else {
            // fs is already imported at the top
            let removedCount = 0;
            const removePromises = songs.map(song => {
              return new Promise((resolveRemove, rejectRemove) => {
                if (!fs.existsSync(song.file_path)) {
                  this.db.run(
                    'DELETE FROM music_library WHERE id = ?',
                    [song.id],
                    function (err) {
                      if (err) {
                        rejectRemove(err);
                      } else {
                        removedCount += this.changes;
                        console.log(`🧹 Removed invalid path: ${song.file_path}`);
                        resolveRemove();
                      }
                    }
                  );
                } else {
                  resolveRemove();
                }
              });
            });

            Promise.all(removePromises).then(() => {
              console.log(`✅ Removed ${removedCount} songs with invalid paths`);
              resolve(removedCount);
            }).catch(reject);
          }
        }
      );
    });
  }

  // Playlist methods
  async createPlaylist(userId, name, description = '') {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO playlists (user_id, name, description, updated_at) VALUES (?, ?, ?, datetime("now"))',
        [userId, name, description],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, name, description });
          }
        }
      );
    });
  }

  async getPlaylists(userId = null) {
    return new Promise((resolve, reject) => {
      // First, get playlists with track counts
      let query = `
        SELECT p.*, 
               COUNT(pt.id) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
      `;
      let params = [];

      if (userId) {
        query += ' WHERE p.user_id = ?';
        params.push(userId);
      }

      query += ' GROUP BY p.id ORDER BY p.name COLLATE NOCASE ASC';

      this.db.all(query, params, async (err, playlists) => {
        if (err) {
          reject(err);
          return;
        }

        // Then fetch artwork for each playlist (optimized single query per playlist)
        const playlistsWithArtwork = await Promise.all(
          playlists.map(async (playlist) => {
            return new Promise((resolveArt) => {
              this.db.get(
                `SELECT m.album_cover 
                 FROM playlist_tracks pt 
                 JOIN music_library m ON pt.music_id = m.id 
                 WHERE pt.playlist_id = ? AND m.album_cover IS NOT NULL
                 ORDER BY pt.position ASC, pt.added_at ASC 
                 LIMIT 1`,
                [playlist.id],
                (err, row) => {
                  if (err || !row) {
                    resolveArt({ ...playlist, artwork: null });
                  } else {
                    resolveArt({ ...playlist, artwork: row.album_cover });
                  }
                }
              );
            });
          })
        );

        resolve(playlistsWithArtwork);
      });
    });
  }

  async getPlaylistById(playlistId, userId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT p.*, 
               COUNT(pt.id) as track_count,
               GROUP_CONCAT(m.title) as track_titles,
               GROUP_CONCAT(m.artist) as track_artists
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        LEFT JOIN music_library m ON pt.music_id = m.id
        WHERE p.id = ?
      `;
      let params = [playlistId];

      if (userId) {
        query += ' AND p.user_id = ?';
        params.push(userId);
      }

      query += ' GROUP BY p.id';

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getPlaylistTracks(playlistId, userId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT m.*, pt.id as playlist_track_id, pt.position, pt.added_at as added_to_playlist
        FROM playlist_tracks pt
        JOIN music_library m ON pt.music_id = m.id
        JOIN playlists p ON pt.playlist_id = p.id
        WHERE pt.playlist_id = ?
      `;
      let params = [playlistId];

      if (userId) {
        query += ' AND p.user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY pt.position ASC, pt.added_at ASC';

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async addTrackToPlaylist(playlistId, musicId, position = null, userId = null) {
    return new Promise((resolve, reject) => {
      // First verify the playlist belongs to the user
      if (userId) {
        this.db.get(
          'SELECT id FROM playlists WHERE id = ? AND user_id = ?',
          [playlistId, userId],
          (err, playlist) => {
            if (err) {
              reject(err);
            } else if (!playlist) {
              reject(new Error('Playlist not found or access denied'));
            } else {
              this._addTrackToPlaylistInternal(playlistId, musicId, position, resolve, reject);
            }
          }
        );
      } else {
        this._addTrackToPlaylistInternal(playlistId, musicId, position, resolve, reject);
      }
    });
  }

  _addTrackToPlaylistInternal(playlistId, musicId, position, resolve, reject) {
    // Check if track is already in playlist
    this.db.get(
      'SELECT id FROM playlist_tracks WHERE playlist_id = ? AND music_id = ?',
      [playlistId, musicId],
      (err, existing) => {
        if (err) {
          reject(err);
        } else if (existing) {
          reject(new Error('Track already in playlist'));
        } else {
          // Get next position if not specified
          if (position === null) {
            this.db.get(
              'SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?',
              [playlistId],
              (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  const nextPosition = (result.max_pos || 0) + 1;
                  this._insertPlaylistTrack(playlistId, musicId, nextPosition, resolve, reject);
                }
              }
            );
          } else {
            this._insertPlaylistTrack(playlistId, musicId, position, resolve, reject);
          }
        }
      }
    );
  }

  _insertPlaylistTrack(playlistId, musicId, position, resolve, reject) {
    this.db.run(
      'INSERT INTO playlist_tracks (playlist_id, music_id, position) VALUES (?, ?, ?)',
      [playlistId, musicId, position],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      }
    );
  }

  async removeTrackFromPlaylist(playlistId, musicId, userId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        DELETE FROM playlist_tracks 
        WHERE playlist_id = ? AND music_id = ?
      `;
      let params = [playlistId, musicId];

      // If userId provided, verify playlist ownership
      if (userId) {
        query = `
          DELETE FROM playlist_tracks 
          WHERE playlist_id = ? AND music_id = ? 
          AND EXISTS (SELECT 1 FROM playlists WHERE id = ? AND user_id = ?)
        `;
        params = [playlistId, musicId, playlistId, userId];
      }

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async updatePlaylist(playlistId, updates, userId = null) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }

      if (fields.length === 0) {
        resolve(false);
        return;
      }

      let query = `UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`;
      let params = [...values, playlistId];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async deletePlaylist(playlistId, userId = null) {
    return new Promise((resolve, reject) => {
      let query = 'DELETE FROM playlists WHERE id = ?';
      let params = [playlistId];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  async reorderPlaylistTracks(playlistId, trackOrders, userId = null) {
    return new Promise((resolve, reject) => {
      // Verify playlist ownership if userId provided
      if (userId) {
        this.db.get(
          'SELECT id FROM playlists WHERE id = ? AND user_id = ?',
          [playlistId, userId],
          (err, playlist) => {
            if (err) {
              reject(err);
            } else if (!playlist) {
              reject(new Error('Playlist not found or access denied'));
            } else {
              this._reorderPlaylistTracksInternal(playlistId, trackOrders, resolve, reject);
            }
          }
        );
      } else {
        this._reorderPlaylistTracksInternal(playlistId, trackOrders, resolve, reject);
      }
    });
  }

  _reorderPlaylistTracksInternal(playlistId, trackOrders, resolve, reject) {
    // Begin transaction
    this.db.serialize(() => {
      this.db.run('BEGIN TRANSACTION');

      let completed = 0;
      const total = trackOrders.length;

      if (total === 0) {
        this.db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve(true);
        });
        return;
      }

      trackOrders.forEach(({ musicId, position }) => {
        this.db.run(
          'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND music_id = ?',
          [position, playlistId, musicId],
          (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              completed++;
              if (completed === total) {
                this.db.run('COMMIT', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(true);
                  }
                });
              }
            }
          }
        );
      });
    });
  }

  // Get albums grouped with track count (optimized SQL query)
  async getAlbumsGrouped(userId = null) {
    return new Promise(async (resolve, reject) => {
      try {
        let query, params;
        const isAdmin = userId ? await this.isUserAdmin(userId) : false;

        if (userId && !isAdmin) {
          // Regular user: Show only albums from their library (user_library table)
          query = `
            SELECT 
              ml.album,
              ml.artist,
              COUNT(*) as trackCount,
              MAX(ml.album_cover) as albumCover
            FROM music_library ml
            INNER JOIN user_library ul ON ml.id = ul.music_id
            WHERE ul.user_id = ? AND ml.album IS NOT NULL
            GROUP BY LOWER(ml.album), LOWER(ml.artist)
            ORDER BY ml.album ASC
          `;
          params = [userId];
        } else {
          // Admin or no userId: Show ALL music
          query = `
            SELECT 
              album,
              artist,
              COUNT(*) as trackCount,
              MAX(album_cover) as albumCover
            FROM music_library
            WHERE album IS NOT NULL
            GROUP BY LOWER(album), LOWER(artist)
            ORDER BY album ASC
          `;
          params = [];
        }

        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get artists grouped with track counts (optimized SQL)
  async getArtistsGrouped(userId = null) {
    return new Promise(async (resolve, reject) => {
      try {
        let query, params;
        const isAdmin = userId ? await this.isUserAdmin(userId) : false;

        // Get MUSIC_PATH from environment (same as used in scanning)
        const musicBasePath = process.env.MUSIC_PATH || 'music';
        const musicFolderName = musicBasePath.split('/').pop(); // Extract last folder name

        if (userId && !isAdmin) {
          // Regular user: Get only tracks from their library (user_library table)
          query = `
            SELECT ml.file_path, ml.artist_image 
            FROM music_library ml
            INNER JOIN user_library ul ON ml.id = ul.music_id
            WHERE ul.user_id = ?
          `;
          params = [userId];
        } else {
          // Admin or no userId: Get ALL tracks
          query = `SELECT file_path, artist_image FROM music_library`;
          params = [];
        }

        this.db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          // Extract artist from file path using same logic as artworkService.js
          const artistGroups = {};

          rows.forEach(row => {
            let artistName = 'Unknown Artist';

            if (row.file_path) {
              const pathParts = row.file_path.split('/');
              // Find the music base folder in the path
              const musicIndex = pathParts.findIndex(part =>
                part === musicFolderName ||
                part === 'music' ||
                part === 'MusicLibrary'
              );

              // Artist folder is right after the base music folder
              if (musicIndex !== -1 && pathParts[musicIndex + 1]) {
                artistName = pathParts[musicIndex + 1];
              }
            }

            // Skip Unknown Artist
            if (artistName === 'Unknown Artist') return;

            const key = artistName.toLowerCase();
            if (!artistGroups[key]) {
              artistGroups[key] = {
                name: artistName,
                trackCount: 0,
                artistImage: null
              };
            }

            artistGroups[key].trackCount++;
            // Keep first non-null artist image
            if (row.artist_image && !artistGroups[key].artistImage) {
              artistGroups[key].artistImage = row.artist_image;
            }
          });

          // Convert to array and sort
          const result = Object.values(artistGroups).sort((a, b) =>
            a.name.localeCompare(b.name)
          );

          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Get all music files from database
  async getAllMusicFiles() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM music_library', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Update an existing music file
  async updateMusicFile(id, filePath, musicData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE music_library SET 
         file_path = ?, title = ?, artist = ?, album = ?, year = ?, 
         genre = ?, duration = ?, file_size = ?, bitrate = ?, 
         album_cover = COALESCE(?, album_cover), 
         artist_image = COALESCE(?, artist_image),
         added_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          filePath, musicData.title, musicData.artist, musicData.album,
          musicData.year, musicData.genre, musicData.duration,
          musicData.fileSize, musicData.bitrate,
          musicData.album_cover || null,
          musicData.artist_image || null,
          id
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  // Update just the file path (for folder renames)
  async updateMusicFilePath(id, newFilePath) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE music_library SET file_path = ?, added_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newFilePath, id],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  // ==================== STABLE_ID METHODS ====================

  /**
   * Get music by stable_id
   */
  async getMusicByStableId(stableId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM music_library WHERE stable_id = ?',
        [stableId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Get song relink history
   */
  async getRelinkHistory(stableId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          stable_id,
          original_artist,
          original_title,
          original_album,
          original_file_path,
          first_added_at,
          file_path as current_file_path,
          artist as current_artist,
          title as current_title,
          album as current_album,
          times_relinked,
          last_relinked_at,
          is_available,
          bitrate
         FROM music_library
         WHERE stable_id = ?`,
        [stableId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Manual relink - Updates file path while preserving stable_id AND original metadata
   */
  async manualRelink(stableId, newFilePath, updateCurrentMetadata = true) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
        // 1. Find song by stable_id
        const song = await self.getMusicByStableId(stableId);
        if (!song) {
          reject(new Error('Song not found'));
          return;
        }

        console.log(`🔗 Relinking song:`);
        console.log(`   Original: ${song.original_title} by ${song.original_artist}`);
        console.log(`   ID: ${stableId}`);
        console.log(`   Old path: ${song.file_path}`);
        console.log(`   New path: ${newFilePath}`);

        // 2. Parse new file metadata (optional)
        let newMetadata = {};
        if (updateCurrentMetadata) {
          try {
            const { parseFile } = await import('music-metadata');
            const metadata = await parseFile(newFilePath);
            const stat = fs.statSync(newFilePath);
            newMetadata = {
              title: metadata.common.title || song.title,
              artist: metadata.common.artist || song.artist,
              album: metadata.common.album || song.album,
              year: metadata.common.year || song.year,
              genre: metadata.common.genre ? metadata.common.genre.join(', ') : song.genre,
              duration: Math.round(metadata.format.duration || 0),
              fileSize: stat.size,
              bitrate: metadata.format.bitrate || null
            };
          } catch (metaError) {
            console.warn('Could not parse metadata, using existing:', metaError.message);
          }
        }

        // 3. Update file_path and CURRENT metadata
        //    KEEP stable_id, KEEP all original_* columns (never change)
        self.db.run(
          `UPDATE music_library 
           SET file_path = ?, 
               title = COALESCE(?, title),
               artist = COALESCE(?, artist),
               album = COALESCE(?, album),
               year = COALESCE(?, year),
               genre = COALESCE(?, genre),
               duration = COALESCE(?, duration),
               file_size = COALESCE(?, file_size),
               bitrate = COALESCE(?, bitrate),
               times_relinked = times_relinked + 1,
               last_relinked_at = CURRENT_TIMESTAMP,
               is_available = 1
           WHERE stable_id = ?`,
          [
            newFilePath,
            newMetadata.title,
            newMetadata.artist,
            newMetadata.album,
            newMetadata.year,
            newMetadata.genre,
            newMetadata.duration,
            newMetadata.fileSize,
            newMetadata.bitrate,
            stableId
          ],
          function (err) {
            if (err) {
              reject(err);
            } else {
              console.log(`✅ Relinked successfully`);
              console.log(`   Original metadata preserved:`);
              console.log(`   - Original Artist: ${song.original_artist}`);
              console.log(`   - Original Title: ${song.original_title}`);
              console.log(`   - Original Album: ${song.original_album}`);
              console.log(`   - Times Relinked: ${song.times_relinked + 1}`);
              
              // Log to history
              self.db.run(
                `INSERT INTO song_history (stable_id, action, old_file_path, new_file_path, notes)
                 VALUES (?, 'relinked', ?, ?, ?)`,
                [stableId, song.file_path, newFilePath, `Manual relink from ${song.file_path} to ${newFilePath}`],
                () => {} // Fire and forget
              );
              
              resolve({ 
                success: true, 
                changes: this.changes, 
                stable_id: stableId,
                original_info: {
                  artist: song.original_artist,
                  title: song.original_title,
                  album: song.original_album
                }
              });
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Store relink suggestion with original metadata context
   */
  async addRelinkSuggestion(stableId, suggestedPath, originalInfo, confidence = 'medium') {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO relink_suggestions 
         (stable_id, suggested_path, confidence, original_info, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(stable_id) DO UPDATE SET 
           suggested_path = excluded.suggested_path,
           confidence = excluded.confidence,
           original_info = excluded.original_info,
           updated_at = CURRENT_TIMESTAMP`,
        [stableId, suggestedPath, confidence, JSON.stringify(originalInfo)],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Mark song as unavailable (file missing) - preserves ALL metadata
   */
  async markAsUnavailable(stableId) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
        const song = await self.getMusicByStableId(stableId);
        if (!song) {
          reject(new Error('Song not found'));
          return;
        }

        console.log(`⚠️ Marking as unavailable:`);
        console.log(`   Original: ${song.original_title} by ${song.original_artist}`);
        console.log(`   ID: ${stableId}`);
        console.log(`   Last known path: ${song.file_path}`);

        self.db.run(
          `UPDATE music_library 
           SET is_available = 0, 
               last_unavailable_check = CURRENT_TIMESTAMP
           WHERE stable_id = ?`,
          [stableId],
          function (err) {
            if (err) reject(err);
            else resolve({ success: true, changes: this.changes });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Delete song by stable_id
   */
  async deleteByStableId(stableId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM music_library WHERE stable_id = ?',
        [stableId],
        function (err) {
          if (err) reject(err);
          else resolve({ success: true, changes: this.changes });
        }
      );
    });
  }

  /**
   * Get all duplicate groups
   */
  async getDuplicateGroups() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          LOWER(title) || '_' || LOWER(artist) as group_key,
          COUNT(*) as count,
          title,
          artist,
          GROUP_CONCAT(stable_id) as stable_ids,
          GROUP_CONCAT(file_path) as file_paths,
          GROUP_CONCAT(file_size) as file_sizes,
          GROUP_CONCAT(bitrate) as bitrates,
          GROUP_CONCAT(is_available) as availabilities
         FROM music_library
         GROUP BY LOWER(title), LOWER(artist)
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Parse concatenated values
            const groups = rows.map(row => ({
              title: row.title,
              artist: row.artist,
              count: row.count,
              songs: row.stable_ids.split(',').map((id, i) => ({
                stable_id: id,
                file_path: row.file_paths.split(',')[i],
                file_size: parseInt(row.file_sizes.split(',')[i]) || 0,
                bitrate: parseInt(row.bitrates.split(',')[i]) || 0,
                is_available: row.availabilities.split(',')[i] === '1'
              }))
            }));
            resolve(groups);
          }
        }
      );
    });
  }

  /**
   * Mark song as primary in duplicate group
   */
  async markAsPrimary(stableId) {
    const self = this;
    return new Promise(async (resolve, reject) => {
      try {
        // Get song
        const song = await self.getMusicByStableId(stableId);
        if (!song) {
          reject(new Error('Song not found'));
          return;
        }

        // Unmark all other versions as primary
        await new Promise((res, rej) => {
          self.db.run(
            `UPDATE music_library 
             SET is_primary = 0 
             WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)`,
            [song.title, song.artist],
            (err) => err ? rej(err) : res()
          );
        });

        // Mark this one as primary
        self.db.run(
          'UPDATE music_library SET is_primary = 1 WHERE stable_id = ?',
          [stableId],
          function (err) {
            if (err) reject(err);
            else resolve({ success: true });
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clear entire library (for rebuild mode)
   */
  async clearLibrary() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM music_library', function (err) {
        if (err) reject(err);
        else {
          console.log(`🗑️ Cleared ${this.changes} songs from library`);
          resolve(this.changes);
        }
      });
    });
  }

  // ==================== ANALYTICS METHODS ====================

  /**
   * Get analytics overview
   */
  async getAnalyticsOverview(startDate, endDate) {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      
      this.db.get(
        `SELECT 
          (SELECT COUNT(*) FROM users) as totalUsers,
          (SELECT COUNT(DISTINCT user_id) FROM access_logs WHERE DATE(accessed_at) = DATE('now')) as activeToday,
          (SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now')) as newUsersToday
        `,
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { totalUsers: 0, activeToday: 0, newUsersToday: 0 });
        }
      );
    });
  }

  /**
   * Get DAU (Daily Active Users) trend
   */
  async getDAUTrend(days = 30) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          DATE(accessed_at) as date,
          COUNT(DISTINCT user_id) as dau
         FROM access_logs
         WHERE accessed_at >= datetime('now', ?)
         GROUP BY DATE(accessed_at)
         ORDER BY date ASC`,
        [`-${days} days`],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get average session length
   */
  async getAvgSessionLength(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          AVG(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as avgDuration,
          COUNT(*) as totalSessions
         FROM user_sessions
         WHERE ended_at IS NOT NULL
           AND started_at >= ?
           AND started_at <= ?`,
        [startDate, endDate],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { avgDuration: 0, totalSessions: 0 });
        }
      );
    });
  }

  /**
   * Get average listen time per day
   */
  async getAvgListenTimePerDay(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          DATE(started_at) as date,
          SUM(duration_listened) as total_listen_time,
          COUNT(DISTINCT user_id) as unique_users,
          CASE WHEN COUNT(DISTINCT user_id) > 0 
            THEN SUM(duration_listened) / COUNT(DISTINCT user_id) 
            ELSE 0 
          END as avg_per_user
         FROM listen_events
         WHERE started_at >= ? AND started_at <= ?
         GROUP BY DATE(started_at)
         ORDER BY date ASC`,
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get skips per session
   */
  async getSkipsPerSession(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as totalSkips,
          (SELECT COUNT(*) FROM user_sessions WHERE started_at >= ? AND started_at <= ?) as totalSessions
         FROM listen_events
         WHERE skipped = 1
           AND started_at >= ?
           AND started_at <= ?`,
        [startDate, endDate, startDate, endDate],
        (err, row) => {
          if (err) reject(err);
          else {
            const totalSessions = row?.totalSessions || 1;
            resolve({
              totalSkips: row?.totalSkips || 0,
              avgSkipsPerSession: totalSessions > 0 ? Math.round((row?.totalSkips || 0) / totalSessions * 10) / 10 : 0
            });
          }
        }
      );
    });
  }

  /**
   * Get searches per user
   */
  async getSearchesPerUser(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          COUNT(*) as totalSearches,
          COUNT(DISTINCT user_id) as uniqueUsers
         FROM search_logs
         WHERE searched_at >= ? AND searched_at <= ?`,
        [startDate, endDate],
        (err, row) => {
          if (err) reject(err);
          else {
            const uniqueUsers = row?.uniqueUsers || 1;
            resolve({
              totalSearches: row?.totalSearches || 0,
              avgSearchesPerUser: uniqueUsers > 0 ? Math.round((row?.totalSearches || 0) / uniqueUsers * 10) / 10 : 0
            });
          }
        }
      );
    });
  }

  /**
   * Get most played artists with date filtering
   */
  async getMostPlayedArtists(limit = 10, startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
      // If we have listen_events, use them; otherwise fall back to play_count
      this.db.all(
        `SELECT 
          artist,
          SUM(play_count) as play_count,
          COUNT(*) as track_count
         FROM music_library
         WHERE artist IS NOT NULL AND artist != ''
         GROUP BY artist
         ORDER BY play_count DESC
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get retention rates
   */
  async getRetentionRates() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          DATE(created_at) as cohort_date,
          COUNT(*) as total_users,
          (SELECT COUNT(DISTINCT user_id) 
           FROM access_logs 
           WHERE DATE(accessed_at) = DATE(u.created_at, '+1 day')
             AND user_id IN (SELECT id FROM users WHERE DATE(created_at) = DATE(u.created_at))
          ) as day1_retained
         FROM users u
         WHERE created_at >= datetime('now', '-30 days')
         GROUP BY DATE(created_at)
         ORDER BY cohort_date DESC
         LIMIT 30`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else {
            const rates = (rows || []).map(r => ({
              ...r,
              day1_retention: r.total_users > 0 ? Math.round((r.day1_retained / r.total_users) * 100) : 0
            }));
            resolve(rates);
          }
        }
      );
    });
  }

  /**
   * Get retention cohorts
   */
  async getRetentionCohorts(cohortType = 'daily') {
    // Simplified cohort view
    return this.getRetentionRates();
  }

  /**
   * Get user acquisition sources
   */
  async getUserAcquisition(startDate, endDate) {
    return new Promise((resolve, reject) => {
      // Since we don't track acquisition source, return basic data
      this.db.all(
        `SELECT 'direct' as source, COUNT(*) as count
         FROM users
         WHERE created_at >= ? AND created_at <= ?`,
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get country breakdown from access logs
   */
  async getCountryBreakdown(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT country, COUNT(DISTINCT user_id) as count
         FROM access_logs
         WHERE accessed_at >= ? AND accessed_at <= ?
           AND country IS NOT NULL
         GROUP BY country
         ORDER BY count DESC
         LIMIT 10`,
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get traffic sources (referrer breakdown)
   */
  async getTrafficSources(days = 30) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          COALESCE(referrer_domain, 'Direct') as source,
          COUNT(*) as visits,
          COUNT(DISTINCT user_id) as unique_users
         FROM access_logs
         WHERE accessed_at >= datetime('now', ?)
         GROUP BY COALESCE(referrer_domain, 'Direct')
         ORDER BY visits DESC
         LIMIT 15`,
        [`-${days} days`],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Get detailed source breakdown with categorization
   */
  async getDetailedSourceBreakdown(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          referrer_domain,
          referrer,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users
         FROM access_logs
         WHERE accessed_at >= ? AND accessed_at <= ?
           AND referrer_domain IS NOT NULL
         GROUP BY referrer_domain
         ORDER BY count DESC
         LIMIT 20`,
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else {
            // Categorize sources
            const categorized = (rows || []).map(row => {
              let category = 'Other';
              const domain = (row.referrer_domain || '').toLowerCase();
              
              if (domain.includes('google') || domain.includes('bing') || domain.includes('yahoo') || domain.includes('duckduckgo')) {
                category = 'Search Engine';
              } else if (domain.includes('facebook') || domain.includes('twitter') || domain.includes('instagram') || domain.includes('tiktok') || domain.includes('linkedin')) {
                category = 'Social Media';
              } else if (domain.includes('reddit')) {
                category = 'Reddit';
              } else if (domain.includes('youtube')) {
                category = 'YouTube';
              } else if (domain.includes('discord')) {
                category = 'Discord';
              } else if (domain === '') {
                category = 'Direct';
              }
              
              return { ...row, category };
            });
            
            resolve(categorized);
          }
        }
      );
    });
  }

  /**
   * Get sessions per user per day
   */
  async getSessionsPerUserPerDay(startDate, endDate) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          DATE(started_at) as date,
          COUNT(*) as total_sessions,
          COUNT(DISTINCT user_id) as unique_users,
          CAST(COUNT(*) AS FLOAT) / NULLIF(COUNT(DISTINCT user_id), 0) as sessions_per_user
         FROM user_sessions
         WHERE started_at >= ? AND started_at <= ?
         GROUP BY DATE(started_at)
         ORDER BY date ASC`,
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  /**
   * Create a user session
   */
  async createSession(userId, sessionToken, ipAddress, country, device, userAgent) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_sessions (user_id, session_token, ip_address, country, device, user_agent, started_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, sessionToken, ipAddress, country, device, userAgent],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Update session heartbeat
   */
  async updateSessionHeartbeat(sessionToken) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE user_sessions SET last_heartbeat = datetime('now') WHERE session_token = ?`,
        [sessionToken],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * End a session
   */
  async endSession(sessionToken) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE user_sessions SET ended_at = datetime('now') WHERE session_token = ?`,
        [sessionToken],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Log listen start
   */
  async logListenStart(userId, musicId, sessionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO listen_events (user_id, music_id, session_id, started_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [userId, musicId, sessionId],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  /**
   * Log listen end
   */
  async logListenEnd(listenEventId, durationListened, completed, skipped, skipPosition) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE listen_events 
         SET ended_at = datetime('now'),
             duration_listened = ?,
             completed = ?,
             skipped = ?,
             skip_position = ?
         WHERE id = ?`,
        [durationListened, completed ? 1 : 0, skipped ? 1 : 0, skipPosition, listenEventId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Log a search
   */
  async logSearch(userId, query, resultsCount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO search_logs (user_id, query, results_count, searched_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [userId, query, resultsCount],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }
}

export default Database;
