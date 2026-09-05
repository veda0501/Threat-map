# Quick Start Guide - Global Threat Mapping Platform

## ⚡ 5-Minute Setup

### Step 1: Install Node.js Dependencies
Open PowerShell in the project directory and run:

```powershell
npm install
```

### Step 2: Create Environment File
Copy the example environment file:

```powershell
copy .env.example .env
```

The application works without API keys using mock data for demonstration.

### Step 3: Start the Server

```powershell
npm start
```

You should see:
```
=================================
🌍 Global Threat Mapping Server
=================================
Server running on port 3000
Local:    http://localhost:3000
=================================
```

### Step 4: Open in Browser

Navigate to: **http://localhost:3000**

---

## 🎮 Using the Platform

### Initial View
- **Interactive Map**: Shows global threats with color-coded markers
- **Left Panel**: Filters for categories and severity
- **Right Panel**: Live threat feed with latest events
- **Top Bar**: Connection status

### Basic Operations

#### 1. View Threats on Map
- Threats appear as colored circles
- Color indicates severity: Red (Critical), Orange (High), Yellow (Medium), Green (Low)
- Click any marker to see quick info

#### 2. Filter Threats
Left sidebar:
- ✅ Check/uncheck categories (Cyber, Health, Economic, etc.)
- ✅ Select severity levels

#### 3. Search for Specific Threat
- Enter threat ID (e.g., TM-2026-000001) or keywords
- Click "Search" button
- Map focuses on matching threats

#### 4. View Detailed Information
- Click on any threat card in the right panel
- Or click map marker then "View Details"
- Modal opens with complete threat analysis:
  - Description and classification
  - Location and coordinates
  - Impacted sectors
  - Evidence indicators
  - Source information
  - Confidence level
  - Related threats

---

## 📊 Understanding the Data

### Threat Categories
- 💻 **Cyber**: Ransomware, malware, data breaches
- 🏥 **Health**: Disease outbreaks, pandemics
- 📊 **Economic**: Market issues, supply chain disruptions
- 🏛️ **Political**: Elections, diplomatic tensions
- ✈️ **War**: Military conflicts and state-sponsored attacks
- 🌪️ **Environmental**: Natural disasters
- 🔀 **Hybrid**: Multi-domain events

### Severity Levels
- **Critical**: Immediate widespread impact
- **High**: Significant impact, urgent attention
- **Medium**: Moderate impact, monitoring needed
- **Low**: Limited impact, awareness level

### Threat Status
- **Emerging**: Just detected, developing
- **Ongoing**: Active situation
- **Resolved**: Situation contained/ended

---

## 🔄 Real-time Updates

The platform automatically:
- Collects OSINT data every 15 minutes
- Updates map in real-time via WebSocket
- Shows "Live" status indicator when connected
- Displays notification for new threats

---

## 🧪 Testing the Platform

### Method 1: Wait for Auto-Collection
After starting, the system collects data after 5 seconds, then every 15 minutes.

### Method 2: Manual Testing (Using API)

Open a new PowerShell window and test the API:

```powershell
# Check server health
curl http://localhost:3000/api/health

# View all threats
curl http://localhost:3000/api/threats

# Get statistics
curl http://localhost:3000/api/stats
```

### Method 3: Add Test Threat

Create a file `test-threat.json`:
```json
{
  "title": "Test Cyber Incident - Ransomware Attack",
  "description": "Ransomware targeting healthcare systems detected in multiple locations",
  "location": {
    "country": "United States",
    "coordinates": [40.7128, -74.0060]
  },
  "category": "cyber",
  "severity": "high",
  "sources": [{
    "name": "Security Blog",
    "url": "https://example.com/report",
    "reliability": "medium"
  }],
  "indicators": ["ransomware", "healthcare", "encryption"],
  "impactedSectors": ["Healthcare", "Technology"]
}
```

Post it:
```powershell
curl -X POST http://localhost:3000/api/threats -H "Content-Type: application/json" -d "@test-threat.json"
```

Watch it appear on the map instantly!

---

## 🎯 Common Use Cases

### For Security Analysts
1. Monitor emerging cyber threats in real-time
2. Track cross-domain impacts
3. Correlate related threats
4. Validate threat intelligence
5. Export threat data for reports

### For Students/Interns
1. Learn about different threat types
2. Understand global security landscape
3. Study threat correlation patterns
4. Practice threat analysis
5. Explore historical threat data

### For Decision Makers
1. Get situational awareness
2. Understand regional threat exposure
3. Monitor sector-specific threats
4. Track threat trends over time
5. Assess overall threat landscape

---

## 🔧 Troubleshooting

### Issue: Server won't start
**Solution**: Check if port 3000 is already in use
```powershell
netstat -ano | findstr :3000
```
If used, kill the process or change PORT in `.env`

### Issue: No threats appearing
**Solution**: 
1. Wait 5 seconds for initial data collection
2. Check console for "OSINT collection complete" message
3. Verify filters aren't excluding all threats

### Issue: Map not loading
**Solution**:
1. Check browser console for errors (F12)
2. Ensure internet connection (Leaflet loads from CDN)
3. Try refreshing the page (Ctrl+F5)

### Issue: "Disconnected" status
**Solution**:
1. Restart the server
2. Refresh the browser
3. Check for firewall blocking WebSocket

---

## 🎨 Customization

### Change Update Frequency
Edit `server.js`, line with `cron.schedule`:
```javascript
// Every 15 minutes
cron.schedule('*/15 * * * *', collectAndProcessThreats);

// Change to every 5 minutes
cron.schedule('*/5 * * * *', collectAndProcessThreats);
```

### Add Your OSINT Sources
Edit `osint-collector.js`:
1. Add your API credentials to `.env`
2. Create collection method
3. Add to `collectAllSources()`

### Customize Theme
Edit `styles.css` variables:
```css
:root {
    --primary-bg: #0a0e27;    /* Change background */
    --cyber: #00d9ff;          /* Change cyber color */
    /* ... modify other colors */
}
```

---

## 📱 Mobile Access

Access from mobile devices:
1. Find your computer's IP: `ipconfig` (look for IPv4)
2. On mobile browser: `http://YOUR_IP:3000`
3. Ensure firewall allows incoming connections

---

## 🎓 Learning Resources

### Understanding the Code
- `index.html` - User interface structure
- `styles.css` - Visual design and theming
- `app.js` - Frontend logic and map control
- `server.js` - API server and WebSocket
- `osint-collector.js` - Data collection logic
- `threat-processor.js` - Threat validation and analysis

### Key Concepts
- **OSINT**: Open Source Intelligence gathering
- **WebSocket**: Real-time bidirectional communication
- **Leaflet.js**: Open-source mapping library
- **MongoDB**: Document database for threat storage
- **Express.js**: Node.js web application framework

---

## 🚀 Next Steps

1. ✅ Get familiar with the interface
2. ✅ Test different filters and search
3. ✅ Add your own OSINT API keys
4. ✅ Customize for your specific needs
5. ✅ Deploy to production (see DEPLOYMENT.md)

---

## 📞 Need Help?

1. Check README.md for detailed documentation
2. Review DEPLOYMENT.md for production setup
3. Check console logs for error messages
4. Verify all dependencies are installed

---

**Happy Threat Hunting! 🔍🌍**
