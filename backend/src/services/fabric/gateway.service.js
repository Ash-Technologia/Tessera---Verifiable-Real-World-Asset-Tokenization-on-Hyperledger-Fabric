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

    /** @type {Map<string, { grpcClient: any, gateway: any, network: any, config: any }>} */
    this.connections = new Map();
  }

  /**
   * Establishes the Fabric Gateway connection for a specific organization or all orgs.
   * Defaults to IssuerMSP (primary).
   *
   * @param {string} [targetMspId] - 'IssuerMSP' | 'VerifierMSP' | 'ComplianceMSP'
   */
  async connect(targetMspId = 'IssuerMSP') {
    const orgsToConnect = targetMspId === 'ALL'
      ? ['IssuerMSP', 'VerifierMSP', 'ComplianceMSP']
      : [targetMspId];

    for (const msp of orgsToConnect) {
      if (this.connections.has(msp)) {
        continue;
      }

      const { valid, missing, config } = validateFabricConfig(msp);
      if (!valid) {
        if (msp === 'IssuerMSP') {
          const msg = [
            `Fabric Gateway cannot connect to ${msp} — missing configuration:`,
            ...missing.map(m => `  - ${m}`),
            '',
            'Ensure the TESSERA network is running:',
            '  wsl -d Ubuntu ./blockchain/scripts/network.sh up',
            'Then verify .env has the correct FABRIC_* paths.',
          ].join('\n');
          throw new Error(msg);
        } else {
          logger.warn(`Skipping optional Gateway connection for ${msp}: credentials not present on disk`);
          continue;
        }
      }

      logger.info('Connecting to Fabric Gateway', {
        peer: config.peerEndpoint,
        channel: config.channelName,
        msp: config.mspId,
      });

      // 1. Load peer TLS certificate
      const tlsCert = fs.readFileSync(config.peerTlsCertPath);
      const tlsCredentials = grpc.credentials.createSsl(tlsCert);

      // 2. Create gRPC client
      const grpcClient = new grpc.Client(config.peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': config.peerHostname,
        'grpc.keepalive_time_ms': 120000,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
      });

      // 3. Load identity certificate & private key
      const identityCredentials = fs.readFileSync(config.identityCertPath);
      const privateKeyPath = resolvePrivateKeyPath(config.identityKeyDir);
      const privateKeyPem = fs.readFileSync(privateKeyPath);
      const privateKey = crypto.createPrivateKey(privateKeyPem);

      // 4. Connect to Fabric Gateway
      const gateway = connect({
        client: grpcClient,
        identity: {
          mspId: config.mspId,
          credentials: identityCredentials,
        },
        signer: signers.newPrivateKeySigner(privateKey),
        hash: hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + 10000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
      });

      const network = gateway.getNetwork(config.channelName);
      this.connections.set(config.mspId, { grpcClient, gateway, network, config });

      // Default/primary connection attributes for backward compatibility
      if (config.mspId === 'IssuerMSP' || !this.gateway) {
        this.grpcClient = grpcClient;
        this.gateway = gateway;
        this.network = network;
        this.connected = true;
      }

      logger.info('Fabric Gateway connected successfully', {
        channel: config.channelName,
        peer: config.peerEndpoint,
        msp: config.mspId,
      });
    }

    // Try connecting secondary orgs (VerifierMSP, ComplianceMSP) non-blockingly
    if (targetMspId === 'IssuerMSP') {
      for (const secondaryMsp of ['VerifierMSP', 'ComplianceMSP']) {
        if (!this.connections.has(secondaryMsp)) {
          try {
            await this.connect(secondaryMsp);
          } catch (secErr) {
            logger.warn(`Could not connect secondary MSP ${secondaryMsp} on startup`, { error: secErr.message });
          }
        }
      }
    }
  }

  /**
   * Ensures that a gateway connection for the specified MSP is established.
   *
   * @param {string} mspId
   */
  async ensureConnection(mspId = 'IssuerMSP') {
    if (!this.connections.has(mspId)) {
      await this.connect(mspId);
    }
  }

  /**
   * Returns a contract reference for the given chaincode and organization MSP.
   * Defaults to 'asset' chaincode and 'IssuerMSP'.
   *
   * @param {string} [chaincodeName] - defaults to FABRIC_CHAINCODE env var or 'asset'
   * @param {string} [targetMspId] - defaults to 'IssuerMSP'
   * @returns {import('@hyperledger/fabric-gateway').Contract}
   */
  getContract(chaincodeName, targetMspId = 'IssuerMSP') {
    const ccName = chaincodeName || process.env.FABRIC_CHAINCODE || 'asset';

    if (targetMspId && this.connections.has(targetMspId)) {
      const conn = this.connections.get(targetMspId);
      return conn.network.getContract(ccName);
    }

    if (!this.connected || !this.network) {
      throw new Error(
        'Fabric Gateway is not connected. Call connect() first or ensure the network is running.'
      );
    }

    return this.network.getContract(ccName);
  }

  /**
   * Returns the connected network reference for the given MSP.
   *
   * @param {string} [targetMspId]
   * @returns {import('@hyperledger/fabric-gateway').Network}
   */
  getNetwork(targetMspId = 'IssuerMSP') {
    if (targetMspId && this.connections.has(targetMspId)) {
      return this.connections.get(targetMspId).network;
    }
    if (!this.connected || !this.network) {
      throw new Error('Fabric Gateway is not connected.');
    }
    return this.network;
  }

  /**
   * Gracefully disconnects all Fabric Gateway connections.
   */
  async disconnect() {
    for (const [msp, conn] of this.connections.entries()) {
      try {
        if (conn.gateway) conn.gateway.close();
        if (conn.grpcClient) conn.grpcClient.close();
      } catch (err) {
        logger.warn(`Error disconnecting gateway for ${msp}`, { error: err.message });
      }
    }
    this.connections.clear();
    this.gateway = null;
    this.grpcClient = null;
    this.network = null;
    this.connected = false;
    logger.info('All Fabric Gateway connections disconnected.');
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
      connectedMSPs: Array.from(this.connections.keys()),
    };
  }
}

// Export a singleton — one gateway service per backend process
module.exports = new GatewayService();
