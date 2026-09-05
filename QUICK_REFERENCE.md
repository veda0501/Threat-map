# Quick Reference: Essential Map Data Fields
## Threat Mapping Platform - Developer Cheat Sheet

---

## 🎯 Minimum Required Fields for Map Display

```javascript
{
  threatId: "TM-2026-000001",           // REQUIRED: Unique identifier
  title: "Threat Title",                // REQUIRED: Display name
  category: "cyber",                    // REQUIRED: For icon/color
  severity: "critical",                 // REQUIRED: For marker color
  location: {
    country: "United States",           // REQUIRED: Display text
    coordinates: [40.7128, -74.0060]   // REQUIRED: [lat, lng] for map pin
  },
  eventTime: "2026-02-05T10:00:00Z",   // REQUIRED: For timeline
  status: "ongoing"                     // REQUIRED: For filtering
}
```

---

## 🎨 Severity → Color Mapping

```javascript
const SEVERITY_COLORS = {
  critical: '#ff4444',  // Red
  high:     '#ff8c42',  // Orange
  medium:   '#ffd93d',  // Yellow
  low:      '#6bcf7f'   // Green
};
```

---

## 📍 Category → Icon Mapping

```javascript
const CATEGORY_ICONS = {
  cyber:         '💻',  // or 'fa-shield-virus'
  health:        '🏥',  // or 'fa-virus'
  economic:      '📊',  // or 'fa-chart-line'
  political:     '🏛️',  // or 'fa-landmark'
  war:           '✈️',  // or 'fa-jet-fighter'
  environmental: '🌪️',  // or 'fa-wind'
  hybrid:        '🔀'   // or 'fa-random'
};
```

---

## 📊 Status Values

```javascript
const THREAT_STATUSES = [
  'emerging',      // Just detected, developing situation
  'ongoing',       // Active threat
  'contained',     // Under control but not resolved
  'resolved',      // Situation ended
  'false-positive' // Invalidated
];
```

---

## 🗺️ Creating a Map Marker (Simplified)

```javascript
function addThreatMarker(threat) {
  const marker = L.marker(threat.location.coordinates, {
    icon: createCustomIcon(threat),
    title: threat.title
  });
  
  marker.bindPopup(`
    <strong>${threat.category.toUpperCase()}</strong><br/>
    ${threat.title}<br/>
    <span class="severity ${threat.severity}">${threat.severity}</span>
  `);
  
  marker.addTo(map);
  return marker;
}

function createCustomIcon(threat) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background: ${SEVERITY_COLORS[threat.severity]}">
             ${CATEGORY_ICONS[threat.category]}
           </div>`,
    iconSize: [40, 40]
  });
}
```

---

## 🔍 Filtering Threats for Map Display

```javascript
function filterThreatsForMap(threats, filters) {
  return threats.filter(threat => {
    // Category filter
    if (filters.categories?.length && 
        !filters.categories.includes(threat.category)) {
      return false;
    }
    
    // Severity filter
    if (filters.severities?.length && 
        !filters.severities.includes(threat.severity)) {
      return false;
    }
    
    // No status filter in current UI version
    
    // Time range (last 24 hours example)
    if (filters.timeRange === 'last24h') {
      const hoursSince = (Date.now() - new Date(threat.eventTime)) / 3600000;
      if (hoursSince > 24) return false;
    }
    
    return true;
  });
}
```

---

## 📡 WebSocket Event Handlers

```javascript
// Listen for new threats
socket.on('newThreat', (threat) => {
  addThreatMarker(threat);
  showNotification(`New ${threat.severity} threat: ${threat.title}`);
});

// Listen for threat updates
socket.on('threatUpdate', (threat) => {
  updateMarker(threat.threatId, threat);
});

// Connection status
socket.on('connect', () => {
  document.getElementById('status').className = 'connected';
});
```

---

## 🎯 API Endpoints Quick Reference

```javascript
// Get all threats (with optional filters)
GET /api/threats?category=cyber&severity=high&limit=100

// Get single threat
GET /api/threats/:threatId

// Search threats
GET /api/threats/search/:query

// Add new threat
POST /api/threats
Body: { title, description, location, category, severity, sources, ... }

// Update threat
PATCH /api/threats/:threatId
Body: { status, severity }

// Get statistics
GET /api/stats
```

---

## 📍 Coordinate Format

```javascript
// ALWAYS use [latitude, longitude] format
const coordinates = [40.7128, -74.0060];  // ✅ Correct: [lat, lng]

// Latitude: -90 to 90 (North/South)
// Longitude: -180 to 180 (East/West)

