# TESSERA Security Guide

## Threat Model

### Assets Protected
1. **Asset Registry** - Immutable record of real-world assets
2. **Evidence & Attachments** - Cryptographic proofs, documents
3. **Valuations** - Certified appraisals with financial data
4. **Token Balances** - Fractional ownership records
5. **Transfer History** - Audit trail of ownership changes
6. **User Identities** - X.509 certificates, JWT tokens
7. **Compliance Policies** - Regulatory rules encoded in chaincode

### Threat Actors
| Actor | Motivation | Capability |
|-------|------------|------------|
| External attacker | Data theft, financial fraud | Network access, credential stuffing |
| Malicious insider | Data manipulation, unauthorized transfers | Valid credentials, org access |
| Compromised org | Double-spend, policy bypass | Peer/orderer control |
| Supply chain | Dependency injection | npm/go module compromise |

### Trust Boundaries
```
┌─────────────────────────────────────────────────────────┐
│                   EXTERNAL                              │
│  Frontend (Browser)          Mobile App                 │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS (TLS 1.3)
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   DMZ                                   │
│  Load Balancer (WAF)  →  NGINX (TLS termination)       │
└──────────────────┬──────────────────────────────────────┘
                   │ mTLS
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   APPLICATION TIER                      │
│  Backend API (Express)  ◄──►  Redis (rate limit)       │
│         │                                          │
│         ▼                                          ▼
│  MinIO (S3)                              Fabric Gateway
└──────────────────┬──────────────────────────────────────┘
                   │ gRPC/TLS (mutual auth)
                   ▼
┌─────────────────────────────────────────────────────────┐
│                   FABRIC NETWORK                        │
│  Orderer (Raft)  →  Peers (3 orgs)  →  CouchDB         │
│         │                                          │
│         ▼                                          ▼
│  Chaincode (Asset)                         Ledger (immutable)
└─────────────────────────────────────────────────────────┘
```

## Authentication & Authorization

### JWT Token Security
- **Algorithm**: HS256 (symmetric) — rotate to RS256 in production
- **Access Token**: 1 hour expiry, contains `sub`, `org`, `role`, `permissions`
- **Refresh Token**: 7 days, rotation enabled, stored in HttpOnly cookie
- **Secret**: Minimum 64 chars, from `JWT_SECRET` env var
- **Validation**: Issuer, audience, exp, nbf, signature (timing-safe)

### Identity Flow
```
1. User logs in via /api/auth/login with identityId
2. Backend looks up persona → creates JWT with claims
3. Access token in Authorization header
4. Refresh token in HttpOnly Secure SameSite=Strict cookie
5. Middleware chain:
   sanitizeIdentityHeaders → authenticate → requireAuth → requireRoles/Org/Permission
```

### Role-Based Access Control (RBAC)
| Role | Organization | Permissions |
|------|--------------|-------------|
| ADMIN | Any | All operations (bypasses org checks) |
| ISSUER | IssuerMSP | Create assets, submit evidence, request tokenization |
| VERIFIER | VerifierMSP | Verify evidence, validate valuations |
| COMPLIANCE | ComplianceMSP | Approve tokenization, manage policies |
| INVESTOR | InvestorMSP | Transfer tokens, view holdings |
| GOVERNANCE | GovernanceMSP | Manage policies, audit access |

### Organization Boundary Enforcement
- `requireOrg(...allowedOrgs)` middleware validates `req.user.organization`
- Cross-org transfers require multi-org endorsement policy
- Maker-Checker: VerifierMSP must verify before IssuerMSP can proceed

### Permission Scopes
```
asset:create          # Create new assets
evidence:submit       # Submit evidence documents
evidence:verify       # Verify/approve evidence (Checker)
valuation:create      # Submit valuations
valuation:validate    # Validate valuations (Checker)
tokenization:request  # Request tokenization approval
tokenization:approve  # Approve tokenization (Compliance)
token:mint            # Mint tokens
token:transfer        # Transfer tokens
policy:manage         # Create/update policies (Governance quorum)
audit:read            # Read audit trails
passport:read         # View asset passports
```

## Data Protection

### Encryption
| Data | At Rest | In Transit |
|------|---------|------------|
| Evidence files | MinIO SSE-S3 (AES-256) | TLS 1.3 |
| JWT tokens | N/A (ephemeral) | TLS 1.3 |
| Fabric ledger | File system encryption | mTLS (gRPC) |
| CouchDB | Disk encryption | TLS (peer-to-CouchDB) |
| MinIO | SSE-KMS (recommended) | TLS 1.3 |
| Config/secrets | Vault / env vars | N/A |

### Key Management
- **JWT Secret**: Environment variable, rotate quarterly
- **Fabric TLS**: Generated by Fabric CA, 1-year expiry
- **MinIO**: SSE-KMS with external KMS (AWS/GCP/Azure)
- **Database**: Not applicable (no application DB)

