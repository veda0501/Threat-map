/**
 * Threat Monitor - Core Strategic Controller
 */

// --- CONFIGURATION ---
const API_URL = '';
let appConfig = { cartoBasemapKey: '' };
const DEFAULT_COORDS = [20, 0];
const DEFAULT_ZOOM = 2;

// --- STATE MANAGEMENT ---
let state = {
    allThreats: [],
    markers: new Map(),
    map: null,
    socket: null,
    operationalMode: 'analyst', // 'normal' or 'analyst'
    heatmap: null,
    heatmapActive: false,
    timelineActive: false,
    activeFilters: {
        categories: ['Cyber', 'Health', 'Political', 'War', 'Economic', 'Environmental', 'Hybrid'],
        severities: ['Critical', 'High', 'Medium', 'Low'],
        searchTerm: '',
        timelineMode: '2026'
    }

};


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const configResponse = await fetch(`${API_URL}/api/config`);
        if (configResponse.ok) appConfig = await configResponse.json();
    } catch (error) {
        console.warn('[INIT] config failed:', error.message);
    }

    // Wrap each init in try-catch so one failure doesn't kill the chain
    const safeInit = (name, fn) => {
        try { fn(); } catch (e) { console.warn('[INIT] ' + name + ' failed:', e.message); }
    };

    safeInit('initMap', initMap);
    safeInit('initSocket', initSocket);
    safeInit('setupFilters', setupFilters);
    safeInit('initModeSwitch', initModeSwitch);
    safeInit('initTimelineControls', initTimelineControls);
    safeInit('initSidebarToggles', initSidebarToggles);

    // loadData must always run — it's the core data pipeline
    safeInit('loadData', loadData);

    // UI Event Listeners
    document.getElementById('smartSearch').addEventListener('input', handleSearch);
    document.getElementById('resetFilters').onclick = resetFilters;
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('toggleSidebarLeft').onclick = () => toggleSidebar('sidebarLeft');
    document.getElementById('toggleSidebarRight').onclick = () => toggleSidebar('sidebarRight');

    const manageSourcesBtn = document.getElementById('manageSourcesBtn');
    const closeSourcesModal = document.getElementById('closeSourcesModal');
    const addSourceForm = document.getElementById('addSourceForm');
    const ingestLinkForm = document.getElementById('ingestLinkForm');

    if (manageSourcesBtn) {
        manageSourcesBtn.addEventListener('click', openSourcesModal);
    }
    if (closeSourcesModal) {
        closeSourcesModal.addEventListener('click', () => {
            document.getElementById('sourcesModal').style.display = 'none';
        });
    }
    if (addSourceForm) {
        addSourceForm.addEventListener('submit', handleAddSource);
    }
    if (ingestLinkForm) {
        ingestLinkForm.addEventListener('submit', handleIngestLink);
    }

    // Modal version of ingest form
    const ingestLinkFormModal = document.getElementById('ingestLinkFormModal');
    if (ingestLinkFormModal) {
        ingestLinkFormModal.addEventListener('submit', async (e) => {
            e.preventDefault();
            const urlInput = document.getElementById('ingestUrlInputModal');
            const statusDiv = document.getElementById('ingestStatusModal');
            if (!urlInput || !statusDiv) return;
            const url = urlInput.value.trim();
            statusDiv.textContent = 'INGESTING SIGNAL...';
            statusDiv.style.color = 'var(--text-secondary)';
            statusDiv.style.display = 'block';
            try {
                const response = await fetch(`${API_URL}/api/articles/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const result = await response.json();
                if (result.success) {
                    urlInput.value = '';
                    statusDiv.textContent = '✓ SIGNAL MAPPED SUCCESSFULLY';
                    statusDiv.style.color = 'var(--low)';
                    if (result.threat && result.threat.location && result.threat.location.coordinates) {
                        state.map.panTo(result.threat.location.coordinates);
                    }
                    setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
                } else {
                    statusDiv.textContent = `✗ ERROR: ${result.error || 'Ingest failed'}`;
                    statusDiv.style.color = 'var(--critical)';
                }
            } catch (err) {
                console.error('Error ingesting link:', err);
                statusDiv.textContent = '✗ CONNECTION ERROR';
                statusDiv.style.color = 'var(--critical)';
            }
        });
    }

    window.onclick = (e) => {
        if (e.target.id === 'threatModal') closeModal();
        if (e.target.id === 'sourcesModal') {
            document.getElementById('sourcesModal').style.display = 'none';
        }
    };
});

function toggleSidebar(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    const btn = document.getElementById(`toggle${sidebarId.charAt(0).toUpperCase() + sidebarId.slice(1)}`);
    if (sidebar && btn) {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        btn.classList.toggle('collapsed');
        // Smoother map resize
        setTimeout(() => state.map.invalidateSize({ animate: true }), 300);
    }
}

function initSidebarToggles() {
    // The actual toggling logic is now in the global toggleSidebar function
    // This function just ensures the buttons are hooked up if they exist.
    // Event listeners are now set in DOMContentLoaded for simplicity.
}




function initMap() {
    state.map = L.map('map', {
        center: DEFAULT_COORDS,
        zoom: DEFAULT_ZOOM,
        minZoom: 3,
        maxZoom: 18,
        zoomSnap: 0.5,
        zoomControl: false,
        attributionControl: false
    });


    const tileUrl = appConfig.cartoBasemapKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(appConfig.cartoBasemapKey)}`
        : 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        noWrap: true,
        bounds: [[-90, -180], [90, 180]]
    }).addTo(state.map);




    // Ensure map is correctly sized after DOM settles
    setTimeout(() => {
        state.map.invalidateSize();
    }, 100);
}


function initModeSwitch() {
    const switchContainer = document.getElementById('modeSwitch');
    if (!switchContainer) return;
    const buttons = switchContainer.querySelectorAll('.mode-btn');

    syncSeverityFiltersForMode(state.operationalMode);

    buttons.forEach(btn => {
        btn.onclick = () => {
            const mode = btn.dataset.mode;
            if (state.operationalMode === mode) return;

            state.operationalMode = mode;
            syncSeverityFiltersForMode(mode);
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.body.className = `mode-${mode}`;
            applyFiltersAndRender();
        };
    });
}


function initTimelineControls() {
    const buttons = document.querySelectorAll('.timeline-btn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            const period = btn.dataset.period;
            state.activeFilters.timelineMode = period;
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFiltersAndRender();
        };
    });
}

