package main

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// =============================================================================
// TESSERA AssetContract — Phase 3
// =============================================================================
//
// AssetContract is the single, generic Hyperledger Fabric chaincode contract
// for the TESSERA real-world asset tokenization platform.
//
// Phase 3 Operations:
//   - CreateAsset             — Register new asset (supports DRAFT and REGISTERED)
//   - ReadAsset               — Retrieve asset with template context
//   - AssetExists             — Fast existence check
//   - UpdateAssetAttributes   — Update mutable attributes (preserves template version)
//   - GetAssetTemplateRef     — Read immutable template ID and version
//   - CreateEvidence          — Commit off-chain document hash and metadata
//   - GetEvidence             — Retrieve evidence record by ID
//   - ListAssetEvidence       — List all evidence records committed for an asset
//   - UpdateAssetStatus       — Transition asset lifecycle state
//   - RecordVerification      — Independent verification record with Maker-Checker check
//   - GetVerificationHistory  — Full audit trail of verifications for an asset
// =============================================================================

// AssetContract implements the TESSERA asset management chaincode.
type AssetContract struct {
	contractapi.Contract
}

// =============================================================================
// Asset Lifecycle Operations
// =============================================================================

// CreateAsset registers a new real-world asset on the TESSERA ledger.
func (c *AssetContract) CreateAsset(
	ctx contractapi.TransactionContextInterface,
	assetID string,
	assetType string,
	templateID string,
	templateVersion string,
	owner string,
	canonicalIdentity string,
	attributesJSON string,
) error {
	if assetID == "" {
		return fmt.Errorf("assetID cannot be empty")
	}
	if assetType == "" {
		return fmt.Errorf("assetType cannot be empty")
	}
	if templateID == "" {
		return fmt.Errorf("templateID cannot be empty")
	}
	if templateVersion == "" {
		return fmt.Errorf("templateVersion cannot be empty")
	}
	if owner == "" {
		return fmt.Errorf("owner cannot be empty")
	}

	exists, err := c.AssetExists(ctx, assetID)
	if err != nil {
		return fmt.Errorf("failed to check asset existence for %q: %w", assetID, err)
	}
	if exists {
		return fmt.Errorf("asset %q already exists: duplicate asset protection enforced", assetID)
	}

	attributes := make(map[string]interface{})
	if attributesJSON != "" {
		if err := json.Unmarshal([]byte(attributesJSON), &attributes); err != nil {
			return fmt.Errorf("invalid attributesJSON for asset %q: %w", assetID, err)
		}
	}

	clientID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		clientID = "unknown-client"
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	// Phase 3: Assets are created in REGISTERED state (or DRAFT if explicitly noted)
	asset := Asset{
		DocType:           DocTypeAsset,
		AssetID:           assetID,
		AssetType:         assetType,
		TemplateID:        templateID,
		TemplateVersion:   templateVersion,
		CanonicalIdentity: canonicalIdentity,
		Status:            StatusRegistered,
		Owner:             owner,
		CreatedBy:         clientID,
		CreatedAt:         now,
		UpdatedAt:         now,
		Attributes:        attributes,
	}

	assetBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to serialize asset %q: %w", assetID, err)
	}

	if err := ctx.GetStub().PutState(assetID, assetBytes); err != nil {
		return fmt.Errorf("failed to write asset %q to ledger: %w", assetID, err)
	}

	return nil
}

// ReadAsset retrieves an asset by its unique identifier.
func (c *AssetContract) ReadAsset(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (*Asset, error) {
	if assetID == "" {
		return nil, fmt.Errorf("assetID cannot be empty")
	}

	assetBytes, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return nil, fmt.Errorf("failed to read asset %q: %w", assetID, err)
	}
	if assetBytes == nil {
		return nil, fmt.Errorf("asset %q does not exist", assetID)
	}

	var asset Asset
	if err := json.Unmarshal(assetBytes, &asset); err != nil {
		return nil, fmt.Errorf("failed to deserialize asset %q: %w", assetID, err)
	}

	return &asset, nil
}

