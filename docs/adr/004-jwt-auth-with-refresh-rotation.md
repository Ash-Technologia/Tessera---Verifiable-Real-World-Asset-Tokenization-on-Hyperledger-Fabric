# ADR 004: JWT Authentication with Refresh Token Rotation

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
TESSERA needs stateless authentication for REST API. Options: session cookies, JWT, mTLS client certs, OAuth2.

## Decision
Use **JWT (HS256)** for access tokens + **Refresh Token Rotation** for session management:
- **Access Token**: 1 hour, HS256, in Authorization header
- **Refresh Token**: 7 days, HttpOnly Secure cookie, rotation on use
- **Secret**: `JWT_SECRET` env var (min 32 chars, 64+ in prod)

## Consequences

### Positive
- **Stateless**: No server-side session store for access tokens
- **Short-lived access**: Limits blast radius of token theft
- **Rotation**: Refresh token reuse detection invalidates session
- **HttpOnly cookie**: XSS-resistant refresh token storage
- **Scalable**: No sticky sessions, works behind load balancer

### Negative
- **Secret management**: Single secret for all instances (rotate quarterly)
- **Revocation**: No immediate revocation without token blocklist
- **Clock skew**: Requires NTP sync across instances

## Token Structure

### Access Token Claims
```json
{
  "sub": "user-issuer-01",
  "name": "John Issuer",
  "org": "IssuerMSP",
  "role": "ISSUER",
  "permissions": ["asset:create", "evidence:submit"],
  "iat": 1705312800,
  "exp": 1705316400,
  "iss": "tessera-platform",
  "aud": "tessera-api"
}
```

### Refresh Token Claims
```json
{
  "sub": "user-issuer-01",
  "type": "refresh",
  "iat": 1705312800,
  "exp": 1705917600,
  "iss": "tessera-platform",
  "aud": "tessera-api"
}
```

## Rotation Flow
```
1. Client sends refresh token (cookie) to /api/auth/refresh
2. Server verifies refresh token (type=refresh, signature, exp)
3. Server generates NEW access token + NEW refresh token
4. Server invalidates OLD refresh token (deletes from Redis)
5. Server returns new access token + sets new refresh cookie
6. If same refresh token presented again → INVALIDATE ALL user sessions (reuse attack)
```

## Security Features
- **Timing-safe verification**: `crypto.timingSafeEqual` for signatures
- **Algorithm pinning**: Reject `none`, `RS256` if HS256 expected
- **Claims validation**: iss, aud, exp, nbf, clock tolerance
- **Secret rotation**: Quarterly, with grace period for old tokens

## Alternatives Considered
1. **Session cookies** — Requires sticky sessions or shared store
2. **OAuth2/OIDC** — Overkill for internal consortium API
3. **mTLS client certs** — Complex certificate lifecycle
4. **Long-lived JWT only** — No revocation, high theft risk