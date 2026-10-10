'use strict';

const path = require('node:path');
const fs = require('node:fs');

/**
 * TESSERA Fabric Gateway Configuration
 *
 * Reads all Fabric connection parameters from environment variables.
 * All paths are resolved relative to the project root so the backend
 * can be started from any working directory.
 *
 * IMPORTANT: Never hardcode certificate paths, MSP IDs, or credentials.
 * All of these come from the running Fabric network and .env file.
 *
 * Required after network startup:
 *   cp .env.example .env
 *   # (fill in paths after running ./blockchain/scripts/network.sh up)
 *
 * Architecture:
 *   Backend → Fabric Gateway → Fabric Peer → Chaincode → Ledger → CouchDB
 */

// Project root — two levels up from src/config/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Returns the validated Fabric Gateway configuration object for the given MSP.
 * Defaults to IssuerMSP (or FABRIC_MSP_ID env).
 *
 * @param {string} [targetMspId] - 'IssuerMSP' | 'VerifierMSP' | 'ComplianceMSP'
 * @returns {object}
 */
function getFabricConfig(targetMspId) {
  const msp = targetMspId || process.env.FABRIC_MSP_ID || 'IssuerMSP';
  const channelName = process.env.FABRIC_CHANNEL || 'tessera-channel';
  const chaincodeName = process.env.FABRIC_CHAINCODE || 'asset';

  if (msp === 'VerifierMSP') {
    return {
      channelName,
      chaincodeName,
      mspId: 'VerifierMSP',
      peerEndpoint: process.env.FABRIC_VERIFIER_PEER_ENDPOINT || 'localhost:9051',
      peerHostname: process.env.FABRIC_VERIFIER_PEER_HOSTNAME || 'peer0.verifier.tessera.com',
      peerTlsCertPath: resolvePath(process.env.FABRIC_VERIFIER_PEER_TLS_CERT || 'blockchain/organizations/peerOrganizations/verifier.tessera.com/peers/peer0.verifier.tessera.com/tls/ca.crt'),
      identityCertPath: resolvePath(process.env.FABRIC_VERIFIER_IDENTITY_CERT || 'blockchain/organizations/peerOrganizations/verifier.tessera.com/users/Admin@verifier.tessera.com/msp/signcerts/cert.pem'),
      identityKeyDir: resolvePath(process.env.FABRIC_VERIFIER_IDENTITY_KEY_DIR || 'blockchain/organizations/peerOrganizations/verifier.tessera.com/users/Admin@verifier.tessera.com/msp/keystore'),
    };
  }

  if (msp === 'ComplianceMSP') {
    return {
      channelName,
      chaincodeName,
      mspId: 'ComplianceMSP',
      peerEndpoint: process.env.FABRIC_COMPLIANCE_PEER_ENDPOINT || 'localhost:11051',
      peerHostname: process.env.FABRIC_COMPLIANCE_PEER_HOSTNAME || 'peer0.compliance.tessera.com',
      peerTlsCertPath: resolvePath(process.env.FABRIC_COMPLIANCE_PEER_TLS_CERT || 'blockchain/organizations/peerOrganizations/compliance.tessera.com/peers/peer0.compliance.tessera.com/tls/ca.crt'),
      identityCertPath: resolvePath(process.env.FABRIC_COMPLIANCE_IDENTITY_CERT || 'blockchain/organizations/peerOrganizations/compliance.tessera.com/users/Admin@compliance.tessera.com/msp/signcerts/cert.pem'),
      identityKeyDir: resolvePath(process.env.FABRIC_COMPLIANCE_IDENTITY_KEY_DIR || 'blockchain/organizations/peerOrganizations/compliance.tessera.com/users/Admin@compliance.tessera.com/msp/keystore'),
    };
  }

  return {
    channelName,
    chaincodeName,
    mspId: process.env.FABRIC_MSP_ID || 'IssuerMSP',
    peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
    peerHostname: process.env.FABRIC_PEER_HOSTNAME || 'peer0.issuer.tessera.com',
    peerTlsCertPath: resolvePath(process.env.FABRIC_PEER_TLS_CERT || 'blockchain/organizations/peerOrganizations/issuer.tessera.com/peers/peer0.issuer.tessera.com/tls/ca.crt'),
    identityCertPath: resolvePath(process.env.FABRIC_IDENTITY_CERT || 'blockchain/organizations/peerOrganizations/issuer.tessera.com/users/Admin@issuer.tessera.com/msp/signcerts/cert.pem'),
    identityKeyDir: resolvePath(process.env.FABRIC_IDENTITY_KEY_DIR || 'blockchain/organizations/peerOrganizations/issuer.tessera.com/users/Admin@issuer.tessera.com/msp/keystore'),
  };
}

/**
 * Resolves a path relative to the project root.
 * Returns null if the envPath is not provided.
 */
function resolvePath(envPath) {
  if (!envPath) return null;
  return path.isAbsolute(envPath)
    ? envPath
    : path.join(PROJECT_ROOT, envPath);
}

/**
 * Validates that the Fabric config files actually exist on disk for the given MSP.
 *
 * @param {string} [targetMspId]
 * @returns {{ valid: boolean, missing: string[], config: object }}
 */
function validateFabricConfig(targetMspId) {
  const config = getFabricConfig(targetMspId);
  const missing = [];

  const filesToCheck = [
    { label: `${config.mspId} Peer TLS cert`, path: config.peerTlsCertPath },
    { label: `${config.mspId} Identity cert`, path: config.identityCertPath },
    { label: `${config.mspId} Identity key dir`, path: config.identityKeyDir },
  ];

  for (const { label, path: filePath } of filesToCheck) {
    if (!filePath || !fs.existsSync(filePath)) {
      missing.push(`${label}: ${filePath || '(not set)'}`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    config,
  };
}

/**
 * Returns the private key file path by scanning the keystore directory.
 * Fabric CA generates keys with unpredictable filenames ending in _sk.
 */
function resolvePrivateKeyPath(keyDir) {
  if (!keyDir || !fs.existsSync(keyDir)) {
    throw new Error(`Identity key directory not found: ${keyDir}`);
  }

  const keyFiles = fs.readdirSync(keyDir);
  // Key files end in _sk or are the only file in the dir
  const keyFile = keyFiles.find(f => f.endsWith('_sk')) || keyFiles[0];

  if (!keyFile) {
    throw new Error(`No private key file found in ${keyDir}`);
  }

  return path.join(keyDir, keyFile);
}

module.exports = {
  getFabricConfig,
  validateFabricConfig,
  resolvePrivateKeyPath,
  PROJECT_ROOT,
};
