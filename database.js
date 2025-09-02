const sqlite3 = require('sqlite3').verbose();
const DB_FILE = 'axe_results.db';

const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');
});

const initDb = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            violations INTEGER NOT NULL,
            passes INTEGER NOT NULL,
            incomplete INTEGER NOT NULL,
            result_json TEXT NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS scheduled_urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL UNIQUE
        )`, (err) => {
            if (err) {
                console.error("Error creating scheduled_urls table:", err);
                return;
            }
            // Now, check if the config_json column exists and add it if it doesn't
            db.all("PRAGMA table_info(scheduled_urls)", (err, columns) => {
                if (err) {
                    console.error("Error checking table info for scheduled_urls:", err);
                    return;
                }
                const hasConfigJson = columns.some(col => col.name === 'config_json');
                if (!hasConfigJson) {
                    db.run("ALTER TABLE scheduled_urls ADD COLUMN config_json TEXT", (err) => {
                        if (err) {
                            console.error("Error adding config_json column to scheduled_urls:", err);
                        }
                    });
                }
            });
        });
    });
};

const addResult = (result) => {
    return new Promise((resolve, reject) => {
        const { url, timestamp, violations, passes, incomplete } = result;
        const resultJson = JSON.stringify(result);
        const stmt = `INSERT INTO results (url, timestamp, violations, passes, incomplete, result_json) VALUES (?, ?, ?, ?, ?, ?)`;

        const violationCount = violations ? violations.length : 0;
        const passCount = passes ? passes.length : 0;
        const incompleteCount = incomplete ? incomplete.length : 0;

        db.run(stmt, [url, timestamp, violationCount, passCount, incompleteCount, resultJson], function(err) {
            if (err) {
                console.error('DB Error on insert:', err.message);
                reject(err);
            } else {
                resolve({ id: this.lastID });
            }
        });
    });
};

const getAllResults = () => {
    return new Promise((resolve, reject) => {
        const query = `SELECT id, url, timestamp, violations, passes, incomplete FROM results ORDER BY timestamp DESC`;
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            }
            resolve(rows);
        });
    });
};

const getResultById = (id) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT result_json FROM results WHERE id = ?`;
        db.get(query, [id], (err, row) => {
            if (err) {
                return reject(err);
            }
            if (!row) {
                return resolve(null);
            }
            try {
                resolve(JSON.parse(row.result_json));
            } catch (e) {
                console.error(`Error parsing result_json for id ${id}:`, e);
                reject(e);
            }
        });
    });
};

const addScheduledUrl = (url, config) => {
    return new Promise((resolve, reject) => {
        const stmt = `INSERT INTO scheduled_urls (url, config_json) VALUES (?, ?)`;
        const configJson = JSON.stringify(config || {});
        db.run(stmt, [url, configJson], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, url, config });
            }
        });
    });
};

const removeScheduledUrl = (id) => {
    return new Promise((resolve, reject) => {
        const stmt = `DELETE FROM scheduled_urls WHERE id = ?`;
        db.run(stmt, [id], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ changes: this.changes });
            }
        });
    });
};

const getAllScheduledUrls = () => {
    return new Promise((resolve, reject) => {
        const query = `SELECT id, url, config_json FROM scheduled_urls ORDER BY id DESC`;
        db.all(query, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            if (!rows) {
                return resolve([]);
            }
            try {
                const urls = rows.map(row => {
                    let config = {};
                    if (row.config_json) {
                        try {
                            config = JSON.parse(row.config_json);
                        } catch (e) {
                            console.error(`Error parsing config for URL id ${row.id}:`, e);
                            // If config is invalid, proceed with an empty config object
                        }
                    }
                    return {
                        id: row.id,
                        url: row.url,
                        config: config,
                    };
                });
                resolve(urls);
            } catch (e) {
                reject(e);
            }
        });
    });
};

const updateScheduledUrlConfig = (id, config) => {
    return new Promise((resolve, reject) => {
        const stmt = `UPDATE scheduled_urls SET config_json = ? WHERE id = ?`;
        const configJson = JSON.stringify(config || {});
        db.run(stmt, [configJson, id], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ changes: this.changes });
            }
        });
    });
};

module.exports = { db, initDb, addResult, getAllResults, getResultById, addScheduledUrl, removeScheduledUrl, getAllScheduledUrls, updateScheduledUrlConfig };
