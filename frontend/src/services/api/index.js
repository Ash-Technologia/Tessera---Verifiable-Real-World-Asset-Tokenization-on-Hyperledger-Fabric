// API service barrel (Phase 8A). Single import surface for pages/hooks.
export { apiRequest, apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError, ApiErrorKind, unwrap } from './client.js';
export { healthApi } from './health.js';
export { assetsApi } from './assets.js';
export { templatesApi } from './templates.js';
export { evidenceApi, verificationApi } from './evidence.js';
export { valuationApi, approvalApi } from './valuation.js';
export { tokenizationApi } from './tokenization.js';
export { ownershipApi } from './ownership.js';
export { transferApi } from './transfers.js';
export { policiesApi } from './policies.js';
export { lifecycleApi } from './lifecycle.js';
export { auditApi } from './audit.js';
export { passportApi } from './passport.js';
