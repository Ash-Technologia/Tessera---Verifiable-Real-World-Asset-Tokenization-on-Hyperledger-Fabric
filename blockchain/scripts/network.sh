#!/bin/bash
# =============================================================================
# TESSERA — Master Network Orchestration Script
#
# Usage:
#   ./blockchain/scripts/network.sh up       — Start the complete network
#   ./blockchain/scripts/network.sh down     — Stop containers (keep state)
#   ./blockchain/scripts/network.sh reset    — Full teardown + wipe all state
#   ./blockchain/scripts/network.sh status   — Show running containers
#   ./blockchain/scripts/network.sh verify   — Run end-to-end verification
#
# 'up' sequence:
#   1. Validate prerequisites (docker, fabric binaries)
#   2. Start Fabric CA containers
#   3. Register and enroll all identities (Fabric CA)
#   4. Generate tessera-channel genesis block (configtxgen)
#   5. Start orderer, peers, CouchDB
#   6. Join orderer to channel (osnadmin)
#   7. Join all peers to channel
#   8. Update anchor peers
#   9. Deploy asset chaincode (full lifecycle)
#  10. Run Phase 1 verification
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/utils.sh"

# ============================================================
# Load .env
# ============================================================
ENV_FILE="${TESSERA_ROOT}/.env"
if [ -f "${ENV_FILE}" ]; then
  set -a; source "${ENV_FILE}"; set +a
  info "Loaded environment from ${ENV_FILE}"
else
  warn ".env not found. Using .env.example defaults. Copy .env.example to .env to customize."
  if [ -f "${TESSERA_ROOT}/.env.example" ]; then
    set -a; source "${TESSERA_ROOT}/.env.example"; set +a
  fi
fi

# ============================================================
# up — bring up the full network
# ============================================================
networkUp() {
  header "TESSERA Network — Starting Up"
  checkDocker
  checkBinaries

  # ----------------------------------------------------------
  # 1. Start Fabric CAs
  # ----------------------------------------------------------
  header "Step 1/6: Starting Fabric Certificate Authorities"
  cd "${TESSERA_ROOT}"
  mkdir -p \
    "${ORG_DIR}/fabric-ca/orderer" \
    "${ORG_DIR}/fabric-ca/issuer" \
    "${ORG_DIR}/fabric-ca/verifier" \
    "${ORG_DIR}/fabric-ca/compliance"

  ${COMPOSE_CMD} up -d \
    ca.orderer.tessera.com \
    ca.issuer.tessera.com \
    ca.verifier.tessera.com \
    ca.compliance.tessera.com

  success "CA containers started."
  sleep 3

  # ----------------------------------------------------------
  # 2. Register and enroll all identities
  # ----------------------------------------------------------
  header "Step 2/6: Registering and enrolling Fabric identities"
  bash "${SCRIPTS_DIR}/register-identities.sh"

  # ----------------------------------------------------------
  # 3. Start CouchDB + Orderer + Peers
  # ----------------------------------------------------------
  header "Step 3/6: Starting CouchDB, Orderer, and Peers"
  cd "${TESSERA_ROOT}"
  ${COMPOSE_CMD} up -d \
    couchdb.peer0.issuer.tessera.com \
    couchdb.peer0.verifier.tessera.com \
    couchdb.peer0.compliance.tessera.com

  sleep 3

  ${COMPOSE_CMD} up -d orderer.tessera.com
  sleep 5

  ${COMPOSE_CMD} up -d \
    peer0.issuer.tessera.com \
    peer0.verifier.tessera.com \
    peer0.compliance.tessera.com

  sleep 5

  # ----------------------------------------------------------
  # 4. Create channel and join peers
  # ----------------------------------------------------------
  header "Step 4/6: Creating channel and joining peers"
  bash "${SCRIPTS_DIR}/create-channel.sh"

  # ----------------------------------------------------------
  # 5. Deploy chaincode
  # ----------------------------------------------------------
  header "Step 5/6: Deploying TESSERA asset chaincode"
  bash "${SCRIPTS_DIR}/deploy-chaincode.sh"

  # Wait for chaincode container to initialize
  sleep 5

  # ----------------------------------------------------------
  # 6. Verify
  # ----------------------------------------------------------
  header "Step 6/6: Running Phase 1 verification"
  bash "${SCRIPTS_DIR}/verify.sh"

  echo ""
  echo -e "${GREEN}${BOLD}=================================================="
  echo -e "  TESSERA Phase 1 Network is UP and VERIFIED"
  echo -e "==================================================${NC}"
  echo ""
  networkStatus
  echo ""
  echo -e "${CYAN}Next steps:${NC}"
  echo -e "  Start backend:   cd backend && npm install && npm run dev"
  echo -e "  Manual invoke:   See README.md → Manual Testing"
  echo -e "  Verify again:    ./blockchain/scripts/verify.sh"
  echo -e "  Stop network:    ./blockchain/scripts/network.sh down"
  echo ""
}