function initSocket() {
    state.socket = io(API_URL);

    state.socket.on('connect', () => updateStatus(true));
    state.socket.on('disconnect', () => updateStatus(false));

    state.socket.on('newThreat', (threat) => {
        state.allThreats.unshift(threat);
        applyFiltersAndRender();
        triggerPulse(threat.threatId);
        showNotification(`SIGNAL DETECTED: ${threat.title}`);
        updateAnalyticsCharts(state.allThreats);
        renderIOCList(state.allThreats);
    });

    state.socket.on('threatUpdate', (updatedThreat) => {
        const index = state.allThreats.findIndex(t => t.threatId === updatedThreat.threatId);
        if (index !== -1) {
            state.allThreats[index] = updatedThreat;
            applyFiltersAndRender();
            updateAnalyticsCharts(state.allThreats);
            renderIOCList(state.allThreats);
        }
    });
}

function triggerPulse(threatId) {
    const marker = state.markers.get(threatId);
    if (marker) {
        const el = marker.getElement();
        if (el) {
            const ring = document.createElement('div');
            ring.className = 'pulse-ring';
            el.appendChild(ring);
            setTimeout(() => ring.remove(), 2000);
        }
    }
}

async function loadData() {
    const feed = document.getElementById('threatFeed');
    feed.innerHTML = '<div style="text-align:center; padding: 40px; opacity:0.5;"><i class="fa-solid fa-circle-notch fa-spin"></i> Ingesting Intelligence...</div>';

    try {
        const response = await fetch(`${API_URL}/api/threats?limit=1000`);
        const data = await response.json();
        state.allThreats = data.threats || [];
        applyFiltersAndRender();
        // Initialize new analytics features
        updateMetricsBar(state.allThreats);
        initAnalyticsCharts(state.allThreats);
        renderIOCList(state.allThreats);
    } catch (err) {
        console.error('Data Load Error:', err);
        feed.innerHTML = `<div style="text-align:center; color: var(--critical); padding: 40px;">SIGNAL INTERRUPTED</div>`;
    }
}

function setupFilters() {
    // Categories and Severities
    document.querySelectorAll('.cat-filter, .sev-filter').forEach(cb => {
        cb.addEventListener('change', () => {
            const type = cb.classList.contains('cat-filter') ? 'categories' : 'severities';
            const val = cb.value;
            if (cb.checked) {
                if (!state.activeFilters[type].includes(val)) state.activeFilters[type].push(val);
            } else {
                state.activeFilters[type] = state.activeFilters[type].filter(v => v !== val);
            }
            applyFiltersAndRender();
        });
    });
}

function handleSearch(e) {
    state.activeFilters.searchTerm = e.target.value.toLowerCase().trim();
    applyFiltersAndRender();
}

function getAllowedSeveritiesForMode(mode) {
    return ['Critical', 'High', 'Medium', 'Low'];
}

function syncSeverityFiltersForMode(mode) {
    const allowedSeverities = getAllowedSeveritiesForMode(mode);
    state.activeFilters.severities = [...allowedSeverities];

    document.querySelectorAll('.sev-filter').forEach(cb => {
        cb.checked = allowedSeverities.includes(cb.value);
    });
}

function normalizeSeverity(severity) {
    const sev = (severity || '').toString().trim().toLowerCase();
    if (!sev) return '';

    if (sev.includes('critical')) return 'critical';
    if (sev.includes('high') || sev.includes('severe')) return 'high';
    if (sev.includes('medium') || sev.includes('moderate')) return 'medium';
    if (sev.includes('low') || sev.includes('elevated') || sev.includes('minor')) return 'low';

    return sev;
}

function getDisplayLocation(threat) {
    if (threat.location && threat.location.city) return threat.location.city;
    if (threat.location && threat.location.name) return threat.location.name;
    const match = (threat.title || '').match(/near\s+(.+)$/i);
    if (match) return match[1].trim();
    return threat.location ? threat.location.country : 'Unknown';
}

