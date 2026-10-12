package main

import (
	"fmt"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type AssetContract struct {
	contractapi.Contract
}

func (c *AssetContract) CreateOwnership(
	ctx contractapi.TransactionContextInterface,
	ownershipJSON string,
) error {
	fmt.Println("test")
	return nil
}

func main() {}