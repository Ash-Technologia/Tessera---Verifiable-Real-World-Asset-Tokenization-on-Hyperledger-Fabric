package main

// =============================================================================
// TESSERA Asset & Evidence Models — Phase 4
// =============================================================================
//
// Design Principle — Generic Evidence & Verification Foundation:
//
// TESSERA maintains a strictly governed relationship between real-world assets,
// their attributes, evidentiary documents, cryptographic integrity commitments,
// independent verification decisions, valuations, and tokenization.
//
// DocTypes:
//   - "asset":        Real-world asset record
//   - "evidence":     Off-chain document integrity commitment & metadata
//   - "verification": Attestation / verification audit record
//   - "valuation":    Generic valuation record
//   - "approval":     Formal tokenization approval record
//   - "token":        On-chain token representation (Whole/Fractional)
// =============================================================================

// CouchDB document type discriminators
const (
	DocTypeAsset         = "asset"
	DocTypeEvidence      = "evidence"
	DocTypeVerification  = "verification"
	DocTypeValuation     = "valuation"
	DocTypeTokenApproval = "approval"
	DocTypeToken         = "token"
	DocTypeAuditEvent    = "audit"
	DocTypeOwnership     = "ownership"
	DocTypeTransfer      = "transfer"
)

// Asset lifecycle states
const (
	StatusDraft             = "DRAFT"
	StatusRegistered        = "REGISTERED"
	StatusUnderVerification = "UNDER_VERIFICATION"
	StatusVerified          = "VERIFIED"
	StatusRejected          = "REJECTED"
	StatusTokenized         = "TOKENIZED"

	// Retained for compatibility/future
	StatusApproved   = "APPROVED"
	StatusValued     = "VALUED"
	StatusActive     = "ACTIVE"
	StatusRestricted = "RESTRICTED"
	StatusFrozen     = "FROZEN"
	StatusRedeemed   = "REDEEMED"
	StatusRetired    = "RETIRED"
)

// Evidence status constants
const (
	EvidenceStatusSubmitted   = "SUBMITTED"
	EvidenceStatusUnderReview = "UNDER_REVIEW"
	EvidenceStatusVerified    = "VERIFIED"
	EvidenceStatusRejected    = "REJECTED"
	EvidenceStatusExpired     = "EXPIRED"
)

// Verification decisions
const (
	VerificationApproved = "APPROVED"
	VerificationRejected = "REJECTED"
)

// Valuation status constants
const (
	ValuationStatusSubmitted  = "SUBMITTED"
	ValuationStatusValid      = "VALID"
	ValuationStatusExpired    = "EXPIRED"
	ValuationStatusRejected   = "REJECTED"
	ValuationStatusSuperseded = "SUPERSEDED"
)

// Tokenization Approval decisions
const (
	ApprovalDecisionApproved = "APPROVED"
	ApprovalDecisionRejected = "REJECTED"
)

// Token types and statuses
const (
	TokenTypeWhole      = "WHOLE"
	TokenTypeFractional = "FRACTIONAL"

	TokenStatusPending    = "PENDING"
	TokenStatusActive     = "ACTIVE"
	TokenStatusRestricted = "RESTRICTED"
	TokenStatusFrozen     = "FROZEN"
)

// Asset is the canonical on-ledger representation of a real-world asset.
type Asset struct {
	DocType           string                 `json:"docType"`
	AssetID           string                 `json:"assetId"`
	AssetType         string                 `json:"assetType"`
	TemplateID        string                 `json:"templateId"`
	TemplateVersion   string                 `json:"templateVersion"`
	CanonicalIdentity string                 `json:"canonicalIdentity"`
	Status            string                 `json:"status"`
	Owner             string                 `json:"owner"`
	CreatedBy         string                 `json:"createdBy"`
	CreatedAt         string                 `json:"createdAt"`
	UpdatedAt         string                 `json:"updatedAt"`
	Attributes        map[string]interface{} `json:"attributes"`
}

// Evidence represents an off-chain document's integrity commitment and metadata.
type Evidence struct {
	DocType              string `json:"docType"`
	EvidenceID           string `json:"evidenceId"`
	AssetID              string `json:"assetId"`
	Type                 string `json:"type"`
	FileName             string `json:"fileName"`
	MimeType             string `json:"mimeType"`
	StorageReference     string `json:"storageReference"`
	SHA256               string `json:"sha256"`
	Source               string `json:"source"`
	Attester             string `json:"attester"`
	SubmittedBy          string `json:"submittedBy"`
	SubmittedAt          string `json:"submittedAt"`
	ExpiresAt            string `json:"expiresAt"`
	Status               string `json:"status"`
	Remarks              string `json:"remarks"`
	Version              int    `json:"version"`
	SupersedesEvidenceID string `json:"supersedesEvidenceId"`
}

// Verification represents an independent maker-checker attestation record.
type Verification struct {
	DocType          string   `json:"docType"`
	VerificationID   string   `json:"verificationId"`
	AssetID          string   `json:"assetId"`
	VerifierIdentity string   `json:"verifierIdentity"`
	Organization     string   `json:"organization"`
	Decision         string   `json:"decision"`
	EvidenceReviewed []string `json:"evidenceReviewed"`
	Remarks          string   `json:"remarks"`
	Timestamp        string   `json:"timestamp"`
}