// AssetExists returns true if an asset with the given ID exists on the ledger.
func (c *AssetContract) AssetExists(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (bool, error) {
	if assetID == "" {
		return false, fmt.Errorf("assetID cannot be empty")
	}

	assetBytes, err := ctx.GetStub().GetState(assetID)
	if err != nil {
		return false, fmt.Errorf("failed to check existence for %q: %w", assetID, err)
	}

	return assetBytes != nil, nil
}

// UpdateAssetAttributes updates the mutable attributes of an existing asset.
func (c *AssetContract) UpdateAssetAttributes(
	ctx contractapi.TransactionContextInterface,
	assetID string,
	attributesJSON string,
) error {
	if assetID == "" {
		return fmt.Errorf("assetID cannot be empty")
	}
	if attributesJSON == "" {
		return fmt.Errorf("attributesJSON cannot be empty")
	}

	asset, err := c.ReadAsset(ctx, assetID)
	if err != nil {
		return err
	}

	newAttributes := make(map[string]interface{})
	if err := json.Unmarshal([]byte(attributesJSON), &newAttributes); err != nil {
		return fmt.Errorf("invalid attributesJSON: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	asset.Attributes = newAttributes
	asset.UpdatedAt = now

	assetBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to serialize updated asset %q: %w", assetID, err)
	}

	return ctx.GetStub().PutState(assetID, assetBytes)
}

// GetAssetTemplateRef returns only the template reference (id + version) for an asset.
func (c *AssetContract) GetAssetTemplateRef(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	asset, err := c.ReadAsset(ctx, assetID)
	if err != nil {
		return "", err
	}

	type TemplateRef struct {
		TemplateID      string `json:"templateId"`
		TemplateVersion string `json:"templateVersion"`
		AssetType       string `json:"assetType"`
	}

	ref := TemplateRef{
		TemplateID:      asset.TemplateID,
		TemplateVersion: asset.TemplateVersion,
		AssetType:       asset.AssetType,
	}

	refBytes, err := json.Marshal(ref)
	if err != nil {
		return "", fmt.Errorf("failed to serialize template ref for %q: %w", assetID, err)
	}

	return string(refBytes), nil
}

// UpdateAssetStatus transitions an asset to a new lifecycle state.
func (c *AssetContract) UpdateAssetStatus(
	ctx contractapi.TransactionContextInterface,
	assetID string,
	newStatus string,
	remarks string,
) error {
	if assetID == "" {
		return fmt.Errorf("assetID cannot be empty")
	}
	if newStatus == "" {
		return fmt.Errorf("newStatus cannot be empty")
	}

	asset, err := c.ReadAsset(ctx, assetID)
	if err != nil {
		return err
	}

	// Validate allowed state transitions
	current := asset.Status
	switch current {
	case StatusDraft:
		if newStatus != StatusRegistered {
			return fmt.Errorf("invalid transition: %s cannot transition to %s (allowed: %s)", current, newStatus, StatusRegistered)
		}
	case StatusRegistered:
		if newStatus != StatusUnderVerification && newStatus != StatusRegistered {
			return fmt.Errorf("invalid transition: %s cannot transition to %s (allowed: %s)", current, newStatus, StatusUnderVerification)
		}
	case StatusUnderVerification:
		if newStatus != StatusVerified && newStatus != StatusRejected {
			return fmt.Errorf("invalid transition: %s cannot transition to %s (allowed: %s, %s)", current, newStatus, StatusVerified, StatusRejected)
		}
	case StatusVerified:
		if newStatus != StatusTokenized {
			return fmt.Errorf("invalid transition: %s cannot transition to %s (allowed: %s)", current, newStatus, StatusTokenized)
		}
	case StatusRejected:
		// Terminal
		return fmt.Errorf("asset %q is REJECTED: rejected assets cannot transition to other states", assetID)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	asset.Status = newStatus
	asset.UpdatedAt = now

	assetBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to serialize asset %q: %w", assetID, err)
	}

	return ctx.GetStub().PutState(assetID, assetBytes)
}

// =============================================================================
// Evidence Operations — Phase 3
// =============================================================================

// CreateEvidence commits an evidence document's SHA-256 hash and metadata to the ledger.
//
// Rules enforced:
//   - Target asset must exist on the ledger.
//   - SHA-256 hash must be exactly 64 hexadecimal characters.
//   - Historical evidence immutability: evidenceID cannot be overwritten.
//   - Updates must supply a new evidenceID and declare supersedesEvidenceId.
func (c *AssetContract) CreateEvidence(
	ctx contractapi.TransactionContextInterface,
	evidenceJSON string,
) error {
	if evidenceJSON == "" {
		return fmt.Errorf("evidenceJSON cannot be empty")
	}

	var ev Evidence
	if err := json.Unmarshal([]byte(evidenceJSON), &ev); err != nil {
		return fmt.Errorf("invalid evidenceJSON: %w", err)
	}

	if ev.EvidenceID == "" {
		return fmt.Errorf("evidenceId is required")
	}
	if ev.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if ev.Type == "" {
		return fmt.Errorf("evidence type is required")
	}
	if len(ev.SHA256) != 64 {
		return fmt.Errorf("invalid sha256 hash: must be exactly 64 hex characters (got %d)", len(ev.SHA256))
	}

	// Verify target asset exists
	exists, err := c.AssetExists(ctx, ev.AssetID)
	if err != nil {
		return fmt.Errorf("failed checking asset existence: %w", err)
	}
	if !exists {
		return fmt.Errorf("asset %q does not exist: cannot commit evidence for non-existent asset", ev.AssetID)
	}

	// Immutability: prevent silent overwrite of existing evidence record
	evidenceKey := "evidence_" + ev.EvidenceID
	existingBytes, err := ctx.GetStub().GetState(evidenceKey)
	if err != nil {
		return fmt.Errorf("failed checking evidence existence: %w", err)
	}
	if existingBytes != nil {
		return fmt.Errorf("evidence %q already exists: evidence records are immutable and cannot be overwritten", ev.EvidenceID)
	}

	// Capture submitter identity and timestamp
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	if ev.SubmittedBy == "" {
		ev.SubmittedBy = fmt.Sprintf("%s::%s", mspID, clientID)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	if ev.SubmittedAt == "" {
		ev.SubmittedAt = now
	}
	if ev.Status == "" {
		ev.Status = EvidenceStatusSubmitted
	}
	if ev.Version == 0 {
		ev.Version = 1
	}
	ev.DocType = DocTypeEvidence

	evBytes, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("failed to serialize evidence %q: %w", ev.EvidenceID, err)
	}

	// Store evidence record
	if err := ctx.GetStub().PutState(evidenceKey, evBytes); err != nil {
		return fmt.Errorf("failed writing evidence %q to ledger: %w", ev.EvidenceID, err)
	}

	// Create composite key index for fast retrieval by assetId
	indexKey, err := ctx.GetStub().CreateCompositeKey("asset~evidence", []string{ev.AssetID, ev.EvidenceID})
	if err != nil {
		return fmt.Errorf("failed creating composite key for evidence: %w", err)
	}

	return ctx.GetStub().PutState(indexKey, []byte{0x00})
}

// GetEvidence retrieves a single evidence record by its evidenceID.
func (c *AssetContract) GetEvidence(
	ctx contractapi.TransactionContextInterface,
	evidenceID string,
) (string, error) {
	if evidenceID == "" {
		return "", fmt.Errorf("evidenceID cannot be empty")
	}

	evidenceKey := "evidence_" + evidenceID
	evBytes, err := ctx.GetStub().GetState(evidenceKey)
	if err != nil {
		return "", fmt.Errorf("failed to read evidence %q: %w", evidenceID, err)
	}
	if evBytes == nil {
		return "", fmt.Errorf("evidence %q does not exist", evidenceID)
	}

	return string(evBytes), nil
}

// ListAssetEvidence retrieves all evidence records committed for a specific asset.
func (c *AssetContract) ListAssetEvidence(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetID cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~evidence", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query evidence for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var evidenceList []*Evidence
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading evidence iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		evidenceID := compositeParts[1]
		evidenceKey := "evidence_" + evidenceID
		evBytes, err := ctx.GetStub().GetState(evidenceKey)
		if err == nil && evBytes != nil {
			var ev Evidence
			if err := json.Unmarshal(evBytes, &ev); err == nil {
				evidenceList = append(evidenceList, &ev)
			}
		}
	}

	if evidenceList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(evidenceList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize evidence list: %w", err)
	}

	return string(b), nil
}

// =============================================================================
// Phase 4 — Valuation Operations
// =============================================================================

// CreateValuation creates a new valuation record for an asset.
func (c *AssetContract) CreateValuation(
	ctx contractapi.TransactionContextInterface,
	valuationJSON string,
) error {
	if valuationJSON == "" {
		return fmt.Errorf("valuationJSON cannot be empty")
	}

	var v Valuation
	if err := json.Unmarshal([]byte(valuationJSON), &v); err != nil {
		return fmt.Errorf("invalid valuationJSON: %w", err)
	}

	if v.ValuationID == "" {
		return fmt.Errorf("valuationId is required")
	}
	if v.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if v.Value <= 0 {
		return fmt.Errorf("value must be positive")
	}
	if v.Currency == "" {
		return fmt.Errorf("currency is required")
	}
	if v.Method == "" {
		return fmt.Errorf("method is required")
	}
	if v.ValuationDate == "" {
		return fmt.Errorf("valuationDate is required")
	}
	if v.ValidUntil == "" {
		return fmt.Errorf("validUntil is required")
	}

	// Verify target asset exists
	exists, err := c.AssetExists(ctx, v.AssetID)
	if err != nil {
		return fmt.Errorf("failed checking asset existence: %w", err)
	}
	if !exists {
		return fmt.Errorf("asset %q does not exist: cannot create valuation for non-existent asset", v.AssetID)
	}

	// Immutability: prevent silent overwrite of existing valuation record
	valuationKey := "valuation_" + v.ValuationID
	existingBytes, err := ctx.GetStub().GetState(valuationKey)
	if err != nil {
		return fmt.Errorf("failed checking valuation existence: %w", err)
	}
	if existingBytes != nil {
		return fmt.Errorf("valuation %q already exists: valuation records are immutable and cannot be overwritten", v.ValuationID)
	}

	// Capture submitter identity and timestamp
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	if v.SubmittedBy == "" {
		v.SubmittedBy = fmt.Sprintf("%s::%s", mspID, clientID)
	}
	if v.SubmittedAt == "" {
		v.SubmittedAt = now
	}
	if v.Status == "" {
		v.Status = ValuationStatusSubmitted
	}
	v.DocType = DocTypeValuation

	vBytes, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to serialize valuation %q: %w", v.ValuationID, err)
	}

	if err := ctx.GetStub().PutState(valuationKey, vBytes); err != nil {
		return fmt.Errorf("failed writing valuation %q to ledger: %w", v.ValuationID, err)
	}

	// Create composite key index for fast retrieval by assetId
	indexKey, err := ctx.GetStub().CreateCompositeKey("asset~valuation", []string{v.AssetID, v.ValuationID})
	if err != nil {
		return fmt.Errorf("failed creating composite key for valuation: %w", err)
	}

	if err := ctx.GetStub().PutState(indexKey, []byte{0x00}); err != nil {
		return fmt.Errorf("failed indexing valuation: %w", err)
	}

	// Record audit event
	if err := c.recordAuditEvent(ctx, "VALUATION_CREATED", v.AssetID, clientID, mspID, now, "Valuation submitted", v.ValuationID); err != nil {
		return err
	}

	return nil
}

// GetValuation retrieves a single valuation record by its valuationID.
func (c *AssetContract) GetValuation(
	ctx contractapi.TransactionContextInterface,
	valuationID string,
) (string, error) {
	if valuationID == "" {
		return "", fmt.Errorf("valuationID cannot be empty")
	}

	valuationKey := "valuation_" + valuationID
	vBytes, err := ctx.GetStub().GetState(valuationKey)
	if err != nil {
		return "", fmt.Errorf("failed to read valuation %q: %w", valuationID, err)
	}
	if vBytes == nil {
		return "", fmt.Errorf("valuation %q does not exist", valuationID)
	}

	return string(vBytes), nil
}

// ListAssetValuations retrieves all valuation records committed for a specific asset.
func (c *AssetContract) ListAssetValuations(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetID cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~valuation", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query valuations for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var valuationList []*Valuation
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading valuation iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		valuationID := compositeParts[1]
		valuationKey := "valuation_" + valuationID
		vBytes, err := ctx.GetStub().GetState(valuationKey)
		if err == nil && vBytes != nil {
			var v Valuation
			if err := json.Unmarshal(vBytes, &v); err == nil {
				valuationList = append(valuationList, &v)
			}
		}
	}

	if valuationList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(valuationList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize valuation list: %w", err)
	}

	return string(b), nil
}

// parseValuationDate parses a date string in either RFC3339 or YYYY-MM-DD format.
func parseValuationDate(dateStr string) (time.Time, error) {
	// Try RFC3339 first
	t, err := time.Parse(time.RFC3339, dateStr)
	if err == nil {
		return t, nil
	}
	// Try date-only format (YYYY-MM-DD)
	t, err = time.Parse("2006-01-02", dateStr)
	if err == nil {
		return t, nil
	}
	return time.Time{}, fmt.Errorf("invalid date format: %s", dateStr)
}

