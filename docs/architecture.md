# TESSERA Architecture — Phase 1

## Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      TESSERA Network                            │
│                   (tessera-network Docker)                      │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Fabric CA    │  │ Fabric CA    │  │ Fabric CA    │          │
│  │ IssuerOrg    │  │ VerifierOrg  │  │ComplianceOrg │          │
│  │ :7054        │  │ :9054        │  │ :10054       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐                                               │
│  │ Fabric CA    │                                               │
│  │ OrdererOrg   │                                               │
│  │ :8054        │                                               │
│  └──────────────┘                                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            orderer.tessera.com   :7050                   │   │
│  │            Raft single-node orderer                      │   │
│  │            Channel participation API :7053               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │peer0.issuer     │  │peer0.verifier   │  │peer0.compliance│  │
│  │:7051            │  │:9051            │  │:11051          │  │
│  │  CouchDB        │  │  CouchDB        │  │  CouchDB       │  │
│  │  :5984          │  │  :7984          │  │  :9984         │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
APPLICATION (REST API or peer CLI)
        │
        ▼
FABRIC GATEWAY (Node.js @hyperledger/fabric-gateway)
        │ gRPC / TLS
        ▼
PEER (peer0.issuer.tessera.com:7051)
        │ endorsement
        ▼
CHAINCODE (AssetContract in fabric-ccenv container)
        │ PutState / GetState
        ▼
FABRIC LEDGER (append-only blockchain)
        │ world state sync
        ▼
COUCHDB (peer0's world state database)
```

## Organizations

| Org | MSP ID | CA Port | Peer Port | Role |
|-----|--------|---------|-----------|------|
| OrdererOrg | OrdererMSP | 8054 | — | Raft orderer consensus |
| IssuerOrg | IssuerMSP | 7054 | 7051 | Asset issuance, registration |
| VerifierOrg | VerifierMSP | 9054 | 9051 | Evidence verification, appraisal |
| ComplianceOrg | ComplianceMSP | 10054 | 11051 | Regulatory compliance |

## Identities

| Identity | Org | Type | Purpose |
|----------|-----|------|---------|
| orderer-admin | OrdererOrg | admin | Orderer channel management |
| orderer.tessera.com | OrdererOrg | orderer | Orderer node MSP+TLS |
| issuer-admin | IssuerOrg | admin | Org administration |
| peer0.issuer | IssuerOrg | peer | Peer node MSP+TLS |
| issuer-user | IssuerOrg | client | Asset registrar |
| auditor-user | IssuerOrg | client | Audit access (Phase 4) |
| verifier-admin | VerifierOrg | admin | Org administration |
| peer0.verifier | VerifierOrg | peer | Peer node MSP+TLS |
| verifier-user | VerifierOrg | client | Evidence verifier |
| compliance-admin | ComplianceOrg | admin | Org administration |
| peer0.compliance | ComplianceOrg | peer | Peer node MSP+TLS |
| compliance-user | ComplianceOrg | client | Compliance officer |

## Chaincode: Asset Template Engine

```
Asset{
  assetId:    "LAND-001"
  assetType:  "LAND"           ← determines template (future: config-driven)
  status:     "ACTIVE"
  owner:      "IssuerOrg"
  createdBy:  <X.509 subject>  ← from Fabric CA, unforgeable
  attributes: {                ← type-specific, no separate chaincode needed
    "area":     "5000"
    "location": "Plot 42"
    "landTitle": "LT-001"
  }
}
```

## Phase 1 → Future Phases

```
Phase 1  ✓  Fabric foundation + basic chaincode
Phase 2     Evidence + Verification + Maker-checker approval
Phase 3     Valuation + Tokenization + Transfer policies
Phase 4     Audit trail + Asset Passport + Rule simulation
```

## CouchDB — World State Only

```
⚠️  CouchDB is FABRIC INFRASTRUCTURE, not an application database.

Fabric Ledger (immutable blocks)
    ↓ synchronization
Fabric World State
    ↓ stored in
CouchDB (per-peer, per-channel databases)

The application NEVER reads/writes CouchDB directly.
All access goes through:
  Application → Fabric Gateway → Peer → Chaincode → PutState/GetState
```

## Security Boundaries

```
Frontend (React)       → HTTP/HTTPS  → Backend (Express)
Backend (Express)      → gRPC/TLS   → Fabric Gateway
Fabric Gateway         → TLS        → Fabric Peer
Fabric Peer            → Chaincode execution
Chaincode              → Ledger state

NO direct Frontend → Fabric connection
NO direct Application → CouchDB connection
```
