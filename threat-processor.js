const validator = require('validator');

// Threat Processing and Validation Engine
class ThreatProcessor {
    constructor() {
        this.threatIdCounter = this.initializeThreatId();
    }

    // Initialize threat ID counter
    initializeThreatId() {
        const now = new Date();
        const year = now.getFullYear();
        return {
            year: year,
            counter: 1
        };
    }

    // Generate unique threat ID
    generateThreatId() {
        const now = new Date();
        const year = now.getFullYear();

        if (this.threatIdCounter.year !== year) {
            this.threatIdCounter.year = year;
            this.threatIdCounter.counter = 1;
        }

        const id = `TM-${year}-${String(this.threatIdCounter.counter).padStart(6, '0')}`;
        this.threatIdCounter.counter++;

        return id;
    }

    // Main threat processing function
    async processThreat(rawEvent) {
        try {
            // Step 1: Validate mandatory fields
            if (!this.validateMandatoryFields(rawEvent)) {
                console.log('  ✗ Threat rejected: Missing mandatory fields');
                return null;
            }

            // Step 2: Verify and sanitize data
            const sanitized = this.sanitizeData(rawEvent);

            // Step 3: Calculate confidence score
            const confidence = this.calculateConfidence(sanitized);

            if (confidence < 50) {
                console.log('  ✗ Threat rejected: Low confidence score');
                return null;
            }

            // Step 4: Check ethical constraints
            if (!this.checkEthicalConstraints(sanitized)) {
                console.log('  ✗ Threat rejected: Ethical constraint violation');
                return null;
            }

            // Step 5: Assign category and severity
            const category = this.assignCategory(sanitized);
            const severity = this.assignSeverity(sanitized, category);

            // Step 6: Determine impacted sectors
            const impactedSectors = this.determineImpactedSectors(sanitized, category);

            // Step 7: Extract and validate indicators
            const indicators = this.extractIndicators(sanitized);

            // Step 8: Build final threat object
            const threat = {
                threatId: this.generateThreatId(),
                title: sanitized.title,
                description: sanitized.description,
                eventTime: sanitized.eventTime || new Date().toISOString(),
                location: sanitized.location,
                category: category,
                severity: severity,
                status: 'emerging',
                impactedSectors: impactedSectors,
                indicators: indicators,
                sources: sanitized.sources,
                confidence: confidence,
                secondaryTags: sanitized.secondaryTags || [],
                relatedThreats: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            return threat;

        } catch (error) {
            console.error('Error processing threat:', error.message);
            return null;
        }
    }

    // Validate mandatory fields
    validateMandatoryFields(event) {
        const requiredFields = [
            'title',
            'description',
            'location',
            'sources'
        ];

        for (const field of requiredFields) {
            if (!event[field]) {
                return false;
            }
        }

        // Validate location structure
        if (!event.location.country || !event.location.coordinates) {
            return false;
        }

        // Validate coordinates
        const [lat, lng] = event.location.coordinates;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return false;
        }

        // Validate sources
        if (!Array.isArray(event.sources) || event.sources.length === 0) {
            return false;
        }

        return true;
    }

    // Sanitize and clean data
    sanitizeData(event) {
        return {
            title: validator.escape(event.title.substring(0, 200)),
            description: validator.escape(event.description.substring(0, 1000)),
            location: {
                country: validator.escape(event.location.country),
                coordinates: event.location.coordinates
            },
            eventTime: event.eventTime || new Date().toISOString(),
            sources: event.sources.map(source => ({
                name: validator.escape(source.name),
                url: source.url,
                reliability: source.reliability || 'medium'
            })),
            category: this.normalizeCategory(event.category),
            severity: event.severity,
            indicators: event.indicators || [],
            impactedSectors: event.impactedSectors || [],
            secondaryTags: event.secondaryTags || []
        };
    }

    normalizeCategory(value) {
        if (!value) return null;
        const normalized = String(value).toLowerCase().trim();
        if (normalized === 'geopolitical') return 'political';
        const aliases = { 'war': 'war', 'conflict': 'war', 'military': 'war', 'terrorism': 'war', 'counterterrorism': 'war' };
        if (aliases[normalized]) return aliases[normalized];
        const allowed = new Set(['cyber', 'health', 'economic', 'political', 'war', 'environmental', 'hybrid']);
        return allowed.has(normalized) ? normalized : 'political';
    }

