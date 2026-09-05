const fs = require('fs');
const path = require('path');
const sqliteDb = require('./sqlite-db');

async function run() {
    const jsonPath = path.join(__dirname, 'custom_threats.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('Error: custom_threats.json not found in the project root.');
        console.log('Please create one using the following structure:');
        console.log(JSON.stringify([
            {
                "link": "https://www.darkreading.com/...",
                "title": "CISA Third-Party Data Breach",
                "sectorAffected": "Cybersecurity / National Security",
                "sectors": ["Technology", "Government"],
                "wasResponse": "Yes",
                "response": "The Treasury Department alerted Congressional committees...",
                "origin": "Chinese hacking groups",
                "date": "December 30, 2024",
                "additionalNotes": "BeyondTrust was compromised..."
            }
        ], null, 2));
        process.exit(1);
    }

    try {
        console.log('Connecting to database...');
        await sqliteDb.init();

        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const customThreats = JSON.parse(rawData);

        console.log(`Loaded ${customThreats.length} threats. Importing...`);

        let count = 0;
        for (let i = 0; i < customThreats.length; i++) {
            const raw = customThreats[i];
            
            // Map the user's structured fields to the database threat schema
            const threat = {
                threatId: `CUSTOM-THRT-${Date.now()}-${i}`,
                title: raw.title || 'Structured Threat Incident',
                description: `${raw.additionalNotes || ''}\n\nResponse: ${raw.response || 'No response recorded.'}\nOrigin: ${raw.origin || 'Unknown'}`,
                eventTime: raw.date ? new Date(raw.date).toISOString() : new Date().toISOString(),
                location: {
                    country: raw.originCountry || 'United States',
                    coordinates: raw.coordinates || [38.8977, -77.0365] // Default to Washington DC or custom coords
                },
                category: 'cyber',
                severity: 'high',
                status: 'emerging',
                impactedSectors: raw.sectors || ['Technology'],
                indicators: [
                    ...(raw.sectors || []),
                    ...(raw.origin ? [raw.origin.toLowerCase()] : [])
                ].slice(0, 10),
                sources: [{
                    name: 'Custom Import Source',
                    url: raw.link || 'https://www.darkreading.com',
                    reliability: 'high'
                }],
                confidence: 80,
                secondaryTags: [raw.sectorAffected].filter(Boolean),
                relatedThreats: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await sqliteDb.insertOne(threat);
            count++;
        }

        console.log(`✓ Success! Successfully imported ${count} threats into SQLite.`);
        process.exit(0);
    } catch (error) {
        console.error('✗ Import failed:', error.message);
        process.exit(1);
    }
}

run();
