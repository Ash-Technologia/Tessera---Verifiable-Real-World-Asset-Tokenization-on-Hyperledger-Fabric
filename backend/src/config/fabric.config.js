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
 * Returns the validated Fabric Gateway configuration object.
 * Throws a descriptive error if required configuration is missing.
 */
function getFabricConfig() {
  const config = {
    // Fabric network parameters
    channelName:     process.env.FABRIC_CHANNEL    || 'tessera-channel',
    chaincodeName:   process.env.FABRIC_CHAINCODE  || 'asset',

    // Identity (MSP)
    mspId:           process.env.FABRIC_MSP_ID     || 'IssuerMSP',

    // Peer gRPC connection
    peerEndpoint:    process.env.FABRIC_PEER_ENDPOINT  || 'localhost:7051',
    peerHostname:    process.env.FABRIC_PEER_HOSTNAME  || 'peer0.issuer.tessera.com',

    // Certificate paths (resolved from project root)
    peerTlsCertPath:    resolvePath(process.env.FABRIC_PEER_TLS_CERT),
    identityCertPath:   resolvePath(process.env.FABRIC_IDENTITY_CERT),
    identityKeyDir:     resolvePath(process.env.FABRIC_IDENTITY_KEY_DIR),
  };

  return config;
}

/**
 * Resolves a path relative to the project root.
 * Returns null if the env var is not set.
 */
function resolvePath(envPath) {
  if (!envPath) return null;
  // If already absolute, return as-is; otherwise resolve from project root
  return path.isAbsolute(envPath)
    ? envPath
    : path.join(PROJECT_ROOT, envPath);
}

/**
 * Validates that the Fabric config files actually exist on disk.
 * Used by the gateway service before attempting connection.
 *
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateFabricConfig() {
  const config = getFabricConfig();
  const missing = [];

  const filesToCheck = [
    { label: 'Peer TLS cert',    path: config.peerTlsCertPath },
    { label: 'Identity cert',    path: config.identityCertPath },
    { label: 'Identity key dir', path: config.identityKeyDir },
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
