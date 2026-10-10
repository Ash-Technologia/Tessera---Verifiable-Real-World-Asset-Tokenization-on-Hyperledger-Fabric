#!/bin/bash
# =============================================================================
# TESSERA — Shared Script Utilities
# Source this file from other scripts: source "$(dirname "$0")/utils.sh"
# =============================================================================

# ============================================================
# Logging
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}==> $*${NC}"; }
step()    { echo -e "${BOLD}--- $*${NC}"; }

# ============================================================
# Project paths
# Resolved relative to the scripts/ directory
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESSERA_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BLOCKCHAIN_DIR="${TESSERA_ROOT}/blockchain"
ORG_DIR="${BLOCKCHAIN_DIR}/organizations"
NETWORK_DIR="${BLOCKCHAIN_DIR}/network"
CHANNEL_ARTIFACTS="${NETWORK_DIR}/channel-artifacts"
SCRIPTS_DIR="${BLOCKCHAIN_DIR}/scripts"

CHANNEL_NAME="tessera-channel"
CHAINCODE_NAME="asset"
CHAINCODE_VERSION="6.4"
CHAINCODE_SEQUENCE="20"
CHAINCODE_LABEL="asset_6.4"
CHAINCODE_PATH="${BLOCKCHAIN_DIR}/chaincode/asset"

# Fabric binary path (installed by install-fabric.sh)
FABRIC_BIN="/usr/local/bin"

# Docker Compose command detection (v2 plugin or v1/v2 standalone)
if docker compose version &>/dev/null; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null && docker-compose version &>/dev/null; then
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi
export COMPOSE_CMD

# ============================================================
# Fabric CA client helper
# ============================================================
FABRIC_CA_CLIENT="${FABRIC_BIN}/fabric-ca-client"

# Wait for a Fabric CA to become healthy
waitForCA() {
  local caUrl="$1"
  local caName="$2"
  local maxRetries="${3:-30}"
  local retryDelay="${4:-2}"

  info "Waiting for CA ${caName} at ${caUrl} ..."
  local count=0
  while ! curl -sk "${caUrl}/cainfo" 2>/dev/null | grep -q "${caName}"; do
    count=$((count + 1))
    if [ "${count}" -ge "${maxRetries}" ]; then
      error "CA ${caName} did not become healthy after $((maxRetries * retryDelay))s"
    fi
    sleep "${retryDelay}"
  done
  success "CA ${caName} is ready."
}

# Wait for a Docker container to be running
waitForContainer() {
  local containerName="$1"
  local maxRetries="${2:-30}"

  info "Waiting for container ${containerName} ..."
  local count=0
  while ! docker inspect -f '{{.State.Running}}' "${containerName}" 2>/dev/null | grep -q "true"; do
    count=$((count + 1))
    if [ "${count}" -ge "${maxRetries}" ]; then
      error "Container ${containerName} did not start in time."
    fi
    sleep 2
  done
  success "Container ${containerName} is running."
}

# ============================================================
# MSP config.yaml writer
# NodeOUs enable role-based policy (admin/peer/client/orderer)
# ============================================================
writeMSPConfig() {
  local mspDir="$1"
  local caCertFile="$2"   # just the filename, e.g. ca-cert.pem

  mkdir -p "${mspDir}"
  cat > "${mspDir}/config.yaml" << YAML
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${caCertFile}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${caCertFile}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${caCertFile}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${caCertFile}
    OrganizationalUnitIdentifier: orderer
YAML
  success "Wrote config.yaml (NodeOUs) → ${mspDir}"
}

