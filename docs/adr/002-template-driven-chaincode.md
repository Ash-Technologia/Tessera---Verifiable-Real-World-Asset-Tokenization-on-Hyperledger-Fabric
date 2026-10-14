# ADR 002: Template-Driven Asset Chaincode

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Architecture Team

## Context
TESSERA supports multiple asset types (vehicle, land, grain, equipment) with different attributes. Traditional approach: separate chaincode per type or generic key-value store.

## Decision
Use a **single chaincode (`asset`)** with **template-driven validation**. Asset templates defined in JSON, loaded at chaincode init, enforce attribute schemas per asset type.

## Consequences

### Positive
- **Single chaincode**: One deployment, one endorsement policy
- **Extensible**: New asset types = new template JSON, no code deploy
- **Validation on-chain**: Invalid attributes rejected at commit
- **Audit**: Template version recorded with each asset
- **Governance**: Template changes = new version, approval workflow

### Negative
- **Template complexity**: Validation logic in chaincode grows
- **Schema evolution**: Migration needed for template changes
- **Performance**: Validation overhead per transaction

## Template Structure
```json
{
  "templateId": "VEHICLE-v1",
  "assetType": "vehicle",
  "version": "1.0",
  "requiredAttributes": ["vin", "make", "model", "year"],
  "attributeTypes": {
    "vin": "string",
    "make": "string",
    "model": "string",
    "year": "integer"
  },
  "validations": {
    "vin": { "pattern": "^[A-HJ-NPR-Z0-9]{17}$" },
    "year": { "min": 1900, "max": 2099 }
  }
}
```

## Chaincode Validation Flow
```go
func (c *AssetContract) CreateAsset(ctx, assetType, canonicalIdentity, attrsJSON) error {
    template := c.getTemplate(assetType)
    if template == nil { return ErrUnknownAssetType }
    
    attrs := parseJSON(attrsJSON)
    if err := template.Validate(attrs); err != nil {
        return ErrInvalidAttributes
    }
    // ... create asset with templateId, templateVersion
}
```

## Alternatives Considered
1. **Separate chaincode per type** — Deployment overhead, policy duplication
2. **Generic key-value** — No validation, data quality issues
3. **Off-chain validation only** — No on-chain guarantees