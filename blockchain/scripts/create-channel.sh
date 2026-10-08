#!/bin/bash
# =============================================================================
# TESSERA — Channel Creation Script
#
# Creates and joins the tessera-channel using Fabric 2.5 channel participation API.
# No system channel is used (deprecated). The orderer joins via osnadmin.
#
# Flow:
#   1. Generate tessera-channel genesis block (configtxgen)
#   2. Join orderer to channel (osnadmin channel join)
#   3. Join peer0.issuer to channel
#   4. Join peer0.verifier to channel
#   5. Join peer0.compliance to channel
#   6. Update anchor peers for each org
#
# Usage:
#   ./blockchain/scripts/create-channel.sh
#
# Prerequisites:
#   - All identities enrolled (register-identities.sh)
#   - Orderer and peers running
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# ============================================================
# Generate channel genesis block
# ============================================================
generateChannelGenesis() {
  header "Generating tessera-channel genesis block"

  mkdir -p "${CHANNEL_ARTIFACTS}"

  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  ${FABRIC_BIN}/configtxgen \
    -profile TesseraApplicationGenesis \
    -outputBlock "${CHANNEL_ARTIFACTS}/tessera-channel.block" \
    -channelID "${CHANNEL_NAME}"

  success "Genesis block created: ${CHANNEL_ARTIFACTS}/tessera-channel.block"
}

# ============================================================
# Join orderer to channel via channel participation API
# ============================================================
joinOrdererToChannel() {
  header "Joining orderer to ${CHANNEL_NAME} (channel participation API)"

  ${FABRIC_BIN}/osnadmin channel join \
    --channelID "${CHANNEL_NAME}" \
    --config-block "${CHANNEL_ARTIFACTS}/tessera-channel.block" \
    -o "${ORDERER_ADMIN_ADDRESS}" \
    --ca-file "${ORDERER_CA}" \
    --client-cert "${ORDERER_ADMIN_TLS_SIGN_CERT}" \
    --client-key "${ORDERER_ADMIN_TLS_PRIVATE_KEY}"

  success "Orderer joined ${CHANNEL_NAME}."

  # Wait for orderer to process the channel
  sleep 3

  # Verify orderer channel membership
  ${FABRIC_BIN}/osnadmin channel list \
    -o "${ORDERER_ADMIN_ADDRESS}" \
    --ca-file "${ORDERER_CA}" \
    --client-cert "${ORDERER_ADMIN_TLS_SIGN_CERT}" \
    --client-key "${ORDERER_ADMIN_TLS_PRIVATE_KEY}"
}

# ============================================================
# Join a peer to the channel
# ============================================================
joinPeerToChannel() {
  local org="$1"
  header "Joining peer0.${org} to ${CHANNEL_NAME}"

  setPeerEnv "${org}"

  local maxRetries=10
  local count=0
  local joined=0

  while [ "${count}" -lt "${maxRetries}" ]; do
    if ${FABRIC_BIN}/peer channel join -b "${CHANNEL_ARTIFACTS}/tessera-channel.block" 2>/dev/null; then
      joined=1
      break
    fi
    count=$((count + 1))
    info "Waiting for peer0.${org} to be ready to join channel (attempt ${count}/${maxRetries})..."
    sleep 2
  done

  if [ "${joined}" -eq 1 ]; then
    success "peer0.${org} joined ${CHANNEL_NAME}."
  else
    ${FABRIC_BIN}/peer channel join -b "${CHANNEL_ARTIFACTS}/tessera-channel.block"
    success "peer0.${org} joined ${CHANNEL_NAME}."
  fi
}

