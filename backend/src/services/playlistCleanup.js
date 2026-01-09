/**
 * Playlist Cleanup Service
 * Tries to reconnect orphaned playlist tracks to existing songs, or removes them if no match found
 */

export async function cleanupOrphanedPlaylistTracks(database) {
  console.log('🧹 Starting smart playlist cleanup...');
  
  try {
    // Find all orphaned playlist tracks with their original metadata
    const orphanedTracks = await new Promise((resolve, reject) => {
      database.db.all(`
        SELECT 
          pt.id as pt_id,
          pt.playlist_id,
          pt.music_id as old_music_id,
          pt.position,
          p.name as playlist_name,
          ml_deleted.title,
          ml_deleted.artist,
          ml_deleted.album
        FROM playlist_tracks pt
        LEFT JOIN music_library m ON pt.music_id = m.id
        LEFT JOIN playlists p ON pt.playlist_id = p.id
        LEFT JOIN music_library ml_deleted ON pt.music_id = ml_deleted.id
        WHERE m.id IS NULL
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    if (orphanedTracks.length === 0) {
      console.log('✅ No orphaned playlist tracks found');
      return { removed: 0, reconnected: 0, byPlaylist: {} };
    }
    
    console.log(`🔍 Found ${orphanedTracks.length} orphaned playlist tracks`);
    console.log('🔗 Attempting to reconnect tracks by matching artist + title...');
    
    let reconnected = 0;
    let removed = 0;
    const byPlaylist = {};
    const reconnectedByPlaylist = {};
    
    // Try to match each orphaned track to an existing song
    for (const track of orphanedTracks) {
      const playlistName = track.playlist_name || 'Unknown Playlist';
      
      // Initialize counters
      if (!byPlaylist[playlistName]) {
        byPlaylist[playlistName] = { removed: 0, reconnected: 0 };
      }
      
      // Try to find a matching song in the current library by artist + title
      const matchingSong = await new Promise((resolve, reject) => {
        database.db.get(`
          SELECT id, title, artist, file_path
          FROM music_library
          WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)
          LIMIT 1
        `, [track.title, track.artist], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (matchingSong) {
        // Found a match! Update the playlist_tracks to point to the new music_id
        await new Promise((resolve, reject) => {
          database.db.run(`
            UPDATE playlist_tracks
            SET music_id = ?
            WHERE id = ?
          `, [matchingSong.id, track.pt_id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log(`   ✅ Reconnected: "${track.title}" by ${track.artist} (${track.old_music_id} → ${matchingSong.id})`);
        reconnected++;
        byPlaylist[playlistName].reconnected++;
      } else {
        // No match found - remove the orphaned track
        await new Promise((resolve, reject) => {
          database.db.run(`
            DELETE FROM playlist_tracks WHERE id = ?
          `, [track.pt_id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log(`   🗑️ Removed: "${track.title}" by ${track.artist} (no match found)`);
        removed++;
        byPlaylist[playlistName].removed++;
      }
    }
    
    console.log(`\n📊 Cleanup summary:`);
    console.log(`   ✅ Reconnected: ${reconnected} tracks`);
    console.log(`   🗑️ Removed: ${removed} tracks`);
    console.log(`\n📋 By playlist:`);
    Object.entries(byPlaylist).forEach(([name, counts]) => {
      if (counts.reconnected > 0 || counts.removed > 0) {
        console.log(`   ${name}: ${counts.reconnected} reconnected, ${counts.removed} removed`);
      }
    });
    
    return { 
      removed, 
      reconnected,
      total: orphanedTracks.length,
      byPlaylist 
    };
    
  } catch (error) {
    console.error('❌ Error cleaning up orphaned playlist tracks:', error);
    throw error;
  }
}

/**
 * Get statistics about orphaned tracks without removing them
 */
export async function getOrphanedTracksStats(database) {
  try {
    const orphanedTracks = await new Promise((resolve, reject) => {
      database.db.all(`
        SELECT pt.id, pt.playlist_id, pt.music_id, p.name as playlist_name
        FROM playlist_tracks pt
        LEFT JOIN music_library m ON pt.music_id = m.id
        LEFT JOIN playlists p ON pt.playlist_id = p.id
        WHERE m.id IS NULL
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    const byPlaylist = {};
    orphanedTracks.forEach(track => {
      const playlistName = track.playlist_name || 'Unknown Playlist';
      if (!byPlaylist[playlistName]) byPlaylist[playlistName] = 0;
      byPlaylist[playlistName]++;
    });
    
    return {
      totalOrphaned: orphanedTracks.length,
      byPlaylist
    };
  } catch (error) {
    console.error('Error getting orphaned tracks stats:', error);
    throw error;
  }
}

