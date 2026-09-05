require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const threatsCollection = require('./supabase-db');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

app.get('/api/config', (req, res) => {
    res.json({ cartoBasemapKey: process.env.CARTO_BASEMAP_KEY || '' });
});

// Serve the default UI page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files but exclude sensitive files
app.use(express.static(__dirname, {
    dotfiles: 'ignore'
}));

// Database connection
async function connectToDatabase() {
    try {
        await threatsCollection.init();
        console.log('Connected to Supabase');
    } catch (error) {
        console.error('Supabase connection error:', error.message);
        process.exit(1);
    }
}

// Import OSINT collectors
const osintCollector = require('./osint-collector');
const threatProcessor = require('./threat-processor');
const { inferLocationFromText } = require('./location-helper');

function titleCase(value) {
    if (!value) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function inferCoordinates(locationText = '') {
    const text = String(locationText).toLowerCase();
    if (text.includes('qatar')) return [25.2854, 51.5310];
    if (text.includes('bahrain') || text.includes('manama')) return [26.2235, 50.5876];
    return [32.4279, 53.6880];
}

function inferSeverity(attackType = '') {
    const value = String(attackType).toLowerCase();
    if (value.includes('missile') || value.includes('airstrike') || value.includes('drone')) return 'High';
    if (value.includes('explosion') || value.includes('shoot')) return 'Medium';
    return 'Low';
}

function normalizeEventTime(rawDate) {
    const raw = String(rawDate || '').trim();
    if (!raw || raw.toLowerCase().includes('unknown')) return new Date().toISOString();
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function extractJsonObjects(text = '') {
    const objects = [];
    const input = String(text);
    let depth = 0;
    let start = -1;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];
        if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '}') {
            if (depth > 0) depth--;
            if (depth === 0 && start !== -1) {
                const candidate = input.slice(start, i + 1);
                try {
                    const parsed = JSON.parse(candidate);
                    if (parsed && typeof parsed === 'object') objects.push(parsed);
                } catch (_) {
                    // Ignore malformed JSON fragments.
                }
                start = -1;
            }
        }
    }

    return objects;
}