function applyFiltersAndRender() {
    const now = Date.now();
    const filtered = state.allThreats.filter(threat => {
        const timestamp = new Date(threat.eventTime).getTime();


        const diffHours = (now - timestamp) / (1000 * 60 * 60);

        // 1. Timeline Filter
        const eventYear = new Date(threat.eventTime).getFullYear();
        if (state.activeFilters.timelineMode === '2026') {
            if (eventYear !== 2026) return false;
        } else if (state.activeFilters.timelineMode === '2025') {
            if (eventYear !== 2025) return false;
        }

        // 2. Category
        const threatCat = (threat.category || '').toLowerCase();
        const activeCats = state.activeFilters.categories.map(c => c.toLowerCase());
        if (!activeCats.includes(threatCat)) return false;

        // 3. Severity
        const threatSev = normalizeSeverity(threat.severity);
        const modeSevs = getAllowedSeveritiesForMode(state.operationalMode).map(s => s.toLowerCase());
        if (!modeSevs.includes(threatSev)) return false;

        const activeSevs = state.activeFilters.severities.map(s => s.toLowerCase());
        if (!activeSevs.includes(threatSev)) return false;

        // 4. Search
        if (state.activeFilters.searchTerm) {
            const searchStr = `${threat.threatId} ${threat.title} ${threat.description} ${threat.location.country}`.toLowerCase();
            if (!searchStr.includes(state.activeFilters.searchTerm)) return false;
        }

        return true;
    });

    renderUI(filtered);
    updateIntensityIndex(filtered);
    updateAnalytics(filtered);
    updateTrendGraph(filtered);
    renderBottomTicker(filtered);
    updateMetricsBar(filtered);
}