# ============================================================
# down — stop containers without wiping state
# ============================================================
networkDown() {
  header "TESSERA Network — Stopping (preserving state)"
  cd "${TESSERA_ROOT}"
  ${COMPOSE_CMD} stop

  success "All TESSERA containers stopped. State preserved in Docker volumes."
  info "Restart with: ./blockchain/scripts/network.sh up-containers"
}

# ============================================================
# up-containers — restart stopped containers (no re-enrollment)
# ============================================================
networkUpContainers() {
  header "TESSERA Network — Restarting containers (using existing state)"
  checkDocker
  cd "${TESSERA_ROOT}"

  ${COMPOSE_CMD} start \
    ca.orderer.tessera.com \
    ca.issuer.tessera.com \
    ca.verifier.tessera.com \
    ca.compliance.tessera.com

  sleep 2

  ${COMPOSE_CMD} start \
    couchdb.peer0.issuer.tessera.com \
    couchdb.peer0.verifier.tessera.com \
    couchdb.peer0.compliance.tessera.com

  sleep 2

  ${COMPOSE_CMD} start orderer.tessera.com
  sleep 3

  ${COMPOSE_CMD} start \
    peer0.issuer.tessera.com \
    peer0.verifier.tessera.com \
    peer0.compliance.tessera.com

  sleep 5
  networkStatus
  success "Network restarted. Run verify.sh to confirm state."
}

# ============================================================
# reset — full teardown + wipe
# ============================================================
networkReset() {
  header "TESSERA Network — Full Reset"
  warn "This will DESTROY all network state including crypto material and ledger data."
  if [ "${2:-}" != "-f" ] && [ "${2:-}" != "--force" ] && [ -t 0 ]; then
    echo ""
    read -r -p "Are you sure? (type 'yes' to confirm): " confirm
    if [ "${confirm}" != "yes" ]; then
      info "Reset cancelled."
      exit 0
    fi
  fi

  header "Stopping and removing all TESSERA containers and volumes"
  cd "${TESSERA_ROOT}"
  ${COMPOSE_CMD} down -v --remove-orphans 2>/dev/null || true

  # Remove any chaincode containers
  docker ps -a --filter "name=dev-peer" --format "{{.ID}}" | \
    xargs -r docker rm -f 2>/dev/null || true

  # Remove chaincode images
  docker images --filter "label=service=hyperledger-fabric" --format "{{.ID}}" | \
    xargs -r docker rmi -f 2>/dev/null || true

  # Remove generated crypto material
  header "Removing generated crypto material"
  rm -rf "${ORG_DIR}/ordererOrganizations"
  rm -rf "${ORG_DIR}/peerOrganizations"
  rm -rf "${ORG_DIR}/fabric-ca/orderer"
  rm -rf "${ORG_DIR}/fabric-ca/issuer"
  rm -rf "${ORG_DIR}/fabric-ca/verifier"
  rm -rf "${ORG_DIR}/fabric-ca/compliance"
  rm -rf "${CHANNEL_ARTIFACTS}"

  success "TESSERA network fully reset."
  info "Run './blockchain/scripts/network.sh up' to start fresh."
}

# ============================================================
# status — show container state
# ============================================================
networkStatus() {
  header "TESSERA Network Status"

  echo ""
  printf "%-50s %-12s %-20s\n" "CONTAINER" "STATUS" "PORTS"
  echo "--------------------------------------------------------------------------------"

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
    local status
    status=$(docker inspect -f '{{.State.Status}}' "${container}" 2>/dev/null || echo "not found")
    local ports
    ports=$(docker inspect -f '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} {{end}}' "${container}" 2>/dev/null || echo "")
    printf "%-50s %-12s %-20s\n" "${container}" "${status}" "${ports:0:30}"
  done

  echo ""
  echo -e "${CYAN}CouchDB UIs:${NC}"
  echo -e "  IssuerOrg:     http://localhost:5984/_utils"
  echo -e "  VerifierOrg:   http://localhost:7984/_utils"
  echo -e "  ComplianceOrg: http://localhost:9984/_utils"
  echo -e "  Credentials:   admin/adminpw (default)"
}

# ============================================================
# Main dispatcher
# ============================================================
usage() {
  echo ""
  echo "Usage: $0 <command>"
  echo ""
  echo "Commands:"
  echo "  up              Start the complete TESSERA network (full setup)"
  echo "  down            Stop containers (preserve state)"
  echo "  up-containers   Restart stopped containers (no re-enrollment)"
  echo "  reset           Full teardown and wipe all state"
  echo "  status          Show network container status"
  echo "  verify          Run Phase 1 end-to-end verification"
  echo ""
}

case "${1:-}" in
  up)            networkUp ;;
  down)          networkDown ;;
  up-containers) networkUpContainers ;;
  reset)         networkReset "$@" ;;
  status)        networkStatus ;;
  verify)        bash "${SCRIPTS_DIR}/verify.sh" ;;
  *)             usage; exit 1 ;;
esac