function buildThreatFromCsvRow(row, index) {
    const city = (row[0] || '').trim();
    const province = (row[1] || '').trim();
    const count = parseInt((row[2] || '').trim(), 10);
    const attackType = (row[3] || '').trim();
    const eventDate = (row[4] || '').trim();
    const description = (row[5] || '').trim();

    if (!description) return null;
    if (!city && !province) return null;
    if (!Number.isFinite(count) || count <= 0) return null;
    if (description.length < 30 || description.length > 1400) return null;

    const lowered = description.toLowerCase();
    if (lowered.startsWith('total unique locations attacked') || lowered.startsWith('list of attacks')) return null;
    const threatKeywordPattern = /(attack|airstrike|missile|explosion|drone|targeted|destroyed|reported)/i;
    if (!threatKeywordPattern.test(description) && !threatKeywordPattern.test(attackType)) return null;

    const rowLocation = [city, province].filter(Boolean).join(', ') || 'Iran';
    const eventTime = normalizeEventTime(eventDate);

    return {
        threatId: `CSV-IRN-${String(index + 1).padStart(4, '0')}`,
        title: `${attackType || 'Attack'} reported near ${rowLocation}`,
        description,
        eventTime,
        location: inferLocationFromText(rowLocation),
        category: 'War',
        severity: inferSeverity(attackType),
        status: 'emerging',
        impactedSectors: ['Security'],
        indicators: [attackType || 'Unknown Type'].filter(Boolean),
        sources: [{
            name: 'Iran War CSV',
            url: 'local-csv://20260219_Iran_War - Sheet1.csv',
            reliability: 'medium'
        }],
        confidence: 70,
        secondaryTags: [titleCase(province || city || 'Iran')],
        relatedThreats: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function buildThreatFromEmbeddedJson(obj, index) {
    const coords = obj.location?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null;

    const countryOrProvince = obj.location?.province || obj.location?.city || 'Iran';
    return {
        threatId: obj.threat_id || `CSV-JSON-${String(index + 1).padStart(4, '0')}`,
        title: obj.attack_type
            ? `${obj.attack_type} near ${obj.location?.city || countryOrProvince}`
            : (obj.details || `Threat near ${obj.location?.city || countryOrProvince}`).slice(0, 120),
        description: obj.details || 'Threat imported from CSV embedded JSON.',
        eventTime: normalizeEventTime(obj.timestamp),
        location: {
            country: /qatar/i.test(countryOrProvince) ? 'Qatar' : /bahrain/i.test(countryOrProvince) ? 'Bahrain' : 'Iran',
            coordinates: coords
        },
        category: 'War',
        severity: titleCase(obj.severity || 'High'),
        status: 'emerging',
        impactedSectors: ['Security'],
        indicators: [obj.attack_type || 'Unknown Type'].filter(Boolean),
        sources: [{
            name: 'Iran War CSV',
            url: 'local-csv://20260219_Iran_War - Sheet1.csv',
            reliability: titleCase(obj.confidence || 'medium').toLowerCase() === 'high' ? 'high' : 'medium'
        }],
        confidence: titleCase(obj.confidence || '').toLowerCase() === 'high' ? 85 : 70,
        secondaryTags: [titleCase(obj.location?.province || '')].filter(Boolean),
        relatedThreats: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

async function importThreatsFromCsv() {
    const csvFile = path.join(__dirname, '20260219_Iran_War - Sheet1.csv');
    if (!fs.existsSync(csvFile)) {
        console.log('↷ CSV import skipped: file not found');
        return;
    }

    try {
        const csvContent = fs.readFileSync(csvFile, 'utf8');
        const parsedRows = parse(csvContent, {
            relax_quotes: true,
            relax_column_count: true,
            skip_empty_lines: false
        });

        const importedById = new Set();
        let importedCount = 0;

        for (let i = 0; i < parsedRows.length; i++) {
            const row = parsedRows[i];
            if (!Array.isArray(row) || row.length < 6) continue;

            const basicThreat = buildThreatFromCsvRow(row, i);
            if (basicThreat && !importedById.has(basicThreat.threatId)) {
                const exists = await threatsCollection.findOne({ threatId: basicThreat.threatId });
                if (!exists) {
                    await threatsCollection.insertOne(basicThreat);
                    importedById.add(basicThreat.threatId);
                    importedCount++;
                }
            }

            const embeddedObjects = extractJsonObjects(row[5]);
            for (let j = 0; j < embeddedObjects.length; j++) {
                const threatFromJson = buildThreatFromEmbeddedJson(embeddedObjects[j], j);
                if (!threatFromJson || importedById.has(threatFromJson.threatId)) continue;

                const exists = await threatsCollection.findOne({ threatId: threatFromJson.threatId });
                if (!exists) {
                    await threatsCollection.insertOne(threatFromJson);
                    importedById.add(threatFromJson.threatId);
                    importedCount++;
                }
            }
        }

        console.log(`✓ CSV import complete: ${importedCount} threats inserted`);
    } catch (error) {
        console.error('✗ CSV import failed:', error.message);
    }
}

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// REST API Routes

// Get all threats
app.get('/api/threats', async (req, res) => {
    try {
        const { category, severity, status, limit = 100 } = req.query;

        let query = {};
        if (category) query.category = category;
        if (severity) query.severity = severity;
        if (status) query.status = status;

        const threats = await threatsCollection
            .find(query)
            .sort({ eventTime: -1 })
            .limit(parseInt(limit))
            .toArray();

        res.json({ success: true, threats });
    } catch (error) {
        console.error('Error fetching threats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get archived (resolved) threats
app.get('/api/threats/archive', async (req, res) => {
    try {
        const archived = await threatsCollection
            .find({ status: 'resolved' })
            .sort({ updatedAt: -1 })
            .limit(50)
            .toArray();

        res.json({ success: true, archive: archived });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single threat by ID
app.get('/api/threats/:threatId', async (req, res) => {
    try {
        const threat = await threatsCollection.findOne({ threatId: req.params.threatId });

        if (!threat) {
            return res.status(404).json({ success: false, error: 'Threat not found' });
        }

        res.json({ success: true, threat });
    } catch (error) {
        console.error('Error fetching threat:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Search threats
app.get('/api/threats/search/:query', async (req, res) => {
    try {
        const query = req.params.query.toLowerCase();

        const threats = await threatsCollection.find({
            $or: [
                { threatId: { $regex: query, $options: 'i' } },
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        }).toArray();

        res.json({ success: true, threats });
    } catch (error) {
        console.error('Error searching threats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manually add threat (for testing/analyst input)
app.post('/api/threats', async (req, res) => {
    try {
        const threat = await threatProcessor.processThreat(req.body);

        if (!threat) {
            return res.status(400).json({ success: false, error: 'Invalid threat data' });
        }

        await threatsCollection.insertOne(threat);

        // Broadcast to all connected clients
        io.emit('newThreat', threat);

        res.json({ success: true, threat });
    } catch (error) {
        console.error('Error adding threat:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update threat status
app.patch('/api/threats/:threatId', async (req, res) => {
    try {
        const { status, severity } = req.body;

        const updateData = {};
        if (status) updateData.status = status;
        if (severity) updateData.severity = severity;

        await threatsCollection.updateOne(
            { threatId: req.params.threatId },
            { $set: updateData }
        );

        const updatedThreat = await threatsCollection.findOne({ threatId: req.params.threatId });

        // Broadcast update
        io.emit('threatUpdate', updatedThreat);

        res.json({ success: true, threat: updatedThreat });
    } catch (error) {
        console.error('Error updating threat:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        res.json({
            success: true,
            stats: await threatsCollection.getStats()
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all RSS feeds
app.get('/api/rss-feeds', async (req, res) => {
    try {
        const feeds = await threatsCollection.rssFeeds.find();
        res.json({ success: true, feeds });
    } catch (error) {
        console.error('Error fetching RSS feeds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a new RSS feed
app.post('/api/rss-feeds', async (req, res) => {
    try {
        let { url, name } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }
        
        // Strip HTML tags to prevent XSS/injection
        url = url.replace(/<[^>]*>/g, '').trim();
        name = (name || '').replace(/<[^>]*>/g, '').trim();

        try {
            new URL(url);
        } catch (_) {
            return res.status(400).json({ success: false, error: 'Invalid URL format' });
        }

        const feedId = await threatsCollection.rssFeeds.insertOne({
            url,
            name: name || new URL(url).hostname,
            enabled: 1
        });
        
        res.json({ 
            success: true, 
            feed: { 
                id: feedId, 
                url, 
                name: name || new URL(url).hostname, 
                enabled: 1 
            } 
        });
    } catch (error) {
        console.error('Error adding RSS feed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete an RSS feed
app.delete('/api/rss-feeds/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Invalid feed ID' });
        }
        await threatsCollection.rssFeeds.deleteOne(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting RSS feed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle an RSS feed enabled status
app.patch('/api/rss-feeds/:id/toggle', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (Number.isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Invalid feed ID' });
        }
        const { enabled } = req.body;
        await threatsCollection.rssFeeds.updateOne(id, { enabled: enabled ? 1 : 0 });
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating RSS feed status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── INTELLIGENCE IMPORT ENGINE ────────────────────────────────────
// Handles: RSS/Atom feeds, HTML articles with auto-discovery, body text extraction

const { XMLParser } = require('fast-xml-parser');
const feedParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true, parseTagValue: true });

function unescapeHtml(str) {
    if (!str) return '';
    return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
        .replace(/&#\d+;/g, m => String.fromCharCode(parseInt(m.slice(2, -1))));
}

function getMetaContent(html, property) {
    const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
    const match = html.match(regex);
    if (match) return unescapeHtml(match[1]);
    const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
    const altMatch = html.match(altRegex);
    return altMatch ? unescapeHtml(altMatch[1]) : null;
}

function extractBodyText(html) {
    // Remove script/style/nav/header/footer/noise tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
    // Try to find article/main content
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
        || text.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
        || text.match(/<div[^>]*class=["'][^"']*(?:article|content|story|post-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (articleMatch) text = articleMatch[1];
    // Strip tags, collapse whitespace
    text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
}

function discoverRssFeeds(html) {
    // Find <link rel="alternate" type="application/rss+xml" or atom+xml
    const feeds = [];
    const linkRegex = /<link[^>]*type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
        const tag = m[0];
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        const titleMatch = tag.match(/title=["']([^"']+)["']/i);
        if (hrefMatch) {
            feeds.push({ url: hrefMatch[1], name: titleMatch ? titleMatch[1] : 'Discovered Feed' });
        }
    }
    // Also check reverse attribute order
    const linkRegex2 = /<link[^>]*href=["']([^"']+)["'][^>]*type=["'](application\/rss\+xml|application\/atom\+xml)["'][^>]*>/gi;
    while ((m = linkRegex2.exec(html)) !== null) {
        const href = m[1];
        if (!feeds.some(f => f.url === href)) {
            feeds.push({ url: href, name: 'Discovered Feed' });
        }
    }
    return feeds;
}

function extractArticleText(html) {
    // Try JSON-LD first (most reliable)
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
        for (const block of jsonLdMatch) {
            try {
                const jsonStr = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
                const data = JSON.parse(jsonStr);
                if (data.articleBody) return data.articleBody;
                if (data.description) return data.description;
            } catch (_) {}
        }
    }
    // Fallback to body text extraction
    return extractBodyText(html);
}

function extractDateFromUrl(url) {
    const urlDateMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//) || url.match(/\/(\d{4})\/(\d{2})\//);
    if (urlDateMatch) {
        return urlDateMatch[3] ? `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}` : `${urlDateMatch[1]}-${urlDateMatch[2]}-01`;
    }
    return null;
}

function extractDateFromText(text) {
    const monthRegex = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+20\d{2}\b/i;
    const dayMonthRegex = /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+20\d{2}\b/i;
    const ymdRegex = /\b20\d{2}[-/]\d{2}[-/]\d{2}\b/;
    return text.match(monthRegex)?.[0] || text.match(dayMonthRegex)?.[0] || text.match(ymdRegex)?.[0] || null;
}

function isRssFeed(contentType, body) {
    if (contentType && (contentType.includes('rss') || contentType.includes('atom') || contentType.includes('xml'))) return true;
    if (typeof body === 'string') {
        if (body.includes('<rss') || body.includes('<feed') || body.includes('<channel>')) return true;
    }
    return false;
}

// Content quality detection - rejects challenge pages, cookie consent, thin content
function detectGarbageContent(html, url) {
    const lower = (html || '').toLowerCase();
    const reasons = [];

    // Cloudflare / bot challenge pages
    if (/just a moment/i.test(lower) || /verifying your browser/i.test(lower) ||
        /checking your browser/i.test(lower) || /cf-challenge/i.test(lower) ||
        /turnstile/i.test(lower) || /challenge-platform/i.test(lower) ||
        /ray id/i.test(lower) || /cloudflare/i.test(lower)) {
        reasons.push('cloudflare-challenge');
    }

    // Cookie consent / login walls
    if (/cookies must be enabled/i.test(lower) || /enable cookies/i.test(lower) ||
        /please enable javascript/i.test(lower) || /cookie consent/i.test(lower) ||
        /accept cookies/i.test(lower)) {
        reasons.push('cookie-consent-wall');
    }

    // Access denied / paywall
    if (/access denied/i.test(lower) || /403 forbidden/i.test(lower) ||
        /subscription required/i.test(lower) || /paywall/i.test(lower) ||
        /sign in to continue/i.test(lower) || /log in to read/i.test(lower)) {
        reasons.push('access-denied');
    }

    // CAPTCHA / human verification
    if (/are you a robot/i.test(lower) || /captcha/i.test(lower) ||
        /human verification/i.test(lower) || /prove you are human/i.test(lower)) {
        reasons.push('captcha');
    }

    // Browser not supported
    if (/browser.*not.*supported/i.test(lower) || /unsupported browser/i.test(lower) ||
        /please upgrade your browser/i.test(lower)) {
        reasons.push('unsupported-browser');
    }

    // Too short (probably just a redirect page)
    if (html && html.length < 500) {
        reasons.push('too-short');
    }

    return reasons.length > 0 ? reasons[0] : null;
}

// Process an RSS/Atom feed from raw XML text, return array of rawEvents
function parseRssFeed(xmlText, feedUrl) {
    const events = [];
    try {
        const parsed = feedParser.parse(xmlText);
        let items = [];
        if (parsed.rss?.channel?.item) items = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
        else if (parsed.feed?.entry) items = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
        else if (parsed.channel?.item) items = Array.isArray(parsed.channel.item) ? parsed.channel.item : [parsed.channel.item];

        let domain = 'RSS Feed';
        try { domain = new URL(feedUrl).hostname.replace(/^www\./, '').toUpperCase(); } catch (_) {}

        for (const item of items.slice(0, 30)) {
            const title = typeof item.title === 'string' ? item.title.replace(/<[^>]+>/g, '').trim() : '';
            let desc = item.description || item.summary || item['content:encoded'] || item.content || '';
            if (typeof desc === 'object') desc = desc['#text'] || desc.__cdata || '';
            desc = String(desc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);

            if (!title || !desc || desc.length < 20) continue;

            // Get link
            let link = '';
            if (typeof item.link === 'string') link = item.link;
            else if (Array.isArray(item.link)) link = item.link[0]?.href || item.link[0] || '';
            else if (item.link?.href) link = item.link.href;
            else if (item.guid && typeof item.guid === 'string' && item.guid.startsWith('http')) link = item.guid;

            // Get date
            const rawDate = item.pubDate || item.published || item.updated || item['dc:date'];
            let eventTime = new Date().toISOString();
            if (rawDate) {
                const d = new Date(String(rawDate));
                if (!isNaN(d.getTime())) eventTime = d.toISOString();
            }

            events.push({
                title: title.substring(0, 200),
                description: desc,
                location: inferLocationFromText(`${title} ${desc}`),
                sources: [{ name: domain, url: link || feedUrl, reliability: getSourceReliability(domain) }],
                indicators: ['rss-import', domain.toLowerCase()],
                eventTime
            });
        }
    } catch (e) {
        console.warn('  RSS parse error:', e.message);
    }
    return events;
}

function getSourceReliability(domain) {
    const trusted = ['WHO', 'CDC', 'NYTIMES', 'BBC', 'UN', 'GDACS', 'USGS', 'CISA', 'Reuters', 'APNEWS', 'AP'];
    const upper = (domain || '').toUpperCase();
    return trusted.some(item => upper.includes(item)) ? 'high' : 'medium';
}

// ─── MAIN IMPORT ENDPOINT ─────────────────────────────────────────
app.post('/api/articles/import', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
        try { new URL(url); } catch (_) {
            return res.status(400).json({ success: false, error: 'Invalid URL format' });
        }

        // Step 1: Fetch the URL
        let response;
        try {
            response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, text/html, application/xhtml+xml, */*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: 15000,
                maxRedirects: 5
            });
        } catch (fetchErr) {
            return res.status(400).json({ success: false, error: `Failed to fetch URL: ${fetchErr.message}` });
        }

        const contentType = response.headers?.['content-type'] || '';
        const body = typeof response.data === 'string' ? response.data : String(response.data);

        // Step 2: Detect if it's an RSS/Atom feed
        if (isRssFeed(contentType, body)) {
            console.log('  [IMPORT] Detected RSS/Atom feed, parsing as feed...');
            const events = parseRssFeed(body, url);
            if (events.length === 0) {
                return res.status(400).json({ success: false, error: 'RSS feed parsed but found no valid entries' });
            }

            // Process all entries, return the first one as the primary result
            const results = [];
            for (const rawEvent of events.slice(0, 5)) {
                const processed = await threatProcessor.processThreat(rawEvent);
                if (processed) {
                    const existing = await findExistingByTitleOrUrl(processed.title, rawEvent.sources[0]?.url);
                    if (existing) {
                        await threatsCollection.updateOne({ threatId: existing.threatId }, { $set: { eventTime: processed.eventTime, title: processed.title, description: processed.description, updatedAt: new Date().toISOString() } });
                    } else {
                        await threatsCollection.insertOne(processed);
                        io.emit('newThreat', processed);
                    }
                    results.push(processed);
                }
            }
            return res.json({ success: true, threat: results[0], totalIngested: results.length, type: 'rss-feed' });
        }

        // Step 3: It's an HTML page — scrape it
        const html = body;

        // Step 3a: Check for garbage content (challenge pages, cookie walls, thin content)
        const garbageReason = detectGarbageContent(html, url);
        if (garbageReason) {
            console.log(`  [IMPORT] Rejected: ${garbageReason} for ${url.substring(0, 60)}`);
            return res.status(400).json({ success: false, error: `Content rejected: ${garbageReason}` });
        }

        // Extract title
        let title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
        if (!title) {
            const tm = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (tm) title = unescapeHtml(tm[1]);
        }
        title = (title || 'Untitled Article').replace(/<[^>]*>/g, '').trim();

        // Extract description — prefer body text over meta
        let description = getMetaContent(html, 'og:description') || getMetaContent(html, 'twitter:description') || getMetaContent(html, 'description');
        const bodyText = extractArticleText(html);
        if (bodyText && bodyText.length > (description || '').length) {
            description = bodyText.substring(0, 1000);
        }
        if (!description || description.length < 30) {
            description = bodyText ? bodyText.substring(0, 1000) : 'No article summary could be extracted.';
        }
        description = description.replace(/<[^>]*>/g, '').trim();

        // Reject if description is too thin (likely no real article content)
        if (description.length < 40 || description === 'No article summary could be extracted.') {
            console.log(`  [IMPORT] Rejected: thin-content for ${url.substring(0, 60)}`);
            return res.status(400).json({ success: false, error: 'Content rejected: thin-content (no article text extracted)' });
        }

        // Domain
        let domain = 'External Source';
        try { domain = new URL(url).hostname.replace(/^www\./, '').toUpperCase(); } catch (_) {}

        // Location
        const location = inferLocationFromText(`${title} ${description}`);

        // Date extraction (7-stage cascade)
        let eventTime = null;
        const dateProperties = ['article:published_time', 'og:pubdate', 'datePublished', 'date', 'publish_date', 'pubdate', 'og:published_time', 'published_time', 'dcterms.created', 'dcterms.date', 'dc.date', 'dc.date.issued'];
        for (const prop of dateProperties) { eventTime = getMetaContent(html, prop); if (eventTime) break; }
        if (!eventTime) { const dm = html.match(/<meta[^>]*name=["'](?:date|publish_date|publication_date|published_time|pubdate|dcterms\.created|dcterms\.date)["'][^>]*content=["']([^"']*)["']/i); if (dm) eventTime = dm[1]; }
        if (!eventTime) { const jm = html.match(/"datePublished"\s*:\s*["']([^"']+)["']/i) || html.match(/"dateCreated"\s*:\s*["']([^"']+)["']/i); if (jm) eventTime = jm[1]; }
        if (!eventTime) { const tm2 = html.match(/<time[^>]*datetime=["']([^"']*)["']/i); if (tm2) eventTime = tm2[1]; }
        if (!eventTime) eventTime = extractDateFromUrl(url);
        if (!eventTime) eventTime = extractDateFromText(html.replace(/<[^>]*>/g, ' '));
        if (!eventTime) { const ym = title.match(/\b(20\d{2})\b/) || url.match(/\b(20\d{2})\b/); if (ym) eventTime = `${ym[1]}-01-01`; }

        if (eventTime) {
            const pd = new Date(eventTime);
            eventTime = isNaN(pd.getTime()) ? new Date().toISOString() : pd.toISOString();
        } else { eventTime = new Date().toISOString(); }

        // Auto-discover RSS feeds on the page
        const discoveredFeeds = discoverRssFeeds(html);
        let autoAddedFeed = null;
        if (discoveredFeeds.length > 0) {
            const feed = discoveredFeeds[0];
            try { feed.url = new URL(feed.url, url).href; } catch (_) {}
            const existingFeeds = await threatsCollection.rssFeeds.find();
            if (!existingFeeds.some(f => f.url === feed.url)) {
                await threatsCollection.rssFeeds.insertOne({ url: feed.url, name: feed.name || domain, enabled: 1 });
                autoAddedFeed = feed.url;
                console.log(`  [IMPORT] Auto-discovered RSS feed: ${feed.url}`);
            }
        }

        // Build raw event
        const rawEvent = {
            title, description, location,
            sources: [{ name: domain, url, reliability: 'high' }],
            indicators: ['analyst-import', domain.toLowerCase()],
            eventTime
        };

        const processedThreat = await threatProcessor.processThreat(rawEvent);
        if (!processedThreat) {
            return res.status(400).json({ success: false, error: 'Content did not meet threat intelligence thresholds' });
        }

        // Content-based dedup: check by URL OR similar title
        const existing = await findExistingByTitleOrUrl(processedThreat.title, url);
        if (existing) {
            await threatsCollection.updateOne({ threatId: existing.threatId }, { $set: { eventTime: processedThreat.eventTime, title: processedThreat.title, description: processedThreat.description, updatedAt: new Date().toISOString() } });
            const updated = { ...existing, eventTime: processedThreat.eventTime, title: processedThreat.title, description: processedThreat.description, updatedAt: new Date().toISOString() };
            io.emit('threatUpdate', updated);
            return res.json({ success: true, threat: updated, autoAddedFeed });
        }

        await threatsCollection.insertOne(processedThreat);
        io.emit('newThreat', processedThreat);
        res.json({ success: true, threat: processedThreat, autoAddedFeed });

    } catch (error) {
        console.error('Error importing article:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper: find existing threat by URL or similar title
async function findExistingByTitleOrUrl(title, url) {
    // 1. Check by URL
    if (url) {
        const byUrl = await threatsCollection.find({ sources: { $regex: url } }).toArray();
        const urlMatch = byUrl.find(t => { try { return JSON.parse(t.sources || '[]').some(s => s.url === url); } catch (_) { return false; } });
        if (urlMatch) return urlMatch;
    }
    // 2. Check by similar title (first 60 chars)
    if (title && title.length > 20) {
        const snippet = title.substring(0, 60).replace(/'/g, "''");
        const byTitle = await threatsCollection.find({ title: { $regex: snippet } }).toArray();
        if (byTitle.length > 0) return byTitle[0];
    }
    return null;
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OSINT Data Collection Jobs
async function collectAndProcessThreats() {
    console.log('🔄 Starting OSINT data collection...');

    try {
        const rawEvents = await osintCollector.collectAllSources();
        console.log(`  Found ${rawEvents.length} raw events`);

        const existingThreats = await threatsCollection.find({}).toArray();

        const isDuplicateThreat = (candidate) => {
            const candidateCoords = candidate.location?.coordinates || [];
            const candidateSourceUrls = (candidate.sources || [])
                .map(source => source.url)
                .filter(Boolean);

            return existingThreats.some(existing => {
                const existingCoords = existing.location?.coordinates || [];
                const sameTitle = existing.title === candidate.title;
                const sameTime = existing.eventTime === candidate.eventTime;
                const sameCountry = existing.location?.country === candidate.location?.country;
                const sameCoords = existingCoords.length === 2 &&
                    candidateCoords.length === 2 &&
                    existingCoords[0] === candidateCoords[0] &&
                    existingCoords[1] === candidateCoords[1];

                const existingSourceUrls = (existing.sources || [])
                    .map(source => source.url)
                    .filter(Boolean);
                const sharedSource = candidateSourceUrls.some(url => existingSourceUrls.includes(url));

                return sharedSource || (sameTitle && sameTime && (sameCoords || sameCountry));
            });
        };

        for (const rawEvent of rawEvents) {
            const processedThreat = await threatProcessor.processThreat(rawEvent);

            if (processedThreat) {
                if (!isDuplicateThreat(processedThreat)) {
                    await threatsCollection.insertOne(processedThreat);
                    existingThreats.push(processedThreat);
                    console.log(`  ✓ New threat added: ${processedThreat.threatId}`);

                    // Broadcast to clients
                    io.emit('newThreat', processedThreat);
                } else {
                    console.log(`  ↷ Duplicate threat skipped: ${processedThreat.title}`);
                }
            }
        }

        // Auto-resolve logic: Archive threats older than 48 hours that are no longer active
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        await threatsCollection.updateMany(
            { eventTime: { $lt: cutoff }, status: { $ne: 'resolved' } },
            { $set: { status: 'resolved', updatedAt: new Date().toISOString() } }
        );

        console.log('✓ OSINT collection complete');
    } catch (error) {
        console.error('✗ Error in data collection:', error.message);
    }
}

// Schedule data collection jobs
function scheduleJobs() {
    // Run every minute
    cron.schedule('* * * * *', () => {
        console.log('\n⏰ Scheduled collection triggered');
        collectAndProcessThreats();
    });

    console.log('✓ Scheduled jobs configured');
}

// Initialize server
async function initializeServer() {
    await connectToDatabase();
    // CSV threat import disabled per user request
    // await importThreatsFromCsv();
    scheduleJobs();

    // Run initial collection
    setTimeout(() => {
        collectAndProcessThreats();
    }, 5000);
}

// Start the HTTP server only when this file is run directly. Vercel imports the app.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
        console.log('\n=================================');
        console.log('Global Threat Mapping Server');
        console.log('=================================');
        console.log(`Server running on port ${PORT}`);
        console.log(`Local:    http://localhost:${PORT}`);
        console.log(`Network:  http://0.0.0.0:${PORT}`);
        console.log('=================================\n');

        initializeServer();
    });
}

// Export for testing
module.exports = { app, io, threatsCollection, initializeServer };