    // Calculate confidence score (0-100) based on source quality, content, and recency
    calculateConfidence(event) {
        let score = 0;

        // 1. Source reliability (30 points max)
        const reliabilityScores = { 'high': 30, 'medium': 18, 'low': 8 };
        const sourceScore = event.sources.reduce((acc, source) => {
            return acc + (reliabilityScores[source.reliability] || 8);
        }, 0) / event.sources.length;
        score += sourceScore;

        // 2. Content quality (30 points max)
        const descLen = (event.description || '').length;
        if (descLen > 500) score += 30;
        else if (descLen > 300) score += 25;
        else if (descLen > 150) score += 18;
        else if (descLen > 80) score += 10;
        else if (descLen > 40) score += 5;

        // 3. Technical specificity (20 points max)
        if (event.indicators && event.indicators.length > 0) {
            score += Math.min(event.indicators.length * 4, 20);
        }

        // 4. Recency (15 points max)
        if (event.eventTime) {
            const hoursSince = (Date.now() - new Date(event.eventTime).getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) score += 15;
            else if (hoursSince < 72) score += 10;
            else if (hoursSince < 168) score += 5;
        }

        // 5. Location specificity (5 points)
        if (event.location && event.location.coordinates &&
            !(event.location.coordinates[0] === 20 && event.location.coordinates[1] === 0)) {
            score += 5;
        }

        return Math.min(Math.round(score), 100);
    }

    // Check ethical constraints
    checkEthicalConstraints(event) {
        const title = event.title.toLowerCase();
        const description = event.description.toLowerCase();
        const combined = title + ' ' + description;

        // No personal data
        const piiPatterns = [
            /\b\d{3}-\d{2}-\d{4}\b/, // SSN
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b\d{16}\b/, // Credit card
            /phone:\s*\d+/i
        ];

        for (const pattern of piiPatterns) {
            if (pattern.test(combined)) {
                return false;
            }
        }

        // No panic-inducing language without evidence
        const panicWords = ['imminent attack', 'massive casualties expected', 'doomsday'];
        const hasEvidence = event.indicators && event.indicators.length > 2;

        for (const word of panicWords) {
            if (combined.includes(word) && !hasEvidence) {
                return false;
            }
        }

        // No attribution without verified evidence
        const attributionWords = ['carried out by', 'orchestrated by', 'perpetrated by'];
        const hasHighReliability = event.sources.some(s => s.reliability === 'high');

        for (const word of attributionWords) {
            if (combined.includes(word) && !hasHighReliability) {
                return false;
            }
        }

        return true;
    }

    // Assign primary category (weighted: title gets 3x weight)
    assignCategory(event) {
        const normalizedCategory = this.normalizeCategory(event.category);
        if (normalizedCategory) return normalizedCategory;

        const title = event.title.toLowerCase();
        const description = event.description.toLowerCase();
        // Title keywords count 3x more than description keywords
        const combinedWeighted = (title + ' ' + title + ' ' + title + ' ' + description);

        const categoryKeywords = {
            cyber: ['ransomware', 'malware', 'hack', 'cyber attack', 'data breach', 'ddos', 'vulnerability', 'exploit', 'phishing', 'zero-day', 'backdoor', 'botnet', 'credential', 'encryption', 'network intrusion'],
            health: ['disease', 'outbreak', 'pandemic', 'epidemic', 'virus', 'infection', 'health crisis', 'contamination', 'who', 'cdc', 'pathogen', 'hospital', 'death toll', 'casualties'],
            economic: ['market crash', 'economic crisis', 'inflation', 'recession', 'supply chain', 'oil price', 'financial', 'trade war', 'tariff', 'sanctions', 'stock market', 'currency', 'debt'],
            political: ['election', 'coup', 'diplomatic', 'protest', 'political crisis', 'government', 'parliament', 'legislation', 'impeach', 'embassy', 'treaty', 'summit'],
            war: ['military', 'airstrike', 'bombing', 'missile', 'troops', 'invasion', 'ceasefire', 'frontline', 'artillery', 'drone strike', 'combat', 'battalion', 'offensive', 'nato', 'defense system', 'fighter jet', 'warship', 'naval', 'occupied', 'territory'],
            environmental: ['earthquake', 'tsunami', 'hurricane', 'flood', 'wildfire', 'volcano', 'disaster', 'storm', 'typhoon', 'cyclone', 'drought', 'heatwave', 'evacuation', 'relief']
        };

        let maxScore = 0;
        let selectedCategory = 'political';

        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            let score = 0;
            for (const keyword of keywords) {
                const count = (combinedWeighted.match(new RegExp(keyword, 'g')) || []).length;
                score += count;
            }
            if (score > maxScore) {
                maxScore = score;
                selectedCategory = category;
            }
        }