// Common locations
const LOCATIONS = {
  newYork:    [40.7128, -74.0060],
  london:     [51.5074, -0.1278],
  tokyo:      [35.6762, 139.6503],
  sydney:     [-33.8688, 151.2093],
  dubai:      [25.2048, 55.2708]
};
```

---

## 🔢 Confidence Score Calculation

```javascript
function calculateConfidence(threat) {
  let score = 0;
  
  // Source reliability (40 points)
  if (threat.sources?.some(s => s.reliability === 'high')) {
    score += 40;
  } else if (threat.sources?.some(s => s.reliability === 'medium')) {
    score += 25;
  }
  
  // Multiple sources (20 points)
  if (threat.sources?.length >= 3) score += 20;
  else if (threat.sources?.length >= 2) score += 10;
  
  // Indicators present (20 points)
  if (threat.indicators?.length >= 3) score += 20;
  else if (threat.indicators?.length >= 1) score += 10;
  
  // Recent (10 points)
  const hoursOld = (Date.now() - new Date(threat.eventTime)) / 3600000;
  if (hoursOld < 24) score += 10;
  else if (hoursOld < 168) score += 5;
  
  // Description quality (10 points)
  if (threat.description?.length > 200) score += 10;
  else if (threat.description?.length > 100) score += 5;
  
  return Math.min(score, 100);
}
```

---

## 🎨 CSS Classes for Styling

```css
/* Severity badges */
.severity.critical { background: #ff4444; }
.severity.high     { background: #ff8c42; }
.severity.medium   { background: #ffd93d; }
.severity.low      { background: #6bcf7f; }

/* Category colors */
.category.cyber         { border-left: 4px solid #00d9ff; }
.category.health        { border-left: 4px solid #ff6b9d; }
.category.economic      { border-left: 4px solid #4caf50; }
.category.political     { border-left: 4px solid #9c27b0; }
.category.terrorism     { border-left: 4px solid #f44336; }
.category.environmental { border-left: 4px solid #ff9800; }
.category.hybrid        { border-left: 4px solid #795548; }

/* Marker animations */
.marker-bounce {
  animation: bounce 1s ease-in-out;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}

.pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
```

---

## 🚀 Performance Tips

```javascript
// 1. Limit markers on screen
const MAX_MARKERS = 1000;
if (threats.length > MAX_MARKERS) {
  // Use clustering or viewport filtering
  useMarkerClustering();
}

// 2. Debounce map updates
const debouncedUpdate = debounce(updateMap, 300);
map.on('moveend', debouncedUpdate);

// 3. Cache threat data
const threatCache = new Map();
function getCachedThreat(id) {
  if (!threatCache.has(id)) {
    threatCache.set(id, fetchThreat(id));
  }
  return threatCache.get(id);
}

// 4. Use lightweight markers for distant zoom
if (map.getZoom() < 5) {
  useSimpleMarkers();  // Just dots
} else {
  useDetailedMarkers(); // Icons with details
}
```

---

## 🐛 Common Issues & Solutions

### Issue: Markers not appearing
```javascript
// ✅ Check coordinate format
const coords = [lat, lng];  // NOT [lng, lat]

// ✅ Check bounds
if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
  console.error('Invalid coordinates');
}

// ✅ Check layer
marker.addTo(map);  // or marker.addTo(layerGroup);
```

### Issue: Too many markers (slow)
```javascript
// ✅ Enable clustering
const markers = L.markerClusterGroup();
markers.addLayer(marker);

// ✅ Or viewport filtering
function isInViewport(coords) {
  const bounds = map.getBounds();
  return bounds.contains(coords);
}
```

### Issue: Popup not showing
```javascript
// ✅ Bind popup after adding to map
marker.addTo(map);
marker.bindPopup(content);

// ✅ Or use openPopup
marker.openPopup();
```

---

## 📦 Required Dependencies

```json
{
  "dependencies": {
    "leaflet": "^1.9.4",
    "socket.io-client": "^4.7.2"
  }
}
```

```html
<!-- CDN Links -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
```

---

## 🔗 Related Documentation

- Full Data Structure: [MAP_DATA_STRUCTURE.md](MAP_DATA_STRUCTURE.md)
- Implementation Examples: [IMPLEMENTATION_EXAMPLES.md](IMPLEMENTATION_EXAMPLES.md)
- General Guide: [README.md](README.md)
- Quick Start: [QUICKSTART.md](QUICKSTART.md)

---

## 💡 Quick Test

```javascript
// Test threat object
const testThreat = {
  threatId: "TM-2026-TEST-001",
  title: "Test Cyber Threat",
  category: "cyber",
  severity: "high",
  status: "ongoing",
  location: {
    country: "United States",
    coordinates: [40.7128, -74.0060]
  },
  eventTime: new Date().toISOString(),
  confidence: 85,
  sources: [{ name: "Test", reliability: "high" }]
};

// Add to map
addThreatMarker(testThreat);
```

---

## 📞 Need More Details?

- **Basic Setup**: See [QUICKSTART.md](QUICKSTART.md)
- **Complete Data Structure**: See [MAP_DATA_STRUCTURE.md](MAP_DATA_STRUCTURE.md)
- **Code Examples**: See [IMPLEMENTATION_EXAMPLES.md](IMPLEMENTATION_EXAMPLES.md)
- **API Testing**: See [API_EXAMPLES.md](API_EXAMPLES.md)
