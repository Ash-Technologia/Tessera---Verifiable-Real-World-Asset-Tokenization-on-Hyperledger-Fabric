# ADR 003: Maker-Checker Governance for Critical Operations

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
Regulatory requirements mandate independent verification for:
- Evidence verification (VerifierMSP checks IssuerMSP submissions)
- Valuation validation (VerifierMSP validates IssuerMSP appraisals)
- Tokenization approval (ComplianceMSP authorizes minting)
- Policy management (GovernanceMSP quorum required)

## Decision
Enforce **Maker-Checker** at both **chaincode** and **application** layers:
- **Maker** (submits): Creates proposal, signs with their MSP
- **Checker** (verifies): Independent org reviews, signs with different MSP
- **Chaincode enforcement**: State transitions require multi-MSP signatures

## Consequences

### Positive
- **Regulatory compliance**: Meets MiCA, Basel III, SOX requirements
- **Tamper evidence**: Single org cannot unilaterally mutate critical state
- **Audit trail**: Every transition has dual signatures
- **Operational resilience**: No single point of failure

### Negative
- **Workflow latency**: Two orgs must act sequentially
- **Coordination overhead**: Org availability required
- **Complexity**: State machines for pending/approved/rejected

## Implementation

### Chaincode State Machine (Evidence)
```
PENDING_VERIFICATION (Maker: IssuerMSP submits)
    → VerifierMSP verifies → VERIFIED
    → VerifierMSP rejects → REJECTED (with mandatory remarks)
```

### Chaincode State Machine (Valuation)
```
PENDING_VALIDATION (Maker: IssuerMSP submits)
    → VerifierMSP validates → VALIDATED
    → VerifierMSP rejects → REJECTED
```

### Chaincode State Machine (Tokenization)
```
APPROVAL_PENDING (Maker: IssuerMSP requests)
    → ComplianceMSP approves → APPROVED_FOR_TOKENIZATION
    → ComplianceMSP rejects → REJECTED
```

### Application Layer Enforcement
```javascript
// Backend routes
app.post('/api/assets/:assetId/verify', 
  requireRoles('VERIFIER'),           // Only VerifierMSP can call
  asyncHandler(evidenceController.verify))

// Chaincode verifies caller MSP
const callerMsp = ctx.clientIdentity.getMSPID()
if (callerMsp === asset.makerMsp) return shim.Error('Maker cannot check own work')
```

## Alternatives Considered
1. **Single org approval** — Fails regulatory audit
2. **Off-chain workflow only** — No on-chain proof of independent review
3. **Voting-based** — Overkill for binary verify/reject