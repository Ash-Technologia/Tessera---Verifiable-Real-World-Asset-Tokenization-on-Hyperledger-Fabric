# ADR 001: Fabric Gateway as Sole Ledger Access Layer

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
TESSERA needs to interact with Hyperledger Fabric ledger for asset registration, evidence, valuation, tokenization, transfers, and audit. Multiple integration patterns exist.

## Decision
Use **Hyperledger Fabric Gateway (Node.js SDK)** as the **sole** interface between backend services and Fabric. No direct peer CLI, no SDK event hubs, no direct CouchDB access.

## Consequences

### Positive
- **Single connection lifecycle**: Managed by `GatewayService` singleton
- **Automatic retry/timeout**: Built-in deadline options per operation type
- **Identity management**: MSP credentials loaded once, reused
- **Type-safe**: Contract API with submit/evaluate distinction
- **Security**: mTLS enforced, no raw gRPC exposed to services

### Negative
- **Abstraction limits**: Some low-level Fabric features unavailable
- **Vendor lock-in**: Tied to Node.js Gateway SDK
- **Debugging**: Less visibility into peer communication

## Implementation
```javascript
// services/fabric/gateway.service.js
class GatewayService {
  async connect(targetMspId = 'IssuerMSP') { ... }
  getContract(chaincodeName, targetMspId) { ... }
  async disconnect() { ... }
}
module.exports = new GatewayService();
```

All services import and use:
```javascript
const gatewayService = require('./services/fabric/gateway.service');
const contract = gatewayService.getContract('asset');
await contract.submitTransaction('CreateAsset', ...);
```

## Alternatives Considered
1. **Fabric SDK (legacy)** — Deprecated, complex connection profiles
2. **Peer CLI** — Not programmatic, no transaction context
3. **Direct CouchDB** — Violates Fabric architecture, no consensus
4. **Custom gRPC client** — Reinventing Gateway, high maintenance