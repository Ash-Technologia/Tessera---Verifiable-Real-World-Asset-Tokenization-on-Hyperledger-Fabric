// Retry utilities with exponential backoff and circuit breaker support

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['network', 'timeout', 'fabric-unavailable', 'server-error'],
};

/**
 * Calculates delay with exponential backoff and optional jitter
 */
export function calculateRetryDelay(attempt, config = {}) {
  const { baseDelay = 1000, maxDelay = 10000, backoffMultiplier = 2, jitter = true } = config;
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  if (config.jitter) {
    return delay + Math.random() * 1000;
  }
  return delay;
}

/**
 * Determines if an error is retryable based on its type/status
 */
export function isRetryableError(error, config = {}) {
  if (!error) return false;
  
  // Check for ApiError with retryable flag
  if (error.retryable === true) return true;
  if (error.retryable === false) return false;
  
  // Check for ApiError with retryable kind
  if (error.kind && config.retryableErrors?.includes(error.kind)) {
    return true;
  }
  
  // Check HTTP status codes
  if (error.status && config.retryableStatuses?.includes(error.status)) {
    return true;
  }
  
  // Check error types
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return true; // Network error
  }
  if (error.name === 'AbortError') {
    return false; // Don't retry aborted requests
  }
  
  // Network errors
  if (error.message?.includes('network') || 
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ENOTFOUND')) {
    return true;
  }
  
  return false;
}

/**
 * Retry a function with exponential backoff
 * @template T
 * @param {() => Promise<T>} fn - Function to retry
 * @param {Object} options - Retry configuration
 * @returns {Promise<T>}
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    jitter = true,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
    retryableErrors = ['network', 'timeout', 'fabric-unavailable', 'server-error'],
    onRetry = null,
    shouldRetry = isRetryableError,
    onSuccess = null,
    onFailure = null,
    signal,
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      // Check if we should retry
      const isLastAttempt = attempt === maxRetries;
      const shouldRetry = !isLastAttempt && shouldRetryFn(error, { 
        retryableStatuses, 
        retryableErrors 
      });
      
      if (!shouldRetry || isLastAttempt) {
        throw error;
      }
      
      // Calculate delay
      const delay = calculateRetryDelay(attempt, {
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
      });
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error.message,
        attempt: attempt + 1,
      });
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached due to throw in catch block
  throw new Error('Retry exhausted');
}

/**
 * Wraps a fetch call with timeout
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs)]),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Circuit breaker states
 */
export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

/**
 * Simple in-memory circuit breaker for API endpoints
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.halfOpenRequests = options.halfOpenRequests || 3;
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenRequests = 0;
  }

  get state() {
    return this._state;
  }

  set state(value) {
    this._state = value;
    this.onStateChange?.(value);
  }

  recordSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= 2) {
        this.reset();
      }
    } else {
      this.successes++;
    }
  }

  recordFailure() {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.open();
    } else if (this.failures >= 5) {
      this.open();
    }
  }

  open() {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    
    if (this.state === 'OPEN') {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= 30000) {
        this.halfOpen();
        return true;
      }
      return false;
    }
    
    if (this.state === 'HALF_OPEN') {
      return true;
    }
    
    return false;
  }

  halfOpen() {
    this.state = 'HALF_OPEN';
    this.halfOpenSuccesses = 0;
  }

  reset() {
    this.failures = 0;
    this.successes = 0;
    this.state = 'CLOSED';
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  getBreaker(key, options = {}) {
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker(options));
    }
    return this.breakers.get(key);
  }

  getBreakerState(key) {
    const breaker = this.breakers.get(key);
    if (!breaker) return null;
    return {
      state: breaker.state,
      failures: breaker.failures,
      successes: breaker.successes,
    };
  }

  reset(key) {
    const breaker = this.breakers.get(key);
    if (breaker) {
      breaker.reset();
    }
  }

  getAllStates() {
    const states = {};
    for (const [key, breaker] of this.breakers.entries()) {
      states[key] = {
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes,
      };
    }
    return states;
  }
}

/**
 * Global circuit breaker registry instance
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Wraps a fetch call with circuit breaker protection
 */
export async function fetchWithCircuitBreaker(key, fetchFn, options = {}) {
  const breaker = circuitBreakerRegistry.getBreaker(key, { failureThreshold: 5 });
  
  if (!breaker.canExecute()) {
    throw new Error(`Circuit breaker OPEN for ${key}`);
  }
  
  try {
    const result = await fetchFn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

/**
 * Retry policy configuration
 */
export const RETRY_POLICIES = {
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
  },
  AGGRESSIVE: {
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitter: true,
  },
  CONSERVATIVE: {
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 3,
    jitter: false,
  },
};

/**
 * Creates a retry function with custom policy
 */
export function createRetry(fn, policy = {}) {
  const config = { ...RETRY_POLICIES.DEFAULT, ...policy };
  
  return async function retryable(...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        if (attempt === config.maxRetries) throw error;
        
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay
        );
        
        const jitter = config.jitter ? Math.random() * 1000 : 0;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
    
    throw new Error('Max retries exceeded');
  };
}

export default {
  calculateRetryDelay,
  isRetryableError,
  withRetry,
  CircuitBreaker,
  CircuitBreakerRegistry,
  circuitBreakerRegistry,
  RETRY_POLICIES,
  createRetry,
};