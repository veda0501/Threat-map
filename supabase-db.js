const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) are required');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const threatFields = [
    'threatId', 'title', 'description', 'eventTime', 'location', 'category',
    'severity', 'status', 'impactedSectors', 'indicators', 'sources', 'confidence',
    'secondaryTags', 'relatedThreats', 'createdAt', 'updatedAt'
];

function throwIfError(error, operation) {
    if (error) throw new Error(`${operation}: ${error.message}`);
}

function mapThreat(row) {
    return row || null;
}

function applyThreatFilters(builder, query = {}) {
    let result = builder;
    for (const [key, value] of Object.entries(query)) {
        if (key === '$or') {
            const clauses = [];
            for (const alternative of value) {
                for (const [field, condition] of Object.entries(alternative)) {
                    if (condition && condition.$regex) {
                        clauses.push(`${field}.ilike.%${String(condition.$regex).replace(/[,()]/g, '')}%`);
                    } else {
                        clauses.push(`${field}.eq.${String(condition).replace(/[,()]/g, '')}`);
                    }
                }
            }
            if (clauses.length) result = result.or(clauses.join(','));
            continue;
        }

        if (value && typeof value === 'object') {
            if ('$lt' in value) result = result.lt(key, value.$lt);
            if ('$ne' in value) result = result.neq(key, value.$ne);
        } else {
            result = result.eq(key, value);
        }
    }
    return result;
}

const threatsCollection = {
    async init() {
        const { error } = await supabase.from('threats').select('threatId').limit(1);
        throwIfError(error, 'Unable to connect to Supabase');

        const { count, error: feedError } = await supabase
            .from('rss_feeds')
            .select('id', { count: 'exact', head: true });
        throwIfError(feedError, 'Unable to read RSS feeds');

        if (count === 0) {
            const now = new Date().toISOString();
            const defaultFeeds = [
                { name: 'WHO Disease Outbreaks', url: process.env.WHO_DON_URL || 'https://www.who.int/feeds/entity/csr/don/en/rss.xml' },
                { name: 'CDC Media Advisories', url: process.env.CDC_RSS_URL || 'https://tools.cdc.gov/api/v2/resources/media/403372.rss' },
                { name: 'New York Times World', url: process.env.NEW_YORK_TIMES_WORLD_RSS_URL || 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
                { name: 'BBC News World', url: process.env.BBC_WORLD_RSS_URL || 'https://feeds.bbci.co.uk/news/world/rss.xml' },
                { name: 'UN News All', url: process.env.UN_NEWS_RSS_URL || 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' }
            ].map(feed => ({ ...feed, enabled: true, createdAt: now, updatedAt: now }));

            const { error } = await supabase.from('rss_feeds').upsert(defaultFeeds, { onConflict: 'url', ignoreDuplicates: true });
            throwIfError(error, 'Unable to seed RSS feeds');
            console.log('Seeded default RSS feeds into Supabase');
        }
    },

    async findOne(query = {}) {
        let request = applyThreatFilters(supabase.from('threats').select('*'), query).limit(1);
        const { data, error } = await request.maybeSingle();
        throwIfError(error, 'Unable to find threat');
        return mapThreat(data);
    },

    async insertOne(doc) {
        if (!doc) throw new Error('Cannot insert null document');
        const { data, error } = await supabase.from('threats').upsert(doc, { onConflict: 'threatId' }).select('threatId').single();
        throwIfError(error, 'Unable to insert threat');
        return { insertedId: data.threatId };
    },

    async updateOne(query, update) {
        if (!query || !update || !update.$set || Object.keys(update.$set).length === 0) return;
        const { error } = await applyThreatFilters(supabase.from('threats'), query).update(update.$set);
        throwIfError(error, 'Unable to update threat');
    },

    async updateMany(query, update) {
        return this.updateOne(query, update);
    },

    find(query = {}) {
        let request = applyThreatFilters(supabase.from('threats').select('*'), query);
        let order;
        let limit;
        return {
            sort(sortObject) {
                order = sortObject;
                return this;
            },
            limit(limitValue) {
                limit = limitValue;
                return this;
            },
            async toArray() {
                if (order) {
                    for (const [field, direction] of Object.entries(order)) {
                        request = request.order(field, { ascending: direction >= 0 });
                    }
                }
                if (limit !== null && limit !== undefined) request = request.limit(limit);
                const { data, error } = await request;
                throwIfError(error, 'Unable to list threats');
                return (data || []).map(mapThreat);
            }
        };
    },

    async getStats() {
        const { data, error } = await supabase.from('threats').select('category, severity, status');
        throwIfError(error, 'Unable to calculate threat statistics');
        const stats = { total: data.length, active: 0, resolved: 0, byCategory: {}, bySeverity: {} };
        for (const threat of data) {
            if (threat.status !== 'resolved') stats.active++;
            if (threat.category) stats.byCategory[threat.category] = (stats.byCategory[threat.category] || 0) + 1;
            if (threat.severity) stats.bySeverity[threat.severity] = (stats.bySeverity[threat.severity] || 0) + 1;
        }
        stats.resolved = stats.total - stats.active;
        return stats;
    }
};

threatsCollection.rssFeeds = {
    async find(query = {}) {
        let request = supabase.from('rss_feeds').select('*').order('id', { ascending: true });
        if (Object.prototype.hasOwnProperty.call(query, 'enabled')) request = request.eq('enabled', Boolean(query.enabled));
        const { data, error } = await request;
        throwIfError(error, 'Unable to list RSS feeds');
        return (data || []).map(feed => ({ ...feed, enabled: feed.enabled ? 1 : 0 }));
    },
    async insertOne(doc) {
        if (!doc || !doc.url) throw new Error('Cannot insert feed: URL is required');
        const now = new Date().toISOString();
        const { data, error } = await supabase.from('rss_feeds').upsert({
            url: doc.url, name: doc.name || doc.url, enabled: doc.enabled !== 0,
            createdAt: doc.createdAt || now, updatedAt: doc.updatedAt || now
        }, { onConflict: 'url' }).select('id').single();
        throwIfError(error, 'Unable to insert RSS feed');
        return data.id;
    },
    async deleteOne(id) {
        const { error } = await supabase.from('rss_feeds').delete().eq('id', id);
        throwIfError(error, 'Unable to delete RSS feed');
        return true;
    },
    async updateOne(id, update) {
        const { error } = await supabase.from('rss_feeds').update({ ...update, updatedAt: new Date().toISOString() }).eq('id', id);
        throwIfError(error, 'Unable to update RSS feed');
        return true;
    }
};

module.exports = threatsCollection;