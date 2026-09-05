# Global Threat Mapping Platform

## 📋 Overview

A real-time web-based platform that collects, verifies, categorizes, and visualizes global threat-related events using open-source intelligence (OSINT). The platform provides situational awareness and analytical understanding of threats across multiple domains including Cyber, Health, Economic, Political, Terrorism, and Environmental.

## 🎯 Key Features

- **Real-time OSINT Data Collection**: Automatically ingests live data from trusted public sources
- **Interactive Global Map**: Visualize threats with severity-based color coding and category icons
- **Threat Intelligence Processing**: Validates, categorizes, and assigns confidence scores to threats
- **Multi-domain Tracking**: Monitors Cyber, Health, Economic, Political, War, Environmental, and Hybrid threats
- **Ethical Constraints**: Enforces no personal data, no prediction, and evidence-based attribution
- **Live Updates**: WebSocket-based real-time threat notifications
- **Advanced Filtering**: Filter by category and severity
- **Threat Relationships**: Identifies and displays cross-domain threat connections

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher) - Optional, falls back to in-memory storage
- npm or yarn package manager

### Installation

1. **Clone or navigate to the project directory**

```bash
cd "d:\Internships\IN NETWORK\Threat Map"
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Copy `.env.example` to `.env` and configure your settings:

```bash
copy .env.example .env
```

Edit `.env` and add your API keys:

```env
MONGODB_URI=mongodb://localhost:27017/threat_map
PORT=3000
NEWS_API_KEY=your_newsapi_key_here
VIRUSTOTAL_API_KEY=your_virustotal_key_here
# Add other API keys as needed
```

4. **Start MongoDB** (if using database)

```bash
mongod
```

5. **Run the application**

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

6. **Access the application**

Open your browser and navigate to:
```
http://localhost:3000
```

## 📁 Project Structure

```
Threat Map/
├── index.html              # Main HTML interface
├── styles.css              # Styling and theme
├── app.js                  # Frontend JavaScript logic
├── server.js               # Express server and API routes
├── osint-collector.js      # OSINT data collection module
├── threat-processor.js     # Threat validation and processing
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## 🔧 Configuration

### Adding OSINT Data Sources

To add new data sources, edit `osint-collector.js`:

1. Create a new collection method:
```javascript
async collectYourSource() {
    const events = [];
    try {
        const response = await axios.get('YOUR_API_URL', {
            headers: { 'Authorization': `Bearer ${process.env.YOUR_API_KEY}` }
        });
        // Process and format data
        events.push(...formattedData);
    } catch (error) {
        console.error('Error:', error.message);
    }
    return events;
}
```

2. Add to `collectAllSources()` method:
```javascript
const yourData = await this.collectYourSource();
allEvents.push(...yourData);
```

### RSS/XML Feed Configuration

The collector now reads RSS/XML sources directly from environment variables:

- Any variable ending in `_RSS_URL` or `_XML_URL` (for example `WHO_DON_URL`, `BBC_WORLD_RSS_URL`)
- Optional comma/newline-separated lists in `RSS_FEED_URLS` and `XML_FEED_URLS`

Example:

```env
RSS_FEED_URLS=https://example.com/security.rss,https://example.com/world.xml
XML_FEED_URLS=https://example.org/feed.xml
```

Feed entries are normalized into threat events and appear through the same `/api/threats` endpoint and website map/feed UI.

### Threat Data Structure

Every threat must contain:

```javascript
{
    threatId: "TM-2026-000001",           // Auto-generated
    title: "Threat Title",
    description: "Detailed description",
    eventTime: "2026-02-05T10:00:00Z",
    location: {
        country: "Country Name",
        coordinates: [latitude, longitude]
    },
    category: "cyber|health|economic|political|war|environmental|hybrid",
    severity: "critical|high|medium|low",
    status: "emerging|ongoing|resolved",
    impactedSectors: ["Healthcare", "Technology"],
    indicators: ["indicator1", "indicator2"],
    sources: [{
        name: "Source Name",
        url: "https://source.url",
        reliability: "high|medium|low"
    }],
    confidence: 85,                        // 0-100
    secondaryTags: [],
    relatedThreats: []
}
```

## 🔌 API Endpoints

### Get All Threats
```
GET /api/threats?category=cyber&severity=high&limit=100
```

### Get Single Threat
```
GET /api/threats/:threatId
```

### Search Threats
```
GET /api/threats/search/:query
```

### Add Threat (Manual/Testing)
```
POST /api/threats
Content-Type: application/json

{
    "title": "Threat Title",
    "description": "Description",
    "location": {...},
    "sources": [...]
}
```

### Update Threat Status
```
PATCH /api/threats/:threatId
Content-Type: application/json

{
    "status": "resolved",
    "severity": "medium"
}
```

### Get Statistics
```
GET /api/stats
```

### Health Check
```
GET /api/health
```

## 🎨 User Interface