### Data Minimization
- No PII in ledger (only X.509 subject DN)
- Evidence content stored in MinIO, hash on-chain
- Valuation amounts on-chain, details off-chain
- Refresh tokens: minimal claims (`sub`, `type`)

## Network Security

### Fabric Network
- **Orderer**: Raft consensus, 3+ nodes, TLS mutual auth
- **Peers**: TLS mutual auth, client auth required
- **CAs**: TLS, HSM-backed keys (production)
- **Channels**: Private data collections for sensitive data
- **Endorsement Policy**: Multi-org (2-of-3 for transfers)

### Network Segmentation
```
VPC/Network Zones:
├── Public (Load Balancer, CDN)
├── App Tier (Backend, Frontend, Redis)
├── Data Tier (MinIO, CouchDB)
├── Fabric Tier (Orderers, Peers, CAs)
└── Management (Bastion, Monitoring)
```

### Firewall Rules
| Source | Destination | Port | Protocol | Purpose |
|--------|-------------|------|----------|---------|
| Internet | LB | 443 | HTTPS | Frontend/API |
| LB | Backend | 3000 | HTTP | API traffic |
| Backend | Redis | 6379 | TCP | Rate limit/session |
| Backend | MinIO | 9000 | HTTPS | Evidence storage |
| Backend | Fabric Gateway | 7051 | gRPC/TLS | Ledger access |
| Peers | Orderer | 7050 | gRPC/TLS | Consensus |
| Peers | CouchDB | 5984 | HTTP | World state |

## API Security

### Input Validation
- All endpoints validated with Zod schemas
- Strict mode: unknown fields rejected
- Sanitization: `sanitize-html` strips all HTML/JS
- Size limits: 10MB body, 10MB uploads

### Rate Limiting
| Tier | Limit | Window | Key |
|------|-------|--------|-----|
| Global | 100 | 15 min | IP |
| Auth | 20 | 15 min | IP |
| Sensitive | 50 | 1 hour | User ID |

### Security Headers
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
X-Request-ID: <uuid>
```

### CORS Policy
```javascript
origin: production ? 'https://app.tessera.example.com' : '*'
methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token', 'X-Session-ID']
credentials: false
maxAge: 86400
```

## CSRF Protection
- **Mechanism**: Double-submit cookie pattern
- **Token**: Generated per session, validated on state-changing requests
- **Excluded**: GET, HEAD, OPTIONS, health endpoints
- **Header**: `X-CSRF-Token` or body `_csrf`

## Audit & Logging

### What's Logged
| Event | Fields |
|-------|--------|
| Authentication | userId, org, role, ip, userAgent, success |
| Authorization failures | userId, requiredRole/Org/Permission, path |
| Asset operations | assetId, actor, operation, before/after hash |
| Transfers | tokenId, from, to, amount, policy decision |
| Policy evaluations | tokenId, decision, deniedRules |
| Errors | requestId, path, method, stack (dev only) |

### Log Security
- **No secrets**: Tokens, passwords, keys never logged
- **Sanitization**: Internal paths stripped in production
- **Retention**: 1 year hot, 7 years cold (compliance)
- **Integrity**: Forward to immutable storage (S3 Object Lock)

## Incident Response

### Playbooks

#### Compromised JWT Secret
1. Rotate `JWT_SECRET` immediately
2. Invalidate all refresh tokens (delete from Redis)
3. Force re-authentication for all users
4. Audit recent auth logs for anomalies

#### Compromised User Credentials
1. Revoke user's refresh tokens
2. Force password reset / re-enrollment
3. Review recent activity for unauthorized actions
4. Check for lateral movement

#### Fabric Peer Compromise
1. Isolate peer from network
2. Revoke peer TLS cert via Fabric CA
3. Rebuild peer from clean backup
4. Verify ledger integrity

#### Evidence Tampering Detected
1. Compare on-chain hash with MinIO object
2. Quarantine affected asset
3. Notify compliance team
4. Preserve forensic evidence

### Contact Escalation
| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical (data breach) | 1 hour | Security team → CISO → Legal |
| High (unauthorized access) | 4 hours | Security team → Engineering lead |
| Medium (policy violation) | 24 hours | Engineering lead |
| Low (config issue) | 72 hours | On-call engineer |

## Compliance

### Standards Alignment
| Standard | Controls Implemented |
|----------|---------------------|
| SOC 2 Type II | Access control, audit logging, encryption |
| ISO 27001 | A.5-A.18 controls mapped |
| GDPR | Data minimization, right to erasure (off-chain), DPIA |
| MiCA (EU) | Asset reference tokens, audit trail, whitepaper |

### Regulatory Reporting
- **Monthly**: Access review, failed auth summary
- **Quarterly**: Policy compliance, vulnerability scan
- **Annual**: Penetration test, SOC 2 audit, key rotation

---

*TESSERA v5.0.0 Security Guide — Phase 23 complete*