require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');

const dbPath = process.env.DB_PATH || path.join(process.env.DB_DIR || __dirname, 'threats.db');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) are required');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

function readAll(db, sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function mapThreat(row) {
    return {
        threatId: row.threatId, title: row.title, description: row.description,
        eventTime: row.eventTime, location: parseJson(row.location, null),
        category: row.category, severity: row.severity, status: row.status,
        impactedSectors: parseJson(row.impactedSectors, []),
        indicators: parseJson(row.indicators, []), sources: parseJson(row.sources, []),
        confidence: row.confidence, secondaryTags: parseJson(row.secondaryTags, []),
        relatedThreats: parseJson(row.relatedThreats, []), createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

async function upsertInBatches(table, rows, conflictColumn) {
    for (let offset = 0; offset < rows.length; offset += 500) {
        const batch = rows.slice(offset, offset + 500);
        const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictColumn });
        if (error) {
            if (error.message.includes('Could not find the table')) {
                throw new Error(`Supabase table "${table}" is missing. Run supabase-schema.sql in the Supabase SQL Editor, then retry.`);
            }
            throw new Error(`Failed migrating ${table}: ${error.message}`);
        }
        console.log(`Migrated ${Math.min(offset + batch.length, rows.length)}/${rows.length} ${table}`);
    }
}

async function run() {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    try {
        const threats = (await readAll(db, 'SELECT * FROM threats')).map(mapThreat);
        const feeds = (await readAll(db, 'SELECT * FROM rss_feeds')).map(feed => ({
            id: feed.id, url: feed.url, name: feed.name, enabled: Boolean(feed.enabled),
            createdAt: feed.createdAt, updatedAt: feed.updatedAt
        }));
        await upsertInBatches('threats', threats, 'threatId');
        await upsertInBatches('rss_feeds', feeds, 'url');
        console.log(`Migration complete: ${threats.length} threats and ${feeds.length} RSS feeds copied from ${dbPath}`);
    } finally { db.close(); }
}

run().catch(error => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
});