# ============================================================
# TLS certificate installer
# Copies fabric-ca-client TLS enrollment output to standard locations
# ============================================================
installTLSCerts() {
  local tlsMspDir="$1"   # where fabric-ca-client enrolled with --enrollment.profile tls
  local destDir="$2"     # target tls/ directory for the node

  mkdir -p "${destDir}"

  # server.crt — the node's TLS certificate
  cp "${tlsMspDir}/signcerts/cert.pem" "${destDir}/server.crt"

  # server.key — the node's TLS private key
  local keyFile
  keyFile=$(find "${tlsMspDir}/keystore" -type f -name "*_sk" | head -1)
  if [ -z "${keyFile}" ]; then
    keyFile=$(find "${tlsMspDir}/keystore" -type f | head -1)
  fi
  [ -z "${keyFile}" ] && error "No private key found in ${tlsMspDir}/keystore"
  cp "${keyFile}" "${destDir}/server.key"

  # ca.crt — the TLS CA certificate (for verifying the node's cert)
  local tlsCaCert
  tlsCaCert=$(find "${tlsMspDir}/tlscacerts" -type f | head -1)
  [ -z "${tlsCaCert}" ] && error "No TLS CA cert found in ${tlsMspDir}/tlscacerts"
  cp "${tlsCaCert}" "${destDir}/ca.crt"

  success "Installed TLS certs → ${destDir}"
}

# ============================================================
# Peer environment setter
# Usage: setPeerEnv issuer  (sets CORE_PEER_* for IssuerOrg peer)
# ============================================================
setPeerEnv() {
  local org="$1"
  export FABRIC_CFG_PATH="${FABRIC_CFG_PATH:-/etc/hyperledger/fabric}"

  case "${org}" in
    issuer)
      export CORE_PEER_LOCALMSPID="IssuerMSP"
      export CORE_PEER_TLS_ENABLED="true"
      export CORE_PEER_ADDRESS="localhost:7051"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/peerOrganizations/issuer.tessera.com/users/Admin@issuer.tessera.com/msp"
      ;;
    verifier)
      export CORE_PEER_LOCALMSPID="VerifierMSP"
      export CORE_PEER_TLS_ENABLED="true"
      export CORE_PEER_ADDRESS="localhost:9051"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peerOrganizations/verifier.tessera.com/peers/peer0.verifier.tessera.com/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/peerOrganizations/verifier.tessera.com/users/Admin@verifier.tessera.com/msp"
      ;;
    compliance)
      export CORE_PEER_LOCALMSPID="ComplianceMSP"
      export CORE_PEER_TLS_ENABLED="true"
      export CORE_PEER_ADDRESS="localhost:11051"
      export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peerOrganizations/compliance.tessera.com/peers/peer0.compliance.tessera.com/tls/ca.crt"
      export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/peerOrganizations/compliance.tessera.com/users/Admin@compliance.tessera.com/msp"
      ;;
    *)
      error "Unknown org: ${org}. Valid: issuer | verifier | compliance"
      ;;
  esac
}

# ============================================================
# Orderer TLS common args (used in peer channel/lifecycle commands)
# ============================================================
ORDERER_CA="${ORG_DIR}/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/ca.crt"
ORDERER_ADMIN_TLS_SIGN_CERT="${ORG_DIR}/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/server.crt"
ORDERER_ADMIN_TLS_PRIVATE_KEY="${ORG_DIR}/ordererOrganizations/tessera.com/orderers/orderer.tessera.com/tls/server.key"
ORDERER_ADDRESS="localhost:7050"
ORDERER_ADMIN_ADDRESS="localhost:7053"

ordererTLSArgs() {
  echo "--orderer ${ORDERER_ADDRESS} --tls --cafile ${ORDERER_CA}"
}

# ============================================================
# Confirm required binaries exist
# ============================================================
checkBinaries() {
  local missing=0
  for bin in peer configtxgen fabric-ca-client osnadmin; do
    if ! command -v "${bin}" &>/dev/null; then
      warn "Missing binary: ${bin} (expected at ${FABRIC_BIN}/${bin})"
      missing=$((missing + 1))
    fi
  done
  [ "${missing}" -gt 0 ] && error "${missing} required Fabric binaries are missing. Run install-fabric.sh first."
  success "All required Fabric binaries found."
}

# ============================================================
# Docker check
# ============================================================
checkDocker() {
  if ! docker info &>/dev/null; then
    error "Docker is not running. Start Docker first: service docker start"
  fi
  if ! ${COMPOSE_CMD} version &>/dev/null; then
    error "Docker compose is not working via '${COMPOSE_CMD}'."
  fi
  success "Docker and ${COMPOSE_CMD} are ready."
}
