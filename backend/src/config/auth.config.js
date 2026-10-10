'use strict';

/**
 * TESSERA Authentication & Identity Configuration — Phase 9C
 *
 * Defines authoritative roles, MSPs, permissions, and trusted persona directory.
 *
 * Security Notice:
 *   - In development mode, known test personas can authenticate via /api/auth/login
 *     to obtain cryptographically signed server tokens.
 *   - In production mode, authentication must be bound to an external OIDC / OAuth2 / SAML
 *     identity provider. The development adapter strictly fails closed in production.
 */

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  ISSUER: 'ISSUER',
  VERIFIER: 'VERIFIER',
  VALUATION_APPROVER: 'VALUATION_APPROVER',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  INVESTOR: 'INVESTOR',
  AUDITOR: 'AUDITOR',
});

const MSPS = Object.freeze({
  ISSUER_MSP: 'IssuerMSP',
  VERIFIER_MSP: 'VerifierMSP',
  COMPLIANCE_MSP: 'ComplianceMSP',
});

/**
 * Authoritative persona definitions for local development and integration testing.
 * Every persona has a deterministic userId, organization MSP, role, and permission scope.
 */
const DEV_PERSONAS = Object.freeze({
  'issuer-admin': {
    userId: 'issuer-admin',
    name: 'Alice Issuer',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.ISSUER,
    permissions: [
      'assets:create',
      'assets:read',
      'attributes:update',
      'evidence:create',
      'evidence:read',
      'valuation:create',
      'valuation:read',
      'token:create',
      'token:read',
      'ownership:read',
      'transfer:execute',
      'lifecycle:transition',
      'passport:read',
    ],
  },
  'senior-verifier': {
    userId: 'senior-verifier',
    name: 'Bob Verifier',
    organization: MSPS.VERIFIER_MSP,
    role: ROLES.VERIFIER,
    permissions: [
      'assets:read',
      'evidence:read',
      'evidence:verify',
      'valuation:read',
      'lifecycle:transition',
      'passport:read',
      'audit:read',
    ],
  },
  'valuation-approver': {
    userId: 'valuation-approver',
    name: 'Carol Appraiser',
    organization: MSPS.VERIFIER_MSP,
    role: ROLES.VALUATION_APPROVER,
    permissions: [
      'assets:read',
      'valuation:read',
      'valuation:validate',
      'lifecycle:transition',
      'passport:read',
      'audit:read',
    ],
  },
  'compliance-officer': {
    userId: 'compliance-officer',
    name: 'Dave Compliance',
    organization: MSPS.COMPLIANCE_MSP,
    role: ROLES.COMPLIANCE_OFFICER,
    permissions: [
      'assets:read',
      'evidence:read',
      'valuation:read',
      'token:approve',
      'lifecycle:transition',
      'policies:manage',
      'passport:read',
      'audit:read',
    ],
  },
  'platform-admin': {
    userId: 'platform-admin',
    name: 'System Administrator',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.ADMIN,
    permissions: ['*'],
  },
  'investor-alice': {
    userId: 'investor-alice',
    name: 'Alice Investor',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.INVESTOR,
    permissions: [
      'assets:read',
      'token:read',
      'ownership:read',
      'transfer:read',
      'passport:read',
    ],
  },
  'auditor-bob': {
    userId: 'auditor-bob',
    name: 'Bob Auditor',
    organization: MSPS.COMPLIANCE_MSP,
    role: ROLES.AUDITOR,
    permissions: [
      'assets:read',
      'evidence:read',
      'valuation:read',
      'token:read',
      'ownership:read',
      'audit:read',
      'passport:read',
    ],
  },
});

module.exports = {
  ROLES,
  MSPS,
  DEV_PERSONAS,
};