        return selectedCategory;
    }

    // Assign severity level (impact-aware: death tolls, scale, disruption)
    assignSeverity(event, category) {
        if (event.severity) return event.severity;

        let score = 0;
        const title = (event.title || '').toLowerCase();
        const desc = (event.description || '').toLowerCase();
        const combined = title + ' ' + desc;

        // Direct title keywords get +3 (if it's in the title, it's more severe)
        const titleCritical = ['killed', 'dead', 'death', 'attack', 'invasion', 'airstrike', 'missile', 'bomb', 'earthquake', 'tsunami', 'flood', 'pandemic', 'outbreak', 'ransomware', 'breach', 'exploit', 'collapse', 'emergency', 'catastroph'];
        titleCritical.forEach(w => { if (title.includes(w)) score += 3; });

        // Critical indicators (score +2 each)
        const criticalWords = ['critical', 'severe', 'massive', 'widespread', 'catastrophic', 'devastating', 'major', 'emergency', 'collapse', 'destroy', 'shut down', 'disrupted', 'casualt', 'fatal', 'lethal'];
        criticalWords.forEach(w => { if (combined.includes(w)) score += 2; });

        // High indicators (score +1 each)
        const highWords = ['significant', 'serious', 'urgent', 'escalat', 'toll', 'injured', 'displaced', 'evacuat', 'damage', 'declared', 'emergency', 'shutdown', 'compromised', 'exposed', 'leaked', 'stolen', 'hijack', 'hack', 'intrusion', 'targeted'];
        highWords.forEach(w => { if (combined.includes(w)) score += 1; });

        // Medium indicators (score +1 each)
        const mediumWords = ['warning', 'advisory', 'alert', 'concern', 'threat', 'risk', 'incident', 'investigation', 'arrest', 'suspect', 'probe', 'sanction'];
        mediumWords.forEach(w => { if (combined.includes(w)) score += 1; });

        // Scale multipliers
        if (combined.includes('thousands') || combined.includes('millions')) score += 3;
        else if (combined.includes('hundreds')) score += 1;

        // Category-specific boosts
        if (category === 'cyber' && (combined.includes('ransomware') || combined.includes('zero-day') || combined.includes('data breach'))) score += 2;
        if (category === 'health' && (combined.includes('pandemic') || combined.includes('outbreak') || combined.includes('epidemic'))) score += 2;
        if (category === 'war' && (combined.includes('invasion') || combined.includes('airstrike') || combined.includes('missile') || combined.includes('troops') || combined.includes('combat'))) score += 2;
        if (category === 'environmental' && (combined.includes('earthquake') || combined.includes('tsunami') || combined.includes('hurricane') || combined.includes('typhoon'))) score += 2;

        // Multiple sectors impacted
        if (event.impactedSectors && event.impactedSectors.length > 3) score += 1;

        if (score >= 6) return 'critical';
        if (score >= 3) return 'high';
        if (score >= 1) return 'medium';
        return 'low';
    }

    // Determine impacted sectors
    determineImpactedSectors(event, category) {
        if (event.impactedSectors && event.impactedSectors.length > 0) {
            return event.impactedSectors;
        }

        const sectors = new Set();
        const combined = (event.title + ' ' + event.description).toLowerCase();

        const sectorKeywords = {
            'Healthcare': ['hospital', 'health', 'medical', 'patient', 'clinic'],
            'Finance': ['bank', 'financial', 'market', 'currency', 'investment'],
            'Government': ['government', 'federal', 'state', 'military', 'defense'],
            'Technology': ['software', 'technology', 'IT', 'system', 'network'],
            'Energy': ['power', 'electricity', 'energy', 'oil', 'gas', 'pipeline'],
            'Transportation': ['airport', 'airline', 'shipping', 'transport', 'logistics'],
            'Infrastructure': ['infrastructure', 'water', 'utilities', 'communication'],
            'Agriculture': ['farm', 'agriculture', 'crop', 'food supply'],
            'Education': ['school', 'university', 'education', 'student'],
            'Public Safety': ['safety', 'emergency', 'rescue', 'evacuation']
        };

        for (const [sector, keywords] of Object.entries(sectorKeywords)) {
            for (const keyword of keywords) {
                if (combined.includes(keyword)) {
                    sectors.add(sector);
                    break;
                }
            }
        }

        // Default sectors by category
        const defaultSectors = {
            cyber: ['Technology', 'Government'],
            health: ['Healthcare', 'Public Safety'],
            economic: ['Finance', 'Government'],
            political: ['Government'],
            war: ['Government', 'Public Safety', 'Infrastructure'],
            environmental: ['Infrastructure', 'Public Safety'],
            hybrid: ['Government', 'Infrastructure', 'Technology']
        };

        if (sectors.size === 0) {
            return defaultSectors[category] || ['General'];
        }

        return Array.from(sectors);
    }

    // Extract indicators (CVEs, IPs, hashes, actors, malware, TTPs)
    extractIndicators(event) {
        if (event.indicators && event.indicators.length > 0) return event.indicators;

        const indicators = new Set();
        const combined = (event.title + ' ' + event.description).toLowerCase();

        // Technical indicators
        const techPatterns = [
            [/cve-\d{4}-\d+/gi, 'cve'],
            [/\b[a-f0-9]{32,64}\b/gi, 'hash'],
            [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, 'ip']
        ];
        for (const [pattern] of techPatterns) {
            const matches = combined.match(pattern);
            if (matches) matches.forEach(m => indicators.add(m));
        }

        // Known threat actor groups
        const actors = ['apt28', 'apt29', 'apt41', 'lazarus', 'cozy bear', 'fancy bear', 'sandworm', 'turla', ' equation group', 'darkside', 'revil', 'conti', 'lockbit', 'blackcat', 'cl0p', 'phantom', 'silk typhoon', 'volt typhoon'];
        actors.forEach(a => { if (combined.includes(a)) indicators.add('actor:' + a); });

        // Malware families
        const malware = ['cobalt strike', 'mimikatz', 'metasploit', 'emotet', 'trickbot', 'ryuk', 'wannacry', 'notpetya', 'solarwinds', 'log4j', 'exchange', 'barracuda', 'citrix', 'fortinet', 'palo alto', 'cisco'];
        malware.forEach(m => { if (combined.includes(m)) indicators.add('malware:' + m); });

        // MITRE ATT&CK TTPs
        const ttps = ['phishing', 'spearphishing', 'watering hole', 'supply chain', 'zero-day', 'lateral movement', 'privilege escalation', 'data exfiltration', 'credential dumping', 'ransomware', 'ddos', 'brute force', 'sql injection'];
        ttps.forEach(t => { if (combined.includes(t)) indicators.add('ttp:' + t); });

        // Key terms as fallback
        if (indicators.size === 0) {
            const keyTerms = combined.match(/\b[a-z]{5,}\b/g) || [];
            const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'their', 'about', 'which', 'when', 'what', 'more', 'than', 'into', 'also', 'after', 'other', 'some', 'only', 'being', 'most', 'over', 'such']);
            keyTerms.filter(t => !stopwords.has(t)).slice(0, 5).forEach(t => indicators.add(t));
        }

        return Array.from(indicators).slice(0, 12);
    }

    // Update threat status (for ongoing monitoring)
    updateThreatStatus(threat, newStatus) {
        const validStatuses = ['emerging', 'ongoing', 'resolved'];

        if (!validStatuses.includes(newStatus)) {
            return threat;
        }

        threat.status = newStatus;
        threat.updatedAt = new Date().toISOString();

        return threat;
    }

    // Link related threats
    linkRelatedThreats(threat1, threat2) {
        // Simple relationship detection
        const hasCommonSector = threat1.impactedSectors.some(s =>
            threat2.impactedSectors.includes(s)
        );

        const hasCommonIndicator = threat1.indicators.some(i =>
            threat2.indicators.includes(i)
        );

        const isSimilarLocation = threat1.location.country === threat2.location.country;

        if (hasCommonSector && (hasCommonIndicator || isSimilarLocation)) {
            if (!threat1.relatedThreats.includes(threat2.threatId)) {
                threat1.relatedThreats.push(threat2.threatId);
            }
            if (!threat2.relatedThreats.includes(threat1.threatId)) {
                threat2.relatedThreats.push(threat1.threatId);
            }
        }
    }
}

module.exports = new ThreatProcessor();
