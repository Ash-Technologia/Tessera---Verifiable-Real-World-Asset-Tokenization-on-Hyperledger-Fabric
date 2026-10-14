# TESSERA Developer Guide

## Project Structure

```
TESSERA/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── config/            # Configuration & validation
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic
│   │   │   ├── adapters/      # External service adapters
│   │   │   ├── audit/         # Audit trail
│   │   │   ├── fabric/        # Fabric Gateway integration
│   │   │   ├── lifecycle/     # Asset lifecycle
│   │   │   ├── ownership/     # Ownership & transfers
│   │   │   ├── passport/      # Asset passport
│   │   │   ├── policy/        # Policy engine
│   │   │   ├── storage/       # MinIO storage
│   │   │   ├── templates/     # Asset templates
│   │   │   ├── token/         # Token lifecycle
│   │   │   ├── tokenization/  # Tokenization workflow
│   │   │   └── transfer/      # Transfer logic
│   │   ├── utils/             # Shared utilities
│   │   └── validation/        # Zod schemas
│   └── tests/                 # Integration tests
├── frontend/                   # React 18 + Vite
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── auth/          # Auth components
│   │   │   ├── data/          # Data display components
│   │   │   ├── modals/        # Modal dialogs
│   │   │   └── ui/            # Base UI components
│   │   ├── context/           # React context providers
│   │   ├── hooks/             # Custom hooks
│   │   ├── lib/               # Client utilities
│   │   ├── pages/             # Page components
│   │   ├── routes/            # Router configuration
│   │   ├── services/          # API client
│   │   └── styles/            # CSS design system
│   └── public/                # Static assets
├── blockchain/
│   ├── chaincode/             # Go chaincode
│   │   └── asset/             # Asset chaincode
│   ├── network/               # Fabric network config
│   └── scripts/               # Network lifecycle scripts
├── docs/                       # Documentation
└── tests/                      # Cross-cutting tests
```

## Development Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with local config
npm run dev        # Nodemon auto-reload
npm run test       # Run all phase tests
npm run lint       # ESLint
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server
npm run build      # Production build
npm run test       # Vitest
npm run lint       # ESLint
```

### Fabric Network (WSL2/Ubuntu)
```bash
cd blockchain/scripts
./network.sh up
./network.sh deployCC -ccn asset -ccv 1.0 -ccl go
```

## Coding Standards

### Backend (Node.js/Express)
- **ES Modules**: `"type": "module"` in package.json
- **Strict Mode**: `'use strict'` at top of every file
- **Async/Await**: Prefer over promises
- **Error Handling**: Use `asyncHandler` wrapper, throw `TesseraError` subclasses
- **Validation**: Zod schemas in `src/validation/schemas.js`
- **Logging**: Winston logger, structured JSON
- **Dependencies**: Inject via require, avoid circular deps

### Frontend (React)
- **Function Components**: Hooks only, no classes
- **TypeScript-ready**: JSDoc types, strict PropTypes not needed
- **State**: `useState`, `useReducer`, `useContext` — no Redux
- **API**: `services/api/` with fetch wrapper + retry/circuit breaker
- **Styles**: CSS custom properties, `components.css` + `tokens.css`
- **Components**: Compose from `ui/` primitives

### Chaincode (Go)
- **Fabric Contract API**: `github.com/hyperledger/fabric-contract-api-go`
- **Struct Tags**: JSON for ledger, validate on unmarshal
- **Error Handling**: Return `shim.Error()` for client errors
- **Testing**: `github.com/stretchr/testify` with mock stub

## Key Patterns

### Backend Service Pattern
```javascript
// services/asset/asset.service.js
'use strict';

const { ValidationError, NotFoundError } = require('../middleware/error.middleware');
const gatewayService = require('../fabric/gateway.service');

async function createAsset(data, user) {
  // 1. Validate input
  // 2. Check permissions
  // 3. Call Fabric
  const contract = gatewayService.getContract();
  const result = await contract.submitTransaction('CreateAsset', ...args);
  return JSON.parse(result.toString());
}

module.exports = { createAsset };
```

### Frontend Page Pattern
```jsx
// pages/AssetList.jsx
import { useQuery } from '../hooks/useApi';
import { Table, Button } from '../components/ui';