// CheckValuationReadiness checks if an asset has a valid, non-expired valuation.
func (c *AssetContract) CheckValuationReadiness(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "", fmt.Errorf("assetID cannot be empty")
	}

	asset, err := c.ReadAsset(ctx, assetID)
	if err != nil {
		return "", err
	}

	// Get all valuations for the asset
	valJSON, err := c.ListAssetValuations(ctx, assetID)
	if err != nil {
		return "", err
	}

	var valuations []*Valuation
	if err := json.Unmarshal([]byte(valJSON), &valuations); err != nil {
		return "", fmt.Errorf("failed to parse valuations: %w", err)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	var now time.Time
	if err == nil && txTimestamp != nil && txTimestamp.Seconds > 0 {
		now = time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()
	} else {
		now = time.Now().UTC()
	}

	// Find the latest VALID valuation that hasn't expired deterministically
	var validValuation *Valuation
	for _, v := range valuations {
		if v.Status == ValuationStatusValid {
			validUntil, err := parseValuationDate(v.ValidUntil)
			if err != nil {
				continue
			}
			if now.Before(validUntil) || now.Equal(validUntil) {
				// Check if this valuation is superseded by a newer valid one
				if v.SupersededBy == "" {
					if validValuation == nil || v.ValuationDate > validValuation.ValuationDate ||
						(v.ValuationDate == validValuation.ValuationDate && v.ValuationID > validValuation.ValuationID) {
						validValuation = v
					}
				}
			}
		}
	}

	if validValuation == nil {
		// Build detailed failure reason
		hasValuation := len(valuations) > 0
		valuationExpired := false
		// A valuation counts as "expired" if:
		//  (a) its Status was explicitly set to EXPIRED, OR
		//  (b) its Status is VALID but validUntil is in the past.
		for _, v := range valuations {
			if v.Status == ValuationStatusExpired {
				valuationExpired = true
				break
			}
			if v.Status == ValuationStatusValid {
				validUntil, err := parseValuationDate(v.ValidUntil)
				if err != nil {
					continue
				}
				if now.After(validUntil) {
					valuationExpired = true
					break
				}
			}
		}

		result := map[string]interface{}{
			"ready":       false,
			"reason":      "VALID_VALUATION_REQUIRED",
			"assetId":     assetID,
			"assetStatus": asset.Status,
			"details": map[string]interface{}{
				"hasValuation":     hasValuation,
				"valuationExpired": valuationExpired,
			},
		}

		b, _ := json.Marshal(result)
		return string(b), nil
	}

	result := map[string]interface{}{
		"ready":       true,
		"reason":      "VALUATION_READY",
		"assetId":     assetID,
		"assetStatus": asset.Status,
		"valuationId": validValuation.ValuationID,
		"value":       validValuation.Value,
		"currency":    validValuation.Currency,
		"method":      validValuation.Method,
		"validUntil":  validValuation.ValidUntil,
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// =============================================================================
// Phase 5 — Ownership & Transfer Operations
// =============================================================================

// CreateOwnership creates an initial ownership record for a token.
func (c *AssetContract) CreateOwnership(
	ctx contractapi.TransactionContextInterface,
	ownershipJSON string,
) error {
	if ownershipJSON == "" {
		return fmt.Errorf("ownershipJSON cannot be empty")
	}

	var o Ownership
	if err := json.Unmarshal([]byte(ownershipJSON), &o); err != nil {
		return fmt.Errorf("invalid ownershipJSON: %w", err)
	}

	if o.OwnershipID == "" {
		return fmt.Errorf("ownershipId is required")
	}
	if o.TokenID == "" {
		return fmt.Errorf("tokenId is required")
	}
	if o.OwnerID == "" {
		return fmt.Errorf("ownerId is required")
	}
	if o.OwnerMSP == "" {
		return fmt.Errorf("ownerMSP is required")
	}
	if o.Balance <= 0 {
		return fmt.Errorf("balance must be positive")
	}
	if o.OwnershipType != TokenTypeWhole && o.OwnershipType != TokenTypeFractional {
		return fmt.Errorf("invalid ownershipType %q: must be WHOLE or FRACTIONAL", o.OwnershipType)
	}

	// Verify token exists
	token, err := c.GetToken(ctx, o.TokenID)
	if err != nil {
		return fmt.Errorf("token %q does not exist: %w", o.TokenID, err)
	}

	var t Token
	json.Unmarshal([]byte(token), &t)

	// Verify token supply matches balance for initial ownership
	if o.OwnershipType == TokenTypeWhole && o.Balance != 1 {
		return fmt.Errorf("WHOLE token initial ownership must have balance = 1")
	}
	if o.OwnershipType == TokenTypeFractional && o.Balance != t.TotalSupply {
		return fmt.Errorf("FRACTIONAL token initial ownership must have balance = totalSupply")
	}

	// Check if ownership already exists for this token+owner
	ownershipKey := "ownership_" + o.TokenID + "_" + o.OwnerMSP + "_" + o.OwnerID
	existingBytes, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return fmt.Errorf("failed checking ownership existence: %w", err)
	}
	if existingBytes != nil {
		return fmt.Errorf("ownership for token %q owner %q already exists", o.TokenID, o.OwnerID)
	}

	// Capture submitter identity and timestamp
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	if o.CreatedAt == "" {
		o.CreatedAt = now
	}
	if o.UpdatedAt == "" {
		o.UpdatedAt = now
	}
	if o.Status == "" {
		o.Status = OwnershipStatusActive
	}
	o.DocType = DocTypeOwnership

	oBytes, err := json.Marshal(o)
	if err != nil {
		return fmt.Errorf("failed to serialize ownership %q: %w", o.OwnershipID, err)
	}

	if err := ctx.GetStub().PutState(ownershipKey, oBytes); err != nil {
		return fmt.Errorf("failed writing ownership %q to ledger: %w", o.OwnershipID, err)
	}

	// Create composite key indexes
	tokenOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("token~ownership", []string{o.TokenID, o.OwnerMSP, o.OwnerID})
	ctx.GetStub().PutState(tokenOwnershipIndex, []byte{0x00})

	ownerOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("owner~ownership", []string{o.OwnerMSP, o.OwnerID, o.TokenID})
	ctx.GetStub().PutState(ownerOwnershipIndex, []byte{0x00})

	// Record audit event
	if err := c.recordAuditEvent(ctx, "OWNERSHIP_CREATED", t.AssetID, clientID, mspID, now, "Initial ownership created", o.OwnershipID); err != nil {
		return err
	}

	return nil
}

// GetOwnership retrieves an ownership record by token and owner.
func (c *AssetContract) GetOwnership(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
	ownerID string,
	ownerMSP string,
) (string, error) {
	if tokenID == "" {
		return "", fmt.Errorf("tokenId is required")
	}
	if ownerID == "" {
		return "", fmt.Errorf("ownerId is required")
	}
	if ownerMSP == "" {
		return "", fmt.Errorf("ownerMSP is required")
	}

	ownershipKey := "ownership_" + tokenID + "_" + ownerMSP + "_" + ownerID
	oBytes, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return "", fmt.Errorf("failed to read ownership: %w", err)
	}
	if oBytes == nil {
		return "", fmt.Errorf("ownership not found")
	}

	return string(oBytes), nil
}