// Valuation represents a generic asset valuation record.
type Valuation struct {
	DocType        string  `json:"docType"`
	ValuationID    string  `json:"valuationId"`
	AssetID        string  `json:"assetId"`
	Value          float64 `json:"value"`
	Currency       string  `json:"currency"`
	Method         string  `json:"method"`
	ValuationDate  string  `json:"valuationDate"`
	ValidUntil     string  `json:"validUntil"`
	Source         string  `json:"source"`
	Valuer         string  `json:"valuer"`
	SubmittedBy    string  `json:"submittedBy"`
	SubmittedAt    string  `json:"submittedAt"`
	Status         string  `json:"status"`
	Remarks        string  `json:"remarks"`
	SupersededBy   string  `json:"supersededBy"`
}

// ValuationSnapshot captures valuation state at a point in time.
type ValuationSnapshot struct {
	ValuationID   string  `json:"valuationId"`
	Value         float64 `json:"value"`
	Currency      string  `json:"currency"`
	Method        string  `json:"method"`
	ValuationDate string  `json:"valuationDate"`
	Source        string  `json:"source"`
	ValidUntil    string  `json:"validUntil"`
}

// TokenizationApproval represents the formal authorization to create a token.
type TokenizationApproval struct {
	DocType              string                `json:"docType"`
	ApprovalID           string                `json:"approvalId"`
	AssetID              string                `json:"assetId"`
	ApprovedBy           string                `json:"approvedBy"`
	ApprovedByMSP        string                `json:"approvedByMSP"`
	ApprovedAt           string                `json:"approvedAt"`
	Decision             string                `json:"decision"`
	Reason               string                `json:"reason"`
	VerificationSnapshot *VerificationSnapshot `json:"verificationSnapshot"`
	ValuationSnapshot    *ValuationSnapshot    `json:"valuationSnapshot"`
}

// Token represents the generic on-chain representation of an asset.
type Token struct {
	DocType              string                `json:"docType"`
	TokenID              string                `json:"tokenId"`
	AssetID              string                `json:"assetId"`
	CanonicalIdentity    string                `json:"canonicalIdentity"`
	TokenType            string                `json:"tokenType"`
	TotalSupply          float64               `json:"totalSupply"`
	Decimals             int                   `json:"decimals"`
	Currency             string                `json:"currency"`
	ValuationSnapshot    *ValuationSnapshot    `json:"valuationSnapshot"`
	VerificationSnapshot *VerificationSnapshot `json:"verificationSnapshot"`
	CreatedBy            string                `json:"createdBy"`
	CreatedAt            string                `json:"createdAt"`
	Status               string                `json:"status"`
}

// VerificationSnapshot captures verification state at a point in time.
type VerificationSnapshot struct {
	VerificationID string `json:"verificationId"`
	Verifier       string `json:"verifier"`
	VerifiedAt     string `json:"verifiedAt"`
}

// Transfer status constants
const (
	TransferStatusPending   = "PENDING"
	TransferStatusApproved  = "APPROVED"
	TransferStatusCompleted = "COMPLETED"
	TransferStatusRejected  = "REJECTED"
)

// Ownership status constants
const (
	OwnershipStatusActive   = "ACTIVE"
	OwnershipStatusInactive = "INACTIVE"
)

// Ownership represents an ownership record for a token.
type Ownership struct {
	DocType         string  `json:"docType"`
	OwnershipID     string  `json:"ownershipId"`
	TokenID         string  `json:"tokenId"`
	OwnerID         string  `json:"ownerId"`
	OwnerMSP        string  `json:"ownerMSP"`
	Balance         float64 `json:"balance"`
	OwnershipType   string  `json:"ownershipType"`
	CreatedAt       string  `json:"createdAt"`
	UpdatedAt       string  `json:"updatedAt"`
	Status          string  `json:"status"`
}

// Transfer represents an ownership transfer record.
type Transfer struct {
	DocType         string  `json:"docType"`
	TransferID      string  `json:"transferId"`
	TokenID         string  `json:"tokenId"`
	AssetID         string  `json:"assetId"`
	FromOwnerID     string  `json:"fromOwnerId"`
	FromOwnerMSP    string  `json:"fromOwnerMSP"`
	ToOwnerID       string  `json:"toOwnerId"`
	ToOwnerMSP      string  `json:"toOwnerMSP"`
	Amount          float64 `json:"amount"`
	Status          string  `json:"status"`
	RequestedBy     string  `json:"requestedBy"`
	RequestedByMSP  string  `json:"requestedByMSP"`
	Timestamp       string  `json:"timestamp"`
	Reason          string  `json:"reason"`
}

// AuditEvent represents an immutable audit trail entry.
type AuditEvent struct {
	DocType         string `json:"docType"`
	EventID         string `json:"eventId"`
	Event           string `json:"event"`
	AssetID         string `json:"assetId"`
	Actor           string `json:"actor"`
	ActorMSP        string `json:"actorMSP"`
	Timestamp       string `json:"timestamp"`
	Reason          string `json:"reason"`
	RelatedEntityID string `json:"relatedEntityId"`
}
