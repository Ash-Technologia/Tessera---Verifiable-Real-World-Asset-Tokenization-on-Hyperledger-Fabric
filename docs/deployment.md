# TESSERA Deployment Guide

## Prerequisites

### System Requirements
- **OS**: Ubuntu 22.04 LTS / RHEL 9 / Docker Desktop (macOS/Windows)
- **Docker**: 24.0+ with Buildx
- **Docker Compose**: 2.20+
- **Node.js**: 20.x LTS
- **Go**: 1.22+ (for chaincode)
- **WSL2** (Windows): Ubuntu 22.04 distro
- **Memory**: 8 GB minimum, 16 GB recommended
- **Disk**: 50 GB free space

### Required Ports
| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Backend API | HTTP |
| 5173 | Frontend (dev) | HTTP |
| 7050 | Orderer | gRPC |
| 7051 | Peer0 Issuer | gRPC |
| 7054 | CA Issuer | HTTPS |
| 9051 | Peer0 Verifier | gRPC |
| 9054 | CA Verifier | HTTPS |
| 11051 | Peer0 Compliance | gRPC |
| 10054 | CA Compliance | HTTPS |
| 5984 | CouchDB Issuer | HTTP |
| 7984 | CouchDB Verifier | HTTP |
| 9984 | CouchDB Compliance | HTTP |
| 9000 | MinIO API | HTTP |
| 9001 | MinIO Console | HTTP |

## Quick Start (Development)

### 1. Clone Repository
```bash
git clone https://github.com/Ash-Technologia/Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric.git
cd Tessera---Verifiable-Real-World-Asset-Tokenization-on-Hyperledger-Fabric
```

### 2. Configure Environment
```bash
# Copy environment templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit backend/.env with your configuration
# Key variables:
# - JWT_SECRET (min 32 chars in production)
# - FABRIC_* paths to crypto material
# - FRONTEND_ORIGIN
```

### 3. Start Fabric Network (WSL2/Ubuntu)
```bash
cd blockchain/scripts
./network.sh up
```

### 4. Start Backend
```bash
cd backend
npm install
npm run dev
```

### 5. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### 6. Access Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

## Production Deployment

### 1. Infrastructure Setup
```bash
# Provision servers (recommended: 3+ nodes for HA)
# - Load balancer (NGINX/HAProxy)
# - App servers (2+ backend, 2+ frontend)
# - Fabric network (3+ orderers, 3+ peers per org)
# - CouchDB cluster (3 nodes)
# - MinIO cluster (4+ nodes)
# - Redis (for rate limiting/sessions)
```

### 2. SSL/TLS Certificates
```bash
# Obtain certificates for:
# - api.tessera.example.com (backend)
# - app.tessera.example.com (frontend)
# - peer0.issuer.tessera.com, peer0.verifier.tessera.com, peer0.compliance.tessera.com
# - orderer.tessera.com
# - ca.issuer.tessera.com, etc.
```

### 3. Configure Production Environment
```bash
# backend/.env.production
NODE_ENV=production
PORT=3000
JWT_SECRET=<64-char-random-string>
JWT_ISSUER=tessera-platform
JWT_AUDIENCE=tessera-api
FRONTEND_ORIGIN=https://app.tessera.example.com
FABRIC_CHANNEL=tessera-channel
FABRIC_CHAINCODE=asset
FABRIC_MSP_ID=IssuerMSP
FABRIC_PEER_ENDPOINT=peer0.issuer.tessera.com:7051
FABRIC_PEER_TLS_CERT_PATH=/etc/fabric/certs/peer0/ca.crt
FABRIC_IDENTITY_CERT_PATH=/etc/fabric/certs/user/msp/signcerts/cert.pem
FABRIC_IDENTITY_KEY_DIR=/etc/fabric/certs/user/msp/keystore
MINIO_ENDPOINT=minio.tessera.internal:9000
MINIO_ACCESS_KEY=<secret>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=tessera-evidence
REDIS_URL=redis://redis-cluster:6379
LOG_LEVEL=info
```

### 4. Docker Compose Production
```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  backend:
    image: tessera-backend:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - /etc/fabric/certs:/etc/fabric/certs:ro
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    image: tessera-frontend:latest
    ports:
      - "80:80"
      - "443:443"
    deploy:
      replicas: 2

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 5. Build and Deploy
```bash
# Build images
docker build -t tessera-backend:latest ./backend
docker build -t tessera-frontend:latest ./frontend

# Deploy
docker stack deploy -c docker-compose.prod.yml tessera
```

## Fabric Network Operations

### Network Lifecycle
```bash
# Start network
cd blockchain/scripts
./network.sh up