### Map Controls
- **Pan**: Click and drag
- **Zoom**: Mouse wheel or zoom controls
- **Marker Click**: View threat details in popup
- **Filter Panel**: Left sidebar for category and severity filters
- **Threat Feed**: Right panel shows latest threats in real-time

## 📊 Data Collection Schedule

The system automatically collects data on the following schedule:
- **Every 15 minutes**: All OSINT sources
- **On-demand**: Via API endpoints or analyst input

Modify schedule in `server.js`:
```javascript
cron.schedule('*/15 * * * *', collectAndProcessThreats);
```

## 🛡️ Ethical & Security Considerations

The system enforces:
1. **No Personal Data**: Automatic PII detection and blocking
2. **No Predictions**: Only observed, verified events
3. **No Attribution Without Evidence**: Requires high-reliability sources
4. **Source Credibility**: Confidence scoring based on source reliability
5. **OSINT Only**: No surveillance or proprietary data

## 🔍 Threat Processing Logic

1. **Validation**: Check mandatory fields exist
2. **Sanitization**: Clean and escape user input
3. **Confidence Scoring**: Based on source reliability, indicators, and recency
4. **Ethical Check**: Ensure no PII, panic language, or unsupported attribution
5. **Categorization**: Assign primary category based on keywords
6. **Severity Assignment**: Determine impact level
7. **Sector Analysis**: Identify impacted sectors
8. **Indicator Extraction**: Extract technical indicators and key terms

Minimum confidence threshold: **50%**

## 🌐 Recommended OSINT Sources

### Cyber Threats
- CISA Advisories: https://www.cisa.gov/
- US-CERT: https://www.cisa.gov/uscert/
- NVD (National Vulnerability Database): https://nvd.nist.gov/
- VirusTotal API: https://www.virustotal.com/
- AlienVault OTX: https://otx.alienvault.com/

### Health Threats
- WHO Disease Outbreak News: https://www.who.int/emergencies/disease-outbreak-news
- CDC: https://www.cdc.gov/
- ProMED: https://promedmail.org/
- HealthMap: https://www.healthmap.org/

### Disaster Alerts
- GDACS: https://www.gdacs.org/ (Already integrated)
- USGS Earthquakes: https://earthquake.usgs.gov/
- NOAA Weather: https://www.weather.gov/

### General News & Political
- NewsAPI: https://newsapi.org/
- Reuters API: https://www.reuters.com/
- GDELT Project: https://www.gdeltproject.org/

## 🐛 Troubleshooting

### MongoDB Connection Error
If you see "MongoDB connection error", you can either:
1. Start MongoDB service: `mongod`
2. Or run without database (in-memory storage is automatic)

### API Rate Limits
If hitting API rate limits:
1. Reduce collection frequency in `server.js`
2. Add API keys in `.env` file
3. Implement caching for API responses

### WebSocket Connection Issues
- Ensure port 3000 is not blocked
- Check firewall settings
- Verify server is running

## 📦 Dependencies

### Backend
- **express**: Web server framework
- **socket.io**: Real-time WebSocket communication
- **mongodb**: Database driver
- **axios**: HTTP client for API calls
- **node-cron**: Scheduled task execution
- **validator**: Data validation and sanitization
- **dotenv**: Environment variable management

### Frontend
- **Leaflet.js**: Interactive map library
- **Socket.IO Client**: Real-time updates
- **Vanilla JavaScript**: No framework dependencies

## 🔄 Future Enhancements

1. **Machine Learning**: Automated threat correlation
2. **Threat Intelligence Sharing**: STIX/TAXII integration
3. **Advanced Analytics**: Trend analysis and predictive indicators
4. **Multi-language Support**: Internationalization
5. **Mobile App**: Native mobile applications
6. **Export Functionality**: PDF reports, CSV exports
7. **Alert System**: Email/SMS notifications for critical threats
8. **API Authentication**: JWT-based user authentication

## 📝 API Keys Setup

### NewsAPI (Optional)
1. Sign up at https://newsapi.org/
2. Get your API key
3. Add to `.env`: `NEWS_API_KEY=your_key_here`

### VirusTotal (Optional)
1. Sign up at https://www.virustotal.com/
2. Get your API key
3. Add to `.env`: `VIRUSTOTAL_API_KEY=your_key_here`

### GDACS (No Key Required)
GDACS API is public and already integrated.

## 🤝 Contributing

1. Follow the ethical guidelines
2. Ensure all threats pass validation
3. Add tests for new features
4. Document new OSINT sources
5. Maintain confidence scoring accuracy

## 📄 License

MIT License - See LICENSE file for details

## 💡 Notes for Developers

- **Mock Data**: The system includes mock data generators for demonstration when APIs aren't available
- **Extensible Architecture**: Easy to add new threat categories and sources
- **Modular Design**: Each component (collector, processor, server) is independent
- **Real-time Ready**: WebSocket infrastructure for instant updates
- **Database Optional**: Works with or without MongoDB

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section
2. Review console logs for error messages
3. Verify environment variables are set correctly
4. Ensure all dependencies are installed

---

**Built with ❤️ for global security awareness**
