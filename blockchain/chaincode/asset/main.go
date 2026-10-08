// Package main implements the TESSERA asset chaincode entry point.
//
// TESSERA uses a single, generic asset chaincode designed to support
// multiple real-world asset types (LAND, VEHICLE, GRAIN, and future types)
// through a configuration-driven template system — not through separate contracts.
//
// Architecture Principle:
//
//	NEW ASSET TYPE ← configuration/template
//	            ↓
//	AssetContract (this chaincode) ← generic, policy-agnostic
//	            ↓
//	Fabric Ledger + CouchDB World State
package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	assetChaincode, err := contractapi.NewChaincode(&AssetContract{})
	if err != nil {
		log.Panicf("[TESSERA] Failed to create asset chaincode: %v", err)
	}

	if err := assetChaincode.Start(); err != nil {
		log.Panicf("[TESSERA] Failed to start asset chaincode: %v", err)
	}
}
