# Deployment Guide for Global Threat Mapping Platform

## 🌐 Deployment Options

### Option 1: Local Development (Already Configured)

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Access at `http://localhost:3000`

---

### Option 2: Cloud Deployment (Heroku)

#### Prerequisites
- Heroku account
- Heroku CLI installed

#### Steps

1. **Create Heroku app**
```bash
heroku create your-threat-map
```

2. **Add MongoDB Atlas** (Free tier)
```bash
heroku addons:create mongolab:sandbox
```

3. **Set environment variables**
```bash
heroku config:set NODE_ENV=production
heroku config:set NEWS_API_KEY=your_key
heroku config:set VIRUSTOTAL_API_KEY=your_key
```

4. **Deploy**
```bash
git init
git add .
git commit -m "Initial deployment"
git push heroku main
```

5. **Open app**
```bash
heroku open
```

---

### Option 3: Docker Deployment

#### Create Dockerfile

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

#### Create docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/threat_map
      - PORT=3000
    depends_on:
      - mongo
    restart: unless-stopped

  mongo:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

volumes:
  mongo-data:
```

#### Deploy with Docker

```bash
docker-compose up -d
```

---

### Option 4: AWS EC2 Deployment

#### Step 1: Launch EC2 Instance
- AMI: Ubuntu Server 22.04 LTS
- Instance Type: t2.medium (minimum)
- Security Group: Allow ports 22, 80, 443, 3000

#### Step 2: Connect and Setup

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2 for process management
sudo npm install -g pm2

# Clone/upload your project
git clone your-repo-url threat-map
cd threat-map

# Install dependencies
npm install

# Create .env file
nano .env
# Add your configuration

# Start with PM2
pm2 start server.js --name threat-map
pm2 save
pm2 startup
```

#### Step 3: Setup Nginx Reverse Proxy

```bash
sudo apt install nginx -y

sudo nano /etc/nginx/sites-available/threat-map
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/threat-map /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Step 4: Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

### Option 5: Azure Deployment

#### Using Azure App Service

1. **Create App Service**
```bash
az group create --name ThreatMapRG --location eastus
az appservice plan create --name ThreatMapPlan --resource-group ThreatMapRG --sku B1 --is-linux
az webapp create --resource-group ThreatMapRG --plan ThreatMapPlan --name your-threat-map --runtime "NODE|18-lts"
```

2. **Configure MongoDB**
```bash
az cosmosdb create --name threat-map-db --resource-group ThreatMapRG --kind MongoDB
```

3. **Deploy**
```bash
az webapp deployment source config-zip --resource-group ThreatMapRG --name your-threat-map --src threat-map.zip
```

---

### Option 6: Digital Ocean

#### Using App Platform

1. **Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-github-repo
git push -u origin main
```

2. **Create App on Digital Ocean**
- Go to Digital Ocean App Platform
- Connect GitHub repository
- Configure build settings:
  - Build Command: `npm install`
  - Run Command: `npm start`
  - HTTP Port: 3000

3. **Add Database**
- Add MongoDB Database component
- Configure environment variables

---

## 🔒 Production Checklist

### Security
- [ ] Change default MongoDB credentials
- [ ] Use strong API keys
- [ ] Enable HTTPS/SSL
- [ ] Set up firewall rules
- [ ] Implement rate limiting
- [ ] Add authentication for admin endpoints
- [ ] Use environment variables (never hardcode secrets)
- [ ] Enable CORS only for trusted domains
- [ ] Regular security updates

### Performance
- [ ] Enable gzip compression
- [ ] Setup CDN for static assets
- [ ] Implement caching strategy
- [ ] Optimize database queries
- [ ] Use connection pooling
- [ ] Monitor memory usage
- [ ] Setup auto-scaling

### Monitoring
- [ ] Setup logging (Winston, Morgan)
- [ ] Configure error tracking (Sentry)
- [ ] Setup uptime monitoring
- [ ] Configure alerts
- [ ] Performance monitoring (New Relic, DataDog)
- [ ] Database backup strategy

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=your_production_mongodb_uri

# API Keys
NEWS_API_KEY=production_key
VIRUSTOTAL_API_KEY=production_key
USCERT_API_KEY=production_key

# Security
SESSION_SECRET=random_secure_string
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

---

## 📊 Monitoring Setup

### PM2 Monitoring

```bash
# Start with monitoring
pm2 start server.js --name threat-map --watch

# View logs
pm2 logs threat-map

# Monitoring dashboard
pm2 monit

# Web-based dashboard
pm2 plus
```

### Health Checks

Add to your monitoring service:
- Endpoint: `/api/health`
- Expected response: `{"status":"ok","timestamp":"..."}`
- Frequency: Every 1 minute

---

## 🔄 Continuous Deployment

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
    
    - name: Run tests
      run: npm test
    
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd /path/to/threat-map
          git pull
          npm install
          pm2 restart threat-map
```

---

## 🗄️ Database Backup

### MongoDB Backup Script

```bash
#!/bin/bash
# backup-mongo.sh

BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="threat_map_$DATE"

mkdir -p $BACKUP_DIR
mongodump --db threat_map --out $BACKUP_DIR/$BACKUP_NAME

# Compress backup
tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz -C $BACKUP_DIR $BACKUP_NAME
rm -rf $BACKUP_DIR/$BACKUP_NAME

# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_NAME.tar.gz"
```

Schedule daily:
```bash
crontab -e
# Add: 0 2 * * * /path/to/backup-mongo.sh
```

---

## 🚀 Performance Optimization

### Enable Compression

Add to `server.js`:
```javascript
const compression = require('compression');
app.use(compression());
```

### Implement Caching

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });

app.get('/api/threats', async (req, res) => {
    const cached = cache.get('threats');
    if (cached) return res.json(cached);
    
    const threats = await threatsCollection.find({}).toArray();
    cache.set('threats', { success: true, threats });
    res.json({ success: true, threats });
});
```

### Database Indexing

Already configured in `server.js`, but verify:
```javascript
db.threats.createIndex({ threatId: 1 }, { unique: true });
db.threats.createIndex({ category: 1, severity: 1 });
db.threats.createIndex({ eventTime: -1 });
```

---

## 📱 Mobile Responsiveness

The platform is already mobile-responsive, but test on:
- iPhone (Safari)
- Android (Chrome)
- Tablets (iPad, Android tablets)

---

## 🆘 Rollback Procedure

If deployment fails:

```bash
# Using PM2
pm2 restart threat-map@previous

# Using Git
git reset --hard HEAD~1
npm install
pm2 restart threat-map

# Using Docker
docker-compose down
docker-compose up -d --build
```

---

## 📞 Support & Maintenance

- Monitor logs daily
- Review error reports
- Update dependencies monthly
- Security patches immediately
- Performance audits quarterly
- Backup verification weekly

---

**Remember**: Always test in staging before production deployment!
