# API Examples and Testing Guide

## Using PowerShell to Test the API

### 1. Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
```

### 2. Get All Threats
```powershell
$threats = Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Get
$threats.threats | Format-Table threatId, title, category, severity
```

### 3. Get Threats by Category
```powershell
# Cyber threats only
Invoke-RestMethod -Uri "http://localhost:3000/api/threats?category=cyber" -Method Get

# High severity only
Invoke-RestMethod -Uri "http://localhost:3000/api/threats?severity=high" -Method Get

# Cyber + High severity
Invoke-RestMethod -Uri "http://localhost:3000/api/threats?category=cyber&severity=high" -Method Get
```

### 4. Get Single Threat
```powershell
# Replace with actual threat ID from your system
Invoke-RestMethod -Uri "http://localhost:3000/api/threats/TM-2026-000001" -Method Get
```

### 5. Search Threats
```powershell
# Search for ransomware
Invoke-RestMethod -Uri "http://localhost:3000/api/threats/search/ransomware" -Method Get

# Search by country
Invoke-RestMethod -Uri "http://localhost:3000/api/threats/search/United%20States" -Method Get
```

### 6. Get Statistics
```powershell
$stats = Invoke-RestMethod -Uri "http://localhost:3000/api/stats" -Method Get
$stats.stats
```

### 7. Add New Threat (Manual Testing)
```powershell
$threat = @{
    title = "Critical Infrastructure Cyber Attack"
    description = "Coordinated DDoS attack targeting power grid control systems"
    location = @{
        country = "Germany"
        coordinates = @(51.1657, 10.4515)
    }
    category = "cyber"
    severity = "critical"
    sources = @(
        @{
            name = "CERT-EU"
            url = "https://cert.europa.eu/alerts"
            reliability = "high"
        }
    )
    indicators = @("DDoS", "SCADA", "power grid")
    impactedSectors = @("Energy", "Infrastructure", "Government")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $threat -ContentType "application/json"
```

### 8. Update Threat Status
```powershell
$update = @{
    status = "resolved"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats/TM-2026-000001" -Method Patch -Body $update -ContentType "application/json"
```

---

## Using cURL (Alternative)

### Get All Threats
```bash
curl http://localhost:3000/api/threats
```

### Add New Threat
```bash
curl -X POST http://localhost:3000/api/threats \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ransomware Campaign",
    "description": "New ransomware variant targeting financial sector",
    "location": {
      "country": "United Kingdom",
      "coordinates": [51.5074, -0.1278]
    },
    "category": "cyber",
    "severity": "high",
    "sources": [{
      "name": "UK NCSC",
      "url": "https://www.ncsc.gov.uk/alerts",
      "reliability": "high"
    }],
    "indicators": ["ransomware", "financial", "encryption"],
    "impactedSectors": ["Finance", "Technology"]
  }'
```

---

## JavaScript Fetch Examples (Browser Console)

### Get Threats
```javascript
fetch('http://localhost:3000/api/threats')
  .then(r => r.json())
  .then(data => console.table(data.threats));
```

### Add Threat
```javascript
fetch('http://localhost:3000/api/threats', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: "Supply Chain Attack",
    description: "Malicious package discovered in popular npm library",
    location: {
      country: "Global",
      coordinates: [0, 0]
    },
    category: "cyber",
    severity: "high",
    sources: [{
      name: "GitHub Advisory",
      url: "https://github.com/advisories",
      reliability: "high"
    }],
    indicators: ["supply chain", "npm", "malware"],
    impactedSectors: ["Technology", "Software Development"]
  })
})
.then(r => r.json())
.then(data => console.log('Threat added:', data));
```

---

## Python Examples

```python
import requests
import json

BASE_URL = "http://localhost:3000"

# Get all threats
response = requests.get(f"{BASE_URL}/api/threats")
threats = response.json()
print(f"Total threats: {len(threats['threats'])}")

# Add new threat
new_threat = {
    "title": "State-Sponsored Cyber Espionage",
    "description": "Advanced persistent threat targeting defense contractors",
    "location": {
        "country": "United States",
        "coordinates": [38.9072, -77.0369]
    },
    "category": "cyber",
    "severity": "critical",
    "sources": [{
        "name": "US-CERT",
        "url": "https://www.cisa.gov/uscert/",
        "reliability": "high"
    }],
    "indicators": ["APT", "espionage", "defense sector"],
    "impactedSectors": ["Defense", "Government", "Technology"]
}

response = requests.post(
    f"{BASE_URL}/api/threats",
    json=new_threat
)
print(f"Added: {response.json()['threat']['threatId']}")