# ============================================================
# Update anchor peer for an org
# ============================================================
updateAnchorPeer() {
  local org="$1"
  local mspId="$2"
  header "Updating anchor peer for ${mspId}"

  setPeerEnv "${org}"
  export FABRIC_CFG_PATH="${NETWORK_DIR}"

  local anchorUpdateTx="${CHANNEL_ARTIFACTS}/${mspId}anchors.tx"

  # Fetch current channel config
  ${FABRIC_BIN}/peer channel fetch config "${CHANNEL_ARTIFACTS}/config_block.pb" \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    -c "${CHANNEL_NAME}" \
    --tls \
    --cafile "${ORDERER_CA}"

  # Decode to JSON
  ${FABRIC_BIN}/configtxlator proto_decode \
    --input "${CHANNEL_ARTIFACTS}/config_block.pb" \
    --type common.Block \
    --output "${CHANNEL_ARTIFACTS}/config_block.json"

  # Extract channel config
  jq .data.data[0].payload.data.config "${CHANNEL_ARTIFACTS}/config_block.json" \
    > "${CHANNEL_ARTIFACTS}/config.json"

  # Determine anchor peer host and port
  local anchorHost anchorPort
  case "${org}" in
    issuer)    anchorHost="peer0.issuer.tessera.com";    anchorPort=7051  ;;
    verifier)  anchorHost="peer0.verifier.tessera.com";  anchorPort=9051  ;;
    compliance) anchorHost="peer0.compliance.tessera.com"; anchorPort=11051 ;;
  esac

  # Check if anchor peer is already defined in config (e.g. from genesis block)
  local currentAnchor
  currentAnchor=$(jq -r ".channel_group.groups.Application.groups[\"${mspId}\"].values.AnchorPeers.value.anchor_peers[0].host // empty" "${CHANNEL_ARTIFACTS}/config.json")
  if [ "${currentAnchor}" = "${anchorHost}" ]; then
    success "Anchor peer already configured for ${mspId} (${anchorHost}:${anchorPort}) via genesis block."
    return 0
  fi

  # Add anchor peer to config
  jq --arg msp "${mspId}" \
     --arg host "${anchorHost}" \
     --argjson port "${anchorPort}" \
     '.channel_group.groups.Application.groups[$msp].values.AnchorPeers = {
        "mod_policy": "Admins",
        "value": {
          "anchor_peers": [{"host": $host, "port": $port}]
        },
        "version": "0"
      }' \
    "${CHANNEL_ARTIFACTS}/config.json" \
    > "${CHANNEL_ARTIFACTS}/modified_config.json"

  # Encode both configs
  ${FABRIC_BIN}/configtxlator proto_encode \
    --input "${CHANNEL_ARTIFACTS}/config.json" \
    --type common.Config \
    --output "${CHANNEL_ARTIFACTS}/config.pb"

  ${FABRIC_BIN}/configtxlator proto_encode \
    --input "${CHANNEL_ARTIFACTS}/modified_config.json" \
    --type common.Config \
    --output "${CHANNEL_ARTIFACTS}/modified_config.pb"

  # Compute delta
  ${FABRIC_BIN}/configtxlator compute_update \
    --channel_id "${CHANNEL_NAME}" \
    --original "${CHANNEL_ARTIFACTS}/config.pb" \
    --updated "${CHANNEL_ARTIFACTS}/modified_config.pb" \
    --output "${CHANNEL_ARTIFACTS}/config_update.pb"

  # Wrap in envelope
  ${FABRIC_BIN}/configtxlator proto_decode \
    --input "${CHANNEL_ARTIFACTS}/config_update.pb" \
    --type common.ConfigUpdate \
    --output "${CHANNEL_ARTIFACTS}/config_update.json"

  echo '{"payload":{"header":{"channel_header":{"channel_id":"'"${CHANNEL_NAME}"'","type":2}},"data":{"config_update":'"$(cat "${CHANNEL_ARTIFACTS}/config_update.json")"'}}}' \
    | jq . > "${CHANNEL_ARTIFACTS}/config_update_in_envelope.json"

  ${FABRIC_BIN}/configtxlator proto_encode \
    --input "${CHANNEL_ARTIFACTS}/config_update_in_envelope.json" \
    --type common.Envelope \
    --output "${anchorUpdateTx}"

  # Submit update
  ${FABRIC_BIN}/peer channel update \
    -f "${anchorUpdateTx}" \
    -c "${CHANNEL_NAME}" \
    -o "${ORDERER_ADDRESS}" \
    --ordererTLSHostnameOverride orderer.tessera.com \
    --tls \
    --cafile "${ORDERER_CA}"

  success "Anchor peer updated for ${mspId}: ${anchorHost}:${anchorPort}"

  # Clean up temp files
  rm -f "${CHANNEL_ARTIFACTS}/config_block.pb" \
        "${CHANNEL_ARTIFACTS}/config_block.json" \
        "${CHANNEL_ARTIFACTS}/config.json" \
        "${CHANNEL_ARTIFACTS}/modified_config.json" \
        "${CHANNEL_ARTIFACTS}/config.pb" \
        "${CHANNEL_ARTIFACTS}/modified_config.pb" \
        "${CHANNEL_ARTIFACTS}/config_update.pb" \
        "${CHANNEL_ARTIFACTS}/config_update.json" \
        "${CHANNEL_ARTIFACTS}/config_update_in_envelope.json"
}

# ============================================================
# Verify channel membership
# ============================================================
verifyChannel() {
  header "Verifying channel membership"

  for org in issuer verifier compliance; do
    setPeerEnv "${org}"
    local channelList
    channelList=$(${FABRIC_BIN}/peer channel list 2>&1)
    if echo "${channelList}" | grep -q "${CHANNEL_NAME}"; then
      success "peer0.${org} is a member of ${CHANNEL_NAME}"
    else
      error "peer0.${org} is NOT in ${CHANNEL_NAME}. Output: ${channelList}"
    fi
  done
}

# ============================================================
# Main
# ============================================================
main() {
  header "TESSERA — Channel Creation: ${CHANNEL_NAME}"
  checkBinaries

  generateChannelGenesis

  # Wait a moment for containers to be stable
  sleep 2

  joinOrdererToChannel
  joinPeerToChannel "issuer"
  joinPeerToChannel "verifier"
  joinPeerToChannel "compliance"

  updateAnchorPeer "issuer"    "IssuerMSP"
  updateAnchorPeer "verifier"  "VerifierMSP"
  updateAnchorPeer "compliance" "ComplianceMSP"

  verifyChannel

  echo ""
  success "Channel ${CHANNEL_NAME} created and all peers joined."
}

main "$@"