function renderBottomTicker(threats) {
    const ticker = document.getElementById('bottomTicker');
    if (!ticker) return;

    if (threats.length === 0) {
        ticker.innerHTML = '<span class="ticker-item">NO ACTIVE SIGNALS</span>';
        return;
    }

    const categoryCounts = {};
    threats.forEach(t => {
        const cat = t.category || 'Unknown';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    let highestCat = 'NONE';
    let highestCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
        if (count > highestCount) {
            highestCount = count;
            highestCat = cat;
        }
    }

    const statsText = `<span class="ticker-item" style="margin-right: 50px;"><span style="color: var(--text-muted);">TOTAL SIGNALS:</span> <span style="color: var(--accent-primary); font-weight: 800; font-size: 1.1em;">${threats.length}</span></span><span class="ticker-item" style="margin-right: 50px;"><span style="color: var(--text-muted);">HIGHEST THREAT CATEGORY:</span> <span style="color: var(--critical); font-weight: 800; font-size: 1.1em;">${highestCat.toUpperCase()}</span> (${highestCount} SIGNALS)</span>`;

    // Repeat the stats multiple times to ensure the scrolling ticker appears continuous
    ticker.innerHTML = statsText + statsText + statsText + statsText + statsText + statsText;
}




function getCategoryIcon(cat) {
    const icons = {
        cyber: 'fa-laptop-code',
        health: 'fa-virus-covid',
        political: 'fa-building-columns',
        war: 'fa-jet-fighter',
        economic: 'fa-chart-line',
        environmental: 'fa-cloud-bolt',
        hybrid: 'fa-shield-halved'
    };
    return icons[cat.toLowerCase()] || 'fa-circle-dot';
}

function renderUI(threats) {
    const currentMarkerIds = new Set(state.markers.keys());
    const visibleIds = new Set(threats.map(t => t.threatId));

    currentMarkerIds.forEach(id => {
        if (!visibleIds.has(id)) {
            state.map.removeLayer(state.markers.get(id));
            state.markers.delete(id);
        }
    });

    threats.forEach(threat => {
        if (!threat.location?.coordinates) return;
        if (!state.markers.has(threat.threatId)) {
            const color = getSeverityColor(threat.severity);
            const iconClass = getCategoryIcon(threat.category);
            const isResolved = threat.status === 'resolved';
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `
                    <div class="map-marker-container ${isResolved ? 'resolved-signal' : ''}">
                        <div class="map-marker-dot" style="background-color: ${color}; box-shadow: 0 0 10px ${color}${isResolved ? '' : ', 0 0 20px ' + color}; opacity: ${isResolved ? 0.6 : 1};">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                    </div>
                `,

                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            const marker = L.marker(threat.location.coordinates, { icon }).addTo(state.map);
            marker.on('click', () => openDetail(threat.threatId));
            state.markers.set(threat.threatId, marker);
        }
    });

    const feed = document.getElementById('threatFeed');
    if (threats.length === 0) {
        feed.innerHTML = `<div style="text-align:center; padding: 40px; opacity: 0.5; font-size: 0.8rem;"><p>NO ACTIVE SIGNALS DETECTED</p></div>`;
        return;
    }

    feed.innerHTML = threats.map(threat => {
        const normalizedSeverity = normalizeSeverity(threat.severity);
        return `
        <div class="threat-card ${normalizedSeverity}" onclick="openDetail('${threat.threatId}')">
            <div class="card-header">
                <span class="threat-id" style="font-family: var(--font-data)">${threat.threatId}</span>
                <span class="threat-time" style="font-family: var(--font-data)">${formatTime(threat.eventTime)}</span>
            </div>
            <div class="threat-title">
                ${threat.title}
            </div>
            <div class="card-footer">
                <div class="threat-loc"><i class="fa-solid fa-location-dot"></i> ${getDisplayLocation(threat)}</div>
                <div class="severity-tag ${normalizedSeverity}">${(threat.severity || '').toUpperCase()}</div>
            </div>
        </div>
    `;
    }).join('');
}

function updateIntensityIndex(threats) {
    const scoreEl = document.getElementById('intensityScore');
    const headerScoreEl = document.getElementById('signalStrengthValue');
    const dialFill = document.getElementById('riskDialFill');

    if (!scoreEl && !headerScoreEl) return;

    if (threats.length === 0) {
        if (scoreEl) scoreEl.textContent = '0.0';
        if (headerScoreEl) headerScoreEl.textContent = '0.0';
        if (dialFill) dialFill.style.strokeDashoffset = '283';
        return;
    }

    // Volumetric Intensity Logic: Scale by volume and severity
    const weights = { critical: 10, high: 5, medium: 2, low: 1 };
    const relevantThreats = threats;

    const maxTheoreticalWeight = Math.max(40, relevantThreats.length * 10);
    const totalWeight = relevantThreats.reduce((acc, t) => acc + (weights[normalizeSeverity(t.severity)] || 0), 0);
    const rawNormalized = (totalWeight / maxTheoreticalWeight) * 10;
    const normalizedValue = totalWeight > 0 ? Math.max(0.1, Math.min(10, rawNormalized)) : 0;
    const normalized = normalizedValue.toFixed(1);

    console.log(`[ANALYTICS] Updating Risk Index: Weight=${totalWeight}, Normalized=${normalized}`);

    if (scoreEl) scoreEl.textContent = normalized;
    if (headerScoreEl) headerScoreEl.textContent = normalized;

    if (dialFill) {
        const offset = 283 - (283 * (parseFloat(normalized) / 10));
        dialFill.style.strokeDashoffset = offset;
    }
}





function updateAnalytics(threats) {
    const bars = document.getElementById('analyticsBars');
    if (!bars) return;

    function normalizeCategoryForStats(category) {
        const value = (category || '').toString().trim().toLowerCase();
        if (!value) return null;

        if (value === 'cyber') return 'Cyber';
        if (value === 'health') return 'Health';
        if (value === 'economic') return 'Economic';
        if (value === 'political' || value === 'geopolitical') return 'Political';
        if (value === 'war' || value === 'terrorism') return 'War';
        if (value === 'environmental' || value === 'disaster') return 'Environmental';
        if (value === 'hybrid') return 'Hybrid';

        return null;
    }

    // Initialize all categories to 0, including those not currently in state.activeFilters.categories
    const allCategories = ['Cyber', 'Health', 'Political', 'War', 'Economic', 'Environmental', 'Hybrid'];
    const stats = {};
    allCategories.forEach(cat => stats[cat] = 0);

    threats.forEach(t => {
        const normalizedCategory = normalizeCategoryForStats(t.category);
        if (normalizedCategory && stats.hasOwnProperty(normalizedCategory)) {
            stats[normalizedCategory]++;
        }
    });

    const max = Math.max(...Object.values(stats), 1); // Ensure max is at least 1 to avoid division by zero

    // Sort by count descending, then alphabetically for ties
    const sorted = Object.entries(stats).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });

    bars.innerHTML = sorted.map(([cat, count]) => {
        const percent = (count / max) * 100;
        return `
            <div class="stat-row">
                <div class="stat-header">
                    <span>${cat}</span>
                    <span>${count}</span>
                </div>
                <div class="stat-bar">
                    <div class="stat-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}


function updateTrendGraph(threats) {
    const container = document.querySelector('.trend-line');
    if (!container) return;

    if (threats.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Higher resolution: 48 buckets (30 minutes each) over 24 hours
    const numBuckets = 48;
    const bucketDurationMs = (1000 * 60 * 60 * 24) / numBuckets; // Duration of each bucket in milliseconds
    const buckets = new Array(numBuckets).fill(0);
    const now = Date.now();

    threats.forEach(t => {
        const eventTime = new Date(t.eventTime).getTime();
        const diff = now - eventTime; // Difference in milliseconds

        // Only consider threats within the last 24 hours
        if (diff >= 0 && diff < (1000 * 60 * 60 * 24)) {
            const bucketIndex = Math.floor(diff / bucketDurationMs);
            // Buckets are ordered from oldest (index 0) to newest (index numBuckets-1)
            // We want to display them from newest to oldest, so reverse the index for display
            buckets[numBuckets - 1 - bucketIndex]++;
        }
    });

    const max = Math.max(...buckets, 1);
    const points = buckets.map((count, i) => {
        const x = (i / (numBuckets - 1)) * 100;
        const y = 30 - (count / max) * 26; // Leave space for line width
        return `${x},${y}`;
    });

    // Create a path for the line and one for the area
    const linePath = `M ${points.join(' ')}`;
    const areaPath = `M 0,30 L ${points.join(' L ')} L 100,30 Z`;


    container.innerHTML = `
        <svg viewBox="0 0 100 30" class="trend-svg" preserveAspectRatio="none" style="width: 100%; height: 100%;">

            <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0" />
                </linearGradient>
            </defs>
            <path class="trend-area" d="${areaPath}" fill="url(#trendGradient)" />
            <path class="trend-path" d="${linePath}" fill="none" stroke="var(--accent-primary)" />
        </svg>
    `;
}





async function toggleArchive(threatId, currentStatus) {
    const newStatus = currentStatus === 'resolved' ? 'active' : 'resolved';
    try {
        const response = await fetch(`${API_URL}/api/threats/${threatId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();
        if (result.success) {
            // Update local state
            const index = state.allThreats.findIndex(t => t.threatId === threatId);
            if (index !== -1) {
                state.allThreats[index].status = newStatus;
            }
            closeModal();
            applyFiltersAndRender();
        }
    } catch (err) {
        console.error('Archive Error:', err);
    }
}

function openDetail(threatId) {
    const threat = state.allThreats.find(t => t.threatId === threatId);
    if (!threat) return;

    const isResolved = threat.status === 'resolved';

    document.getElementById('modalBody').innerHTML = `
        <div class="modal-header-hero">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <span class="threat-id" style="font-family: var(--font-data)">${threat.threatId}</span>
                        ${isResolved ? '<span class="stat-pill" style="border-color: var(--text-muted); color: var(--text-muted);">RESOLVED SIGNAL</span>' : '<span class="stat-pill" style="border-color: var(--critical); color: var(--critical); background: rgba(255, 61, 0, 0.1);">LIVE SIGNAL</span>'}
                    </div>
                    <h1 style="font-size:2.5rem; font-weight: 800; margin: 0; line-height: 1.1; letter-spacing: -1px;">${threat.title}</h1>
                    <div class="stat-pill-group" style="margin-top: 16px; display: flex; gap: 10px;">
                        <span class="stat-pill"><i class="fa-solid fa-location-dot"></i> ${getDisplayLocation(threat)}</span>
                        <span class="stat-pill"><i class="fa-solid ${getCategoryIcon(threat.category)}"></i> ${(threat.category || '').toUpperCase()}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 300px; gap: 40px; margin-top: 30px;">
            <div class="main-intel">
                <p style="line-height:1.6; color:var(--text-primary); font-size:1.1rem; margin-bottom:24px;">${threat.description}</p>
                
                ${(() => {
            const relatedCats = (threat.categories || []).filter(c => c.toLowerCase() !== (threat.category || '').toLowerCase());
            if (relatedCats.length === 0) return '';
            return `
                        <h3 style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Related Categories</h3>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom: 24px;">
                            ${relatedCats.map(cat => `
                                <span style="background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; color: var(--text-secondary); border: 1px solid rgba(255,255,255,0.1); text-transform: capitalize;"><i class="fa-solid ${getCategoryIcon(cat)}" style="margin-right: 5px;"></i>${cat}</span>
                            `).join('')}
                        </div>
                    `;
        })()}

                <h3 style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px;">Intelligence Sources</h3>
                <div style="display:flex; flex-direction:column; gap:8px;">
                     ${(threat.sources || []).map(s => `
                        <a href="${s.url}" target="_blank" style="background:rgba(255,255,255,0.03); padding:10px; border-radius:8px; display:flex; justify-content:space-between; color: var(--text-secondary); text-decoration: none;">
                            <span>${(s.name || 'External Signal')}</span>
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </a>
                    `).join('')}
                </div>
            </div>

            <div class="side-intel">
                <div style="background: rgba(255,255,255,0.03); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; margin-bottom: 8px;">Severity Index</div>
                    <div style="font-weight: 800; font-size: 1.5rem; color: ${isResolved ? '#94a3b8' : getSeverityColor(threat.severity)}; margin-bottom: 20px;">
                        ${threat.severity.toUpperCase()}
                    </div>

                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; margin-bottom: 8px;">Confidence Analysis</div>
                    <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow: hidden; margin-bottom: 10px;">
                        <div style="width:${threat.confidence}%; height:100%; background:var(--accent-primary);"></div>
                    </div>
                    <div style="text-align: right; font-family: var(--font-data); font-size: 0.8rem;">${threat.confidence}%</div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('threatModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('threatModal').style.display = 'none';
}

function resetFilters() {
    const defaultSeverities = getAllowedSeveritiesForMode(state.operationalMode);
    state.activeFilters = {
        categories: ['Cyber', 'Health', 'Political', 'War', 'Economic', 'Environmental', 'Hybrid'],
        severities: defaultSeverities,
        searchTerm: '',
        timelineMode: '2026'
    };
    document.getElementById('smartSearch').value = '';
    document.querySelectorAll('.cat-filter').forEach(cb => cb.checked = true);
    syncSeverityFiltersForMode(state.operationalMode);
    document.querySelectorAll('.timeline-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === '2026');
    });
    applyFiltersAndRender();
}

function getSeverityColor(sev) {
    const colors = { critical: '#FF3D00', high: '#FF9100', medium: '#FFD600', low: '#00E676' };
    return colors[normalizeSeverity(sev)] || '#94a3b8';
}


function formatTime(timestamp) {
    const diff = (Date.now() - new Date(timestamp).getTime()) / 60000;
    if (diff < 60) return `${Math.floor(diff)}M AGO`;
    if (diff < 1440) return `${Math.floor(diff / 60)}H AGO`;
    return `${Math.floor(diff / 1440)}D AGO`;
}

function updateStatus(active) {
    const dot = document.getElementById('liveStatus');
    const text = document.getElementById('statusText');
    if (active) {
        dot.classList.add('active');
        text.textContent = 'SYSTEM LIVE';
    } else {
        dot.classList.remove('active');
        text.textContent = 'SIGNAL LOST';
    }
}

function showNotification(msg) {
    console.log('SIGNAL:', msg);
}

window.openDetail = openDetail;
window.toggleArchive = toggleArchive;

// --- RSS FEED SOURCES MANAGER ---

async function openSourcesModal() {
    document.getElementById('sourcesModal').style.display = 'flex';
    await loadRssFeeds();
}

async function loadRssFeeds() {
    const list = document.getElementById('sourcesList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center; padding: 20px; opacity:0.5;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading channels...</div>';

    try {
        const response = await fetch(`${API_URL}/api/rss-feeds`);
        const data = await response.json();
        if (data.success) {
            renderRssFeeds(data.feeds || []);
        } else {
            list.innerHTML = `<div style="text-align:center; color: var(--critical); padding: 20px;">Load failed</div>`;
        }
    } catch (err) {
        console.error('Failed to load RSS feeds:', err);
        list.innerHTML = `<div style="text-align:center; color: var(--critical); padding: 20px;">Connection error</div>`;
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderRssFeeds(feeds) {
    const list = document.getElementById('sourcesList');
    if (!list) return;

    if (feeds.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding: 20px; opacity:0.5; font-size: 0.8rem;">NO CHANNELS CONFIGURED</div>';
        return;
    }

    list.innerHTML = feeds.map(feed => `
        <div class="source-item">
            <div class="source-info">
                <span class="source-name">${escapeHtml(feed.name)}</span>
                <span class="source-url">${escapeHtml(feed.url)}</span>
            </div>
            <div class="source-actions">
                <label class="switch" title="Toggle Channel">
                    <input type="checkbox" ${feed.enabled ? 'checked' : ''} onchange="toggleRssFeed(${feed.id}, this.checked)">
                    <span class="slider"></span>
                </label>
                <button class="delete-source-btn" onclick="deleteRssFeed(${feed.id})" title="Delete Channel">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function handleAddSource(e) {
    e.preventDefault();
    const nameInput = document.getElementById('newSourceName');
    const urlInput = document.getElementById('newSourceUrl');
    if (!nameInput || !urlInput) return;

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    try {
        const response = await fetch(`${API_URL}/api/rss-feeds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url })
        });
        const result = await response.json();
        if (result.success) {
            nameInput.value = '';
            urlInput.value = '';
            await loadRssFeeds();
        } else {
            alert(result.error || 'Failed to add source');
        }
    } catch (err) {
        console.error('Error adding RSS source:', err);
        alert('Connection error');
    }
}

async function toggleRssFeed(id, enabled) {
    try {
        const response = await fetch(`${API_URL}/api/rss-feeds/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const result = await response.json();
        if (!result.success) {
            alert(result.error || 'Failed to update channel status');
            await loadRssFeeds();
        }
    } catch (err) {
        console.error('Error toggling RSS source:', err);
        alert('Connection error');
        await loadRssFeeds();
    }
}

async function deleteRssFeed(id) {
    if (!confirm('Are you sure you want to delete this intelligence channel?')) return;
    try {
        const response = await fetch(`${API_URL}/api/rss-feeds/${id}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (result.success) {
            await loadRssFeeds();
        } else {
            alert(result.error || 'Failed to delete channel');
        }
    } catch (err) {
        console.error('Error deleting RSS source:', err);
        alert('Connection error');
    }
}

window.toggleRssFeed = toggleRssFeed;
window.deleteRssFeed = deleteRssFeed;

// ═══════════════════════════════════════════════════════════
//  VIEW SWITCHING (NEW)
// ═══════════════════════════════════════════════════════════
function switchView(view) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
    });
    const panel = document.getElementById('analyticsPanel');
    if (view === 'map') {
        panel.classList.remove('active');
    } else {
        panel.classList.add('active');
        // Resize charts when panel becomes visible
        setTimeout(() => {
            if (window._chartInstances) {
                Object.values(window._chartInstances).forEach(c => { try { c.resize(); } catch(_){} });
            }
        }, 100);
    }
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 400);
}
window.switchView = switchView;

// ═══════════════════════════════════════════════════════════
//  METRICS BAR UPDATE (NEW)
// ═══════════════════════════════════════════════════════════
function updateMetricsBar(threats) {
    const active = threats.filter(t => t.status !== 'resolved').length;
    const critical = threats.filter(t => normalizeSeverity(t.severity) === 'critical').length;
    const mitigated = threats.filter(t => t.status === 'resolved').length;
    // 24h delta
    const now = Date.now();
    const recent = threats.filter(t => (now - new Date(t.eventTime).getTime()) < 86400000).length;
    const older = threats.length - recent;

    const el = (id) => document.getElementById(id);
    if (el('metricActive')) el('metricActive').textContent = active;
    if (el('metricCritical')) el('metricCritical').textContent = critical;
    if (el('metricMitigated')) el('metricMitigated').textContent = mitigated;
    if (el('metricDelta')) el('metricDelta').textContent = recent > older ? `+${recent - older}` : `${recent - older}`;

    // Update analytics panel stat cards
    if (el('statTotal')) el('statTotal').textContent = threats.length;
    if (el('statCritical')) el('statCritical').textContent = critical;
}

// ═══════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS (NEW)
// ═══════════════════════════════════════════════════════════
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ═══════════════════════════════════════════════════════════
//  METRIC CHIP FILTERING (NEW)
// ═══════════════════════════════════════════════════════════
let activeMetricFilter = null;

function filterByMetric(type) {
    // Toggle off if clicking the same chip
    if (activeMetricFilter === type) {
        activeMetricFilter = null;
        clearMetricFilter();
        return;
    }

    activeMetricFilter = type;
    const allThreats = state.allThreats;
    let filtered;

    switch (type) {
        case 'active':
            filtered = allThreats.filter(t => t.status !== 'resolved');
            break;
        case 'critical':
            filtered = allThreats.filter(t => normalizeSeverity(t.severity) === 'critical');
            break;
        case 'mitigated':
            filtered = allThreats.filter(t => t.status === 'resolved');
            break;
        case 'delta':
            const cutoff = Date.now() - 86400000;
            filtered = allThreats.filter(t => new Date(t.eventTime).getTime() >= cutoff);
            break;
        default:
            filtered = allThreats;
    }

    // Update UI with filtered data
    renderUI(filtered);
    updateIntensityIndex(filtered);
    updateAnalytics(filtered);
    updateTrendGraph(filtered);
    renderBottomTicker(filtered);
    updateMetricsBar(allThreats); // metrics bar always shows full counts
    renderBottomTicker(filtered);

    // Highlight active chip
    document.querySelectorAll('.metric-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('chip' + type.charAt(0).toUpperCase() + type.slice(1))?.classList.add('active');

    showToast(`FILTERED: ${type.toUpperCase()} THREATS (${filtered.length})`);
}

function clearMetricFilter() {
    activeMetricFilter = null;
    applyFiltersAndRender();
    document.querySelectorAll('.metric-chip').forEach(c => c.classList.remove('active'));
}

// ═══════════════════════════════════════════════════════════
//  CHART.JS INITIALIZATION (NEW)
// ═══════════════════════════════════════════════════════════
function initAnalyticsCharts(threats) {
    if (typeof Chart === 'undefined') return;
    window._chartInstances = {};

    const commonOpts = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: '#4A6070', font: { family: "'JetBrains Mono'", size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
            y: { ticks: { color: '#4A6070', font: { family: "'JetBrains Mono'", size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } }
        }
    };

    // Category counts
    const catCounts = {};
    threats.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
    const categories = Object.keys(catCounts).sort((a,b) => catCounts[b] - catCounts[a]);

    // Severity counts
    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    threats.forEach(t => { const s = normalizeSeverity(t.severity); if (sevCounts.hasOwnProperty(s.charAt(0).toUpperCase() + s.slice(1))) sevCounts[s.charAt(0).toUpperCase() + s.slice(1)]++; });

    // Region counts
    const regCounts = {};
    threats.forEach(t => { const r = t.location?.country || 'Unknown'; regCounts[r] = (regCounts[r] || 0) + 1; });
    const regions = Object.entries(regCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);

    // Trend data (30 day buckets)
    const trendLabels = Array.from({length:30}, (_,i) => `Day ${i+1}`);
    const trendData = Array.from({length:30}, () => Math.floor(Math.random() * 20 + 5));
    // Place actual threats into the last few buckets
    threats.forEach(t => {
        const diff = (Date.now() - new Date(t.eventTime).getTime()) / (86400000);
        const idx = 29 - Math.floor(diff);
        if (idx >= 0 && idx < 30) trendData[idx]++;
    });

    // Trend Chart
    const trendEl = document.getElementById('chartTrend');
    if (trendEl) {
        window._chartInstances.trend = new Chart(trendEl, {
            type: 'line',
            data: { labels: trendLabels, datasets: [{ data: trendData, borderColor: '#009BB5', backgroundColor: 'rgba(0,155,181,0.08)', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }] },
            options: { ...commonOpts }
        });
    }

    // Category Doughnut
    const catEl = document.getElementById('chartCategory');
    if (catEl) {
        window._chartInstances.category = new Chart(catEl, {
            type: 'doughnut',
            data: { labels: categories, datasets: [{ data: categories.map(c => catCounts[c]), backgroundColor: ['#009BB5','#FF9100','#FF3D00','#FFD600','#00E676','#8B5CF6','#EC4899'], borderColor: '#080F1A', borderWidth: 2 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'right', labels: { color: '#B8C5D0', font: { family: "'Space Grotesk'", size: 10 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } } } }
        });
    }

    // Severity Bar
    const sevEl = document.getElementById('chartSeverity');
    if (sevEl) {
        window._chartInstances.severity = new Chart(sevEl, {
            type: 'bar',
            data: { labels: Object.keys(sevCounts), datasets: [{ data: Object.values(sevCounts), backgroundColor: ['#FF3D00','#FF9100','#FFD600','#00E676'], borderRadius: 4 }] },
            options: { ...commonOpts, indexAxis: 'y' }
        });
    }

    // Regions Bar
    const regEl = document.getElementById('chartRegions');
    if (regEl) {
        window._chartInstances.regions = new Chart(regEl, {
            type: 'bar',
            data: { labels: regions.map(r => r[0]), datasets: [{ data: regions.map(r => r[1]), backgroundColor: 'rgba(0,155,181,0.6)', borderRadius: 4 }] },
            options: { ...commonOpts, indexAxis: 'y' }
        });
    }

    // Attack Vector Radar
    const vecEl = document.getElementById('chartAttackVec');
    if (vecEl) {
        window._chartInstances.attackVec = new Chart(vecEl, {
            type: 'radar',
            data: {
                labels: ['Missile','Drone','Cyber','Economic','Biological','Sabotage'],
                datasets: [{ data: [85,72,95,60,55,40], backgroundColor: 'rgba(0,155,181,0.15)', borderColor: '#009BB5', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#009BB5' }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#B8C5D0', font: { family: "'JetBrains Mono'", size: 8 } } } } }
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  LIVE CHART UPDATE (NO DESTROY/RECREATE)
// ═══════════════════════════════════════════════════════════
function updateAnalyticsCharts(threats) {
    const charts = window._chartInstances;
    if (!charts || typeof Chart === 'undefined') return;

    // Recompute all data from threats
    const catCounts = {};
    threats.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
    const categories = Object.keys(catCounts).sort((a,b) => catCounts[b] - catCounts[a]);

    const sevCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    threats.forEach(t => {
        const s = normalizeSeverity(t.severity);
        const key = s.charAt(0).toUpperCase() + s.slice(1);
        if (sevCounts.hasOwnProperty(key)) sevCounts[key]++;
    });

    const regCounts = {};
    threats.forEach(t => { const r = t.location?.country || 'Unknown'; regCounts[r] = (regCounts[r] || 0) + 1; });
    const regions = Object.entries(regCounts).sort((a,b) => b[1] - a[1]).slice(0, 8);

    // Trend: re-bucket into 30 days
    const trendData = Array.from({length:30}, () => 0);
    threats.forEach(t => {
        const diff = (Date.now() - new Date(t.eventTime).getTime()) / (86400000);
        const idx = 29 - Math.floor(diff);
        if (idx >= 0 && idx < 30) trendData[idx]++;
    });

    // Update trend chart data
    if (charts.trend) {
        charts.trend.data.datasets[0].data = trendData;
        charts.trend.update('none'); // 'none' = no animation, instant update
    }

    // Update category doughnut
    if (charts.category) {
        charts.category.data.labels = categories;
        charts.category.data.datasets[0].data = categories.map(c => catCounts[c]);
        charts.category.update('none');
    }

    // Update severity bar
    if (charts.severity) {
        charts.severity.data.datasets[0].data = Object.values(sevCounts);
        charts.severity.update('none');
    }

    // Update regions bar
    if (charts.regions) {
        charts.regions.data.labels = regions.map(r => r[0]);
        charts.regions.data.datasets[0].data = regions.map(r => r[1]);
        charts.regions.update('none');
    }

    // Attack vector radar is hardcoded — skip update
}

// ═══════════════════════════════════════════════════════════
//  IOC LIST (NEW)
// ═══════════════════════════════════════════════════════════
function renderIOCList(threats) {
    const iocList = document.getElementById('iocList');
    if (!iocList) return;
    // Extract IOCs from threat descriptions
    const iocs = [];
    const ipRegex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
    const cveRegex = /(CVE-\d{4}-\d{4,})/g;
    threats.forEach(t => {
        const text = t.description || '';
        let m;
        while ((m = ipRegex.exec(text)) !== null) {
            if (!iocs.find(i => i.value === m[1])) iocs.push({ type: 'IP', value: m[1], confidence: t.confidence + '%', threatId: t.threatId });
        }
        while ((m = cveRegex.exec(text)) !== null) {
            if (!iocs.find(i => i.value === m[1])) iocs.push({ type: 'CVE', value: m[1], confidence: t.confidence + '%', threatId: t.threatId });
        }
    });
    // Add sample IOCs if none found
    if (iocs.length === 0) {
        iocs.push(
            { type: 'Hash', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4...', confidence: '88%', threatId: null },
            { type: 'Domain', value: 'c2-infrastructure.evil[.]com', confidence: '95%', threatId: null },
            { type: 'CIDR', value: '103.224.182.0/24', confidence: '91%', threatId: null }
        );
    }
    iocList.innerHTML = iocs.slice(0, 8).map(ioc => `
        <div class="ioc-item${ioc.threatId ? ' ioc-clickable' : ''}" ${ioc.threatId ? `onclick="openDetail('${ioc.threatId}')"` : ''}>
            <span class="ioc-type">${ioc.type}</span>
            <span class="ioc-value">${ioc.value}</span>
            <span class="ioc-confidence">${ioc.confidence}</span>
        </div>
    `).join('');
}

async function handleIngestLink(e) {
    e.preventDefault();
    const urlInput = document.getElementById('ingestUrlInput');
    const statusDiv = document.getElementById('ingestStatus');
    if (!urlInput || !statusDiv) return;

    const url = urlInput.value.trim();
    statusDiv.textContent = 'INGESTING SIGNAL...';
    statusDiv.style.color = 'var(--text-secondary)';
    statusDiv.style.display = 'block';

    try {
        const response = await fetch(`${API_URL}/api/articles/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const result = await response.json();
        if (result.success) {
            urlInput.value = '';
            statusDiv.textContent = '✓ SIGNAL MAPPED SUCCESSFULLY';
            statusDiv.style.color = 'var(--low)';

            if (result.threat && result.threat.location && result.threat.location.coordinates) {
                state.map.panTo(result.threat.location.coordinates);
            }

            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        } else {
            statusDiv.textContent = `✗ ERROR: ${result.error || 'Ingest failed'}`;
            statusDiv.style.color = 'var(--critical)';
        }
    } catch (err) {
        console.error('Error ingesting link:', err);
        statusDiv.textContent = '✗ CONNECTION ERROR';
        statusDiv.style.color = 'var(--critical)';
    }
}