# Get statistics
stats = requests.get(f"{BASE_URL}/api/stats").json()
print(f"Active threats: {stats['stats']['active']}")
```

---

## Testing Scenarios

### Scenario 1: Cyber Attack Simulation
Add multiple related cyber threats to test threat correlation:

```powershell
# Threat 1: Initial compromise
$threat1 = @{
    title = "Phishing Campaign Targeting Financial Sector"
    description = "Large-scale phishing emails with banking trojan payload"
    location = @{ country = "United States"; coordinates = @(40.7128, -74.0060) }
    category = "cyber"
    severity = "medium"
    sources = @(@{ name = "CISA"; url = "https://cisa.gov"; reliability = "high" })
    indicators = @("phishing", "banking trojan", "credential theft")
    impactedSectors = @("Finance", "Banking")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $threat1 -ContentType "application/json"

# Threat 2: Escalation
$threat2 = @{
    title = "Ransomware Deployment Following Credential Theft"
    description = "Ransomware deployed using stolen credentials from phishing campaign"
    location = @{ country = "United States"; coordinates = @(40.7128, -74.0060) }
    category = "cyber"
    severity = "high"
    sources = @(@{ name = "FBI"; url = "https://ic3.gov"; reliability = "high" })
    indicators = @("ransomware", "credential abuse", "encryption")
    impactedSectors = @("Finance", "Banking")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $threat2 -ContentType "application/json"
```

### Scenario 2: Cross-Domain Impact
Test hybrid threat with multiple sectors:

```powershell
$hybridThreat = @{
    title = "Cyber Attack on Energy Infrastructure Causes Economic Impact"
    description = "Ransomware attack on oil pipeline leads to supply disruption and price surge"
    location = @{ country = "United States"; coordinates = @(29.7604, -95.3698) }
    category = "hybrid"
    severity = "critical"
    sources = @(@{ name = "DHS"; url = "https://dhs.gov"; reliability = "high" })
    indicators = @("ransomware", "pipeline", "supply chain", "oil prices")
    impactedSectors = @("Energy", "Economy", "Transportation", "Government")
    secondaryTags = @("cyber", "economic")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $hybridThreat -ContentType "application/json"
```

### Scenario 3: Health Emergency
Test health threat with geographical spread:

```powershell
$healthThreat = @{
    title = "Novel Virus Outbreak in Southeast Asia"
    description = "WHO reports new respiratory virus with human-to-human transmission"
    location = @{ country = "Thailand"; coordinates = @(15.8700, 100.9925) }
    category = "health"
    severity = "high"
    sources = @(@{ name = "WHO"; url = "https://who.int"; reliability = "high" })
    indicators = @("respiratory virus", "H2H transmission", "outbreak")
    impactedSectors = @("Healthcare", "Travel", "Tourism", "Economy")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $healthThreat -ContentType "application/json"
```

---

## Automated Testing Script

Save as `test-api.ps1`:

```powershell
# Test API Functionality
Write-Host "Testing Global Threat Map API..." -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n[TEST 1] Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health"
    Write-Host "✓ Server is healthy" -ForegroundColor Green
} catch {
    Write-Host "✗ Server health check failed" -ForegroundColor Red
    exit
}

# Test 2: Get Threats
Write-Host "`n[TEST 2] Fetching threats..." -ForegroundColor Yellow
$threats = Invoke-RestMethod -Uri "http://localhost:3000/api/threats"
Write-Host "✓ Retrieved $($threats.threats.Count) threats" -ForegroundColor Green

# Test 3: Add Threat
Write-Host "`n[TEST 3] Adding test threat..." -ForegroundColor Yellow
$newThreat = @{
    title = "Test Threat - Auto Generated"
    description = "Automated test threat for API validation"
    location = @{ country = "Test Country"; coordinates = @(0, 0) }
    category = "cyber"
    severity = "low"
    sources = @(@{ name = "Test Source"; url = "https://test.com"; reliability = "medium" })
    indicators = @("test", "automated")
    impactedSectors = @("Testing")
} | ConvertTo-Json

$added = Invoke-RestMethod -Uri "http://localhost:3000/api/threats" -Method Post -Body $newThreat -ContentType "application/json"
Write-Host "✓ Threat added: $($added.threat.threatId)" -ForegroundColor Green

# Test 4: Get Statistics
Write-Host "`n[TEST 4] Fetching statistics..." -ForegroundColor Yellow
$stats = Invoke-RestMethod -Uri "http://localhost:3000/api/stats"
Write-Host "✓ Active threats: $($stats.stats.active)" -ForegroundColor Green

Write-Host "`n✓ All tests passed!" -ForegroundColor Green
```

Run with:
```powershell
.\test-api.ps1
```

---

## WebSocket Testing

Use browser console to test real-time updates:

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected to WebSocket');
});

socket.on('newThreat', (threat) => {
    console.log('New threat received:', threat);
});

socket.on('threatUpdate', (threat) => {
    console.log('Threat updated:', threat);
});
```

---

## Response Formats

### Successful Threat Retrieval
```json
{
  "success": true,
  "threats": [
    {
      "threatId": "TM-2026-000001",
      "title": "Threat Title",
      "category": "cyber",
      "severity": "high",
      "status": "emerging",
      "confidence": 85,
      ...
    }
  ]
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message"
}
```

---

**Happy Testing! 🧪**
