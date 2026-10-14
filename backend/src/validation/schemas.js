'use strict';

const { z } = require('zod');

/**
 * Zod validation schemas for TESSERA API endpoints.
 * All schemas include strict mode and strip unknown fields.
 */



/**
 * Asset creation schemas
 */
const createAssetSchema = z.object({
  assetType: z.enum(['vehicle', 'land', 'grain', 'equipment'], {
    errorMap: () => ({ message: 'Asset type must be one of: vehicle, land, grain, equipment' }),
  }),
  canonicalIdentity: z.string().min(1).max(256).optional(),
  attributes: z.record(z.unknown()).optional(),
  templateId: z.string().min(1).max(128).optional(),
  templateVersion: z.string().min(1).max(32).optional(),
}).strict();

const updateAssetAttributesSchema = z.object({
  attributes: z.record(z.unknown()).min(1, 'At least one attribute required'),
}).strict();

const assetExistsQuerySchema = z.object({
  assetId: z.string().min(1).max(128),
}).strict();

/**
 * Template schemas
 */
const listTemplatesQuerySchema = z.object({
  assetType: z.enum(['vehicle', 'land', 'grain', 'equipment']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(256).optional(),
}).strict();

/**
 * Evidence schemas
 */
const submitEvidenceSchema = z.object({
  evidenceType: z.enum(['document', 'image', 'video', 'certificate', 'report'], {
    errorMap: () => ({ message: 'Evidence type must be one of: document, image, video, certificate, report' }),
  }),
  title: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  content: z.string().min(1).max(10485760), // 10MB max as string (base64)
  contentType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const listEvidenceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  evidenceType: z.enum(['document', 'image', 'video', 'certificate', 'report']).optional(),
  status: z.enum(['pending', 'verified', 'rejected']).optional(),
}).strict();

const verifyIntegritySchema = z.object({
  algorithm: z.enum(['sha256', 'sha512']).default('sha256'),
}).strict();

/**
 * Valuation schemas
 */
const createValuationSchema = z.object({
  value: z.number().positive('Value must be positive'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code').toUpperCase(),
  valuationDate: z.string().datetime({ offset: true }).optional(),
  valuerId: z.string().min(1).max(128),
  valuerOrganization: z.string().min(1).max(128),
  methodology: z.string().min(1).max(512).optional(),
  notes: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const listValuationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'validated', 'rejected', 'expired']).optional(),
  valuerId: z.string().optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
}).strict();

const validateValuationSchema = z.object({
  status: z.enum(['validated', 'rejected']),
  validatorId: z.string().min(1).max(128),
  validatorOrganization: z.string().min(1).max(128),
  remarks: z.string().max(2048).optional(),
}).strict();

const simulateValuationSchema = z.object({
  value: z.number().positive(),
  currency: z.string().length(3).toUpperCase(),
  valuerId: z.string().min(1).max(128),
}).strict();

/**
 * Approval schemas
 */
const createApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  approverId: z.string().min(1).max(128),
  approverOrganization: z.string().min(1).max(128),
  remarks: z.string().max(2048).optional(),
}).strict();

const listApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
}).strict();

/**
 * Tokenization schemas
 */
const tokenizeAssetSchema = z.object({
  tokenType: z.enum(['WHOLE', 'FRACTIONAL']).default('WHOLE'),
  totalSupply: z.number().int().positive().default(1),
  precision: z.number().int().min(0).max(18).default(0),
  initialOwnerId: z.string().min(1).max(128),
  initialOwnerMSP: z.string().min(1).max(64),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const tokenizationReadinessSchema = z.object({}).strict();

/**
 * Ownership schemas
 */
const createOwnershipSchema = z.object({
  ownerId: z.string().min(1).max(128),
  ownerMSP: z.string().min(1).max(64),
  quantity: z.number().int().positive(),
  legalTitle: z.string().min(1).max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const getOwnershipParamsSchema = z.object({
  assetId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
}).strict();

const listOwnersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
}).strict();

const getBalanceParamsSchema = z.object({
  assetId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
}).strict();

/**
 * Transfer schemas
 */
const transferOwnershipSchema = z.object({
  fromOwnerId: z.string().min(1).max(128),
  fromOwnerMSP: z.string().min(1).max(64),
  toOwnerId: z.string().min(1).max(128),
  toOwnerMSP: z.string().min(1).max(64),
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(512).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict().refine(data => data.fromOwnerId !== data.toOwnerId || data.fromOwnerMSP !== data.toOwnerMSP, {
  message: 'Self-transfer to same identity and MSP is prohibited',
  path: ['toOwnerId'],
});

const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'completed', 'failed', 'rejected']).optional(),
  fromOwnerId: z.string().optional(),
  toOwnerId: z.string().optional(),
}).strict();

