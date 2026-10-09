// Frontend data contracts (Phase 8A).
// JSDoc representations of the backend response structures. These mirror
// (never replace) the authoritative backend/ledger shapes; adapters live
// next to the consumers that need them.

/**
 * @typedef {object} Asset
 * @property {string} assetId
 * @property {string} assetType
 * @property {string} templateId
 * @property {string} templateVersion
 * @property {string} [canonicalIdentity]
 * @property {string} status
 * @property {string} [owner]
 * @property {Record<string, unknown>} [attributes]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {object} AssetTemplate
 * @property {string} templateId
 * @property {string} version
 * @property {string} [assetType]
 * @property {string} [description]
 */

/**
 * @typedef {object} Evidence
 * @property {string} evidenceId
 * @property {string} assetId
 * @property {string} type
 * @property {string} [fileName]
 * @property {string} [mimeType]
 * @property {string} sha256
 * @property {string} [status]
 * @property {string} [submittedAt]
 * @property {string} [submittedBy]
 */

/**
 * @typedef {object} Verification
 * @property {string} verificationId
 * @property {string} assetId
 * @property {string} [verifierIdentity]
 * @property {string} [organization]
 * @property {string} decision
 * @property {string[]} [evidenceReviewed]
 * @property {string} [remarks]
 * @property {string} [timestamp]
 */

/**
 * @typedef {object} Valuation
 * @property {string} valuationId
 * @property {string} assetId
 * @property {number} value
 * @property {string} currency
 * @property {string} method
 * @property {string} valuationDate
 * @property {string} validUntil
 * @property {string} [source]
 * @property {string} [valuer]
 * @property {string} [status]
 */

/**
 * @typedef {object} Token
 * @property {string} tokenId
 * @property {string} assetId
 * @property {string} tokenType
 * @property {number} totalSupply
 * @property {number} decimals
 * @property {string} [currency]
 * @property {string} [status]
 */

/**
 * @typedef {object} OwnershipHolding
 * @property {string} [ownershipId]
 * @property {string} tokenId
 * @property {string} ownerId
 * @property {string} [ownerMSP]
 * @property {number} balance
 * @property {number} [percentage]
 * @property {string} [ownershipType]
 * @property {string} [status]
 */

/**
 * @typedef {object} Transfer
 * @property {string} transferId
 * @property {string} tokenId
 * @property {string} assetId
 * @property {string} fromOwnerId
 * @property {string} toOwnerId
 * @property {number} amount
 * @property {string} [status]
 * @property {string} [timestamp]
 */

/**
 * @typedef {object} TransferPolicy
 * @property {string} [policyId]
 * @property {string} [scope]
 * @property {string} [decision]
 * @property {string[]} [reasonCodes]
 */

/**
 * @typedef {object} LifecycleTransition
 * @property {string} [transitionId]
 * @property {string} fromState
 * @property {string} toState
 * @property {string} [reason]
 * @property {string} [actorId]
 * @property {string} [actorMSP]
 * @property {string} [timestamp]
 * @property {string} [transactionId]
 * @property {number} [sequenceNumber]
 */

/**
 * @typedef {object} AuditEvent
 * @property {string} [eventId]
 * @property {string} [event]
 * @property {string} [assetId]
 * @property {string} [actor]
 * @property {string} [actorMSP]
 * @property {string} [timestamp]
 * @property {string} [transactionId]
 */

/**
 * @typedef {object} HistoricalState
 * @property {string} assetId
 * @property {string} timestamp
 * @property {object} state
 */

/**
 * @typedef {object} AssetPassport
 * @property {string} passportVersion
 * @property {string} passportId
 * @property {string} [generatedAt]
 * @property {object} asset
 * @property {object} verification
 * @property {Array} evidence
 * @property {object} valuation
 * @property {object} lifecycle
 * @property {object} tokenization
 * @property {object} ownership
 * @property {object} restrictions
 * @property {object} provenance
 * @property {{ algorithm: string, passportHash: string }} integrity
 */

/**
 * @typedef {object} PassportVerificationResult
 * @property {boolean} valid
 * @property {boolean} hashValid
 * @property {boolean} assetBindingValid
 * @property {boolean} fabricStateConsistent
 * @property {boolean} stale
 * @property {boolean} tampered
 * @property {Array} checks
 * @property {Array} mismatches
 */

/**
 * @typedef {object} ApiErrorShape
 * @property {string} kind
 * @property {number|null} status
 * @property {string} message
 * @property {string|null} path
 */

export {};
