# Data Structure Implementation Examples
## Practical Guide for Map Integration

---

## 1. Creating a New Threat for the Map

### Example: Cyber Attack Threat
```javascript
// In osint-collector.js or manual input
const newThreat = {
  title: "Ransomware Attack on Regional Healthcare Network",
  description: "A sophisticated ransomware campaign has targeted multiple healthcare facilities in the northeastern United States, encrypting patient records and demanding payment in cryptocurrency.",
  
  location: {
    country: "United States",
    countryCode: "US",
    region: "North America",
    city: "Boston",
    coordinates: [42.3601, -71.0589],  // [lat, lng] for Boston
    accuracy: "city"
  },
  
  eventTime: new Date().toISOString(),
  
  category: "cyber",
  severity: "critical",
  
  sources: [
    {
      name: "US-CERT",
      url: "https://www.cisa.gov/alert/example",
      reliability: "high"
    },
    {
      name: "Local News Report",
      url: "https://news.example.com/article",
      reliability: "medium"
    }
  ],
  
  indicators: ["192.168.1.100", "malware.exe", "CVE-2024-1234"],
  impactedSectors: ["Healthcare", "Technology"],
  secondaryTags: ["ransomware", "healthcare", "critical-infrastructure"]
};

// Process through threat processor
const processedThreat = await threatProcessor.processThreat(newThreat);

// Result will include:
// - Auto-generated threatId: "TM-2026-000123"
// - Calculated confidence score: 85
// - Validated and sanitized data
// - Map metadata (color, icon, etc.)
```

---

## 2. Rendering Threats on the Map

### Basic Map Marker Creation
```javascript
// In app.js
function addMarkerToMap(threat) {
  // Determine marker color based on severity
  const markerColor = getSeverityColor(threat.severity);
  
  // Create custom icon
  const icon = L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="marker-container" style="background-color: ${markerColor}">
        <i class="icon-${threat.category}"></i>
        ${threat.status === 'ongoing' ? '<span class="pulse"></span>' : ''}
      </div>
    `,
    iconSize: [40, 40]
  });
  
  // Create marker
  const marker = L.marker(
    threat.location.coordinates,
    { icon: icon }
  );
  
  // Add popup with threat info
  marker.bindPopup(createPopupContent(threat));
  
  // Add tooltip for hover
  marker.bindTooltip(
    `${threat.category.toUpperCase()}: ${threat.title}`,
    { direction: 'top' }
  );
  
  // Store marker reference
  markers[threat.threatId] = {
    marker: marker,
    threat: threat,
    layer: getCategoryLayer(threat.category)
  };
  
  // Add to appropriate layer
  marker.addTo(markers[threat.threatId].layer);
  
  return marker;
}

// Helper function for severity colors
function getSeverityColor(severity) {
  const colors = {
    critical: '#ff4444',
    high: '#ff8c42',
    medium: '#ffd93d',
    low: '#6bcf7f'
  };
  return colors[severity] || colors.medium;
}

// Create popup content
function createPopupContent(threat) {
  return `
    <div class="threat-popup">
      <div class="popup-header ${threat.category}">
        <span class="threat-id">${threat.threatId}</span>
        <span class="severity-badge ${threat.severity}">${threat.severity}</span>
      </div>
      <h4>${threat.title}</h4>
      <p class="popup-meta">
        <strong>Location:</strong> ${threat.location.country}<br/>
        <strong>Time:</strong> ${formatTime(threat.eventTime)}<br/>
        <strong>Confidence:</strong> ${threat.confidence}%
      </p>
      <button onclick="viewThreatDetails('${threat.threatId}')">
        View Full Details
      </button>
    </div>
  `;
}
```

---

## 3. Implementing Marker Clustering

### Cluster Configuration
```javascript
// Initialize marker cluster group
const markerClusters = L.markerClusterGroup({
  maxClusterRadius: 80,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  
  // Custom cluster icon
  iconCreateFunction: function(cluster) {
    const markers = cluster.getAllChildMarkers();
    
    // Count threats by severity
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    
    markers.forEach(m => {
      const threat = m.options.threatData;
      severityCounts[threat.severity]++;
    });
    
    // Determine cluster color (highest severity)
    let clusterColor = '#6bcf7f'; // low
    if (severityCounts.critical > 0) clusterColor = '#ff4444';
    else if (severityCounts.high > 0) clusterColor = '#ff8c42';
    else if (severityCounts.medium > 0) clusterColor = '#ffd93d';
    
    return L.divIcon({
      html: `
        <div class="cluster-marker" style="background-color: ${clusterColor}">
          <span class="cluster-count">${cluster.getChildCount()}</span>
          ${severityCounts.critical > 0 ? '<span class="critical-indicator">!</span>' : ''}
        </div>
      `,
      className: 'custom-cluster',
      iconSize: L.point(50, 50)
    });
  }
});