# Deploy chaincode
./network.sh deployCC -ccn asset -ccv 1.0 -ccl go

# Stop network
./network.sh down

# Clean everything (including ledger)
./network.sh down -ca
```

### Channel Operations
```bash
# Join peer to channel
peer channel join -b tessera-channel.block

# Update anchor peers
peer channel update -o orderer.tessera.com:7050 -c tessera-channel -f anchor.tx
```

### Chaincode Upgrade
```bash
# Package new version
peer lifecycle chaincode package asset_2.0.tar.gz --path blockchain/chaincode/asset --lang golang --label asset_2.0

# Install on all peers
peer lifecycle chaincode install asset_2.0.tar.gz

# Approve for orgs
peer lifecycle chaincode approveformyorg -o orderer.tessera.com:7050 --channelID tessera-channel --name asset --version 2.0 --package-id <pkg-id> --sequence 2

# Commit
peer lifecycle chaincode commit -o orderer.tessera.com:7050 --channelID tessera-channel --name asset --version 2.0 --sequence 2
```

## Monitoring & Observability

### Health Checks
```bash
# Backend health
curl https://api.tessera.example.com/health

# Fabric health
curl https://api.tessera.example.com/health/fabric

# Frontend health
curl https://app.tessera.example.com/
```

### Logs
```bash
# Backend logs
docker service logs tessera_backend -f

# Fabric peer logs
docker logs peer0.issuer -f

# Orderer logs
docker logs orderer -f
```

### Metrics (Prometheus)
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'tessera-backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'
```

## Backup & Disaster Recovery

### Fabric Ledger Backup
```bash
# Backup peer ledger
docker exec peer0.issuer tar czf /backup/ledger-$(date +%F).tar.gz /var/hyperledger/production

# Backup CouchDB
docker exec couchdb0 curl -X POST http://localhost:5984/_replicate -d '{"source":"tessera-channel","target":"backup-'$(date +%F)'","create_target":true}' -H "Content-Type: application/json"
```

### Restore Procedure
```bash
# 1. Stop network
./network.sh down

# 2. Restore ledger
docker run --rm -v $(pwd)/backup:/backup -v fabric_peer0.issuer:/var/hyperledger/production alpine tar xzf /backup/ledger-2024-01-15.tar.gz -C /

# 3. Restart network
./network.sh up
```

## Security Hardening Checklist

- [ ] TLS 1.3 everywhere (frontend, backend, Fabric)
- [ ] JWT_SECRET ≥ 64 chars, rotated quarterly
- [ ] Rate limiting enabled (global, auth, sensitive)
- [ ] CSP headers configured
- [ ] CORS restricted to frontend origin
- [ ] Fabric peer TLS with mutual auth
- [ ] CouchDB authentication enabled
- [ ] MinIO SSE encryption enabled
- [ ] Audit logging to immutable storage
- [ ] Secrets in vault (HashiCorp/AWS/GCP)
- [ ] Regular dependency updates (`npm audit`, `go vulncheck`)
- [ ] Penetration testing annually

## Scaling Guidelines

| Component | Horizontal Scaling | Notes |
|-----------|-------------------|-------|
| Backend | ✅ Stateless, add replicas | Use Redis for rate limit store |
| Frontend | ✅ Static files, CDN | Nginx for SSR if needed |
| Fabric Peers | ⚠️ Per org, add peers | Endorsement policy must match |
| Orderers | ✅ Raft cluster (5 nodes) | 3+ for production |
| CouchDB | ✅ Cluster (3+ nodes) | Per-channel databases |
| MinIO | ✅ Distributed (4+ nodes) | Erasure coding |

## Troubleshooting

### Common Issues

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Backend can't connect to Fabric | Network down / certs wrong | Check `./network.sh up`, verify cert paths |
| `FABRIC_UNAVAILABLE` errors | Peer not ready | Wait for peer to sync blocks |
| CORS errors | FRONTEND_ORIGIN mismatch | Update `.env` with correct origin |
| JWT verification fails | Clock skew / secret mismatch | Sync NTP, verify JWT_SECRET |
| Rate limit 429 | Too many requests | Check client, adjust limits |

### Debug Commands
```bash
# Check Fabric connectivity
peer channel list
peer chaincode list --installed
peer chaincode query -C tessera-channel -n asset -c '{"Args":["GetAsset","VEH-001"]}'

# Check backend config
curl http://localhost:3000/health/fabric

# Check certs
openssl x509 -in /etc/fabric/certs/user/msp/signcerts/cert.pem -text -noout
```

---

*TESSERA v5.0.0 Deployment Guide — Phase 23 complete*