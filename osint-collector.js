const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { inferLocationFromText } = require('./location-helper');

// OSINT Source Collectors
class OSINTCollector {
    constructor() {
        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
            trimValues: true,
            parseTagValue: true
        });
        this.sources = {
            cyber: [],
            health: [],
            economic: [],
            political: [],
            disaster: []
        };
    }

    // Collect from all sources
    async collectAllSources() {
        const allEvents = [];

        try {
            // Collect from various sources in parallel
            const [cyberEvents, healthEvents, disasterEvents, newsEvents, feedEvents] = await Promise.all([
                this.collectCyberThreats(),
                this.collectHealthThreats(),
                this.collectDisasterAlerts(),
                this.collectNewsFeeds(),
                this.collectRssAndXmlFeeds()
            ]);

            allEvents.push(...cyberEvents, ...healthEvents, ...disasterEvents, ...newsEvents, ...feedEvents);
        } catch (error) {
            console.error('Error collecting OSINT data:', error.message);
        }

        return allEvents;
    }

    // Cyber Threat Collection
    async collectCyberThreats() {
        const events = [];

        try {
            // TODO: Implement actual cyber threat source collection
            // - CISA Alerts
            // - CERT advisories
            // - VirusTotal
            // - AlienVault OTX
            // - Threat intelligence feeds
        } catch (error) {
            console.error('Cyber threat collection error:', error.message);
        }

        return events;
    }

    // Health Threat Collection
    async collectHealthThreats() {
        const events = [];

        try {
            // TODO: Implement actual health threat source collection
            // - WHO alerts
            // - CDC reports
            // - ProMED-mail
            // - HealthMap
        } catch (error) {
            console.error('Health threat collection error:', error.message);
        }

        return events;
    }

    // Disaster Alert Collection
    async collectDisasterAlerts() {
        const events = [];

        try {
            // GDACS - Global Disaster Alert and Coordination System
            const gdacsUrl = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

            try {
                const response = await axios.get(gdacsUrl, {
                    params: {
                        limit: 10,
                        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                    },
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'ThreatMap/1.0'
                    },
                    timeout: 10000
                });

                if (response.data && response.data.features) {
                    response.data.features.forEach(feature => {
                        events.push({
                            title: feature.properties.name || 'Disaster Event',
                            description: feature.properties.description || 'Natural disaster detected',
                            category: 'environmental',
                            severity: this.mapGDACSAlertLevel(feature.properties.alertlevel),
                            location: {
                                country: feature.properties.country || 'Unknown',
                                coordinates: [
                                    feature.geometry.coordinates[1],
                                    feature.geometry.coordinates[0]
                                ]
                            },
                            eventTime: feature.properties.fromdate || new Date().toISOString(),
                            sources: [{
                                name: 'GDACS',
                                url: `https://www.gdacs.org/report.aspx?eventid=${feature.properties.eventid}`,
                                reliability: 'high'
                            }],
                            indicators: [feature.properties.eventtype || 'disaster'],
                            impactedSectors: ['Infrastructure', 'Public Safety', 'Health']
                        });
                    });
                }
            } catch (apiError) {
                const status = apiError.response?.status;
                const code = apiError.code;
                const message = apiError.message;
                const detail = status ? `status=${status}` : (code ? `code=${code}` : 'no-status');
                console.warn(`GDACS API request failed (${detail}): ${message}`);
            }

        } catch (error) {
            console.error('Disaster alert collection error:', error.message);
        }

        return events;
    }

    // News Feed Collection
    async collectNewsFeeds() {
        const events = [];

        try {
            // TODO: Implement actual news source collection
            // - NewsAPI
            // - Reuters
            // - AP News
            // Filter for threat-related keywords
        } catch (error) {
            console.error('News feed collection error:', error.message);
        }

        return events;
    }

    // RSS/XML Feed Collection
    async collectRssAndXmlFeeds() {
        const events = [];
        let dbFeedUrls = [];

        try {
            const threatsCollection = require('./sqlite-db');
            if (threatsCollection && threatsCollection.rssFeeds) {
                const activeFeeds = await threatsCollection.rssFeeds.find({ enabled: 1 });
                dbFeedUrls = activeFeeds.map(f => f.url);
            }
        } catch (dbErr) {
            console.error('Failed to load active RSS feeds from DB:', dbErr.message);
        }

        const envUrls = this.getConfiguredFeedUrls();
        const feedUrls = [...new Set([...dbFeedUrls, ...envUrls])];

        if (feedUrls.length === 0) {
            return events;
        }

        for (const feedUrl of feedUrls) {
            try {
                const response = await axios.get(feedUrl, {
                    headers: {
                        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
                        'User-Agent': 'ThreatMap/1.0'
                    },
                    timeout: 12000
                });

                const parsedFeed = this.xmlParser.parse(response.data);
                const entries = this.extractFeedEntries(parsedFeed);

                entries.slice(0, 20).forEach(entry => {
                    const mapped = this.mapFeedEntryToEvent(entry, feedUrl);
                    if (mapped) {
                        events.push(mapped);
                    }
                });
            } catch (error) {
                const status = error.response?.status;
                const code = error.code;
                const detail = status ? `status=${status}` : (code ? `code=${code}` : 'no-status');
                console.warn(`Feed request failed (${detail}) for ${feedUrl}: ${error.message}`);
            }
        }

        return events;
    }

    getConfiguredFeedUrls() {
        const urls = [];
        const env = process.env;

        for (const [key, value] of Object.entries(env)) {
            if (!value) continue;
            if (key.endsWith('_RSS_URL') || key.endsWith('_XML_URL')) {
                urls.push(value);
            }
        }

        urls.push(...this.parseUrlList(env.RSS_FEED_URLS));
        urls.push(...this.parseUrlList(env.XML_FEED_URLS));

        return [...new Set(urls.map(url => url.trim()).filter(Boolean))];
    }

    parseUrlList(urlList) {
        if (!urlList) return [];
        return String(urlList)
            .split(/[\n,;]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    extractFeedEntries(parsedFeed) {
        if (!parsedFeed || typeof parsedFeed !== 'object') {
            return [];
        }

        if (parsedFeed.rss?.channel?.item) {
            return Array.isArray(parsedFeed.rss.channel.item)
                ? parsedFeed.rss.channel.item
                : [parsedFeed.rss.channel.item];
        }

        if (parsedFeed.feed?.entry) {
            return Array.isArray(parsedFeed.feed.entry)
                ? parsedFeed.feed.entry
                : [parsedFeed.feed.entry];
        }

        if (parsedFeed.channel?.item) {
            return Array.isArray(parsedFeed.channel.item)
                ? parsedFeed.channel.item
                : [parsedFeed.channel.item];
        }

        return [];
    }

    mapFeedEntryToEvent(entry, feedUrl) {
        const title = this.extractText(entry.title);
        const description = this.extractText(entry.description)
            || this.extractText(entry.summary)
            || this.extractText(entry['content:encoded'])
            || this.extractText(entry.content);

        if (!title || !description) {
            return null;
        }

        const combined = `${title} ${description}`.toLowerCase();
        if (!this.isThreatLikeContent(combined)) {
            return null;
        }

        const location = this.inferLocation(combined);
        const category = this.inferCategory(combined);
        const severity = this.inferSeverity(combined);
        const indicators = this.extractFeedIndicators(combined);
        const sourceUrl = this.extractEntryUrl(entry) || feedUrl;
        const sourceName = this.getSourceName(feedUrl);
        const eventTime = this.extractDate(entry) || new Date().toISOString();

        return {
            title: title.substring(0, 200),
            description: description.substring(0, 1000),
            category,
            severity,
            location,
            eventTime,
            sources: [{
                name: sourceName,
                url: sourceUrl,
                reliability: this.getSourceReliability(sourceName)
            }],
            indicators,
            impactedSectors: this.getImpactedSectors(category)
        };
    }

    extractText(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (typeof value === 'number') return String(value);
        if (typeof value === 'object') {
            return this.extractText(value['#text'] || value.__cdata || value.content || value.value || '');
        }
        return '';
    }

    extractEntryUrl(entry) {
        if (!entry) return null;

        if (typeof entry.link === 'string') return entry.link;
        if (Array.isArray(entry.link)) {
            const hrefLink = entry.link.find(link => link?.href);
            return hrefLink?.href || this.extractText(entry.link[0]);
        }
        if (entry.link?.href) return entry.link.href;
        if (entry.guid && typeof entry.guid === 'string' && entry.guid.startsWith('http')) return entry.guid;
        return null;
    }

    extractDate(entry) {
        const rawDate = entry.pubDate || entry.published || entry.updated || entry.dcDate || entry['dc:date'];
        if (!rawDate) return null;

        const parsed = new Date(this.extractText(rawDate));
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }

        return parsed.toISOString();
    }

    isThreatLikeContent(text) {
        const keywords = [
            'attack', 'threat', 'outbreak', 'breach', 'exploit', 'ransomware', 'malware',
            'earthquake', 'flood', 'hurricane', 'wildfire', 'conflict', 'sanction',
            'terror', 'epidemic', 'pandemic', 'incident', 'warning', 'emergency',
            'military', 'airstrike', 'bombing', 'missile', 'invasion', 'troops',
            'hack', 'phishing', 'vulnerability', 'zero-day', 'ddos', 'cyber',
            'crisis', 'disaster', 'storm', 'typhoon', 'casualt', 'killed', 'injured',
            'death', 'evacuat', 'relief', 'rescue', 'damage', 'destroy', 'collapse'
        ];

        return keywords.some(keyword => text.includes(keyword));
    }

    inferCategory(text) {
        const mappings = {
            cyber: ['cyber', 'ransomware', 'malware', 'breach', 'phishing', 'vulnerability', 'exploit', 'hack', 'zero-day', 'botnet', 'ddos', 'data breach', 'backdoor', 'credential'],
            health: ['health', 'outbreak', 'epidemic', 'pandemic', 'virus', 'infection', 'disease', 'hospital', 'who', 'cdc', 'pathogen', 'death toll', 'casualties'],
            economic: ['economic', 'market', 'inflation', 'recession', 'supply chain', 'finance', 'trade', 'tariff', 'stock', 'currency', 'debt', 'oil price'],
            political: ['election', 'political', 'government', 'sanction', 'diplomatic', 'conflict', 'protest', 'parliament', 'legislation', 'treaty', 'summit', 'embassy'],
            war: ['military', 'airstrike', 'bombing', 'missile', 'troops', 'invasion', 'ceasefire', 'frontline', 'artillery', 'drone strike', 'combat', 'nato', 'defense', 'fighter', 'warship', 'naval', 'occupied', 'territory', 'war'],
            environmental: ['earthquake', 'flood', 'hurricane', 'wildfire', 'storm', 'volcano', 'disaster', 'typhoon', 'cyclone', 'drought', 'heatwave', 'evacuation']
        };

        let bestCategory = 'political';
        let bestScore = 0;

        for (const [category, words] of Object.entries(mappings)) {
            const score = words.reduce((acc, word) => acc + ((text.match(new RegExp(word, 'g')) || []).length), 0);
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
        }

        return bestCategory;
    }

    inferSeverity(text) {
        if (/(critical|catastrophic|massive|devastating|major)/.test(text)) return 'critical';
        if (/(high risk|severe|urgent|widespread|significant)/.test(text)) return 'high';
        if (/(moderate|watch|advisory|elevated)/.test(text)) return 'medium';
        return 'low';
    }

    inferLocation(text) {
        return inferLocationFromText(text);
    }

    formatCountryName(name) {
        return name
            .split(' ')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    extractFeedIndicators(text) {
        const indicatorKeywords = [
            'ransomware', 'malware', 'phishing', 'ddos', 'vulnerability',
            'outbreak', 'pandemic', 'earthquake', 'flood', 'wildfire',
            'sanction', 'terror', 'conflict', 'emergency', 'advisory'
        ];

        const indicators = indicatorKeywords.filter(keyword => text.includes(keyword));
        if (indicators.length === 0) {
            return ['osint-feed'];
        }
        return indicators.slice(0, 8);
    }

    getImpactedSectors(category) {
        const categorySectors = {
            cyber: ['Technology', 'Finance', 'Government'],
            health: ['Healthcare', 'Public Safety', 'Travel'],
            economic: ['Finance', 'Supply Chain', 'Energy'],
            political: ['Government', 'Public Safety', 'Trade'],
            war: ['Government', 'Public Safety', 'Infrastructure', 'Defense'],
            environmental: ['Infrastructure', 'Public Safety', 'Health'],
            hybrid: ['Public Safety', 'Infrastructure', 'Government']
        };

        return categorySectors[category] || ['Public Safety'];
    }

    getSourceName(feedUrl) {
        try {
            const hostname = new URL(feedUrl).hostname.replace(/^www\./, '');
            return hostname.split('.').slice(0, -1).join('.').toUpperCase() || 'RSS/XML Feed';
        } catch (_error) {
            return 'RSS/XML Feed';
        }
    }

    getSourceReliability(sourceName) {
        const trusted = ['WHO', 'CDC', 'NYTIMES', 'BBC', 'UN', 'GDACS', 'USGS', 'NASA'];
        const upper = (sourceName || '').toUpperCase();
        return trusted.some(item => upper.includes(item)) ? 'high' : 'medium';
    }

    // Helper: Map GDACS alert levels
    mapGDACSAlertLevel(level) {
        const mapping = {
            'Red': 'critical',
            'Orange': 'high',
            'Green': 'medium'
        };
        return mapping[level] || 'medium';
    }

}

module.exports = new OSINTCollector();