// Add markers to cluster
Object.values(markers).forEach(m => {
  markerClusters.addLayer(m.marker);
});

map.addLayer(markerClusters);
```

---

## 4. Filtering Threats on the Map

### Filter Implementation
```javascript
function applyFilters() {
  // Get filter values
  const selectedCategories = getCheckedValues('category-filter');
  const selectedSeverities = getCheckedValues('severity-filter');
  const timeRange = document.getElementById('time-range').value;
  const searchQuery = document.getElementById('search-input').value.toLowerCase();
  
  // Filter threats
  const filteredThreats = threats.filter(threat => {
    // Category filter
    if (selectedCategories.length > 0 && 
        !selectedCategories.includes(threat.category)) {
      return false;
    }
    
    // Severity filter
    if (selectedSeverities.length > 0 && 
        !selectedSeverities.includes(threat.severity)) {
      return false;
    }
    
    // Time range filter
    if (!isInTimeRange(threat.eventTime, timeRange)) {
      return false;
    }
    
    // Search query
    if (searchQuery && !matchesSearch(threat, searchQuery)) {
      return false;
    }
    
    return true;
  });
  
  // Update map display
  updateMapDisplay(filteredThreats);
  
  // Update threat feed
  updateThreatFeed(filteredThreats);
  
  // Update statistics
  updateStatistics(filteredThreats);
}

function isInTimeRange(eventTime, range) {
  const now = new Date();
  const eventDate = new Date(eventTime);
  const diffHours = (now - eventDate) / (1000 * 60 * 60);
  
  switch(range) {
    case 'last24h': return diffHours <= 24;
    case 'last7d': return diffHours <= 168;
    case 'last30d': return diffHours <= 720;
    case 'all': return true;
    default: return true;
  }
}

function matchesSearch(threat, query) {
  return threat.threatId.toLowerCase().includes(query) ||
         threat.title.toLowerCase().includes(query) ||
         threat.description.toLowerCase().includes(query) ||
         threat.location.country.toLowerCase().includes(query);
}

