# TESSERA
### *Real Assets. Real Trust.*

**Production-oriented POC — Syrus 7.0 PS-01: Real-World Asset Tokenization Platform**

TESSERA is a permissioned real-world asset tokenization platform built on Hyperledger Fabric. It creates a continuously governed and traceable relationship between a real-world asset, its evidence, verification, valuation, token, ownership history, and compliance trail.

> **Current scope:** Phase 1 & Phase 2 COMPLETE. Generic Asset Model + Configuration-Driven Asset Template Engine operational on live Fabric 2.5 network.

---

## What Makes TESSERA Different

Most tokenization platforms simply issue a token. TESSERA governs the full chain:

```
REAL-WORLD ASSET
      ↓
ASSET TEMPLATE (Configuration-driven, versioned schema & canonical identity)
      ↓
EVIDENCE
      ↓
VERIFICATION
      ↓
VALUATION
      ↓
APPROVAL (Maker-Checker)
      ↓
TOKEN
      ↓
OWNERSHIP
      ↓
TRANSFER RULES
      ↓
LIFECYCLE
      ↓
AUDIT HISTORY
```

The **Asset Template Engine** means new asset types (`land`, `vehicle`, `grain`, and future classes) are added purely via configuration JSON — with zero code changes to the underlying Go chaincode.

---

## Status & Capabilities

### Phase 1: Fabric Foundation (Complete ✅)
| Status | Capability |
|--------|-----------|
| ✅ | Fabric network (IssuerOrg, VerifierOrg, ComplianceOrg) |
| ✅ | Fabric CA identities per organization |
| ✅ | `tessera-channel` |
| ✅ | CouchDB-backed world state |
| ✅ | Generic Go chaincode deployed |
| ✅ | Node.js + Express backend with Fabric Gateway 1.7 |
| ✅ | End-to-end verification (App → Gateway → Chaincode → Ledger → CouchDB) |

### Phase 2: Generic Asset Model & Template Engine (Complete ✅)
| Status | Capability |
|--------|-----------|
| ✅ | Generic Asset Model on Fabric (`templateId`, `templateVersion`, `canonicalIdentity`, generic `attributes`, `status`) |
| ✅ | Configuration-driven templates (`templates/vehicle.json`, `templates/land.json`, `templates/grain.json`) |
| ✅ | Versioned Template Registry singleton with runtime caching and schema validation |
| ✅ | Comprehensive field validator (types, required, string length, number bounds, regex patterns, enums) |
| ✅ | Deterministic canonical identity generator (`CANON-<TYPE>-<HASH>`) |
| ✅ | Chaincode v2.0 deployed across all 3 peer orgs (`Sequence: 2`) |
| ✅ | REST APIs for templates (`/api/templates`, `/api/templates/:id`, versions) |
| ✅ | Template-validated asset registration (`POST /api/assets`) |
| ✅ | Attribute updates preserving immutable template reference (`PATCH /api/assets/:id/attributes`) |
| ✅ | Automated test suite with 23 passing tests (`npm test` / `node tests/phase2.test.js`) |
| ✅ | Seed script creating live vehicle, land, and grain assets on ledger (`npm run seed`) |

---

## Prerequisites

Run all Fabric operations inside **WSL2 (Ubuntu 24.04)**.

### Required Software

| Software | Version | Install |
|----------|---------|---------|
| Docker Engine | ≥ 24.0 | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose v2 | ≥ 2.20 | Included with Docker Desktop |
| Go | ≥ 1.21 | `sudo apt install golang-go` |
| Node.js | ≥ 20 | `nvm install 20` |
| Hyperledger Fabric binaries | 2.5.16 | See below |
| jq | any | `sudo apt install jq` |
| curl | any | `sudo apt install curl` |

### Install Fabric Binaries

```bash
# Inside WSL2
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh | bash -s -- binary

# Add to PATH (add to ~/.bashrc for persistence)
export PATH="$HOME/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$HOME/fabric-samples/config"
```

Verify:
```bash
peer version       # Expected: 2.5.x
fabric-ca-client version  # Expected: 1.5.x
configtxgen --version
osnadmin version
```

### Project Setup

```bash
# Clone or navigate to project directory (in WSL, /mnt/d/TESSERA)
cd /mnt/d/TESSERA

# Copy environment configuration
cp .env.example .env
# Edit .env if you need to change ports or credentials
```

---

## Project Structure

