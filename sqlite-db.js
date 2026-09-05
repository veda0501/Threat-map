const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Configurable DB path: Render Persistent Disk, env var, or local fallback
const dbDir = process.env.DB_DIR || __dirname;
const dbPath = process.env.DB_PATH || path.join(dbDir, 'threats.db');

// Ensure the directory exists (critical for Persistent Disk mounts)
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Promisified DB helpers
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function initializeDatabase() {
    return dbRun(`
        CREATE TABLE IF NOT EXISTS threats (
            threatId TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            eventTime TEXT,
            location TEXT,
            category TEXT,
            severity TEXT,
            status TEXT,
            impactedSectors TEXT,
            indicators TEXT,
            sources TEXT,
            confidence INTEGER,
            secondaryTags TEXT,
            relatedThreats TEXT,
            createdAt TEXT,
            updatedAt TEXT
        )
    `).then(() => {
        // Create indexes
        return Promise.all([
            dbRun('CREATE INDEX IF NOT EXISTS idx_threats_category ON threats (category)'),
            dbRun('CREATE INDEX IF NOT EXISTS idx_threats_severity ON threats (severity)'),
            dbRun('CREATE INDEX IF NOT EXISTS idx_threats_eventTime ON threats (eventTime DESC)'),
            dbRun('CREATE INDEX IF NOT EXISTS idx_threats_status ON threats (status)')
        ]);
    }).then(() => {
        return dbRun(`
            CREATE TABLE IF NOT EXISTS rss_feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT UNIQUE,
                name TEXT,
                enabled INTEGER DEFAULT 1,
                createdAt TEXT,
                updatedAt TEXT
            )
        `);
    }).then(async () => {
        try {
            const countRow = await dbGet('SELECT COUNT(*) as count FROM rss_feeds');
            if (countRow.count === 0) {
                const defaultFeeds = [
                    { name: 'WHO Disease Outbreaks', url: process.env.WHO_DON_URL || 'https://www.who.int/feeds/entity/csr/don/en/rss.xml' },
                    { name: 'CDC Media Advisories', url: process.env.CDC_RSS_URL || 'https://tools.cdc.gov/api/v2/resources/media/403372.rss' },
                    { name: 'New York Times World', url: process.env.NEW_YORK_TIMES_WORLD_RSS_URL || 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
                    { name: 'BBC News World', url: process.env.BBC_WORLD_RSS_URL || 'https://feeds.bbci.co.uk/news/world/rss.xml' },
                    { name: 'UN News All', url: process.env.UN_NEWS_RSS_URL || 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' }
                ];
                for (const feed of defaultFeeds) {
                    const now = new Date().toISOString();
                    await dbRun(
                        'INSERT OR IGNORE INTO rss_feeds (name, url, enabled, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)',
                        [feed.name, feed.url, now, now]
                    );
                }
                console.log('✓ Seeded default RSS feeds into SQLite database');
            }
        } catch (err) {
            console.error('Error seeding default RSS feeds:', err.message);
        }
    });
}

const threatsCollection = {
    // Expose the init function to initialize SQLite database
    init: async function () {
        await initializeDatabase();
    },

    createIndex: async function () {
        // Indexes are handled in initializeDatabase
        return true;
    },

    findOne: async function (query) {
        if (!query || typeof query !== 'object') return null;
        if (query.threatId) {
            const row = await dbGet('SELECT * FROM threats WHERE threatId = ?', [query.threatId]);
            return mapRowToThreat(row);
        }
        const keys = Object.keys(query);
        if (keys.length === 0) {
            const row = await dbGet('SELECT * FROM threats LIMIT 1');
            return mapRowToThreat(row);
        }
        const whereClauses = [];
        const params = [];
        for (const key of keys) {
            whereClauses.push(`${key} = ?`);
            params.push(query[key]);
        }
        const row = await dbGet(`SELECT * FROM threats WHERE ${whereClauses.join(' AND ')} LIMIT 1`, params);
        return mapRowToThreat(row);
    },

    insertOne: async function (doc) {
        if (!doc) throw new Error('Cannot insert null document');
        const row = mapThreatToRow(doc);
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT OR REPLACE INTO threats (${keys.join(', ')}) VALUES (${placeholders})`;
        const params = keys.map(k => row[k]);
        await dbRun(sql, params);
        return { insertedId: doc.threatId || doc._id };
    },

    updateOne: async function (query, update) {
        if (!query || !update || !update.$set) return;
        const setKeys = Object.keys(update.$set);
        if (setKeys.length === 0) return;

        const setClauses = [];
        const params = [];

        const jsonFields = ['location', 'sources', 'impactedSectors', 'indicators', 'secondaryTags', 'relatedThreats'];
        for (const key of setKeys) {
            setClauses.push(`${key} = ?`);
            let val = update.$set[key];
            if (jsonFields.includes(key)) {
                val = JSON.stringify(val);
            }
            params.push(val);
        }

        // Build WHERE clause
        const whereKeys = Object.keys(query);
        const whereClauses = [];
        for (const key of whereKeys) {
            whereClauses.push(`${key} = ?`);
            params.push(query[key]);
        }

        const sql = `UPDATE threats SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
        await dbRun(sql, params);
    },

    updateMany: async function (query, update) {
        if (!query || !update || !update.$set) return;
        const setKeys = Object.keys(update.$set);
        if (setKeys.length === 0) return;

        const setClauses = [];
        const params = [];

        const jsonFields = ['location', 'sources', 'impactedSectors', 'indicators', 'secondaryTags', 'relatedThreats'];
        for (const key of setKeys) {
            setClauses.push(`${key} = ?`);
            let val = update.$set[key];
            if (jsonFields.includes(key)) {
                val = JSON.stringify(val);
            }
            params.push(val);
        }

        // Parse query filters
        const whereClauses = [];
        const queryKeys = Object.keys(query);
        for (const key of queryKeys) {
            const val = query[key];
            if (val && typeof val === 'object') {
                if ('$lt' in val) {
                    whereClauses.push(`${key} < ?`);
                    params.push(val.$lt);
                }
                if ('$ne' in val) {
                    whereClauses.push(`${key} != ?`);
                    params.push(val.$ne);
                }
            } else {
                whereClauses.push(`${key} = ?`);
                params.push(val);
            }
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const sql = `UPDATE threats SET ${setClauses.join(', ')} ${whereSql}`;
        await dbRun(sql, params);
    },

    find: function (query = {}) {
        let sortObj = null;
        let limitVal = null;

        const cursor = {
            sort: function (s) {
                sortObj = s;
                return this;
            },
            limit: function (l) {
                limitVal = l;
                return this;
            },
            toArray: async function () {
                const whereClauses = [];
                const params = [];

                const queryKeys = Object.keys(query);
                for (const key of queryKeys) {
                    if (key === '$or') {
                        const orClauses = [];
                        for (const orObj of query.$or) {
                            const subKeys = Object.keys(orObj);
                            for (const subKey of subKeys) {
                                const subVal = orObj[subKey];
                                if (subVal && subVal.$regex) {
                                    orClauses.push(`${subKey} LIKE ?`);
                                    params.push(`%${subVal.$regex}%`);
                                } else {
                                    orClauses.push(`${subKey} = ?`);
                                    params.push(subVal);
                                }
                            }
                        }
                        if (orClauses.length > 0) {
                            whereClauses.push(`(${orClauses.join(' OR ')})`);
                        }
                    } else {
                        const val = query[key];
                        if (val && typeof val === 'object') {
                            if ('$lt' in val) {
                                whereClauses.push(`${key} < ?`);
                                params.push(val.$lt);
                            }
                            if ('$ne' in val) {
                                whereClauses.push(`${key} != ?`);
                                params.push(val.$ne);
                            }
                        } else {
                            whereClauses.push(`${key} = ?`);
                            params.push(val);
                        }
                    }
                }

                let sql = 'SELECT * FROM threats';
                if (whereClauses.length > 0) {
                    sql += ` WHERE ${whereClauses.join(' AND ')}`;
                }

                if (sortObj) {
                    const sortKeys = Object.keys(sortObj);
                    if (sortKeys.length > 0) {
                        const orderClauses = sortKeys.map(k => {
                            const dir = sortObj[k] < 0 ? 'DESC' : 'ASC';
                            return `${k} ${dir}`;
                        });
                        sql += ` ORDER BY ${orderClauses.join(', ')}`;
                    }
                }

                if (limitVal !== null && limitVal !== undefined) {
                    sql += ' LIMIT ?';
                    params.push(limitVal);
                }

                const rows = await dbAll(sql, params);
                return rows.map(mapRowToThreat).filter(Boolean);
            }
        };

        return cursor;
    }
};

function mapRowToThreat(row) {
    if (!row) return null;
    try {
        return {
            threatId: row.threatId,
            title: row.title,
            description: row.description,
            eventTime: row.eventTime,
            category: row.category,
            severity: row.severity,
            status: row.status,
            confidence: row.confidence,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            location: row.location ? JSON.parse(row.location) : null,
            sources: row.sources ? JSON.parse(row.sources) : [],
            impactedSectors: row.impactedSectors ? JSON.parse(row.impactedSectors) : [],
            indicators: row.indicators ? JSON.parse(row.indicators) : [],
            secondaryTags: row.secondaryTags ? JSON.parse(row.secondaryTags) : [],
            relatedThreats: row.relatedThreats ? JSON.parse(row.relatedThreats) : []
        };
    } catch (err) {
        console.error('Error mapping database row to threat:', err, row);
        return null;
    }
}

function mapThreatToRow(threat) {
    if (!threat) return null;
    return {
        threatId: threat.threatId,
        title: threat.title,
        description: threat.description,
        eventTime: threat.eventTime,
        category: threat.category,
        severity: threat.severity,
        status: threat.status,
        confidence: threat.confidence,
        createdAt: threat.createdAt,
        updatedAt: threat.updatedAt,
        location: threat.location ? JSON.stringify(threat.location) : null,
        sources: threat.sources ? JSON.stringify(threat.sources) : null,
        impactedSectors: threat.impactedSectors ? JSON.stringify(threat.impactedSectors) : null,
        indicators: threat.indicators ? JSON.stringify(threat.indicators) : null,
        secondaryTags: threat.secondaryTags ? JSON.stringify(threat.secondaryTags) : null,
        relatedThreats: threat.relatedThreats ? JSON.stringify(threat.relatedThreats) : null
    };
}

const rssFeeds = {
    find: async function (query = {}) {
        let sql = 'SELECT * FROM rss_feeds';
        const params = [];
        const whereClauses = [];
        if (query.hasOwnProperty('enabled')) {
            whereClauses.push('enabled = ?');
            params.push(query.enabled);
        }
        if (whereClauses.length > 0) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        sql += ' ORDER BY id ASC';
        return dbAll(sql, params);
    },

    insertOne: async function (doc) {
        if (!doc || !doc.url) throw new Error('Cannot insert feed: URL is required');
        const now = new Date().toISOString();
        const sql = `INSERT OR IGNORE INTO rss_feeds (url, name, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`;
        const params = [doc.url, doc.name || doc.url, doc.enabled ?? 1, doc.createdAt || now, doc.updatedAt || now];
        const result = await dbRun(sql, params);
        return result.lastID;
    },

    deleteOne: async function (id) {
        if (!id) throw new Error('Cannot delete feed: ID is required');
        await dbRun('DELETE FROM rss_feeds WHERE id = ?', [id]);
        return true;
    },

    updateOne: async function (id, update) {
        if (!id) throw new Error('Cannot update feed: ID is required');
        const setClauses = [];
        const params = [];
        const keys = Object.keys(update);
        for (const key of keys) {
            setClauses.push(`${key} = ?`);
            params.push(update[key]);
        }
        params.push(new Date().toISOString());
        params.push(id);
        const sql = `UPDATE rss_feeds SET ${setClauses.join(', ')}, updatedAt = ? WHERE id = ?`;
        await dbRun(sql, params);
        return true;
    }
};

threatsCollection.rssFeeds = rssFeeds;

// Expose raw SQL query helper for aggregation
threatsCollection.rawQuery = dbAll;

module.exports = threatsCollection;