function updateMapDisplay(filteredThreats) {
  // Clear existing markers
  clearMarkers();
  
  // Add filtered threats
  filteredThreats.forEach(threat => {
    addMarkerToMap(threat);
  });
  
  // Update bounds to show all markers
  if (filteredThreats.length > 0) {
    const bounds = L.latLngBounds(
      filteredThreats.map(t => t.location.coordinates)
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }
}
```

---

## 5. Real-Time Updates via WebSocket

### WebSocket Handler
```javascript
// Initialize WebSocket
socket.on('newThreat', (threat) => {
  console.log('New threat received:', threat.threatId);
  
  // Add to threats array
  threats.unshift(threat);
  
  // Check if threat passes current filters
  if (passesCurrentFilters(threat)) {
    // Add marker to map with animation
    const marker = addMarkerToMap(threat);
    animateNewMarker(marker);
    
    // Add to threat feed
    prependToThreatFeed(threat);
    
    // Show notification
    showNotification({
      title: `New ${threat.severity} ${threat.category} threat`,
      message: `${threat.title} in ${threat.location.country}`,
      severity: threat.severity,
      duration: 5000
    });
    
    // Play sound if critical
    if (threat.severity === 'critical') {
      playAlertSound();
    }
  }
  
  // Update statistics
  updateStatistics(threats);
});

socket.on('threatUpdate', (updatedThreat) => {
  console.log('Threat updated:', updatedThreat.threatId);
  
  // Find and update in array
  const index = threats.findIndex(t => t.threatId === updatedThreat.threatId);
  if (index !== -1) {
    const oldThreat = threats[index];
    threats[index] = updatedThreat;
    
    // Update marker if exists
    if (markers[updatedThreat.threatId]) {
      updateMarker(updatedThreat, oldThreat);
    }
    
    // Re-apply filters (threat might not qualify anymore)
    applyFilters();
  }
});

function animateNewMarker(marker) {
  const element = marker.getElement();
  if (element) {
    element.classList.add('marker-bounce');
    setTimeout(() => {
      element.classList.remove('marker-bounce');
    }, 1000);
  }
}

function updateMarker(newThreat, oldThreat) {
  const markerData = markers[newThreat.threatId];
  
  // Update color if severity changed
  if (newThreat.severity !== oldThreat.severity) {
    const newColor = getSeverityColor(newThreat.severity);
    const element = markerData.marker.getElement();
    if (element) {
      element.querySelector('.marker-container').style.backgroundColor = newColor;
    }
  }
  
  // Update popup content
  markerData.marker.setPopupContent(createPopupContent(newThreat));
  
  // Update stored threat data
  markerData.threat = newThreat;
}
```

---

## 6. Viewport-Based Loading (Performance Optimization)

### Load Only Visible Threats
```javascript
// Track map movement
map.on('moveend', () => {
  loadThreatsInViewport();
});

map.on('zoomend', () => {
  loadThreatsInViewport();
});

async function loadThreatsInViewport() {
  const bounds = map.getBounds();
  
  const query = {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
    zoom: map.getZoom()
  };
  
  // Fetch threats for current viewport
  const response = await fetch(
    `${API_URL}/api/threats/viewport?` + new URLSearchParams(query)
  );
  const data = await response.json();
  
  // Update map with viewport threats
  updateMapWithViewportThreats(data.threats);
}

function updateMapWithViewportThreats(viewportThreats) {
  // Get current marker IDs
  const currentMarkerIds = new Set(Object.keys(markers));
  
  // Get new threat IDs
  const newThreatIds = new Set(viewportThreats.map(t => t.threatId));
  
  // Remove markers not in viewport
  currentMarkerIds.forEach(id => {
    if (!newThreatIds.has(id)) {
      removeMarker(id);
    }
  });
  
  // Add/update markers in viewport
  viewportThreats.forEach(threat => {
    if (markers[threat.threatId]) {
      // Update existing marker if data changed
      updateMarker(threat, markers[threat.threatId].threat);
    } else {
      // Add new marker
      addMarkerToMap(threat);
    }
  });
}
```

---

## 7. Threat Relationships Visualization

### Display Related Threats
```javascript
function showThreatRelationships(threatId) {
  const mainThreat = threats.find(t => t.threatId === threatId);
  if (!mainThreat) return;
  
  // Get related threats
  const relatedThreatIds = mainThreat.relatedThreats || [];
  const relatedThreats = threats.filter(t => 
    relatedThreatIds.includes(t.threatId)
  );
  
  // Draw lines between related threats
  const lines = [];
  relatedThreats.forEach(relatedThreat => {
    const line = L.polyline(
      [
        mainThreat.location.coordinates,
        relatedThreat.location.coordinates
      ],
      {
        color: '#00d9ff',
        weight: 2,
        opacity: 0.6,
        dashArray: '5, 10'
      }
    ).addTo(map);
    
    lines.push(line);
  });
  
  // Highlight related markers
  relatedThreats.forEach(threat => {
    if (markers[threat.threatId]) {
      const element = markers[threat.threatId].marker.getElement();
      element.classList.add('related-highlight');
    }
  });
  
  // Store for cleanup
  return {
    lines: lines,
    highlightedMarkers: relatedThreatIds
  };
}

function clearRelationshipVisualization(visualization) {
  // Remove lines
  visualization.lines.forEach(line => map.removeLayer(line));
  
  // Remove highlights
  visualization.highlightedMarkers.forEach(threatId => {
    if (markers[threatId]) {
      const element = markers[threatId].marker.getElement();
      element.classList.remove('related-highlight');
    }
  });
}
```

---

## 8. Heatmap Visualization

### Create Threat Density Heatmap
```javascript
// Include leaflet-heat plugin
// <script src="leaflet-heat.js"></script>

function createHeatmap() {
  // Prepare heatmap data
  const heatmapData = threats.map(threat => {
    // [lat, lng, intensity]
    const intensity = getSeverityIntensity(threat.severity);
    return [
      threat.location.coordinates[0],
      threat.location.coordinates[1],
      intensity
    ];
  });
  
  // Create heatmap layer
  const heatLayer = L.heatLayer(heatmapData, {
    radius: 25,
    blur: 35,
    maxZoom: 10,
    max: 1.0,
    gradient: {
      0.0: '#6bcf7f',
      0.3: '#ffd93d',
      0.6: '#ff8c42',
      1.0: '#ff4444'
    }
  });
  
  return heatLayer;
}

function getSeverityIntensity(severity) {
  const intensities = {
    critical: 1.0,
    high: 0.7,
    medium: 0.4,
    low: 0.2
  };
  return intensities[severity] || 0.5;
}

// Toggle between marker view and heatmap
function toggleHeatmap() {
  const heatmapBtn = document.getElementById('heatmap-toggle');
  
  if (heatmapBtn.dataset.active === 'true') {
    // Remove heatmap, show markers
    if (window.currentHeatmap) {
      map.removeLayer(window.currentHeatmap);
    }
    Object.values(markers).forEach(m => m.marker.addTo(map));
    heatmapBtn.dataset.active = 'false';
    heatmapBtn.textContent = 'Show Heatmap';
  } else {
    // Show heatmap, hide markers
    Object.values(markers).forEach(m => map.removeLayer(m.marker));
    window.currentHeatmap = createHeatmap();
    window.currentHeatmap.addTo(map);
    heatmapBtn.dataset.active = 'true';
    heatmapBtn.textContent = 'Show Markers';
  }
}
```

---

## 9. Search and Focus

### Search and Navigate to Threat
```javascript
async function searchThreats() {
  const query = document.getElementById('search-input').value;
  
  if (!query) {
    applyFilters();
    return;
  }
  
  // Search via API for server-side search
  const response = await fetch(
    `${API_URL}/api/threats/search/${encodeURIComponent(query)}`
  );
  const data = await response.json();
  
  if (data.threats && data.threats.length > 0) {
    // Display search results
    displaySearchResults(data.threats);
    
    // Focus on first result
    focusOnThreat(data.threats[0]);
  } else {
    showNotification({
      title: 'No Results',
      message: `No threats found matching "${query}"`,
      severity: 'medium'
    });
  }
}

function focusOnThreat(threat) {
  // Pan and zoom to threat
  map.setView(
    threat.location.coordinates,
    10,  // Zoom level
    {
      animate: true,
      duration: 1
    }
  );
  
  // Open marker popup
  if (markers[threat.threatId]) {
    markers[threat.threatId].marker.openPopup();
    
    // Highlight marker temporarily
    const element = markers[threat.threatId].marker.getElement();
    element.classList.add('highlight-pulse');
    setTimeout(() => {
      element.classList.remove('highlight-pulse');
    }, 3000);
  }
}
```

---

## 10. Statistics and Analytics

### Calculate and Display Statistics
```javascript
function updateStatistics(threatList = threats) {
  const stats = {
    total: threatList.length,
    active: threatList.filter(t => t.status === 'ongoing').length,
    critical: threatList.filter(t => t.severity === 'critical').length,
    byCategory: {},
    byRegion: {},
    avgConfidence: 0
  };
  
  // Count by category
  threatList.forEach(threat => {
    stats.byCategory[threat.category] = 
      (stats.byCategory[threat.category] || 0) + 1;
    
    stats.byRegion[threat.location.region] = 
      (stats.byRegion[threat.location.region] || 0) + 1;
  });
  
  // Calculate average confidence
  if (threatList.length > 0) {
    const totalConfidence = threatList.reduce(
      (sum, t) => sum + (t.confidence || 0), 
      0
    );
    stats.avgConfidence = Math.round(totalConfidence / threatList.length);
  }
  
  // Update UI
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-active').textContent = stats.active;
  document.getElementById('stat-critical').textContent = stats.critical;
  document.getElementById('stat-confidence').textContent = 
    stats.avgConfidence + '%';
  
  // Update category breakdown
  updateCategoryChart(stats.byCategory);
  
  // Update regional heatmap
  updateRegionalStats(stats.byRegion);
}

function updateCategoryChart(categoryData) {
  const container = document.getElementById('category-stats');
  container.innerHTML = '';
  
  Object.entries(categoryData).forEach(([category, count]) => {
    const bar = document.createElement('div');
    bar.className = 'stat-bar';
    bar.innerHTML = `
      <span class="stat-label">${category}</span>
      <div class="stat-bar-fill ${category}" 
           style="width: ${(count / threats.length) * 100}%">
        <span class="stat-count">${count}</span>
      </div>
    `;
    container.appendChild(bar);
  });
}
```

---

## Summary

These implementation examples demonstrate:

1. **Creating and processing threats** with proper data structure
2. **Map rendering** with color-coded, animated markers
3. **Marker clustering** for performance with many threats
4. **Filtering system** for category, severity, timeline, and search
5. **Real-time updates** via WebSocket with animations
6. **Performance optimization** with viewport-based loading
7. **Relationship visualization** between connected threats
8. **Heatmap view** for threat density visualization
9. **Search and focus** functionality for finding specific threats
10. **Statistics and analytics** display

All examples align with the data structure defined in [MAP_DATA_STRUCTURE.md](MAP_DATA_STRUCTURE.md) and can be integrated into your existing codebase.