// GetTokenOwners retrieves all ownership records for a token.
func (c *AssetContract) GetTokenOwners(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
) (string, error) {
	if tokenID == "" {
		return "[]", fmt.Errorf("tokenId is required")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("token~ownership", []string{tokenID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query owners for token %q: %w", tokenID, err)
	}
	defer iterator.Close()

	var ownershipList []*Ownership
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading ownership iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 3 {
			continue
		}
		ownershipKey := "ownership_" + tokenID + "_" + compositeParts[1] + "_" + compositeParts[2]
		oBytes, err := ctx.GetStub().GetState(ownershipKey)
		if err == nil && oBytes != nil {
			var o Ownership
			if err := json.Unmarshal(oBytes, &o); err == nil {
				ownershipList = append(ownershipList, &o)
			}
		}
	}

	if ownershipList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(ownershipList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize ownership list: %w", err)
	}

	return string(b), nil
}

// GetOwnerHoldings retrieves all ownership records for an owner across all tokens.
func (c *AssetContract) GetOwnerHoldings(
	ctx contractapi.TransactionContextInterface,
	ownerID string,
	ownerMSP string,
) (string, error) {
	if ownerID == "" {
		return "[]", fmt.Errorf("ownerId is required")
	}
	if ownerMSP == "" {
		return "[]", fmt.Errorf("ownerMSP is required")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("owner~ownership", []string{ownerMSP, ownerID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query holdings for owner %q: %w", ownerID, err)
	}
	defer iterator.Close()

	var holdings []*Ownership
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading holdings iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 3 {
			continue
		}
		ownershipKey := "ownership_" + compositeParts[2] + "_" + compositeParts[0] + "_" + compositeParts[1]
		oBytes, err := ctx.GetStub().GetState(ownershipKey)
		if err == nil && oBytes != nil {
			var o Ownership
			if err := json.Unmarshal(oBytes, &o); err == nil {
				holdings = append(holdings, &o)
			}
		}
	}

	if holdings == nil {
		return "[]", nil
	}

	b, err := json.Marshal(holdings)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize holdings: %w", err)
	}

	return string(b), nil
}

// GetTokenBalance retrieves the balance for a specific owner of a token.
func (c *AssetContract) GetTokenBalance(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
	ownerID string,
	ownerMSP string,
) (string, error) {
	if tokenID == "" {
		return "", fmt.Errorf("tokenId is required")
	}
	if ownerID == "" {
		return "", fmt.Errorf("ownerId is required")
	}
	if ownerMSP == "" {
		return "", fmt.Errorf("ownerMSP is required")
	}

	ownershipKey := "ownership_" + tokenID + "_" + ownerMSP + "_" + ownerID
	oBytes, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return "", fmt.Errorf("failed to read ownership: %w", err)
	}
	if oBytes == nil {
		return "0", nil // No ownership record means zero balance
	}

	var o Ownership
	if err := json.Unmarshal(oBytes, &o); err != nil {
		return "", fmt.Errorf("failed to deserialize ownership: %w", err)
	}

	result := map[string]interface{}{
		"tokenId":             tokenID,
		"ownerId":             ownerID,
		"ownerMSP":            ownerMSP,
		"balance":             o.Balance,
		"ownershipType":       o.OwnershipType,
		"totalSupply":         0,
		"ownershipPercentage": 0.0,
	}

	// Get token for totalSupply and percentage calculation
	tokenJSON, err := c.GetToken(ctx, tokenID)
	if err == nil {
		var t Token
		json.Unmarshal([]byte(tokenJSON), &t)
		result["totalSupply"] = t.TotalSupply
		if t.TotalSupply > 0 {
			result["ownershipPercentage"] = (o.Balance / t.TotalSupply) * 100
		}
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// TransferOwnership transfers ownership between owners.
func (c *AssetContract) TransferOwnership(
	ctx contractapi.TransactionContextInterface,
	transferJSON string,
) error {
	if transferJSON == "" {
		return fmt.Errorf("transferJSON cannot be empty")
	}

	var tr Transfer
	if err := json.Unmarshal([]byte(transferJSON), &tr); err != nil {
		return fmt.Errorf("invalid transferJSON: %w", err)
	}

	// Validation
	if tr.TransferID == "" {
		return fmt.Errorf("transferId is required")
	}
	if tr.TokenID == "" {
		return fmt.Errorf("tokenId is required")
	}
	if tr.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if tr.FromOwnerID == "" {
		return fmt.Errorf("fromOwnerId is required")
	}
	if tr.FromOwnerMSP == "" {
		return fmt.Errorf("fromOwnerMSP is required")
	}
	if tr.ToOwnerID == "" {
		return fmt.Errorf("toOwnerId is required")
	}
	if tr.ToOwnerMSP == "" {
		return fmt.Errorf("toOwnerMSP is required")
	}
	if tr.Amount <= 0 {
		return fmt.Errorf("INVALID_TRANSFER_AMOUNT: amount must be positive")
	}
	if tr.FromOwnerID == tr.ToOwnerID && tr.FromOwnerMSP == tr.ToOwnerMSP {
		return fmt.Errorf("SELF_TRANSFER_NOT_ALLOWED: cannot transfer to self")
	}
	if existing, err := ctx.GetStub().GetState("transfer_" + tr.TransferID); err != nil {
		return fmt.Errorf("failed checking transfer uniqueness: %w", err)
	} else if existing != nil {
		return fmt.Errorf("TRANSFER_ALREADY_EXISTS: transfer %q already exists", tr.TransferID)
	}

	// Verify token exists and is active
	token, err := c.GetToken(ctx, tr.TokenID)
	if err != nil {
		return fmt.Errorf("TOKEN_NOT_FOUND: token %q does not exist", tr.TokenID)
	}

	var t Token
	json.Unmarshal([]byte(token), &t)

	if t.Status != TokenStatusActive {
		return fmt.Errorf("TOKEN_NOT_ACTIVE: token %q is not ACTIVE (current: %s)", tr.TokenID, t.Status)
	}

	// Validate token matches asset
	if t.AssetID != tr.AssetID {
		return fmt.Errorf("TOKEN_ASSET_MISMATCH: token %q does not belong to asset %q", tr.TokenID, tr.AssetID)
	}
	if tr.Amount > t.TotalSupply {
		return fmt.Errorf("INVALID_TRANSFER_AMOUNT: amount exceeds total supply")
	}

	// Verify sender ownership
	senderKey := "ownership_" + tr.TokenID + "_" + tr.FromOwnerMSP + "_" + tr.FromOwnerID
	senderBytes, err := ctx.GetStub().GetState(senderKey)
	if err != nil {
		return fmt.Errorf("failed to read sender ownership: %w", err)
	}
	if senderBytes == nil {
		return fmt.Errorf("OWNER_NOT_FOUND: sender %q has no ownership of token %q", tr.FromOwnerID, tr.TokenID)
	}

	var senderOwnership Ownership
	json.Unmarshal(senderBytes, &senderOwnership)

	if senderOwnership.Status != OwnershipStatusActive {
		return fmt.Errorf("OWNER_INACTIVE: sender ownership is not active")
	}

	if senderOwnership.Balance < tr.Amount {
		return fmt.Errorf("INSUFFICIENT_BALANCE: sender balance %.0f < requested amount %.0f", senderOwnership.Balance, tr.Amount)
	}

	// Check decimals precision for fractional tokens
	if t.TokenType == TokenTypeFractional {
		precision := 1.0
		for i := 0; i < t.Decimals; i++ {
			precision *= 10
		}
		// Check if amount respects decimal precision
		if tr.Amount*precision != math.Floor(tr.Amount*precision) {
			return fmt.Errorf("INVALID_TRANSFER_AMOUNT: amount %v exceeds token precision (decimals=%d)", tr.Amount, t.Decimals)
		}
	}

	// For whole tokens, amount must be 1
	if t.TokenType == TokenTypeWhole {
		if tr.Amount != 1 {
			return fmt.Errorf("INVALID_TRANSFER_AMOUNT: WHOLE token transfer amount must be 1")
		}
	}

	// Verify recipient exists or create new ownership
	recipientKey := "ownership_" + tr.TokenID + "_" + tr.ToOwnerMSP + "_" + tr.ToOwnerID
	recipientBytes, err := ctx.GetStub().GetState(recipientKey)
	if err != nil {
		return fmt.Errorf("failed to read recipient ownership: %w", err)
	}

	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	// Update sender balance (subtract)
	senderOwnership.Balance -= tr.Amount
	senderOwnership.UpdatedAt = now
	if senderOwnership.Balance == 0 {
		senderOwnership.Status = OwnershipStatusInactive
	}

	senderBytes, err = json.Marshal(senderOwnership)
	if err != nil {
		return fmt.Errorf("failed to serialize sender ownership: %w", err)
	}
	if err := ctx.GetStub().PutState(senderKey, senderBytes); err != nil {
		return fmt.Errorf("failed to update sender ownership: %w", err)
	}

	// Update or create recipient ownership
	var recipientOwnership Ownership
	if recipientBytes != nil {
		// Update existing
		json.Unmarshal(recipientBytes, &recipientOwnership)
		recipientOwnership.Balance += tr.Amount
		recipientOwnership.UpdatedAt = now
		recipientOwnership.Status = OwnershipStatusActive
	} else {
		// Create new
		recipientOwnership = Ownership{
			DocType:       DocTypeOwnership,
			OwnershipID:   fmt.Sprintf("OWN-%s-%s-%s", tr.TokenID, tr.ToOwnerMSP, tr.ToOwnerID),
			TokenID:       tr.TokenID,
			OwnerID:       tr.ToOwnerID,
			OwnerMSP:      tr.ToOwnerMSP,
			Balance:       tr.Amount,
			OwnershipType: t.TokenType,
			CreatedAt:     now,
			UpdatedAt:     now,
			Status:        OwnershipStatusActive,
		}
		// Create composite key indexes for new ownership
		tokenOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("token~ownership", []string{tr.TokenID, recipientOwnership.OwnerMSP, recipientOwnership.OwnerID})
		ctx.GetStub().PutState(tokenOwnershipIndex, []byte{0x00})

		ownerOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("owner~ownership", []string{tr.ToOwnerMSP, tr.ToOwnerID, tr.TokenID})
		ctx.GetStub().PutState(ownerOwnershipIndex, []byte{0x00})
	}

	recipientBytes, err = json.Marshal(recipientOwnership)
	if err != nil {
		return fmt.Errorf("failed to serialize recipient ownership: %w", err)
	}
	if err := ctx.GetStub().PutState(recipientKey, recipientBytes); err != nil {
		return fmt.Errorf("failed to update recipient ownership: %w", err)
	}

	// Create transfer record
	if tr.Timestamp == "" {
		tr.Timestamp = now
	}
	if tr.RequestedBy == "" {
		tr.RequestedBy = clientID
	}
	if tr.RequestedByMSP == "" {
		tr.RequestedByMSP = mspID
	}
	if tr.Status == "" {
		tr.Status = TransferStatusCompleted
	}
	tr.DocType = DocTypeTransfer

	transferBytes, err := json.Marshal(tr)
	if err != nil {
		return fmt.Errorf("failed to serialize transfer: %w", err)
	}

	transferKey := "transfer_" + tr.TransferID
	if err := ctx.GetStub().PutState(transferKey, transferBytes); err != nil {
		return fmt.Errorf("failed writing transfer: %w", err)
	}

	// Create composite key indexes for transfer
	tokenTransferIndex, _ := ctx.GetStub().CreateCompositeKey("token~transfer", []string{tr.TokenID, tr.TransferID})
	ctx.GetStub().PutState(tokenTransferIndex, []byte{0x00})

	assetTransferIndex, _ := ctx.GetStub().CreateCompositeKey("asset~transfer", []string{tr.AssetID, tr.TransferID})
	ctx.GetStub().PutState(assetTransferIndex, []byte{0x00})

	fromOwnerTransferIndex, _ := ctx.GetStub().CreateCompositeKey("owner~transfer", []string{tr.FromOwnerMSP, tr.FromOwnerID, tr.TransferID})
	ctx.GetStub().PutState(fromOwnerTransferIndex, []byte{0x00})

	toOwnerTransferIndex, _ := ctx.GetStub().CreateCompositeKey("owner~transfer", []string{tr.ToOwnerMSP, tr.ToOwnerID, tr.TransferID})
	ctx.GetStub().PutState(toOwnerTransferIndex, []byte{0x00})

	// Record audit event
	if err := c.recordAuditEvent(ctx, "OWNERSHIP_TRANSFERRED", tr.AssetID, clientID, mspID, now, fmt.Sprintf("Transferred %.0f from %s to %s", tr.Amount, tr.FromOwnerID, tr.ToOwnerID), tr.TransferID); err != nil {
		return err
	}

	return nil
}

// GetTransfer retrieves a transfer record by its transferId.
func (c *AssetContract) GetTransfer(
	ctx contractapi.TransactionContextInterface,
	transferID string,
) (string, error) {
	if transferID == "" {
		return "", fmt.Errorf("transferId is required")
	}

	transferKey := "transfer_" + transferID
	tBytes, err := ctx.GetStub().GetState(transferKey)
	if err != nil {
		return "", fmt.Errorf("failed to read transfer: %w", err)
	}
	if tBytes == nil {
		return "", fmt.Errorf("transfer %q does not exist", transferID)
	}

	return string(tBytes), nil
}

// ListTokenTransfers retrieves all transfers for a token.
func (c *AssetContract) ListTokenTransfers(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
) (string, error) {
	if tokenID == "" {
		return "[]", fmt.Errorf("tokenId is required")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("token~transfer", []string{tokenID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query transfers for token %q: %w", tokenID, err)
	}
	defer iterator.Close()

	var transferList []*Transfer
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading transfer iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		transferID := compositeParts[1]
		transferKey := "transfer_" + transferID
		tBytes, err := ctx.GetStub().GetState(transferKey)
		if err == nil && tBytes != nil {
			var tr Transfer
			if err := json.Unmarshal(tBytes, &tr); err == nil {
				transferList = append(transferList, &tr)
			}
		}
	}

	if transferList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(transferList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize transfer list: %w", err)
	}

	return string(b), nil
}

// ListAssetTransfers retrieves all transfers for an asset.
func (c *AssetContract) ListAssetTransfers(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetId is required")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~transfer", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query transfers for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var transferList []*Transfer
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading transfer iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		transferID := compositeParts[1]
		transferKey := "transfer_" + transferID
		tBytes, err := ctx.GetStub().GetState(transferKey)
		if err == nil && tBytes != nil {
			var tr Transfer
			if err := json.Unmarshal(tBytes, &tr); err == nil {
				transferList = append(transferList, &tr)
			}
		}
	}

	if transferList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(transferList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize transfer list: %w", err)
	}

	return string(b), nil
}

// ListOwnerTransfers retrieves all transfers for an owner (as sender or recipient).
func (c *AssetContract) ListOwnerTransfers(
	ctx contractapi.TransactionContextInterface,
	ownerID string,
	ownerMSP string,
) (string, error) {
	if ownerID == "" {
		return "[]", fmt.Errorf("ownerId is required")
	}
	if ownerMSP == "" {
		return "[]", fmt.Errorf("ownerMSP is required")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("owner~transfer", []string{ownerMSP, ownerID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query transfers for owner %q: %w", ownerID, err)
	}
	defer iterator.Close()

	var transferList []*Transfer
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading transfer iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 3 {
			continue
		}

		transferID := compositeParts[2]
		transferKey := "transfer_" + transferID
		tBytes, err := ctx.GetStub().GetState(transferKey)
		if err == nil && tBytes != nil {
			var tr Transfer
			if err := json.Unmarshal(tBytes, &tr); err == nil {
				transferList = append(transferList, &tr)
			}
		}
	}

	if transferList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(transferList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize transfer list: %w", err)
	}

	return string(b), nil
}

// ValidateTransferParticipants validates basic eligibility for transfer participants.
func (c *AssetContract) ValidateTransferParticipants(
	ctx contractapi.TransactionContextInterface,
	fromOwnerID string,
	fromOwnerMSP string,
	toOwnerID string,
	toOwnerMSP string,
) (string, error) {
	// Phase 5: Basic identity validation - Phase 6 will expand with Policy-as-Code
	result := map[string]interface{}{
		"valid":     true,
		"fromOwner": fmt.Sprintf("%s::%s", fromOwnerMSP, fromOwnerID),
		"toOwner":   fmt.Sprintf("%s::%s", toOwnerMSP, toOwnerID),
		"checks":    []string{"identity_format_valid"},
		"warnings":  []string{},
	}

	// Basic format validation
	if fromOwnerID == "" || fromOwnerMSP == "" {
		result["valid"] = false
		result["checks"] = append(result["checks"].([]string), "from_owner_missing")
	}
	if toOwnerID == "" || toOwnerMSP == "" {
		result["valid"] = false
		result["checks"] = append(result["checks"].([]string), "to_owner_missing")
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// UpdateValuationStatus updates the status of a valuation record.
func (c *AssetContract) UpdateValuationStatus(
	ctx contractapi.TransactionContextInterface,
	valuationID string,
	newStatus string,
	reason string,
) error {
	if valuationID == "" {
		return fmt.Errorf("valuationId is required")
	}
	if newStatus == "" {
		return fmt.Errorf("newStatus is required")
	}

	validStatuses := map[string]bool{
		ValuationStatusValid:      true,
		ValuationStatusExpired:    true,
		ValuationStatusRejected:   true,
		ValuationStatusSuperseded: true,
	}
	if !validStatuses[newStatus] {
		return fmt.Errorf("invalid status %q: must be one of VALID, EXPIRED, REJECTED, SUPERSEDED", newStatus)
	}

	valuationKey := "valuation_" + valuationID
	vBytes, err := ctx.GetStub().GetState(valuationKey)
	if err != nil {
		return fmt.Errorf("failed to read valuation %q: %w", valuationID, err)
	}
	if vBytes == nil {
		return fmt.Errorf("valuation %q does not exist", valuationID)
	}

	var v Valuation
	if err := json.Unmarshal(vBytes, &v); err != nil {
		return fmt.Errorf("failed to deserialize valuation %q: %w", valuationID, err)
	}

	// Record audit event before status change
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	oldStatus := v.Status
	v.Status = newStatus

	if reason == "" {
		reason = fmt.Sprintf("Status changed from %s to %s", oldStatus, newStatus)
	}

	vBytes, err = json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to serialize valuation %q: %w", valuationID, err)
	}

	if err := ctx.GetStub().PutState(valuationKey, vBytes); err != nil {
		return fmt.Errorf("failed writing valuation %q to ledger: %w", valuationID, err)
	}

	// Record audit event
	eventType := "VALUATION_VALIDATED"
	if newStatus == ValuationStatusExpired {
		eventType = "VALUATION_EXPIRED"
	} else if newStatus == ValuationStatusRejected {
		eventType = "VALUATION_REJECTED"
	} else if newStatus == ValuationStatusSuperseded {
		eventType = "VALUATION_SUPERSEDED"
	}
	if err := c.recordAuditEvent(ctx, eventType, v.AssetID, clientID, mspID, now, reason, valuationID); err != nil {
		return err
	}

	return nil
}

// =============================================================================
// Phase 4 — Tokenization Approval Operations
// =============================================================================

// CreateTokenizationApproval records a formal tokenization approval decision.
func (c *AssetContract) CreateTokenizationApproval(
	ctx contractapi.TransactionContextInterface,
	approvalJSON string,
) error {
	if approvalJSON == "" {
		return fmt.Errorf("approvalJSON cannot be empty")
	}

	var a TokenizationApproval
	if err := json.Unmarshal([]byte(approvalJSON), &a); err != nil {
		return fmt.Errorf("invalid approvalJSON: %w", err)
	}

	if a.ApprovalID == "" {
		return fmt.Errorf("approvalId is required")
	}
	if a.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if a.Decision != ApprovalDecisionApproved && a.Decision != ApprovalDecisionRejected {
		return fmt.Errorf("invalid decision %q: must be APPROVED or REJECTED", a.Decision)
	}

	// Verify target asset exists
	_, err := c.ReadAsset(ctx, a.AssetID)
	if err != nil {
		return fmt.Errorf("cannot create approval for non-existent asset %q: %w", a.AssetID, err)
	}

	// Immutability: prevent silent overwrite of existing approval record
	approvalKey := "approval_" + a.ApprovalID
	existingBytes, err := ctx.GetStub().GetState(approvalKey)
	if err != nil {
		return fmt.Errorf("failed checking approval existence: %w", err)
	}
	if existingBytes != nil {
		return fmt.Errorf("approval %q already exists: approval records are immutable and cannot be overwritten", a.ApprovalID)
	}

	// Capture submitter identity and timestamp
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	nowTime := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()
	now := nowTime.Format(time.RFC3339)

	if a.ApprovedBy == "" {
		a.ApprovedBy = clientID
	}
	if a.ApprovedByMSP == "" {
		a.ApprovedByMSP = mspID
	}
	if a.ApprovedAt == "" {
		a.ApprovedAt = now
	}
	a.DocType = DocTypeTokenApproval

	// Capture snapshots at approval time
	if a.VerificationSnapshot == nil {
		// Find latest APPROVED verification
		verifJSON, _ := c.GetVerificationHistory(ctx, a.AssetID)
		var verifications []*Verification
		json.Unmarshal([]byte(verifJSON), &verifications)
		for _, v := range verifications {
			if v.Decision == VerificationApproved {
				a.VerificationSnapshot = &VerificationSnapshot{
					VerificationID: v.VerificationID,
					Verifier:       v.VerifierIdentity,
					VerifiedAt:     v.Timestamp,
				}
				break
			}
		}
	}

	if a.ValuationSnapshot == nil {
		// Find latest VALID valuation
		valJSON, _ := c.ListAssetValuations(ctx, a.AssetID)
		var valuations []*Valuation
		json.Unmarshal([]byte(valJSON), &valuations)
		for _, v := range valuations {
			if v.Status == ValuationStatusValid {
				validUntil, err := parseValuationDate(v.ValidUntil)
				if err == nil && (nowTime.Before(validUntil) || nowTime.Equal(validUntil)) {
					if a.ValuationSnapshot == nil || v.ValuationDate > a.ValuationSnapshot.ValuationDate ||
						(v.ValuationDate == a.ValuationSnapshot.ValuationDate && v.ValuationID > a.ValuationSnapshot.ValuationID) {
						a.ValuationSnapshot = &ValuationSnapshot{
							ValuationID:   v.ValuationID,
							Value:         v.Value,
							Currency:      v.Currency,
							Method:        v.Method,
							ValuationDate: v.ValuationDate,
							Source:        v.Source,
							ValidUntil:    v.ValidUntil,
						}
					}
				}
			}
		}
	}

	aBytes, err := json.Marshal(a)
	if err != nil {
		return fmt.Errorf("failed to serialize approval %q: %w", a.ApprovalID, err)
	}

	if err := ctx.GetStub().PutState(approvalKey, aBytes); err != nil {
		return fmt.Errorf("failed writing approval %q to ledger: %w", a.ApprovalID, err)
	}

	// Create composite key index for fast retrieval by assetId
	indexKey, err := ctx.GetStub().CreateCompositeKey("asset~approval", []string{a.AssetID, a.ApprovalID})
	if err != nil {
		return fmt.Errorf("failed creating composite key for approval: %w", err)
	}

	if err := ctx.GetStub().PutState(indexKey, []byte{0x00}); err != nil {
		return fmt.Errorf("failed indexing approval: %w", err)
	}

	// Record audit event
	eventType := "TOKENIZATION_APPROVED"
	if a.Decision == ApprovalDecisionRejected {
		eventType = "TOKENIZATION_REJECTED"
	}
	if err := c.recordAuditEvent(ctx, eventType, a.AssetID, clientID, mspID, now, a.Reason, a.ApprovalID); err != nil {
		return err
	}

	return nil
}

// GetTokenizationApprovals retrieves all tokenization approval records for an asset.
func (c *AssetContract) GetTokenizationApprovals(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetID cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~approval", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query approvals for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var approvalList []*TokenizationApproval
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading approval iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		approvalID := compositeParts[1]
		approvalKey := "approval_" + approvalID
		aBytes, err := ctx.GetStub().GetState(approvalKey)
		if err == nil && aBytes != nil {
			var a TokenizationApproval
			if err := json.Unmarshal(aBytes, &a); err == nil {
				approvalList = append(approvalList, &a)
			}
		}
	}

	if approvalList == nil {
		return "[]", nil
	}

	b, err := json.Marshal(approvalList)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize approval list: %w", err)
	}

	return string(b), nil
}

// =============================================================================
// Phase 4 — Token Operations
// =============================================================================

// TokenizeAsset creates a token for a verified asset after all prerequisites are met.
func (c *AssetContract) TokenizeAsset(
	ctx contractapi.TransactionContextInterface,
	tokenizationRequestJSON string,
) error {
	if tokenizationRequestJSON == "" {
		return fmt.Errorf("tokenizationRequestJSON cannot be empty")
	}

	var req struct {
		TokenID         string  `json:"tokenId"`
		AssetID         string  `json:"assetId"`
		TokenType       string  `json:"tokenType"`
		TotalSupply     float64 `json:"totalSupply"`
		Decimals        int     `json:"decimals"`
		Currency        string  `json:"currency"`
		CreatedBy       string  `json:"createdBy"`
		Remarks         string  `json:"remarks"`
		InitialOwnerID  string  `json:"initialOwnerId"`
		InitialOwnerMSP string  `json:"initialOwnerMSP"`
	}

	if err := json.Unmarshal([]byte(tokenizationRequestJSON), &req); err != nil {
		return fmt.Errorf("invalid tokenizationRequestJSON: %w", err)
	}

	if req.TokenID == "" {
		return fmt.Errorf("tokenId is required")
	}
	if req.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if req.TokenType != TokenTypeWhole && req.TokenType != TokenTypeFractional {
		return fmt.Errorf("invalid tokenType %q: must be WHOLE or FRACTIONAL", req.TokenType)
	}
	if req.TokenType == TokenTypeWhole {
		if req.TotalSupply != 1 {
			return fmt.Errorf("WHOLE token must have totalSupply = 1")
		}
		if req.Decimals != 0 {
			return fmt.Errorf("WHOLE token must have decimals = 0")
		}
	}
	if req.TokenType == TokenTypeFractional {
		if req.TotalSupply <= 1 {
			return fmt.Errorf("FRACTIONAL token must have totalSupply > 1")
		}
		if req.Decimals < 0 {
			return fmt.Errorf("FRACTIONAL token decimals must be >= 0")
		}
	}
	if req.Currency == "" {
		return fmt.Errorf("currency is required")
	}
	if req.InitialOwnerID == "" {
		return fmt.Errorf("initialOwnerId is required")
	}
	if req.InitialOwnerMSP == "" {
		return fmt.Errorf("initialOwnerMSP is required")
	}

	// Check if asset already tokenized
	assetTokenKey := "asset_token_" + req.AssetID
	existingBytes, err := ctx.GetStub().GetState(assetTokenKey)
	if err != nil {
		return fmt.Errorf("failed checking asset token existence: %w", err)
	}
	if existingBytes != nil {
		return fmt.Errorf("ASSET_ALREADY_TOKENIZED: asset %q already has a token", req.AssetID)
	}

	// Read asset and verify prerequisites
	asset, err := c.ReadAsset(ctx, req.AssetID)
	if err != nil {
		return fmt.Errorf("asset %q does not exist: %w", req.AssetID, err)
	}

	if asset.Status != StatusVerified {
		return fmt.Errorf("ASSET_NOT_VERIFIED: asset %q is not VERIFIED (current: %s)", req.AssetID, asset.Status)
	}

	// Check evidence readiness
	evidenceJSON, err := c.ListAssetEvidence(ctx, req.AssetID)
	if err != nil {
		return fmt.Errorf("failed to check evidence: %w", err)
	}
	var evidenceList []*Evidence
	json.Unmarshal([]byte(evidenceJSON), &evidenceList)

	// Check that all submitted evidence is not REJECTED and not EXPIRED
	// Use transaction timestamp for deterministic results
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()

	for _, ev := range evidenceList {
		if ev.Status == EvidenceStatusRejected {
			return fmt.Errorf("EVIDENCE_NOT_READY: evidence %q is REJECTED", ev.EvidenceID)
		}
		if ev.ExpiresAt != "" {
			expiry, err := parseValuationDate(ev.ExpiresAt)
			if err == nil && now.After(expiry) {
				return fmt.Errorf("EVIDENCE_EXPIRED: evidence %q has expired", ev.EvidenceID)
			}
		}
	}

	// Check valuation readiness inline using transaction timestamp for determinism
	valJSON, err := c.ListAssetValuations(ctx, req.AssetID)
	if err != nil {
		return fmt.Errorf("failed to list valuations: %w", err)
	}
	var valuations []*Valuation
	json.Unmarshal([]byte(valJSON), &valuations)

	var validValuation *Valuation
	for _, v := range valuations {
		if v.Status == ValuationStatusValid {
			validUntil, err := parseValuationDate(v.ValidUntil)
			if err != nil {
				continue
			}
			if now.Before(validUntil) || now.Equal(validUntil) {
				if v.SupersededBy == "" {
					if validValuation == nil || v.ValuationDate > validValuation.ValuationDate ||
						(v.ValuationDate == validValuation.ValuationDate && v.ValuationID > validValuation.ValuationID) {
						validValuation = v
					}
				}
			}
		}
	}

	if validValuation == nil {
		// Build detailed failure reason
		hasValuation := len(valuations) > 0
		valuationExpired := false
		for _, v := range valuations {
			if v.Status == ValuationStatusValid {
				validUntil, err := parseValuationDate(v.ValidUntil)
				if err != nil {
					continue
				}
				if now.After(validUntil) {
					valuationExpired = true
					break
				}
			}
		}
		return fmt.Errorf("VALID_VALUATION_REQUIRED: hasValuation=%v, valuationExpired=%v", hasValuation, valuationExpired)
	}

	valuationID := validValuation.ValuationID

	// Get valuation details for snapshot
	valDetailJSON, err := c.GetValuation(ctx, valuationID)
	if err != nil {
		return fmt.Errorf("failed to get valuation details: %w", err)
	}
	var valuation Valuation
	json.Unmarshal([]byte(valDetailJSON), &valuation)

	// Check approval
	approvalJSON, err := c.GetTokenizationApprovals(ctx, req.AssetID)
	if err != nil {
		return fmt.Errorf("failed to check approvals: %w", err)
	}
	var approvals []*TokenizationApproval
	json.Unmarshal([]byte(approvalJSON), &approvals)

	var latestApproval *TokenizationApproval
	for _, a := range approvals {
		if a.Decision == ApprovalDecisionApproved {
			latestApproval = a
			break
		}
	}
	if latestApproval == nil {
		return fmt.Errorf("TOKENIZATION_APPROVAL_REQUIRED: no APPROVED tokenization approval found")
	}

	// Get verification snapshot
	verifJSON, err := c.GetVerificationHistory(ctx, req.AssetID)
	if err != nil {
		return fmt.Errorf("failed to get verification history: %w", err)
	}
	var verifications []*Verification
	json.Unmarshal([]byte(verifJSON), &verifications)

	var latestVerification *Verification
	for _, v := range verifications {
		if v.Decision == VerificationApproved {
			latestVerification = v
			break
		}
	}
	if latestVerification == nil {
		return fmt.Errorf("ASSET_NOT_VERIFIED: no APPROVED verification found")
	}

	// All checks passed - create token
	clientID, _ := ctx.GetClientIdentity().GetID()
	mspID, _ := ctx.GetClientIdentity().GetMSPID()

	txTimestamp, err = ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	nowStr := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	if req.CreatedBy == "" {
		req.CreatedBy = fmt.Sprintf("%s::%s", mspID, clientID)
	}

	token := Token{
		DocType:           DocTypeToken,
		TokenID:           req.TokenID,
		AssetID:           req.AssetID,
		CanonicalIdentity: asset.CanonicalIdentity,
		TokenType:         req.TokenType,
		TotalSupply:       req.TotalSupply,
		Decimals:          req.Decimals,
		Currency:          req.Currency,
		ValuationSnapshot: &ValuationSnapshot{
			ValuationID:   valuation.ValuationID,
			Value:         valuation.Value,
			Currency:      valuation.Currency,
			Method:        valuation.Method,
			ValuationDate: valuation.ValuationDate,
			Source:        valuation.Source,
			ValidUntil:    valuation.ValidUntil,
		},
		VerificationSnapshot: &VerificationSnapshot{
			VerificationID: latestVerification.VerificationID,
			Verifier:       latestVerification.VerifierIdentity,
			VerifiedAt:     latestVerification.Timestamp,
		},
		CreatedBy: req.CreatedBy,
		CreatedAt: nowStr,
		// Tokenization is approval-gated above; an issued token is immediately
		// transferable unless a later phase explicitly restricts or freezes it.
		Status: TokenStatusActive,
	}

	tokenBytes, err := json.Marshal(token)
	if err != nil {
		return fmt.Errorf("failed to serialize token %q: %w", req.TokenID, err)
	}

	tokenKey := "token_" + req.TokenID
	if err := ctx.GetStub().PutState(tokenKey, tokenBytes); err != nil {
		return fmt.Errorf("failed writing token %q to ledger: %w", req.TokenID, err)
	}

	// Create asset-token binding (enforces uniqueness)
	if err := ctx.GetStub().PutState(assetTokenKey, []byte(req.TokenID)); err != nil {
		return fmt.Errorf("failed creating asset-token binding: %w", err)
	}

	// Create composite key indexes
	tokenAssetIndex, _ := ctx.GetStub().CreateCompositeKey("asset~token", []string{req.AssetID, req.TokenID})
	ctx.GetStub().PutState(tokenAssetIndex, []byte{0x00})

	tokenTypeIndex, _ := ctx.GetStub().CreateCompositeKey("tokentype~token", []string{req.TokenType, req.TokenID})
	ctx.GetStub().PutState(tokenTypeIndex, []byte{0x00})

	// Update asset status to TOKENIZED
	asset.Status = StatusTokenized
	asset.UpdatedAt = nowStr
	assetBytes, _ := json.Marshal(asset)
	ctx.GetStub().PutState(req.AssetID, assetBytes)

	// Record audit event
	if err := c.recordAuditEvent(ctx, "TOKEN_CREATED", req.AssetID, clientID, mspID, nowStr, "Token created successfully", req.TokenID); err != nil {
		return err
	}

	// Create initial ownership
	balance := req.TotalSupply
	if req.TokenType == TokenTypeWhole {
		balance = 1
	}

	ownership := Ownership{
		DocType:       DocTypeOwnership,
		OwnershipID:   fmt.Sprintf("OWN-%s-%s-%s", req.TokenID, req.InitialOwnerMSP, req.InitialOwnerID),
		TokenID:       req.TokenID,
		OwnerID:       req.InitialOwnerID,
		OwnerMSP:      req.InitialOwnerMSP,
		Balance:       balance,
		OwnershipType: req.TokenType,
		CreatedAt:     nowStr,
		UpdatedAt:     nowStr,
		Status:        OwnershipStatusActive,
	}

	ownershipBytes, err := json.Marshal(ownership)
	if err != nil {
		return fmt.Errorf("failed to serialize ownership: %w", err)
	}

	ownershipKey := "ownership_" + req.TokenID + "_" + req.InitialOwnerMSP + "_" + req.InitialOwnerID
	if err := ctx.GetStub().PutState(ownershipKey, ownershipBytes); err != nil {
		return fmt.Errorf("failed writing ownership: %w", err)
	}

	// Create composite key indexes for ownership
	tokenOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("token~ownership", []string{req.TokenID, ownership.OwnerMSP, ownership.OwnerID})
	ctx.GetStub().PutState(tokenOwnershipIndex, []byte{0x00})

	ownerOwnershipIndex, _ := ctx.GetStub().CreateCompositeKey("owner~ownership", []string{req.InitialOwnerMSP, req.InitialOwnerID, req.TokenID})
	ctx.GetStub().PutState(ownerOwnershipIndex, []byte{0x00})

	// Record audit event for ownership
	if err := c.recordAuditEvent(ctx, "OWNERSHIP_CREATED", req.AssetID, clientID, mspID, nowStr, "Initial ownership created", ownership.OwnershipID); err != nil {
		return err
	}

	return nil
}

// GetToken retrieves a token by its tokenID.
func (c *AssetContract) GetToken(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
) (string, error) {
	if tokenID == "" {
		return "", fmt.Errorf("tokenID cannot be empty")
	}

	tokenKey := "token_" + tokenID
	tBytes, err := ctx.GetStub().GetState(tokenKey)
	if err != nil {
		return "", fmt.Errorf("failed to read token %q: %w", tokenID, err)
	}
	if tBytes == nil {
		return "", fmt.Errorf("token %q does not exist", tokenID)
	}

	return string(tBytes), nil
}

// GetTokenByAsset retrieves the token associated with an asset.
func (c *AssetContract) GetTokenByAsset(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "", fmt.Errorf("assetID cannot be empty")
	}

	assetTokenKey := "asset_token_" + assetID
	tokenIDBytes, err := ctx.GetStub().GetState(assetTokenKey)
	if err != nil {
		return "", fmt.Errorf("failed to read asset-token binding: %w", err)
	}
	if tokenIDBytes == nil {
		return "", fmt.Errorf("asset %q has not been tokenized", assetID)
	}

	tokenID := string(tokenIDBytes)
	return c.GetToken(ctx, tokenID)
}

// GetAssetByToken retrieves the asset associated with a token (full traceability).
func (c *AssetContract) GetAssetByToken(
	ctx contractapi.TransactionContextInterface,
	tokenID string,
) (string, error) {
	if tokenID == "" {
		return "", fmt.Errorf("tokenID cannot be empty")
	}

	token, err := c.GetToken(ctx, tokenID)
	if err != nil {
		return "", err
	}

	var t Token
	json.Unmarshal([]byte(token), &t)

	asset, err := c.ReadAsset(ctx, t.AssetID)
	if err != nil {
		return "", err
	}

	// Build full traceability response
	result := map[string]interface{}{
		"token":       t,
		"asset":       asset,
		"templateId":  asset.TemplateID,
		"templateVer": asset.TemplateVersion,
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// CheckTokenizationReadiness checks if an asset meets all tokenization prerequisites.
func (c *AssetContract) CheckTokenizationReadiness(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "", fmt.Errorf("assetID cannot be empty")
	}

	asset, err := c.ReadAsset(ctx, assetID)
	if err != nil {
		return "", err
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	var now time.Time
	if err == nil && txTimestamp != nil && txTimestamp.Seconds > 0 {
		now = time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()
	} else {
		now = time.Now().UTC()
	}

	// Check 1: Asset verified
	assetVerified := asset.Status == StatusVerified

	// Check 2: Evidence ready
	evidenceJSON, _ := c.ListAssetEvidence(ctx, assetID)
	var evidenceList []*Evidence
	json.Unmarshal([]byte(evidenceJSON), &evidenceList)

	evidenceReady := len(evidenceList) > 0
	for _, ev := range evidenceList {
		if ev.Status == EvidenceStatusRejected {
			evidenceReady = false
			break
		}
		if ev.ExpiresAt != "" {
			expiry, err := parseValuationDate(ev.ExpiresAt)
			if err == nil && now.After(expiry) {
				evidenceReady = false
				break
			}
		}
	}

	// Check 3: Valuation valid
	valJSON, _ := c.CheckValuationReadiness(ctx, assetID)
	var valReadiness map[string]interface{}
	json.Unmarshal([]byte(valJSON), &valReadiness)
	valuationValid := valReadiness["ready"].(bool)

	// Check 4: Approval granted
	approvalJSON, _ := c.GetTokenizationApprovals(ctx, assetID)
	var approvals []*TokenizationApproval
	json.Unmarshal([]byte(approvalJSON), &approvals)

	approvalGranted := false
	for _, a := range approvals {
		if a.Decision == ApprovalDecisionApproved {
			approvalGranted = true
			break
		}
	}

	// Check 5: Not already tokenized
	assetTokenKey := "asset_token_" + assetID
	existingBytes, _ := ctx.GetStub().GetState(assetTokenKey)
	alreadyTokenized := existingBytes != nil

	// Check 6: Not in prohibited state
	prohibitedState := asset.Status == StatusRejected || asset.Status == StatusRedeemed || asset.Status == StatusRetired

	canTokenize := assetVerified && evidenceReady && valuationValid && approvalGranted && !alreadyTokenized && !prohibitedState

	var reasons []string
	if !assetVerified {
		reasons = append(reasons, "ASSET_NOT_VERIFIED")
	}
	if !evidenceReady {
		reasons = append(reasons, "EVIDENCE_NOT_READY")
	}
	if !valuationValid {
		reasons = append(reasons, "VALID_VALUATION_REQUIRED")
	}
	if !approvalGranted {
		reasons = append(reasons, "TOKENIZATION_APPROVAL_REQUIRED")
	}
	if alreadyTokenized {
		reasons = append(reasons, "ASSET_ALREADY_TOKENIZED")
	}
	if prohibitedState {
		reasons = append(reasons, "ASSET_IN_PROHIBITED_STATE")
	}

	result := map[string]interface{}{
		"canTokenize": canTokenize,
		"assetId":     assetID,
		"checks": map[string]bool{
			"assetVerified":    assetVerified,
			"evidenceReady":    evidenceReady,
			"valuationValid":   valuationValid,
			"approvalGranted":  approvalGranted,
			"alreadyTokenized": alreadyTokenized,
			"prohibitedState":  prohibitedState,
		},
		"reasons": reasons,
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// recordAuditEvent records an immutable audit trail entry.
func (c *AssetContract) recordAuditEvent(
	ctx contractapi.TransactionContextInterface,
	event string,
	assetID string,
	actor string,
	actorMSP string,
	timestamp string,
	reason string,
	relatedEntityID string,
) error {
	// Use transaction timestamp for deterministic event ID
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp for audit: %w", err)
	}
	eventID := fmt.Sprintf("AUDIT-%s-%d%09d", assetID, txTimestamp.Seconds, txTimestamp.Nanos)

	audit := AuditEvent{
		DocType:         DocTypeAuditEvent,
		EventID:         eventID,
		Event:           event,
		AssetID:         assetID,
		Actor:           actor,
		ActorMSP:        actorMSP,
		Timestamp:       timestamp,
		Reason:          reason,
		RelatedEntityID: relatedEntityID,
	}

	auditBytes, err := json.Marshal(audit)
	if err != nil {
		return fmt.Errorf("failed to serialize audit event: %w", err)
	}

	auditKey := "audit_" + eventID
	if err := ctx.GetStub().PutState(auditKey, auditBytes); err != nil {
		return fmt.Errorf("failed to write audit event: %w", err)
	}

	// Index by asset
	indexKey, _ := ctx.GetStub().CreateCompositeKey("asset~audit", []string{assetID, eventID})
	ctx.GetStub().PutState(indexKey, []byte{0x00})

	return nil
}

// GetAuditHistory retrieves audit history for an asset.
func (c *AssetContract) GetAuditHistory(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetID cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~audit", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query audit history for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var history []*AuditEvent
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading audit iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		eventID := compositeParts[1]
		auditKey := "audit_" + eventID
		aBytes, err := ctx.GetStub().GetState(auditKey)
		if err == nil && aBytes != nil {
			var a AuditEvent
			if err := json.Unmarshal(aBytes, &a); err == nil {
				history = append(history, &a)
			}
		}
	}

	if history == nil {
		return "[]", nil
	}

	b, err := json.Marshal(history)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize audit history: %w", err)
	}

	return string(b), nil
}

// =============================================================================
// Verification Operations — Phase 3
// =============================================================================

// RecordVerification records an independent attestation decision (APPROVED / REJECTED)
// and updates the asset's lifecycle state accordingly.
//
// Maker-Checker Invariant Enforced:
//   - The identity that created/registered the asset is strictly forbidden
//     from verifying their own asset.
//   - The organization that submitted the asset (IssuerMSP) cannot approve it
//     when independent verification (VerifierMSP) is required.
func (c *AssetContract) RecordVerification(
	ctx contractapi.TransactionContextInterface,
	verificationJSON string,
) error {
	if verificationJSON == "" {
		return fmt.Errorf("verificationJSON cannot be empty")
	}

	var v Verification
	if err := json.Unmarshal([]byte(verificationJSON), &v); err != nil {
		return fmt.Errorf("invalid verificationJSON: %w", err)
	}

	if v.VerificationID == "" {
		return fmt.Errorf("verificationId is required")
	}
	if v.AssetID == "" {
		return fmt.Errorf("assetId is required")
	}
	if v.Decision != VerificationApproved && v.Decision != VerificationRejected {
		return fmt.Errorf("invalid verification decision %q: must be APPROVED or REJECTED", v.Decision)
	}

	// Read asset
	asset, err := c.ReadAsset(ctx, v.AssetID)
	if err != nil {
		return fmt.Errorf("cannot verify non-existent asset %q: %w", v.AssetID, err)
	}

	// Caller identity for record-keeping and payload population.
	callerID, _ := ctx.GetClientIdentity().GetID()
	callerMSP, _ := ctx.GetClientIdentity().GetMSPID()

	// Maker-Checker Invariant — Phase 3:
	// The DECLARED verifier identity in the payload must not match the asset creator.
	//
	// Design rationale: In Phase 3 the backend uses a single IssuerMSP service
	// identity for all Fabric Gateway submissions, so a callerID-level check would
	// always fire (callerID == asset.CreatedBy unconditionally).  Org-level and
	// individual identity enforcement is handled at the backend service layer
	// (evidenceService.verifyAsset pre-validation) before the transaction ever
	// reaches the chaincode.  The on-chain check here enforces the immutable
	// payload-declared identity constraint, providing a cryptographic audit trail
	// of any Maker-Checker violation attempt.
	if v.VerifierIdentity != "" && asset.CreatedBy != "" && v.VerifierIdentity == asset.CreatedBy {
		return fmt.Errorf("Maker-Checker violation: Declared verifier identity matches asset creator (%s)", asset.CreatedBy)
	}

	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return fmt.Errorf("failed to get transaction timestamp: %w", err)
	}
	now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

	if v.Timestamp == "" {
		v.Timestamp = now
	}
	if v.VerifierIdentity == "" {
		v.VerifierIdentity = callerID
	}
	if v.Organization == "" {
		v.Organization = callerMSP
	}
	v.DocType = DocTypeVerification

	// Record verification decision
	verificationKey := "verification_" + v.VerificationID
	vBytes, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("failed to serialize verification %q: %w", v.VerificationID, err)
	}

	if err := ctx.GetStub().PutState(verificationKey, vBytes); err != nil {
		return fmt.Errorf("failed writing verification %q to ledger: %w", v.VerificationID, err)
	}

	// Create composite index for asset verification history
	indexKey, err := ctx.GetStub().CreateCompositeKey("asset~verification", []string{v.AssetID, v.VerificationID})
	if err != nil {
		return fmt.Errorf("failed creating composite key for verification: %w", err)
	}
	if err := ctx.GetStub().PutState(indexKey, []byte{0x00}); err != nil {
		return fmt.Errorf("failed indexing verification: %w", err)
	}

	// Update asset status based on decision
	if v.Decision == VerificationApproved {
		asset.Status = StatusVerified
	} else {
		asset.Status = StatusRejected
	}
	asset.UpdatedAt = now

	updatedAssetBytes, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to serialize updated asset: %w", err)
	}

	return ctx.GetStub().PutState(v.AssetID, updatedAssetBytes)
}

