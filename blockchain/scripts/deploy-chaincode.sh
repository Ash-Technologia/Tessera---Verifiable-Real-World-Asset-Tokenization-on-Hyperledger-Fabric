#!/bin/bash
# =============================================================================
# TESSERA — Chaincode Deployment Script
#
# Deploys the TESSERA asset chaincode using Fabric 2.5 lifecycle:
#   1. Vendor Go dependencies
#   2. Package chaincode (peer lifecycle chaincode package)
#   3. Install on all peers
#   4. Approve for each org (IssuerOrg, VerifierOrg, ComplianceOrg)
#   5. Check commit readiness
#   6. Commit chaincode definition
#   7. Verify deployment
#
# Usage:
#   ./blockchain/scripts/deploy-chaincode.sh
#
# Prerequisites:
#   - Channel created (create-channel.sh)
#   - All peers running and channel joined
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

CHAINCODE_PKG="${CHANNEL_ARTIFACTS}/${CHAINCODE_LABEL}.tar.gz"
CC_PACKAGE_ID=""

# ============================================================
# Step 1: Vendor Go dependencies
# ============================================================
vendorChaincode() {
  header "Vendoring Go chaincode dependencies"

  if ! command -v go &>/dev/null; then
    error "Go is not installed. Install Go to vendor chaincode dependencies."
  fi

  cd "${CHAINCODE_PATH}"

  # Always re-vendor to ensure dependencies are up to date
  rm -rf vendor
  GO111MODULE=on go mod tidy
  GO111MODULE=on go mod vendor

  # Build locally to verify it compiles
  GO111MODULE=on go build -o /tmp/asset_verify ./...
  rm -f /tmp/asset_verify

  success "Chaincode vendored and verified: ${CHAINCODE_PATH}"
  cd "${TESSERA_ROOT}"
}

# ============================================================
# Step 2: Package chaincode
# ============================================================
packageChaincode() {
  header "Packaging chaincode: ${CHAINCODE_LABEL}"

  mkdir -p "${CHANNEL_ARTIFACTS}"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  ${FABRIC_BIN}/peer lifecycle chaincode package "${CHAINCODE_PKG}" \
    --path "${CHAINCODE_PATH}" \
    --lang golang \
    --label "${CHAINCODE_LABEL}"

  success "Chaincode packaged: ${CHAINCODE_PKG}"
}

# ============================================================
# Step 3: Install on all peers
# ============================================================
installOnPeer() {
  local org="$1"
  step "Installing ${CHAINCODE_LABEL} on peer0.${org}"

  setPeerEnv "${org}"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local installOut
  installOut=$(${FABRIC_BIN}/peer lifecycle chaincode install "${CHAINCODE_PKG}" 2>&1) || {
    if echo "${installOut}" | grep -q "already successfully installed"; then
      warn "peer0.${org}: ${CHAINCODE_LABEL} already installed — skipping"
    else
      echo "${installOut}" >&2
      error "Failed to install chaincode on peer0.${org}"
    fi
  }
  success "Installed on peer0.${org}"
}

installChaincode() {
  header "Installing chaincode on all peers"
  installOnPeer "issuer"
  installOnPeer "verifier"
  installOnPeer "compliance"
}

# ============================================================
# Step 4: Get package ID
# ============================================================
getPackageID() {
  header "Getting installed chaincode package ID"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local queryOutput
  queryOutput=$(${FABRIC_BIN}/peer lifecycle chaincode queryinstalled 2>&1)
  CC_PACKAGE_ID=$(echo "${queryOutput}" | grep "${CHAINCODE_LABEL}" | awk '{print $3}' | sed 's/,//')

  if [ -z "${CC_PACKAGE_ID}" ]; then
    error "Failed to get package ID. Output was:\n${queryOutput}"
  fi

  success "Package ID: ${CC_PACKAGE_ID}"
  export CC_PACKAGE_ID
}

# ============================================================
# Step 5: Approve for each org
# ============================================================
approveForOrg() {
  local org="$1"
  local mspId="$2"
  step "Approving chaincode for ${mspId}"

  setPeerEnv "${org}"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  ${FABRIC_BIN}/peer lifecycle chaincode approveformyorg \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    --channelID "${CHANNEL_NAME}" \
    --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" \
    --package-id "${CC_PACKAGE_ID}" \
    --sequence "${CHAINCODE_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}"

  success "Approved for ${mspId}"
}

approveChaincode() {
  header "Approving chaincode definition (all orgs)"
  approveForOrg "issuer"     "IssuerMSP"
  approveForOrg "verifier"   "VerifierMSP"
  approveForOrg "compliance" "ComplianceMSP"
}

# ============================================================
# Step 6: Check commit readiness
# ============================================================
checkCommitReadiness() {
  header "Checking commit readiness"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local readiness
  readiness=$(${FABRIC_BIN}/peer lifecycle chaincode checkcommitreadiness \
    --channelID "${CHANNEL_NAME}" \
    --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" \
    --sequence "${CHAINCODE_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --output json 2>&1)

  echo "${readiness}" | jq .

  # Verify all orgs approved
  local approvals
  approvals=$(echo "${readiness}" | jq -r '.approvals | to_entries[] | select(.value == false) | .key')
  if [ -n "${approvals}" ]; then
    error "The following orgs have NOT approved: ${approvals}"
  fi

  success "All orgs have approved. Ready to commit."
}

# ============================================================
# Step 7: Commit chaincode definition
# ============================================================
commitChaincode() {
  header "Committing chaincode definition to ${CHANNEL_NAME}"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  ${FABRIC_BIN}/peer lifecycle chaincode commit \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    --channelID "${CHANNEL_NAME}" \
    --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" \
    --sequence "${CHAINCODE_SEQUENCE}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/verifier.tessera.com/peers/peer0.verifier.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:11051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/compliance.tessera.com/peers/peer0.compliance.tessera.com/tls/ca.crt"

  success "Chaincode '${CHAINCODE_NAME}' committed on ${CHANNEL_NAME}."
}

# ============================================================
# Step 8: Verify committed chaincode
# ============================================================
verifyCommit() {
  header "Verifying chaincode commit"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local committed
  committed=$(${FABRIC_BIN}/peer lifecycle chaincode querycommitted \
    --channelID "${CHANNEL_NAME}" \
    --name "${CHAINCODE_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --output json 2>&1)

  echo "${committed}" | jq .

  local sequence
  sequence=$(echo "${committed}" | jq -r '.sequence // empty')
  if [ -z "${sequence}" ]; then
    error "Chaincode '${CHAINCODE_NAME}' does not appear committed."
  fi

  success "Chaincode '${CHAINCODE_NAME}' is committed (sequence=${sequence})."
}

# ============================================================
# Main
# ============================================================
main() {
  header "TESSERA — Chaincode Deployment: ${CHAINCODE_NAME} v${CHAINCODE_VERSION}"
  checkBinaries

  vendorChaincode
  packageChaincode
  installChaincode
  getPackageID
  approveChaincode
  checkCommitReadiness
  commitChaincode

  # Wait for chaincode container to start
  sleep 5

  verifyCommit

  echo ""
  success "Chaincode '${CHAINCODE_NAME}' deployed successfully on ${CHANNEL_NAME}."
  info "Package ID: ${CC_PACKAGE_ID}"
}

main "$@"
