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
 * Circuit breaker for Fabric connections
 */
class FabricCircuitBreaker {
  constructor(mspId, options = {}) {
    this.mspId = mspId;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.successThreshold = options.successThreshold || 2;
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
    this.halfOpenSuccesses = 0;
  }

  get state() {
    return this._state;
  }

  set state(value) {
    this._state = value;
    if (this.onStateChange) this.onStateChange(value);
  }

  recordSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.state = 'CLOSED';
        logger.info(`Circuit breaker CLOSED for ${this.mspId}`);
      }
    } else if (this.state === 'CLOSED') {
      this.successes++;
    }
  }

  recordFailure() {
    this.failures++;
    this.successes = 0;
    this.lastFailure = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker OPEN for ${this.mspId} after half-open failure`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker OPEN for ${this.mspId} after ${this.failures} failures`);
    }
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    
    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailure > 30000) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit breaker HALF_OPEN for ${this.mspId}`);
        return true;
      }
      return false;
    }
    
    if (this.state === 'HALF_OPEN') return true;
    
    return false;
  }

  halfOpen() {
    this.state = 'HALF_OPEN';
    this.halfOpenSuccesses = 0;
    logger.info(`Circuit breaker HALF_OPEN for ${this.mspId}`);
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenSuccesses = 0;
    this.lastFailure = 0;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      mspId: this.mspId,
    };
  }
}

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

    /** @type {Map<string, { grpcClient: any, gateway: any, network: any, config: any, circuitBreaker: any }>} */
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
      
      // Create circuit breaker for this MSP
      const circuitBreaker = this.createCircuitBreaker(msp);
      
      this.connections.set(config.mspId, { 
        grpcClient, 
        gateway, 
        network, 
        config,
        circuitBreaker,
      });

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

    /**
     * Creates a circuit breaker for an MSP connection
     */
    createCircuitBreaker(mspId) {
      const circuitBreaker = {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failures: 0,
        successes: 0,
        lastFailure: 0,
        halfOpenSuccesses: 0,
        failureThreshold: 5,
        resetTimeout: 30000,
        successThreshold: 2,
        
        recordSuccess() {
          this.failures = 0;
          this.lastFailure = 0;
          
          if (this.state === 'HALF_OPEN') {
            this.halfOpenSuccesses++;
            if (this.halfOpenSuccesses >= 2) {
              this.state = 'CLOSED';
              logger.info(`Circuit breaker CLOSED for ${mspId}`);
            }
          } else if (this.state === 'CLOSED') {
            this.successes++;
          }
        },
        
        recordFailure() {
          this.failures++;
          this.successes = 0;
          this.lastFailure = Date.now();
          
          if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN';
            logger.warn(`Circuit breaker OPEN for ${mspId} after half-open failure`);
          } else if (this.failures >= 5) {
            this.state = 'OPEN';
            logger.warn(`Circuit breaker OPEN for ${mspId} after ${this.failures} failures`);
          }
        },
        
        canExecute() {
          if (this.state === 'CLOSED') return true;
          
          if (this.state === 'OPEN') {
            // Check if reset timeout has passed
            if (Date.now() - this.lastFailure > 30000) {
              this.state = 'HALF_OPEN';
              logger.info(`Circuit breaker HALF_OPEN for ${mspId}`);
              return true;
            }
            return false;
          }
          
          if (this.state === 'HALF_OPEN') return true;
          
          return false;
        },
        
        halfOpen() {
          this.state = 'HALF_OPEN';
          this.halfOpenSuccesses = 0;
          logger.info(`Circuit breaker HALF_OPEN for ${mspId}`);
        },
        
        reset() {
          this.state = 'CLOSED';
          this.failures = 0;
          this.successes = 0;
          this.halfOpenSuccesses = 0;
          this.lastFailure = 0;
        },
        
        getState() {
          return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            lastFailure: this.lastFailure,
          };
        },
        
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        lastFailure: 0,
        halfOpenSuccesses: 0,
        failureThreshold: 5,
        resetTimeout: 30000,
        successThreshold: 2,
      };
      
      return circuitBreaker;
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
        
        // Check circuit breaker
        if (conn.circuitBreaker && !conn.circuitBreaker.canExecute()) {
          throw new Error(`Circuit breaker OPEN for ${targetMspId}. Fabric gateway unavailable.`);
        }
        
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
        const conn = this.connections.get(targetMspId);
        
        if (conn.circuitBreaker && !conn.circuitBreaker.canExecute()) {
          throw new Error(`Circuit breaker OPEN for ${targetMspId}. Fabric gateway unavailable.`);
        }
        
        return conn.network;
      }
      
      if (!this.connected || !this.network) {
        throw new Error('Fabric Gateway is not connected.');
      }
      return this.network;
    }

    /**
     * Executes a Fabric operation with circuit breaker and retry logic
     * 
     * @param {string} mspId - The MSP to use for this operation
     * @param {Function} operation - Async function that performs the Fabric operation
     * @param {Object} options - Retry options
     * @returns {Promise<any>} The result of the operation
     */
    async executeWithRetry(mspId = 'IssuerMSP', operation, options = {}) {
      const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, backoffMultiplier = 2 } = options;
      
      const conn = this.connections.get(mspId);
      if (!conn) {
        throw new Error(`No connection for MSP ${mspId}`);
      }
      
      const circuitBreaker = conn.circuitBreaker;
      let lastError;
      
      for (let attempt = 0; attempt <= 3; attempt++) {
        // Check circuit breaker
        if (circuitBreaker && !circuitBreaker.canExecute()) {
          throw new Error(`Circuit breaker OPEN for ${mspId}. Too many recent failures.`);
        }
        
        try {
          const result = await operation();
          
          // Record success for circuit breaker
          if (circuitBreaker) {
            circuitBreaker.recordSuccess();
          }
          
          return result;
        } catch (error) {
          // Record failure for circuit breaker
          if (circuitBreaker) {
            circuitBreaker.recordFailure();
          }
          
          lastError = error;
          
          // Don't retry on last attempt
          if (attempt === 3) break;
          
          // Check if error is retryable
          const isRetryable = this.isRetryableError(error);
          if (!isRetryable) throw error;
          
          // Calculate delay with exponential backoff
          const delay = Math.min(
            1000 * Math.pow(2, attempt),
            10000
          ) + Math.random() * 1000;
          
          logger.warn(`Retry attempt ${attempt + 1}/3 for ${mspId} after ${delay}ms`, {
            error: error.message,
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError;
    }
    
    /**
     * Determines if an error is retryable
     */
    isRetryableError(error) {
      if (!error) return false;
      
      const message = error.message || '';
      const retryablePatterns = [
        'timeout',
        'timed out',
        'deadline',
        'unavailable',
        'connection',
        'network',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'FABRIC_UNAVAILABLE',
        'GATEWAY_TIMEOUT',
        'SERVICE_UNAVAILABLE',
      ];
      
      return retryablePatterns.some(pattern => 
        message.toLowerCase().includes(pattern.toLowerCase())
      );
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
      const circuitBreakers = {};
      for (const [msp, conn] of this.connections.entries()) {
        if (conn.circuitBreaker) {
          circuitBreakers[msp] = conn.circuitBreaker.getState ? conn.circuitBreaker.getState() : conn.circuitBreaker;
        }
      }
      
      return {
        connected: this.connected,
        channel: process.env.FABRIC_CHANNEL || 'tessera-channel',
        peer: process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051',
        msp: process.env.FABRIC_MSP_ID || 'IssuerMSP',
        connectedMSPs: Array.from(this.connections.keys()),
        circuitBreakers,
      };
    }
  }

  /**
   * Gets circuit breaker status for all connections
   */
  getCircuitBreakerStatus() {
    const status = {};
    for (const [msp, conn] of this.connections.entries()) {
      if (conn.circuitBreaker) {
        status[msp] = conn.circuitBreaker.getState ? conn.circuitBreaker.getState() : conn.circuitBreaker;
      }
    }
    return status;
  }
}

module.exports = new GatewayService();