```
TESSERA/
├── blockchain/
│   ├── chaincode/
│   │   └── asset/           Go chaincode (AssetContract)
│   │       ├── main.go
│   │       ├── asset.go     Asset model + constants
│   │       ├── contract.go  CreateAsset, ReadAsset, AssetExists
│   │       └── go.mod
│   ├── network/
│   │   ├── configtx.yaml    Channel + org configuration
│   │   └── channel-artifacts/   (generated — gitignored)
│   ├── organizations/
│   │   ├── fabric-ca/       CA bootstrap directories (gitignored)
│   │   ├── ordererOrganizations/  (generated — gitignored)
│   │   └── peerOrganizations/     (generated — gitignored)
│   └── scripts/
│       ├── utils.sh              Shared utilities
│       ├── register-identities.sh  Fabric CA enrollment
│       ├── create-channel.sh     Channel creation
│       ├── deploy-chaincode.sh   Chaincode lifecycle
│       ├── verify.sh             End-to-end verification
│       └── network.sh            Master orchestration
│
├── backend/
│   └── src/
│       ├── config/
│       │   └── fabric.config.js   Fabric connection config
│       ├── middleware/
│       │   └── error.middleware.js
│       ├── routes/
│       │   ├── health.routes.js   GET /health
│       │   └── asset.routes.js    POST/GET /api/assets
│       ├── services/
│       │   └── fabric/
│       │       ├── gateway.service.js   Fabric Gateway lifecycle
│       │       └── contract.service.js  Chaincode invocation
│       ├── utils/
│       │   └── logger.js
│       └── server.js
│
├── frontend/               (placeholder — Phase 2+)
├── docs/
│   └── architecture.md
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## Starting the Network

### Option A: One Command (Recommended)

```bash
cd /mnt/d/TESSERA
chmod +x blockchain/scripts/*.sh
./blockchain/scripts/network.sh up
```

This performs all steps automatically:
1. Starts Fabric CAs
2. Registers and enrolls all identities
3. Starts CouchDB, orderer, peers
4. Creates `tessera-channel`
5. Deploys asset chaincode
6. Runs end-to-end verification

Expected final output:
```
✓ ALL TESTS PASSED

Chain of trust verified:
  APPLICATION (peer CLI)
       ↓
  FABRIC GATEWAY / peer binary
       ↓
  CHAINCODE (AssetContract)
       ↓
  FABRIC LEDGER (blocks committed)
       ↓
  COUCHDB WORLD STATE
```

---

### Option B: Step by Step

```bash
cd /mnt/d/TESSERA

# 1. Start CAs
docker compose up -d \
  ca.orderer.tessera.com \
  ca.issuer.tessera.com \
  ca.verifier.tessera.com \
  ca.compliance.tessera.com

# 2. Register and enroll identities (Fabric CA)
./blockchain/scripts/register-identities.sh

# 3. Start CouchDB, orderer, peers
docker compose up -d \
  couchdb.peer0.issuer.tessera.com \
  couchdb.peer0.verifier.tessera.com \
  couchdb.peer0.compliance.tessera.com
sleep 3
docker compose up -d orderer.tessera.com
sleep 5
docker compose up -d \
  peer0.issuer.tessera.com \
  peer0.verifier.tessera.com \
  peer0.compliance.tessera.com
sleep 5

# 4. Create channel and join peers
./blockchain/scripts/create-channel.sh

# 5. Deploy chaincode
./blockchain/scripts/deploy-chaincode.sh

# 6. Verify
./blockchain/scripts/verify.sh
```

---

## Channel

**Channel name:** `tessera-channel`

| Component | Host | Port |
|-----------|------|------|
| Orderer | orderer.tessera.com | 7050 |
| IssuerOrg Peer | peer0.issuer.tessera.com | 7051 |
| VerifierOrg Peer | peer0.verifier.tessera.com | 9051 |
| ComplianceOrg Peer | peer0.compliance.tessera.com | 11051 |

---

## Deploying Chaincode

The chaincode uses Fabric 2.5 lifecycle (package → install → approve → commit).

```bash
# All-in-one:
./blockchain/scripts/deploy-chaincode.sh

# Verify committed:
export FABRIC_CFG_PATH=/mnt/d/TESSERA/blockchain/network
peer lifecycle chaincode querycommitted \
  --channelID tessera-channel \
  --name asset \
  --tls \
  --cafile /mnt/d/TESSERA/blockchain/organizations/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/ca.crt
```

---

## Starting the Backend

```bash
# Windows PowerShell:
cd D:\TESSERA\backend
npm install
npm run dev

# Or in WSL:
cd /mnt/d/TESSERA/backend
npm install
npm run dev
```

Expected output:
```
2024-01-01 00:00:00.000 [info] TESSERA backend started { port: 3000, environment: development }
2024-01-01 00:00:00.000 [info] Fabric Gateway connected on startup.
```

### Backend Endpoints

| Method | Path | Description | Phase |
|--------|------|-------------|-------|
| GET | `/` | API info and loaded capabilities | 1 & 2 |
| GET | `/health` | Backend + Fabric status | 1 |
| GET | `/health/fabric` | Live Fabric connectivity check | 1 |
| GET | `/api/templates` | List all registered templates | 2 |
| GET | `/api/templates/:templateId` | Get template schema and field rules | 2 |
| GET | `/api/templates/:templateId/:version` | Get specific version of template | 2 |
| POST | `/api/assets` | Register asset (validated by template) | 2 |
| GET | `/api/assets/:assetId` | Read asset + full template metadata | 2 |
| GET | `/api/assets/:assetId/exists` | Check if asset exists on ledger | 1 |
| PATCH | `/api/assets/:assetId/attributes` | Update asset attributes (preserves template version) | 2 |
| GET | `/api/assets/:assetId/template-ref` | Get asset's immutable template link | 2 |

---

## Testing & Seed Data

### Run Phase 2 Test Suite (23 Tests)
```bash
# From repository root:
node tests/phase2.test.js
```
Runs:
- Template loading and structure verification
- Required field validation and rejection
- Type coercion and constraint verification
- Regex pattern and enum value checks
- Live Fabric integration tests across all 3 asset types (`vehicle`, `land`, `grain`)
- Immutability of template version on attribute update

### Run Live Seed Data Script
```bash
# Populates live Fabric ledger with Vehicle, Land, and Grain assets:
npm run seed --prefix backend
# or:
node backend/scripts/seed.js
```

---

## Manual Testing (REST API)

### 1. Inspect Available Templates
```bash
curl -s http://localhost:3000/api/templates | jq .
curl -s http://localhost:3000/api/templates/vehicle | jq .
```

### 2. Create a Valid Vehicle Asset
```bash
curl -s -X POST http://localhost:3000/api/assets \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "VEH-DEMO-001",
    "templateId": "vehicle",
    "templateVersion": "1.0",
    "owner": "IssuerOrg",
    "attributes": {
      "vin": "1HGCR2F83HA009999",
      "registrationNumber": "MH-12-DE-1234",
      "manufacturer": "Tata Motors",
      "model": "Nexon EV",
      "year": 2025,
      "mileage": 500
    }
  }' | jq .
```

### 3. Verify Validation Rejection (e.g., Missing Required VIN)
```bash
curl -s -X POST http://localhost:3000/api/assets \
  -H "Content-Type: application/json" \
  -d '{
    "assetId": "VEH-FAIL-001",
    "templateId": "vehicle",
    "owner": "IssuerOrg",
    "attributes": {
      "registrationNumber": "MH-12-DE-1234",
      "manufacturer": "Tata Motors",
      "model": "Nexon EV",
      "year": 2025
    }
  }' | jq .
# Returns 422: "Field 'vin' (Vehicle Identification Number (VIN)) is required for Vehicle"
```

### 4. Read Asset + Template Definition
```bash
curl -s http://localhost:3000/api/assets/VEH-DEMO-001 | jq .
```

### 5. Update Attributes
```bash
curl -s -X PATCH http://localhost:3000/api/assets/VEH-DEMO-001/attributes \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "vin": "1HGCR2F83HA009999",
      "registrationNumber": "MH-12-DE-1234",
      "manufacturer": "Tata Motors",
      "model": "Nexon EV",
      "year": 2025,
      "mileage": 1200
    }
  }' | jq .
```

### Via Fabric peer CLI (in WSL)

```bash
# Set up environment
source /mnt/d/TESSERA/blockchain/scripts/utils.sh
setPeerEnv issuer
export FABRIC_CFG_PATH=/mnt/d/TESSERA/blockchain/network

# Create asset
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.tessera.com \
  -C tessera-channel -n asset \
  --tls --cafile "$ORDERER_CA" \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "$CORE_PEER_TLS_ROOTCERT_FILE" \
  -c '{"function":"CreateAsset","Args":["GRAIN-001","GRAIN","ComplianceOrg","{\"quantity\":\"50000\",\"unit\":\"kg\",\"grainType\":\"wheat\"}"]}' \
  --waitForEvent

# Query asset
peer chaincode query \
  -C tessera-channel -n asset \
  -c '{"function":"ReadAsset","Args":["GRAIN-001"]}' | jq .
```

---

## CouchDB

CouchDB is Fabric's world-state database — **not an application database**.

| Peer | CouchDB URL | Credentials |
|------|-------------|-------------|
| peer0.issuer | http://localhost:5984/_utils | admin/adminpw |
| peer0.verifier | http://localhost:7984/_utils | admin/adminpw |
| peer0.compliance | http://localhost:9984/_utils | admin/adminpw |

In the Fauxton UI, look for databases named `tessera-channel_asset` to see the committed asset documents.

> **⚠️ Never read/write CouchDB directly from your application.** All access goes through Fabric Gateway → Peer → Chaincode.

---

## Stopping and Resetting

```bash
# Stop containers (preserve all state)
./blockchain/scripts/network.sh down

# Restart stopped containers (no re-enrollment needed)
./blockchain/scripts/network.sh up-containers

# Full reset — DESTROYS all state, crypto material, ledger data
./blockchain/scripts/network.sh reset

# Then start fresh:
./blockchain/scripts/network.sh up
```

---

## Running Verification

```bash
./blockchain/scripts/verify.sh
```

Tests:
1. All 11 containers running
2. tessera-channel membership (3 peers)
3. Chaincode committed
4. CreateAsset LAND — transaction committed
5. CreateAsset VEHICLE — transaction committed
6. ReadAsset — returns committed data
7. AssetExists true/false
8. Duplicate CreateAsset rejected by chaincode
9. CouchDB world state contains asset

---

## Troubleshooting

### CAs won't start
```bash
# Check if fabric-ca directories have conflicting files
ls blockchain/organizations/fabric-ca/
# Solution: reset and restart
./blockchain/scripts/network.sh reset
./blockchain/scripts/network.sh up
```

### `fabric-ca-client: command not found`
```bash
# Fabric binaries not on PATH
export PATH="$HOME/fabric-samples/bin:$PATH"
# Add to ~/.bashrc
```

### Peer fails to join channel: `endorsement failure`
```bash
# Check orderer is running and has joined the channel
docker logs orderer.tessera.com | tail -20
# Check osnadmin channel list
osnadmin channel list -o localhost:7053 \
  --ca-file blockchain/organizations/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/ca.crt \
  --client-cert blockchain/organizations/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/server.crt \
  --client-key blockchain/organizations/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/server.key
```

### Chaincode container doesn't start
```bash
# Check peer logs for chaincode launch errors
docker logs peer0.issuer.tessera.com | grep -i chaincode
# Check if Docker socket is mounted correctly
docker inspect peer0.issuer.tessera.com | grep -A5 Mounts
```

### Backend: `Cannot connect to Fabric network`
```bash
# 1. Confirm network is running
./blockchain/scripts/network.sh status

# 2. Confirm .env paths are correct
cat .env | grep FABRIC_

# 3. The paths in .env must point to existing files:
#    FABRIC_PEER_TLS_CERT
#    FABRIC_IDENTITY_CERT
#    FABRIC_IDENTITY_KEY_DIR
# These are generated by register-identities.sh
```

### Port conflicts
```bash
# Check which ports are in use
sudo lsof -i :7050,7051,7054,5984,3000

# If ports are occupied, either:
# (a) Stop the conflicting process
# (b) Modify docker-compose.yml port mappings
```

---

## Technology Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Blockchain | Hyperledger Fabric 2.5 LTS | Permissioned, enterprise-grade, Raft consensus |
| Chaincode | Go | Performance, type safety, official Fabric support |
| Identity | Fabric CA (not cryptogen) | Production-ready, supports runtime identity registration |
| World state DB | CouchDB | Rich JSON queries needed for asset templates |
| Channel API | Channel participation (not system channel) | Fabric 2.5 recommended approach |
| Backend | Node.js + Fabric Gateway 1.7 | Official SDK, async/await, simple deployment |
| No MongoDB | — | CouchDB via Fabric is the database; no parallel app DB |

---

## What's Not in Phase 1

| Feature | Phase |
|---------|-------|
| Evidence submission + verification | Phase 2 |
| Maker-checker approval workflow | Phase 2 |
| Asset valuation | Phase 2 |
| Whole/fractional tokenization | Phase 3 |
| Policy-controlled transfers | Phase 3 |
| Encumbrance/pledge | Phase 3 |
| Asset Passport | Phase 4 |
| Audit trail + rule simulation | Phase 4 |
| React frontend + dashboard | Phase 5 |
| MinIO evidence storage | Phase 2+ |

---

*TESSERA — Real Assets. Real Trust.*