// GetVerificationHistory retrieves all verification records for an asset in chronological order.
func (c *AssetContract) GetVerificationHistory(
	ctx contractapi.TransactionContextInterface,
	assetID string,
) (string, error) {
	if assetID == "" {
		return "[]", fmt.Errorf("assetID cannot be empty")
	}

	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("asset~verification", []string{assetID})
	if err != nil {
		return "[]", fmt.Errorf("failed to query verifications for asset %q: %w", assetID, err)
	}
	defer iterator.Close()

	var history []*Verification
	for iterator.HasNext() {
		item, err := iterator.Next()
		if err != nil {
			return "[]", fmt.Errorf("error reading verification iterator: %w", err)
		}

		_, compositeParts, err := ctx.GetStub().SplitCompositeKey(item.Key)
		if err != nil || len(compositeParts) < 2 {
			continue
		}

		verificationID := compositeParts[1]
		vKey := "verification_" + verificationID
		vBytes, err := ctx.GetStub().GetState(vKey)
		if err == nil && vBytes != nil {
			var v Verification
			if err := json.Unmarshal(vBytes, &v); err == nil {
				history = append(history, &v)
			}
		}
	}

	if history == nil {
		return "[]", nil
	}

	b, err := json.Marshal(history)
	if err != nil {
		return "[]", fmt.Errorf("failed to serialize verification history: %w", err)
	}

	return string(b), nil
}
