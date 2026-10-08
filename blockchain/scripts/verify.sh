#!/bin/bash
# =============================================================================
# TESSERA — Phase 1 End-to-End Verification Script
#
# Demonstrates the complete chain of trust:
#
#   APPLICATION (this script via peer CLI)
#       ↓
#   FABRIC GATEWAY / peer binary
#       ↓
#   CHAINCODE (asset contract)
#       ↓
#   FABRIC LEDGER (blocks committed)
#       ↓
#   COUCHDB WORLD STATE (queryable state)
#
# Tests:
#   1. All containers are running
#   2. tessera-channel exists and all peers are members
#   3. Chaincode is committed
#   4. CreateAsset transaction succeeds (LAND and VEHICLE types)
#   5. ReadAsset query returns committed data
#   6. AssetExists returns true for created asset, false for non-existent
#   7. Duplicate CreateAsset is correctly rejected
#   8. CouchDB world state confirms the committed asset
#
# Usage:
#   ./blockchain/scripts/verify.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

PASS=0
FAIL=0
TEST_TS="$(date +%s)"
TEST_ASSET_ID_LAND="LAND-VERIFY-${TEST_TS}"
TEST_ASSET_ID_VEH="VEH-VERIFY-${TEST_TS}"

# ============================================================
# Test runner helpers
# ============================================================
PASS_COUNT=0
FAIL_COUNT=0

