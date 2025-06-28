// utils/rpcConnectionManager.js
const { ethers } = require("ethers");
const { getNetworkConfig, environment } = require("../config/networks");

class RPCConnectionManager {
  constructor() {
    this.providers = new Map();
    this.failedRpcs = new Map();
    this.connectionAttempts = new Map();
    this.maxRetries = environment.MAX_RETRIES;
    this.retryDelay = environment.RETRY_DELAY;
    this.timeout = environment.RPC_TIMEOUT;
  }

  // Get or create provider for a network with failover support
  async getProvider(networkName) {
    const cacheKey = networkName;
    
    // Return cached provider if available and healthy
    if (this.providers.has(cacheKey)) {
      const provider = this.providers.get(cacheKey);
      if (await this.isProviderHealthy(provider)) {
        return provider;
      }
      // Remove unhealthy provider
      this.providers.delete(cacheKey);
    }

    // Get network configuration
    const networkConfig = getNetworkConfig(networkName);
    
    // Try each RPC URL until one works
    for (const rpcUrl of networkConfig.rpcUrls) {
      if (this.isRpcFailed(rpcUrl)) {
        continue; // Skip recently failed RPCs
      }

      try {
        const provider = await this.createProvider(rpcUrl, networkConfig);
        
        // Test the provider
        if (await this.testProvider(provider, networkConfig.chainId)) {
          this.providers.set(cacheKey, provider);
          this.clearFailureRecord(rpcUrl);
          return provider;
        }
      } catch (error) {
        console.warn(`Failed to connect to ${rpcUrl}:`, error.message);
        this.markRpcAsFailed(rpcUrl);
      }
    }

    throw new Error(`All RPC endpoints failed for network: ${networkName}`);
  }

  // Create provider with timeout and retry configuration
  async createProvider(rpcUrl, networkConfig) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, {
      chainId: networkConfig.chainId,
      name: networkConfig.name
    });

    // Set custom timeout
    provider._setTimeout(this.timeout);

    return provider;
  }

  // Test if provider is working correctly
  async testProvider(provider, expectedChainId) {
    try {
      // Test basic connectivity
      const blockNumber = await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);

      if (!blockNumber || blockNumber < 0) {
        return false;
      }

      // Verify chain ID if provided
      if (expectedChainId) {
        const network = await provider.getNetwork();
        if (network.chainId !== BigInt(expectedChainId)) {
          console.warn(`Chain ID mismatch: expected ${expectedChainId}, got ${network.chainId}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn('Provider test failed:', error.message);
      return false;
    }
  }

  // Check if provider is still healthy
  async isProviderHealthy(provider) {
    try {
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 3000)
        )
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // Mark RPC as failed temporarily
  markRpcAsFailed(rpcUrl) {
    const now = Date.now();
    const attempts = this.connectionAttempts.get(rpcUrl) || 0;
    
    this.connectionAttempts.set(rpcUrl, attempts + 1);
    
    // Exponential backoff: 1min, 5min, 15min, then 30min
    const backoffMinutes = Math.min(Math.pow(2, attempts), 30);
    const backoffMs = backoffMinutes * 60 * 1000;
    
    this.failedRpcs.set(rpcUrl, now + backoffMs);
    
    console.log(`RPC ${rpcUrl} marked as failed for ${backoffMinutes} minutes`);
  }

  // Check if RPC is currently marked as failed
  isRpcFailed(rpcUrl) {
    const failureTime = this.failedRpcs.get(rpcUrl);
    if (!failureTime) return false;
    
    const now = Date.now();
    if (now > failureTime) {
      // Failure timeout expired, clear the record
      this.failedRpcs.delete(rpcUrl);
      return false;
    }
    
    return true;
  }

  // Clear failure record for successful RPC
  clearFailureRecord(rpcUrl) {
    this.failedRpcs.delete(rpcUrl);
    this.connectionAttempts.delete(rpcUrl);
  }

  // Execute RPC call with automatic retry and failover
  async executeWithRetry(networkName, operation) {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const provider = await this.getProvider(networkName);
        return await operation(provider);
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt + 1} failed for ${networkName}:`, error.message);
        
        // Clear provider cache on error
        this.providers.delete(networkName);
        
        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (attempt + 1));
        }
      }
    }
    
    throw new Error(`All retry attempts failed for ${networkName}: ${lastError.message}`);
  }

  // Batch execute multiple operations efficiently
  async batchExecute(networkName, operations) {
    const provider = await this.getProvider(networkName);
    
    // Execute operations in batches to avoid overwhelming the RPC
    const batchSize = 10;
    const results = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchPromises = batch.map(op => 
        this.executeWithTimeout(op(provider), this.timeout)
      );
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch execution failed:`, error);
        throw error;
      }
      
      // Small delay between batches to be respectful to RPC providers
      if (i + batchSize < operations.length) {
        await this.delay(100);
      }
    }
    
    return results;
  }

  // Execute operation with timeout
  async executeWithTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      )
    ]);
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get connection statistics
  getStats() {
    return {
      activeProviders: this.providers.size,
      failedRpcs: Array.from(this.failedRpcs.entries()).map(([url, time]) => ({
        url,
        failsUntil: new Date(time).toISOString()
      })),
      connectionAttempts: Object.fromEntries(this.connectionAttempts)
    };
  }

  // Clear all cached providers (useful for testing or manual refresh)
  clearCache() {
    this.providers.clear();
    this.failedRpcs.clear();
    this.connectionAttempts.clear();
  }

  // Add custom RPC endpoint
  addCustomRpc(networkName, rpcUrl) {
    // This would typically update the network configuration
    // For now, we'll just clear the cache so it gets refreshed
    this.providers.delete(networkName);
    this.clearFailureRecord(rpcUrl);
  }
}

// Singleton instance
const rpcConnectionManager = new RPCConnectionManager();

module.exports = rpcConnectionManager;