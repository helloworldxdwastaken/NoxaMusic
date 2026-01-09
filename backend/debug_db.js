
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data/musicstream.db');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

db.serialize(() => {
    console.log("=== DATABASE STATE ===");

    db.get("SELECT COUNT(*) as count FROM music_library", (err, row) => {
        console.log("Total songs in music_library:", row.count);
    });

    db.get("SELECT COUNT(*) as count FROM user_library", (err, row) => {
        console.log("Total links in user_library:", row.count);
    });

    db.get("SELECT COUNT(*) as count FROM playlists", (err, row) => {
        console.log("Total playlists:", row.count);
    });

    console.log("\n--- USER 3 (tokyo) STATS ---");
    db.get("SELECT username, is_admin FROM users WHERE id = 3", (err, row) => {
        console.log("User 3 Info:", row);
    });

    db.get("SELECT COUNT(*) as count FROM user_library WHERE user_id = 3", (err, row) => {
        console.log("Songs favored by User 3:", row.count);
    });

    db.get("SELECT COUNT(*) as count FROM music_library WHERE user_id = 3", (err, row) => {
        console.log("Songs owned by User 3 (metadata):", row.count);
    });

    db.get("SELECT COUNT(*) as count FROM playlists WHERE user_id = 3", (err, row) => {
        console.log("Playlists owned by User 3:", row.count);
    });

    console.log("\n--- LAST 5 ACCESS LOGS ---");
    db.all("SELECT username, ip_address, accessed_at FROM access_logs ORDER BY accessed_at DESC LIMIT 5", (err, rows) => {
        console.table(rows);
    });
});