export function AssetList() {
  const { data, loading, error, refetch } = useQuery(
    () => assetsApi.listAssets({ pageSize: 50 }),
    [/* deps */]
  );

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <Table
      columns={columns}
      rows={data?.assets || []}
      rowKey="assetId"
    />
  );
}
```

### Chaincode Transaction Pattern
```go
// asset.go
func (c *AssetContract) CreateAsset(ctx contractapi.TransactionContextInterface, args ...) error {
    // 1. Validate args
    // 2. Check caller identity (MSP)
    // 3. Check state (duplicate check)
    // 4. Build asset struct
    // 5. PutState
    // 6. Emit event
    return nil
}
```

## API Client (Frontend)

```javascript
// services/api/client.js
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include', // for refresh token cookie
    ...options
  });

  if (response.status === 401) {
    // Try token refresh
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest(path, options); // retry once
  }

  return response.json();
}
```

### Retry & Circuit Breaker
```javascript
// utils/retry.js
export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === maxRetries || !isRetryable(err)) throw err;
      await sleep(backoff(attempt));
    }
  }
}
```

## Testing

### Backend Integration Tests
```bash
# Run specific phase
npm run test:phase3
npm run test:phase4
# ... up to phase10

# All tests
npm run test
```

### Frontend Unit Tests
```bash
npm run test        # Vitest run
npm run test:watch  # Watch mode
```

### Chaincode Tests
```bash
cd blockchain/chaincode/asset
go test ./...
```

## Debugging

### Backend
```bash
# Logs
npm run dev | grep -E "(ERROR|WARN)"

# Debug mode
DEBUG=* npm run dev

# Inspect Fabric calls
# Add debug logs in gateway.service.js
```

### Frontend
```bash
# React DevTools
# Vite HMR console
# Network tab for API calls
```

### Fabric
```bash
# Query chaincode
peer chaincode query -C tessera-channel -n asset -c '{"Args":["GetAsset","VEH-001"]}'

# Check logs
docker logs peer0.issuer -f --tail 100
docker logs orderer -f --tail 100
```

## Common Tasks

### Add New API Endpoint
1. Define Zod schema in `backend/src/validation/schemas.js`
2. Create route handler in `backend/src/routes/`
3. Add business logic in `backend/src/services/`
4. Register route in `backend/src/server.js`
4. Add frontend API call in `frontend/src/services/api/`
5. Create page/component in `frontend/src/pages/`
6. Add route in `frontend/src/routes/AppRoutes.jsx`

### Add New Asset Type
1. Add template JSON in `blockchain/chaincode/asset/templates/`
2. Update chaincode `asset.go` validation
3. Add frontend template in `frontend/src/pages/RegisterAsset.jsx`
4. Update API validation schemas
5. Deploy chaincode upgrade

### Add New Policy Rule
1. Define rule structure in chaincode
2. Update policy evaluator service
3. Add frontend policy UI
4. Register in policy registry

## Environment Variables

### Backend (.env)
```env
NODE_ENV=development
PORT=3000
JWT_SECRET=dev-secret-min-32-chars
JWT_ISSUER=tessera-platform
JWT_AUDIENCE=tessera-api
FRONTEND_ORIGIN=http://localhost:5173

FABRIC_CHANNEL=tessera-channel
FABRIC_CHAINCODE=asset
FABRIC_MSP_ID=IssuerMSP
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_TLS_CERT_PATH=../blockchain/network/crypto-config/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt
FABRIC_IDENTITY_CERT_PATH=../blockchain/network/crypto-config/peerOrganizations/issuer.tessera.com/users/User1@issuer.tessera.com/msp/signcerts/User1@issuer.tessera.com-cert.pem
FABRIC_IDENTITY_KEY_DIR=../blockchain/network/crypto-config/peerOrganizations/issuer.tessera.com/users/User1@issuer.tessera.com/msp/keystore

MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=tessera-evidence
```

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_HEALTH_BASE_URL=http://localhost:3000
```

## Performance Tips

### Backend
- Use `getContract()` caching in gateway service
- Batch Fabric queries where possible
- Connection pooling for MinIO/Redis
- Compression middleware for large responses

### Frontend
- Code splitting: `const Page = lazy(() => import('./Page'))`
- Memoize expensive computations: `useMemo`
- Virtualize long lists: `react-window`
- Optimize bundle: `rollup-plugin-visualizer`

### Fabric
- Use `evaluateOptions` for read-only (no endorsement)
- Set appropriate timeouts per operation type
- Monitor peer CPU/memory during load

## Troubleshooting

| Issue | Check |
|-------|-------|
| `FABRIC_UNAVAILABLE` | `docker ps`, peer logs, cert paths |
| JWT 401 | Clock sync, secret match, token expiry |
| CORS error | `FRONTEND_ORIGIN` matches exactly |
| Rate limit 429 | Redis connection, key generator |
| Chaincode error | `docker logs peer0.issuer`, shim.Error() |

## Release Process

1. Update version in `package.json` (both)
2. Update CHANGELOG.md
3. Run full test suite
4. Build production: `npm run build`
5. Tag release: `git tag v5.1.0`
6. CI/CD builds Docker images
7. Deploy to staging → production

---

*TESSERA v5.0.0 Developer Guide — Phase 23 complete*