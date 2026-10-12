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
  REGULATOR_MSP: 'RegulatorMSP',
  AUDITOR_MSP: 'AuditorMSP',
});

/**
 * Authoritative role and permissions matrix.
 * Every role specifies exact granted permissions, allowed MSPs, and maker-checker constraints.
 */
const ROLE_PERMISSIONS_MATRIX = Object.freeze({
  [ROLES.ADMIN]: {
    name: 'Platform Administrator',
    organization: MSPS.ISSUER_MSP,
    permissions: Object.freeze(['*']),
    canCreateAsset: true,
    canVerifyEvidence: true,
    canValidateValuation: true,
    canApproveTokenization: true,
    canMintToken: true,
    canExecuteTransfer: true,
    canManagePolicies: true,
    canReadAudit: true,
  },
  [ROLES.ISSUER]: {
    name: 'Asset Issuer / Operator',
    organization: MSPS.ISSUER_MSP,
    permissions: Object.freeze([
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
      'transfer:read',
      'lifecycle:transition',
      'passport:read',
      'passport:verify',
      'audit:read',
      'policies:read',
    ]),
    canCreateAsset: true,
    canVerifyEvidence: false, // Maker-Checker: Cannot verify own asset
    canValidateValuation: false, // Maker-Checker: VerifierMSP required
    canApproveTokenization: false, // Maker-Checker: Compliance required
    canMintToken: true, // Only after tokenization approval exists
    canExecuteTransfer: true, // Subject to transfer policies
    canManagePolicies: false, // Governance quorum required
    canReadAudit: true,
  },
  [ROLES.VERIFIER]: {
    name: 'Independent Verifier / Reviewer',
    organization: MSPS.VERIFIER_MSP,
    permissions: Object.freeze([
      'assets:read',
      'evidence:read',
      'evidence:verify',
      'valuation:read',
      'valuation:validate',
      'lifecycle:transition',
      'passport:read',
      'passport:verify',
      'audit:read',
      'policies:read',
    ]),
    canCreateAsset: false,
    canVerifyEvidence: true,
    canValidateValuation: true,
    canApproveTokenization: false,
    canMintToken: false,
    canExecuteTransfer: false,
    canManagePolicies: false,
    canReadAudit: true,
  },
  [ROLES.VALUATION_APPROVER]: {
    name: 'Certified Valuer / Appraiser',
    organization: MSPS.VERIFIER_MSP,
    permissions: Object.freeze([
      'assets:read',
      'valuation:read',
      'valuation:validate',
      'lifecycle:transition',
      'passport:read',
      'passport:verify',
      'audit:read',
      'policies:read',
    ]),
    canCreateAsset: false,
    canVerifyEvidence: false,
    canValidateValuation: true,
    canApproveTokenization: false,
    canMintToken: false,
    canExecuteTransfer: false,
    canManagePolicies: false,
    canReadAudit: true,
  },
  [ROLES.COMPLIANCE_OFFICER]: {
    name: 'Regulatory Compliance Officer',
    organization: MSPS.COMPLIANCE_MSP,
    permissions: Object.freeze([
      'assets:read',
      'evidence:read',
      'valuation:read',
      'token:read',
      'token:approve',
      'ownership:read',
      'transfer:read',
      'lifecycle:transition',
      'policies:manage',
      'policies:read',
      'passport:read',
      'passport:verify',
      'audit:read',
    ]),
    canCreateAsset: false,
    canVerifyEvidence: false,
    canValidateValuation: false,
    canApproveTokenization: true,
    canMintToken: false,
    canExecuteTransfer: false,
    canManagePolicies: true,
    canReadAudit: true,
  },
  [ROLES.AUDITOR]: {
    name: 'Independent Auditor / Read-Only',
    organization: MSPS.COMPLIANCE_MSP,
    permissions: Object.freeze([
      'assets:read',
      'evidence:read',
      'valuation:read',
      'token:read',
      'ownership:read',
      'transfer:read',
      'policies:read',
      'audit:read',
      'passport:read',
      'passport:verify',
    ]),
    canCreateAsset: false,
    canVerifyEvidence: false,
    canValidateValuation: false,
    canApproveTokenization: false,
    canMintToken: false,
    canExecuteTransfer: false,
    canManagePolicies: false,
    canReadAudit: true,
  },
  [ROLES.INVESTOR]: {
    name: 'Qualified Investor / Token Holder',
    organization: MSPS.ISSUER_MSP,
    permissions: Object.freeze([
      'assets:read',
      'token:read',
      'ownership:read',
      'transfer:read',
      'transfer:execute',
      'passport:read',
      'audit:read',
    ]),
    canCreateAsset: false,
    canVerifyEvidence: false,
    canValidateValuation: false,
    canApproveTokenization: false,
    canMintToken: false,
    canExecuteTransfer: true,
    canManagePolicies: false,
    canReadAudit: true,
  },
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
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.ISSUER].permissions,
  },
  'issuer-operator': {
    userId: 'issuer-operator',
    name: 'Alice Issuer',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.ISSUER,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.ISSUER].permissions,
  },
  'senior-verifier': {
    userId: 'senior-verifier',
    name: 'Bob Verifier',
    organization: MSPS.VERIFIER_MSP,
    role: ROLES.VERIFIER,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.VERIFIER].permissions,
  },
  'verifier-reviewer': {
    userId: 'verifier-reviewer',
    name: 'Bob Verifier',
    organization: MSPS.VERIFIER_MSP,
    role: ROLES.VERIFIER,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.VERIFIER].permissions,
  },
  'valuation-approver': {
    userId: 'valuation-approver',
    name: 'Carol Appraiser',
    organization: MSPS.VERIFIER_MSP,
    role: ROLES.VALUATION_APPROVER,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.VALUATION_APPROVER].permissions,
  },
  'compliance-officer': {
    userId: 'compliance-officer',
    name: 'Dave Compliance',
    organization: MSPS.COMPLIANCE_MSP,
    role: ROLES.COMPLIANCE_OFFICER,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.COMPLIANCE_OFFICER].permissions,
  },
  'auditor-bob': {
    userId: 'auditor-bob',
    name: 'Bob Auditor',
    organization: MSPS.COMPLIANCE_MSP,
    role: ROLES.AUDITOR,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.AUDITOR].permissions,
  },
  'auditor-read-only': {
    userId: 'auditor-read-only',
    name: 'Frank Auditor',
    organization: MSPS.COMPLIANCE_MSP,
    role: ROLES.AUDITOR,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.AUDITOR].permissions,
  },
  'platform-admin': {
    userId: 'platform-admin',
    name: 'System Administrator',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.ADMIN,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.ADMIN].permissions,
  },
  'investor-alice': {
    userId: 'investor-alice',
    name: 'Alice Investor',
    organization: MSPS.ISSUER_MSP,
    role: ROLES.INVESTOR,
    permissions: ROLE_PERMISSIONS_MATRIX[ROLES.INVESTOR].permissions,
  },
});

module.exports = {
  ROLES,
  MSPS,
  DEV_PERSONAS,
  ROLE_PERMISSIONS_MATRIX,
};