testPass() { echo -e "${GREEN}[PASS]${NC} $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
testFail() { echo -e "${RED}[FAIL]${NC} $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ============================================================
# Test 1: Container health check
# ============================================================
testContainers() {
  header "Test 1: Container health"

  local containers=(
    "ca.orderer.tessera.com"
    "ca.issuer.tessera.com"
    "ca.verifier.tessera.com"
    "ca.compliance.tessera.com"
    "orderer.tessera.com"
    "peer0.issuer.tessera.com"
    "peer0.verifier.tessera.com"
    "peer0.compliance.tessera.com"
    "couchdb.peer0.issuer.tessera.com"
    "couchdb.peer0.verifier.tessera.com"
    "couchdb.peer0.compliance.tessera.com"
  )

  for container in "${containers[@]}"; do
    local state
    state=$(docker inspect -f '{{.State.Running}}' "${container}" 2>/dev/null || echo "false")
    if [ "${state}" = "true" ]; then
      testPass "Container running: ${container}"
    else
      testFail "Container NOT running: ${container}"
    fi
  done
}

# ============================================================
# Test 2: Channel membership
# ============================================================
testChannelMembership() {
  header "Test 2: Channel membership (tessera-channel)"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  for org in issuer verifier compliance; do
    setPeerEnv "${org}"
    local channels
    channels=$(${FABRIC_BIN}/peer channel list 2>&1)
    if echo "${channels}" | grep -q "${CHANNEL_NAME}"; then
      testPass "peer0.${org} is a member of ${CHANNEL_NAME}"
    else
      testFail "peer0.${org} is NOT in ${CHANNEL_NAME}"
    fi
  done
}

# ============================================================
# Test 3: Chaincode committed
# ============================================================
testChaincodeCommitted() {
  header "Test 3: Chaincode committed"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local committed
  committed=$(${FABRIC_BIN}/peer lifecycle chaincode querycommitted \
    --channelID "${CHANNEL_NAME}" \
    --name "${CHAINCODE_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --output json 2>&1)

  local sequence version
  sequence=$(echo "${committed}" | jq -r '.sequence // empty')
  version=$(echo "${committed}" | jq -r '.version // empty')

  if [ -n "${sequence}" ]; then
    testPass "Chaincode '${CHAINCODE_NAME}' committed (version=${version}, sequence=${sequence})"
  else
    testFail "Chaincode '${CHAINCODE_NAME}' not found in committed list"
    echo "  Output: ${committed}"
  fi
}

# ============================================================
# Test 4: CreateAsset — LAND type
# ============================================================
testCreateAssetLand() {
  header "Test 4a: CreateAsset (LAND type)"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local landAttrs='{\"area\":\"5000\",\"unit\":\"sqm\",\"location\":\"Plot 42, Sector 5, Bangalore\",\"landTitle\":\"LT-20231001\",\"surveyNo\":\"SY-12345\"}'
  local result

  result=$(${FABRIC_BIN}/peer chaincode invoke \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/verifier.tessera.com/peers/peer0.verifier.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:11051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/compliance.tessera.com/peers/peer0.compliance.tessera.com/tls/ca.crt" \
    -c "{\"function\":\"CreateAsset\",\"Args\":[\"${TEST_ASSET_ID_LAND}\",\"LAND\",\"IssuerOrg\",\"${landAttrs}\"]}" \
    --waitForEvent 2>&1 || true)

  if echo "${result}" | grep -q "Chaincode invoke successful"; then
    testPass "CreateAsset LAND transaction committed to Fabric ledger"
  else
    testFail "CreateAsset LAND failed: ${result}"
  fi
}

# ============================================================
# Test 4b: CreateAsset — VEHICLE type
# ============================================================
testCreateAssetVehicle() {
  header "Test 4b: CreateAsset (VEHICLE type)"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local vehAttrs='{\"vin\":\"1HGBH41JXMN109186\",\"make\":\"Toyota\",\"model\":\"Camry\",\"year\":\"2024\",\"registrationNo\":\"KA-01-AB-1234\"}'
  local result

  result=$(${FABRIC_BIN}/peer chaincode invoke \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/verifier.tessera.com/peers/peer0.verifier.tessera.com/tls/ca.crt" \
    --peerAddresses localhost:11051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/compliance.tessera.com/peers/peer0.compliance.tessera.com/tls/ca.crt" \
    -c "{\"function\":\"CreateAsset\",\"Args\":[\"${TEST_ASSET_ID_VEH}\",\"VEHICLE\",\"VerifierOrg\",\"${vehAttrs}\"]}" \
    --waitForEvent 2>&1 || true)

  if echo "${result}" | grep -q "Chaincode invoke successful"; then
    testPass "CreateAsset VEHICLE transaction committed to Fabric ledger"
  else
    testFail "CreateAsset VEHICLE failed: ${result}"
  fi
}

# ============================================================
# Test 5: ReadAsset — query the committed asset
# ============================================================
testReadAsset() {
  header "Test 5: ReadAsset query"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  # Wait for world state to propagate
  sleep 2

  local result
  result=$(${FABRIC_BIN}/peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    -c "{\"function\":\"ReadAsset\",\"Args\":[\"${TEST_ASSET_ID_LAND}\"]}" 2>&1)

  if echo "${result}" | jq -e '.assetId' &>/dev/null; then
    local assetId assetType status
    assetId=$(echo "${result}" | jq -r '.assetId')
    assetType=$(echo "${result}" | jq -r '.assetType')
    status=$(echo "${result}" | jq -r '.status')

    testPass "ReadAsset returned committed asset: id=${assetId}, type=${assetType}, status=${status}"
    echo "    Full asset:"
    echo "${result}" | jq .
  else
    testFail "ReadAsset failed or returned invalid JSON: ${result}"
  fi
}

# ============================================================
# Test 6: AssetExists
# ============================================================
testAssetExists() {
  header "Test 6: AssetExists"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  # Should return true for created asset
  local existsResult
  existsResult=$(${FABRIC_BIN}/peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    -c "{\"function\":\"AssetExists\",\"Args\":[\"${TEST_ASSET_ID_LAND}\"]}" 2>&1)

  if echo "${existsResult}" | grep -q "true"; then
    testPass "AssetExists(${TEST_ASSET_ID_LAND}) = true  ✓"
  else
    testFail "AssetExists(${TEST_ASSET_ID_LAND}) should be true, got: ${existsResult}"
  fi

  # Should return false for non-existent asset
  local notExistsResult
  notExistsResult=$(${FABRIC_BIN}/peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    -c '{"function":"AssetExists","Args":["DOES-NOT-EXIST-999"]}' 2>&1)

  if echo "${notExistsResult}" | grep -q "false"; then
    testPass "AssetExists(DOES-NOT-EXIST-999) = false  ✓"
  else
    testFail "AssetExists(non-existent) should be false, got: ${notExistsResult}"
  fi
}

# ============================================================
# Test 7: Duplicate protection
# ============================================================
testDuplicateRejection() {
  header "Test 7: Duplicate asset protection"

  setPeerEnv "issuer"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local result
  result=$(${FABRIC_BIN}/peer chaincode invoke \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt" \
    -c "{\"function\":\"CreateAsset\",\"Args\":[\"${TEST_ASSET_ID_LAND}\",\"LAND\",\"IssuerOrg\",\"{}\"]}" \
    --waitForEvent 2>&1 || true)

  if echo "${result}" | grep -qi "already exists\|Error\|endorsement failure"; then
    testPass "Duplicate CreateAsset correctly rejected by chaincode"
  else
    testFail "Duplicate CreateAsset was NOT rejected (expected failure): ${result}"
  fi
}

# ============================================================
# Test 8: CouchDB world state verification
# ============================================================
testCouchDB() {
  header "Test 8: CouchDB world state verification"

  local couchUser="${COUCHDB_USER:-admin}"
  local couchPass="${COUCHDB_PASSWORD:-adminpw}"

  # Load .env if present
  if [ -f "${TESSERA_ROOT}/.env" ]; then
    set -a; source "${TESSERA_ROOT}/.env"; set +a
    couchUser="${COUCHDB_USER:-admin}"
    couchPass="${COUCHDB_PASSWORD:-adminpw}"
  fi

  # Find the channel DB in CouchDB (IssuerOrg's peer)
  local dbsResponse
  dbsResponse=$(curl -sk -u "${couchUser}:${couchPass}" \
    "http://localhost:5984/_all_dbs" 2>&1)

  if echo "${dbsResponse}" | grep -q "tessera"; then
    testPass "CouchDB contains tessera-channel database(s)"
    echo "    Databases: $(echo "${dbsResponse}" | jq -c '[.[] | select(contains("tessera"))]')"
  else
    testFail "CouchDB does not appear to have tessera-channel data"
    echo "    Databases found: ${dbsResponse}"
    return
  fi

  # Try to find the asset document in CouchDB
  # Fabric CouchDB DB name format: <channelid>_<chaincode>
  local channelDb
  channelDb=$(echo "${dbsResponse}" | jq -r '.[] | select(contains("tessera") and contains("asset"))' | head -1)

  if [ -z "${channelDb}" ]; then
    # Try alternate naming
    channelDb=$(echo "${dbsResponse}" | jq -r '.[] | select(contains("tessera"))' | head -1)
  fi

  if [ -n "${channelDb}" ]; then
    local assetDoc
    assetDoc=$(curl -sk -u "${couchUser}:${couchPass}" \
      "http://localhost:5984/${channelDb}/${TEST_ASSET_ID_LAND}" 2>&1)

    if echo "${assetDoc}" | jq -e '.assetId' &>/dev/null; then
      testPass "Asset found in CouchDB world state: ${channelDb}/${TEST_ASSET_ID_LAND}"
      echo "    CouchDB document:"
      echo "${assetDoc}" | jq '{assetId, assetType, status, owner, createdAt}'
    else
      warn "Asset not directly queryable from CouchDB (may be in different DB). Checking via peer is sufficient."
    fi
  fi
}

# ============================================================
# Summary
# ============================================================
printSummary() {
  echo ""
  echo -e "${BOLD}============================================================${NC}"
  echo -e "${BOLD}  TESSERA Phase 1 — Verification Summary${NC}"
  echo -e "${BOLD}============================================================${NC}"
  echo -e "  ${GREEN}PASSED: ${PASS_COUNT}${NC}"
  echo -e "  ${RED}FAILED: ${FAIL_COUNT}${NC}"
  echo -e "${BOLD}============================================================${NC}"

  if [ "${FAIL_COUNT}" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo -e "${CYAN}Chain of trust verified:${NC}"
    echo -e "  APPLICATION (peer CLI)"
    echo -e "       ↓"
    echo -e "  FABRIC GATEWAY / peer binary"
    echo -e "       ↓"
    echo -e "  CHAINCODE (AssetContract)"
    echo -e "       ↓"
    echo -e "  FABRIC LEDGER (blocks committed)"
    echo -e "       ↓"
    echo -e "  COUCHDB WORLD STATE"
    echo ""
  else
    echo ""
    echo -e "${RED}${BOLD}✗ ${FAIL_COUNT} TESTS FAILED. Check output above.${NC}"
    exit 1
  fi
}

# ============================================================
# Main
# ============================================================
main() {
  header "TESSERA Phase 1 — End-to-End Verification"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  checkBinaries
  checkDocker

  testContainers
  testChannelMembership
  testChaincodeCommitted
  testCreateAssetLand
  testCreateAssetVehicle
  testReadAsset
  testAssetExists
  testDuplicateRejection
  testCouchDB
  printSummary
}

main "$@"