const validateParticipantsSchema = z.object({
  fromOwnerId: z.string().min(1).max(128),
  fromOwnerMSP: z.string().min(1).max(64),
  toOwnerId: z.string().min(1).max(128),
  toOwnerMSP: z.string().min(1).max(64),
  amount: z.number().int().positive(),
}).strict();

/**
 * Token query schemas
 */
const getTokenParamsSchema = z.object({
  tokenId: z.string().min(1).max(128),
}).strict();

const getAssetByTokenParamsSchema = z.object({
  tokenId: z.string().min(1).max(128),
}).strict();

/**
 * Owner schemas
 */
const getOwnerParamsSchema = z.object({
  ownerId: z.string().min(1).max(128),
}).strict();

/**
 * Policy schemas
 */
const listPoliciesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  scope: z.enum(['GLOBAL', 'ASSET', 'TOKEN', 'ASSET_TYPE']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT', 'DEPRECATED']).optional(),
}).strict();

const evaluatePolicySchema = z.object({
  tokenId: z.string().min(1).max(128),
  assetId: z.string().min(1).max(128),
  fromOwnerId: z.string().min(1).max(128),
  fromOwnerMSP: z.string().min(1).max(64),
  toOwnerId: z.string().min(1).max(128),
  toOwnerMSP: z.string().min(1).max(64),
  amount: z.number().positive(),
  action: z.enum(['TRANSFER', 'PLEDGE', 'TOKENIZE', 'RETIRE']).default('TRANSFER'),
  context: z.object({
    sender: z.object({
      ownerId: z.string(),
      mspId: z.string(),
      kycStatus: z.string().optional(),
    }).optional(),
    receiver: z.object({
      ownerId: z.string(),
      mspId: z.string(),
      kycStatus: z.string().optional(),
    }).optional(),
  }).optional(),
}).strict();

/**
 * Lifecycle schemas
 */
const updateStatusSchema = z.object({
  status: z.enum([
    'REGISTERED',
    'UNDER_VERIFICATION',
    'VERIFIED',
    'VALUED',
    'APPROVED_FOR_TOKENIZATION',
    'TOKENIZED',
    'PLEDGED',
    'RETIRED',
    'REJECTED',
    'DISPUTED',
  ]),
  reason: z.string().max(512).optional(),
}).strict();

/**
 * Audit schemas
 */
const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
  operation: z.string().optional(),
  actorId: z.string().optional(),
}).strict();

/**
 * Passport schemas
 */
const passportParamsSchema = z.object({
  assetId: z.string().min(1).max(128),
}).strict();

/**
 * Health schemas
 */
const healthQuerySchema = z.object({
  detail: z.coerce.boolean().default(false),
}).strict();

/**
 * Authentication schemas
 */
const loginSchema = z.object({
  identityId: z.string().min(1).max(128),
  password: z.string().min(8).max(128).optional(), // For future password-based auth
}).strict();

const registerSchema = z.object({
  identityId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(256),
  role: z.enum(['ISSUER', 'VERIFIER', 'COMPLIANCE', 'INVESTOR', 'ADMIN', 'GOVERNANCE']),
  msp: z.string().min(1).max(64),
  permissions: z.array(z.string()).optional(),
}).strict();

module.exports = {
  // Assets
  createAssetSchema,
  updateAssetAttributesSchema,
  assetExistsQuerySchema,
  listTemplatesQuerySchema,

  // Evidence
  submitEvidenceSchema,
  listEvidenceQuerySchema,
  verifyIntegritySchema,

  // Valuation
  createValuationSchema,
  listValuationsQuerySchema,
  validateValuationSchema,
  simulateValuationSchema,

  // Approval
  createApprovalSchema,
  listApprovalsQuerySchema,

  // Tokenization
  tokenizeAssetSchema,
  tokenizationReadinessSchema,

  // Ownership
  createOwnershipSchema,
  getOwnershipParamsSchema,
  listOwnersQuerySchema,
  getBalanceParamsSchema,

  // Transfers
  transferOwnershipSchema,
  listTransfersQuerySchema,
  validateParticipantsSchema,

  // Token queries
  getTokenParamsSchema,
  getAssetByTokenParamsSchema,

  // Owners
  getOwnerParamsSchema,

  // Policies
  listPoliciesQuerySchema,
  evaluatePolicySchema,

  // Lifecycle
  updateStatusSchema,

  // Audit
  auditQuerySchema,

  // Passport
  passportParamsSchema,

  // Health
  healthQuerySchema,

  // Auth
  loginSchema,
  registerSchema,
};
