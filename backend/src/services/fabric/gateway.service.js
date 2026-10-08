'use strict';

const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('node:crypto');
const fs = require('node:fs');
const logger = require('../../utils/logger');
const {
  getFabricConfig,
  validateFabricConfig,
  resolvePrivateKeyPath,
} = require('../../config/fabric.config');

/**
 * TESSERA Fabric Gateway Service
 *
 * Manages the lifecycle of the Fabric Gateway connection:
 *   - Creates gRPC connection to the Fabric peer
 *   - Loads identity credentials from enrolled MSP
 *   - Creates a Fabric Gateway connection
 *   - Provides network/contract accessors
 *   - Handles graceful disconnect
 *
 * Architecture:
 *   Backend → GatewayService → Fabric Gateway SDK
 *                                    ↓
 *                             peer0.issuer.tessera.com (gRPC/TLS)
 *                                    ↓
 *                             AssetContract chaincode
 *                                    ↓
 *                             Fabric Ledger + CouchDB
 *
 * IMPORTANT:
 *   - This service mediates ALL backend access to Fabric.
 *   - Route handlers MUST NOT call Fabric directly.
 *   - Never fake Fabric responses — if the network is down, return an error.
 *
 * Usage:
 *   const gatewayService = require('./gateway.service');
 *   await gatewayService.connect();
 *   const contract = gatewayService.getContract();
 */
class GatewayService {
  constructor() {
    /** @type {import('@grpc/grpc-js').Client|null} */
    this.grpcClient = null;

    /** @type {import('@hyperledger/fabric-gateway').Gateway|null} */
    this.gateway = null;

    /** @type {import('@hyperledger/fabric-gateway').Network|null} */
    this.network = null;

    /** @type {boolean} */
    this.connected = false;
  }

  /**
   * Establishes the Fabric Gateway connection.
   *
   * Prerequisites:
   *   1. TESSERA Fabric network must be running
   *   2. ./blockchain/scripts/network.sh up must have completed
   *   3. .env must have FABRIC_* paths populated
   *
   * Startup sequence:
   *   network.sh up → register-identities.sh → identities on disk
   *   → backend reads certs from disk → gateway connects to peer
   */
  async connect() {
    if (this.connected) {
      logger.debug('Gateway already connected.');
      return;
    }

    // Validate configuration before attempting connection
    const { valid, missing, config } = validateFabricConfig();
    if (!valid) {
      const msg = [
        'Fabric Gateway cannot connect — missing configuration:',
        ...missing.map(m => `  - ${m}`),
        '',
        'Ensure the TESSERA network is running:',
        '  wsl -d Ubuntu ./blockchain/scripts/network.sh up',
        'Then verify .env has the correct FABRIC_* paths.',
      ].join('\n');
      throw new Error(msg);
    }

    logger.info('Connecting to Fabric Gateway', {
      peer: config.peerEndpoint,
      channel: config.channelName,
      msp: config.mspId,
    });

    // 1. Load peer TLS certificate for gRPC TLS verification
    const tlsCert = fs.readFileSync(config.peerTlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsCert);

    // 2. Create gRPC client to the peer's gateway port
    this.grpcClient = new grpc.Client(config.peerEndpoint, tlsCredentials, {
      // Override TLS hostname to match the peer certificate's CN
      'grpc.ssl_target_name_override': config.peerHostname,
      // Connection keepalive for long-running backend
      'grpc.keepalive_time_ms': 120000,
      'grpc.keepalive_timeout_ms': 20000,
      'grpc.keepalive_permit_without_calls': 1,
    });

    // 3. Load identity certificate (signed by Fabric CA)
    const identityCredentials = fs.readFileSync(config.identityCertPath);

    // 4. Load private key (generated during CA enrollment)
    const privateKeyPath = resolvePrivateKeyPath(config.identityKeyDir);
    const privateKeyPem = fs.readFileSync(privateKeyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);

    // 5. Connect to Fabric Gateway
    this.gateway = connect({
      client: this.grpcClient,
      identity: {
        mspId: config.mspId,
        credentials: identityCredentials,
      },
      signer: signers.newPrivateKeySigner(privateKey),
      hash: hash.sha256,
      // Evaluate transaction timeouts
      evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30000 }),
      submitOptions: () => ({ deadline: Date.now() + 30000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    // 6. Get the tessera-channel network reference
    this.network = this.gateway.getNetwork(config.channelName);
    this.connected = true;

    logger.info('Fabric Gateway connected successfully', {
      channel: config.channelName,
      peer: config.peerEndpoint,
    });
  }

  /**
   * Returns a contract reference for the given chaincode.
   * Defaults to the TESSERA asset chaincode.
   *
   * @param {string} [chaincodeName] - defaults to FABRIC_CHAINCODE env var
   * @returns {import('@hyperledger/fabric-gateway').Contract}
   */
  getContract(chaincodeName) {
    if (!this.connected || !this.network) {
      throw new Error(
        'Fabric Gateway is not connected. Call connect() first or ensure the network is running.'
      );
    }

    const ccName = chaincodeName || process.env.FABRIC_CHAINCODE || 'asset';
    return this.network.getContract(ccName);
  }

  /**
   * Returns the connected network reference.
   * @returns {import('@hyperledger/fabric-gateway').Network}
   */
  getNetwork() {
    if (!this.connected || !this.network) {
      throw new Error('Fabric Gateway is not connected.');
    }
    return this.network;
  }

  /**
   * Gracefully disconnects from the Fabric Gateway and closes the gRPC client.
   * Should be called on process shutdown.
   */
  async disconnect() {
    if (this.gateway) {
      this.gateway.close();
      this.gateway = null;
    }
    if (this.grpcClient) {
      this.grpcClient.close();
      this.grpcClient = null;
    }
    this.network = null;
    this.connected = false;
    logger.info('Fabric Gateway disconnected.');
  }

  /**
   * Returns connection status for health endpoint.
   */
  getStatus() {
    return {
      connected: this.connected,
      channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
      peer: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
      msp: process.env.FABRIC_MSP_ID || 'IssuerMSP',
    };
  }
}

// Export a singleton — one gateway connection per backend process
module.exports = new GatewayService();
