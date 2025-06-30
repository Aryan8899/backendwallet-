// services/rpcTransactionService.js - FIXED VERSION WITH REAL-TIME SUPPORT
const { ethers } = require("ethers");
const axios = require("axios");

const ETHERSCAN_APIS = {
  ethereum: {
    url: "https://api.etherscan.io/api",
    key: process.env.ETHERSCAN_API_KEY
  },
  bsc: {
    url: "https://api.bscscan.com/api",
    key: process.env.BSCSCAN_API_KEY
  },
  polygon: {
    url: "https://api.polygonscan.com/api",
    key: process.env.POLYGONSCAN_API_KEY0x06081b9f9870954e201c706bf9f71034f470fcbc97e3d9b8a91a402a2f9b51f0
  },
  arbitrum: {
    url: "https://api.arbiscan.io/api",
    key: process.env.ARBISCAN_API_KEY
  },
  linea: {
    url: "https://api.lineascan.build/api",
    key: process.env.LINEASCAN_API_KEY
  },
  
};

const formatEtherscanTx = (tx) => {
  const isConfirmed = tx.txreceipt_status === "1" && tx.isError === "0";
  const gasFee = BigInt(tx.gasUsed || tx.gas || "0") * BigInt(tx.gasPrice || "0");

  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(BigInt(tx.value || "0")),
    gasUsed: tx.gasUsed || "0",
    gasFee: ethers.formatEther(gasFee),
    isConfirmed,
    timestamp: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
    blockNumber: parseInt(tx.blockNumber),
    blockHash: tx.blockHash || null,
    nonce: parseInt(tx.nonce),
    gasPrice: ethers.formatUnits(BigInt(tx.gasPrice || "0"), "gwei") + " Gwei",
    method: tx.methodId || tx.functionName || "Transfer",
    status: tx.txreceipt_status === "1" ? "Success" : tx.txreceipt_status === "0" ? "Failed" : "Pending",
    type: tx.type || "regular"
  };
};

// Format RPC transaction
const formatRpcTx = (tx, receipt = null) => {
  const timestamp = new Date().toLocaleString();
  const gasFee = receipt ? 
    ethers.formatEther(BigInt(receipt.gasUsed) * BigInt(tx.gasPrice)) : 
    "0";

  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(tx.value),
    gasUsed: receipt ? receipt.gasUsed.toString() : tx.gasLimit.toString(),
    gasFee,
    isConfirmed: !!receipt,
    timestamp,
    blockNumber: tx.blockNumber || 0,
    blockHash: tx.blockHash || null,
    nonce: tx.nonce,
    gasPrice: ethers.formatUnits(tx.gasPrice, "gwei") + " Gwei",
    method: tx.data ? tx.data.slice(0, 10) : "0x",
    status: receipt ? (receipt.status === 1 ? "Success" : "Failed") : "Pending",
    type: "realtime"
  };
};

class RPCTransactionService {
  constructor() {
    // RPC endpoints for different networks - FIXED ENV VARIABLE NAMES
    this.rpcEndpoints = {
      ethereum: process.env.ETH_RPC_URL,
      bsc: process.env.BSC_RPC_URL || process.env.BSC_RPC || "https://bsc-dataseed1.binance.org/",
      polygon: process.env.POLYGON_RPC_URL,
      arbitrum: process.env.ARBITRUM_RPC_URL,
      avalanche: process.env.AVALANCHE_RPC_URL,
      fantom: process.env.FANTOM_RPC_URL,
      base: process.env.BASE_RPC_URL || "https://mainnet.base.org",
       linea: process.env.LINEA_RPC_URL || "https://rpc.linea.build",
      optimism: process.env.OPTIMISM_RPC_URL
    };

    // Network configurations
    this.networkConfigs = {
      ethereum: { chainId: 1, symbol: "ETH", decimals: 18 },
      bsc: { chainId: 56, symbol: "BNB", decimals: 18 },
      polygon: { chainId: 137, symbol: "MATIC", decimals: 18 },
      arbitrum: { chainId: 42161, symbol: "ETH", decimals: 18 },
      avalanche: { chainId: 43114, symbol: "AVAX", decimals: 18 },
      fantom: { chainId: 250, symbol: "FTM", decimals: 18 },
      linea: { chainId: 59144, symbol: "ETH", decimals: 18 },
      optimism: { chainId: 10, symbol: "ETH", decimals: 18 }
    };

    // Custom networks added at runtime
    this.customNetworks = {};
    
    // Real-time transaction cache
    this.realtimeCache = new Map();
    this.cacheTimeout = 30000; // 30 seconds
  }

  // Get provider for specific network
  getProvider(network) {
    const rpcUrl = this.rpcEndpoints[network];
    if (!rpcUrl) {
      throw new Error(`Unsupported network: ${network}. Available: ${Object.keys(this.rpcEndpoints).join(', ')}`);
    }
    console.log(`🔗 Using RPC URL for ${network}: ${rpcUrl}`);
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  // Get supported networks
  getSupportedNetworks() {
    const baseNetworks = Object.keys(this.networkConfigs || {});
    const rpcNetworks = Object.keys(this.rpcEndpoints || {});
    const customNetworks = Object.keys(this.customNetworks || {});
  
    // Merge all and remove duplicates
    return Array.from(new Set([...baseNetworks, ...rpcNetworks, ...customNetworks]));
  }
  

  // Add custom network
  addCustomNetwork(networkName, config) {
    this.customNetworks[networkName] = config;
    this.rpcEndpoints[networkName] = config.rpcUrl;
    this.networkConfigs[networkName] = {
      chainId: config.chainId,
      symbol: config.symbol,
      decimals: config.decimals || 18
    };
  }

  // Debug API configuration
  debugApiConfig(network) {
    const config = ETHERSCAN_APIS[network];
    console.log(`🔧 API Config for ${network}:`, {
      url: config?.url,
      hasKey: !!config?.key,
      keyLength: config?.key?.length || 0,
      keyPrefix: config?.key?.substring(0, 8) + '...' || 'NO_KEY'
    });
    return config;
  }

  // Make API request with better error handling
  async makeApiRequest(url, params, network, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`📡 API Request (attempt ${attempt}/${retries}) for ${network}:`);
        console.log(`🔗 URL: ${url}`);
        console.log(`📋 Params:`, params);

        const response = await axios.get(url, {
          params,
          timeout: 30000,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'User-Agent': 'Mozilla/5.0 (compatible; DWallet/1.0)'
          }
        });

        console.log(`✅ Response status: ${response.status}`);
        console.log(`📊 Response data:`, {
          status: response.data.status,
          message: response.data.message,
          resultCount: Array.isArray(response.data.result) ? response.data.result.length : 'not_array'
        });

        // Check for API-specific errors
        if (response.data.status === "0") {
          const errorMsg = response.data.message || response.data.result || "Unknown API error";
          console.error(`❌ API Error: ${errorMsg}`);
          
          // If it's a rate limit error, wait and retry
          if (errorMsg.toLowerCase().includes('rate limit') && attempt < retries) {
            console.log(`⏳ Rate limited, waiting ${attempt * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            continue;
          }
          
          throw new Error(`API Error: ${errorMsg}`);
        }

        return response.data;

      } catch (error) {
        console.error(`❌ API Request failed (attempt ${attempt}/${retries}):`, {
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });

        if (attempt === retries) {
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  // NEW: Get real-time transactions by polling recent blocks
  async getRealTimeTransactions(address, network = "bsc") {
    try {
      console.log(`🔄 Fetching REAL-TIME transactions for ${address} on ${network}...`);
      
      const provider = this.getProvider(network);
      const currentBlock = await provider.getBlockNumber();
      const currentTime = Date.now();
      
      console.log(`📦 Current block: ${currentBlock}`);
      console.log(`⏰ Current time: ${new Date().toISOString()}`);
      
      // Check cache first
      const cacheKey = `${network}_${address}`;
      const cached = this.realtimeCache.get(cacheKey);
      if (cached && (currentTime - cached.timestamp) < this.cacheTimeout) {
        console.log(`📞 Using cached real-time data (${Math.round((currentTime - cached.timestamp) / 1000)}s old)`);
        return cached.data;
      }
      
      const realtimeTxs = [];
      const blocksToCheck = 10; // Check last 10 blocks for recent activity
      const maxTxsPerBlock = 5; // Limit to avoid performance issues
      
      console.log(`🔍 Scanning last ${blocksToCheck} blocks for recent transactions...`);
      
      // Check recent blocks in parallel (but limit concurrency)
      const promises = [];
      for (let i = 0; i < blocksToCheck; i++) {
        const blockNum = currentBlock - i;
        promises.push(this.checkBlockForAddress(provider, blockNum, address, maxTxsPerBlock));
      }
      
      try {
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            realtimeTxs.push(...result.value);
          }
        }
      } catch (error) {
        console.error("Error scanning recent blocks:", error.message);
      }
      
      // Also try to get mempool transactions if available
      try {
        const mempoolTxs = await this.getMempoolTransactions(provider, address);
        realtimeTxs.push(...mempoolTxs);
      } catch (error) {
        console.log("⚠️ Mempool not available:", error.message);
      }
      
      // Remove duplicates and sort by timestamp
      const uniqueTxs = Array.from(
        new Map(realtimeTxs.map(tx => [tx.hash, tx])).values()
      );
      
      // Sort by block number (latest first)
      uniqueTxs.sort((a, b) => b.blockNumber - a.blockNumber);
      
      console.log(`✅ Found ${uniqueTxs.length} real-time transactions`);
      
      const result = {
        success: true,
        address,
        network,
        currentBlock,
        blocksScanned: blocksToCheck,
        transactions: uniqueTxs,
        timestamp: new Date().toISOString(),
        method: "RPC_REALTIME"
      };
      
      // Cache the result
      this.realtimeCache.set(cacheKey, {
        data: result,
        timestamp: currentTime
      });
      
      return result;
      
    } catch (error) {
      console.error("❌ Error fetching real-time transactions:", error);
      return {
        success: false,
        error: error.message,
        transactions: []
      };
    }
  }

  // Check a specific block for transactions involving the address
  async checkBlockForAddress(provider, blockNumber, address, maxTxs = 5) {
    try {
      const block = await provider.getBlock(blockNumber, true);
      if (!block || !block.transactions) {
        return [];
      }
      
      const addressLower = address.toLowerCase();
      const relevantTxs = [];
      
      for (const tx of block.transactions) {
        if (relevantTxs.length >= maxTxs) break;
        
        // Check if transaction involves our address
        if (tx.from && tx.from.toLowerCase() === addressLower || 
            tx.to && tx.to.toLowerCase() === addressLower) {
          
          try {
            // Get transaction receipt
            const receipt = await provider.getTransactionReceipt(tx.hash);
            const formattedTx = formatRpcTx(tx, receipt);
            
            // Add additional real-time info
            formattedTx.blockAge = Date.now() - (block.timestamp * 1000);
            formattedTx.isRecent = formattedTx.blockAge < 300000; // 5 minutes
            
            relevantTxs.push(formattedTx);
          } catch (error) {
            console.error(`Error processing tx ${tx.hash}:`, error.message);
          }
        }
      }
      
      if (relevantTxs.length > 0) {
        console.log(`📦 Block ${blockNumber}: Found ${relevantTxs.length} relevant transactions`);
      }
      
      return relevantTxs;
      
    } catch (error) {
      console.error(`Error checking block ${blockNumber}:`, error.message);
      return [];
    }
  }

  // Try to get mempool transactions (may not be supported by all RPC providers)
  async getMempoolTransactions(provider, address) {
    try {
      // Some providers support eth_getFilterChanges for pending transactions
      const pendingTxs = [];
      
      // Try to get pending transactions using eth_newPendingTransactionFilter
      // This is not supported by all providers
      try {
        const filter = await provider.send("eth_newPendingTransactionFilter", []);
        const changes = await provider.send("eth_getFilterChanges", [filter]);
        
        for (const txHash of changes.slice(0, 10)) { // Limit to 10 pending txs
          try {
            const tx = await provider.getTransaction(txHash);
            if (tx && (tx.from.toLowerCase() === address.toLowerCase() || 
                      tx.to?.toLowerCase() === address.toLowerCase())) {
              pendingTxs.push(formatRpcTx(tx));
            }
          } catch (error) {
            // Skip failed transactions
          }
        }
        
        // Clean up filter
        await provider.send("eth_uninstallFilter", [filter]);
        
      } catch (error) {
        // Mempool filtering not supported
      }
      
      return pendingTxs;
      
    } catch (error) {
      return [];
    }
  }

  // ENHANCED: Get transaction history with REAL-TIME support
  async getTransactionHistory(address, network = "ethereum", options = {}) {
    const {
      limit = 20,
      includeTokenTransfers = true
    } = options;
  
    const config = ETHERSCAN_APIS[network];
    if (!config || !config.key) {
      return {
        success: false,
        error: `Unsupported or missing API key for network: ${network}`
      };
    }
  
    try {
      console.log(`📡 Fetching transaction history from ${network} for ${address}...`);
  
      // Regular transactions
      const regularTxReq = axios.get(config.url, {
        params: {
          module: "account",
          action: "txlist",
          address: address.toLowerCase(),
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: limit,
          sort: "desc",
          apikey: config.key
        },
        timeout: 15000
      });
  
      // Optional: Token transfers
      const tokenTxReq = includeTokenTransfers
        ? axios.get(config.url, {
            params: {
              module: "account",
              action: "tokentx",
              address: address.toLowerCase(),
              startblock: 0,
              endblock: 99999999,
              page: 1,
              offset: limit,
              sort: "desc",
              apikey: config.key
            },
            timeout: 15000
          })
        : null;
  
      const [regularRes, tokenRes] = await Promise.allSettled([
        regularTxReq,
        tokenTxReq
      ]);
  
      let allTxs = [];
  
      if (regularRes.status === "fulfilled" && Array.isArray(regularRes.value.data.result)) {
        allTxs.push(
          ...regularRes.value.data.result.map(tx => ({ ...tx, type: "regular" }))
        );
      }
  
      if (
        includeTokenTransfers &&
        tokenRes &&
        tokenRes.status === "fulfilled" &&
        Array.isArray(tokenRes.value.data.result)
      ) {
        allTxs.push(
          ...tokenRes.value.data.result.map(tx => ({ ...tx, type: "token" }))
        );
      }
  
      // Remove duplicates by hash
      const uniqueTxs = Array.from(new Map(allTxs.map(tx => [tx.hash, tx])).values());
  
      // Sort by timestamp (desc)
      const sortedTxs = uniqueTxs.sort(
        (a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp)
      );
  
      const formattedTxs = sortedTxs.slice(0, limit).map(formatEtherscanTx);
  
      return {
        success: true,
        address,
        network,
        total: sortedTxs.length,
        returned: formattedTxs.length,
        transactions: formattedTxs,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("❌ Error fetching transactions:", error.message);
      return {
        success: false,
        error: error.message,
        network,
        transactions: []
      };
    }
  }
  

  // Get historical transactions (existing API-based method)
  async getHistoricalTransactions(address, network = "ethereum", options = {}) {
    try {
      const { 
        limit = 50, 
        startBlock = 0, 
        endBlock = "latest", 
        includeTokenTransfers = true 
      } = options;
      
      const config = ETHERSCAN_APIS[network];
      
      if (!config) {
        return {
          success: false,
          error: `Unsupported network: ${network}`,
          supportedNetworks: Object.keys(ETHERSCAN_APIS),
          transactions: []
        };
      }

      console.log(`📚 Fetching HISTORICAL transactions from API...`);
      
      // Debug API configuration
      this.debugApiConfig(network);

      // Calculate the maximum number of transactions to fetch
      const maxOffset = Math.min(limit, 10000); // API limit is usually 10,000

      // Make API calls to get historical transactions
      const apiCalls = [
        // Regular transactions
        this.makeApiRequest(config.url, {
          module: "account",
          action: "txlist",
          address: address.toLowerCase(),
          startblock: startBlock,
          endblock: endBlock,
          page: 1,
          offset: maxOffset,
          sort: "desc", // Latest first
          apikey: config.key
        }, network)
      ];

      // Add internal transactions if requested
      if (includeTokenTransfers) {
        apiCalls.push(
          this.makeApiRequest(config.url, {
            module: "account",
            action: "txlistinternal",
            address: address.toLowerCase(),
            startblock: startBlock,
            endblock: endBlock,
            page: 1,
            offset: Math.min(maxOffset, 5000),
            sort: "desc",
            apikey: config.key
          }, network)
        );

        // Token transfers (ERC-20)
        apiCalls.push(
          this.makeApiRequest(config.url, {
            module: "account",
            action: "tokentx",
            address: address.toLowerCase(),
            startblock: startBlock,
            endblock: endBlock,
            page: 1,
            offset: Math.min(maxOffset, 5000),
            sort: "desc",
            apikey: config.key
          }, network)
        );
      }

      console.log("🚀 Making API calls for historical transactions...");
      const responses = await Promise.allSettled(apiCalls);

      let allTransactions = [];

      // Process regular transactions
      if (responses[0].status === 'fulfilled') {
        const regularTxs = responses[0].value.result || [];
        console.log(`📥 Found ${regularTxs.length} regular transactions`);
        allTransactions = allTransactions.concat(regularTxs.map(tx => ({ ...tx, type: 'regular' })));
      } else {
        console.warn("⚠️ Regular transactions API call failed:", responses[0].reason?.message);
      }

      // Process internal transactions
      if (responses[1] && responses[1].status === 'fulfilled') {
        const internalTxs = responses[1].value.result || [];
        console.log(`📥 Found ${internalTxs.length} internal transactions`);
        allTransactions = allTransactions.concat(internalTxs.map(tx => ({ ...tx, type: 'internal' })));
      } else if (responses[1]) {
        console.warn("⚠️ Internal transactions API call failed:", responses[1].reason?.message);
      }

      // Process token transfers
      if (responses[2] && responses[2].status === 'fulfilled') {
        const tokenTxs = responses[2].value.result || [];
        console.log(`📥 Found ${tokenTxs.length} token transfers`);
        allTransactions = allTransactions.concat(tokenTxs.map(tx => ({ ...tx, type: 'token' })));
      } else if (responses[2]) {
        console.warn("⚠️ Token transfers API call failed:", responses[2].reason?.message);
      }

      // Remove duplicates and sort by timestamp (latest first)
      const uniqueTxs = Array.from(
        new Map(allTransactions.map(tx => [tx.hash, tx])).values()
      ).sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp));

      console.log(`🔍 Total unique historical transactions: ${uniqueTxs.length}`);

      // Format transactions
      const formattedTxs = uniqueTxs
        .map(tx => {
          try {
            return formatEtherscanTx(tx);
          } catch (error) {
            console.error(`❌ Error formatting transaction ${tx.hash}:`, error);
            return null;
          }
        })
        .filter(tx => tx !== null);

      return {
        success: true,
        transactions: formattedTxs,
        total: formattedTxs.length
      };

    } catch (err) {
      console.error("❌ Error fetching historical transactions:", err);
      return {
        success: false,
        error: err.message || "Unknown error occurred",
        transactions: []
      };
    }
  }

  // Get transaction by hash
  async getTransactionByHash(hash, network = "ethereum") {
    try {
      const config = ETHERSCAN_APIS[network];
      
      if (!config) {
        return await this.getTransactionByHashUsingRPC(hash, network);
      }

      this.debugApiConfig(network);

      const response = await this.makeApiRequest(config.url, {
        module: "proxy",
        action: "eth_getTransactionByHash",
        txhash: hash,
        apikey: config.key
      }, network);

      if (!response.result) {
        return {
          success: false,
          error: "Transaction not found"
        };
      }

      const tx = response.result;
      
      // Get transaction receipt for additional info
      const receiptResponse = await this.makeApiRequest(config.url, {
        module: "proxy",
        action: "eth_getTransactionReceipt",
        txhash: hash,
        apikey: config.key
      }, network);

      const receipt = receiptResponse.result;

      return {
        success: true,
        transaction: {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatEther(BigInt(tx.value || "0")),
          gasUsed: receipt ? receipt.gasUsed : "0",
          gasPrice: ethers.formatUnits(BigInt(tx.gasPrice || "0"), "gwei") + " Gwei",
          blockNumber: parseInt(tx.blockNumber, 16),
          blockHash: tx.blockHash,
          nonce: parseInt(tx.nonce, 16),
          status: receipt ? (receipt.status === "0x1" ? "Success" : "Failed") : "Pending",
          confirmations: receipt ? "Confirmed" : "Pending"
        },
        network
      };

    } catch (error) {
      console.error("Error getting transaction by hash:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get transaction by hash using RPC (fallback for custom networks)
  async getTransactionByHashUsingRPC(hash, network) {
    try {
      const provider = this.getProvider(network);
      
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(hash),
        provider.getTransactionReceipt(hash)
      ]);

      if (!tx) {
        return {
          success: false,
          error: "Transaction not found"
        };
      }

      return {
        success: true,
        transaction: {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: ethers.formatEther(tx.value),
          gasUsed: receipt ? receipt.gasUsed.toString() : "0",
          gasPrice: ethers.formatUnits(tx.gasPrice, "gwei") + " Gwei",
          blockNumber: tx.blockNumber,
          blockHash: tx.blockHash,
          nonce: tx.nonce,
          status: receipt ? (receipt.status === 1 ? "Success" : "Failed") : "Pending",
          confirmations: receipt ? "Confirmed" : "Pending"
        },
        network
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get balance
  async getBalance(address, network = "ethereum") {
    try {
      const config = ETHERSCAN_APIS[network];
      const provider = this.getProvider(network);
  
      const rawBalance = await provider.getBalance(address);
      const balance = ethers.formatEther(rawBalance);
  
      const networkConfig = this.networkConfigs[network];
  
      // 🔥 Fetch price in USD
      const coingeckoId = {
        ethereum: "ethereum",
        bsc: "binancecoin",
        polygon: "matic-network",
        arbitrum: "ethereum",
        avalanche: "avalanche-2",
        linea: "ethereum",    // Same native asset
        fantom: "fantom",
        base: "ethereum",     
        optimism: "ethereum"
      }[network];
  
      let usdPrice = 0;
      try {
        const priceRes = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price`,
          {
            params: {
              ids: coingeckoId,
              vs_currencies: "usd"
            }
          }
        );
        usdPrice = priceRes.data[coingeckoId]?.usd || 0;
      } catch (err) {
        console.warn("⚠️ Failed to fetch USD price from CoinGecko:", err.message);
      }
  
      const balanceInUSD = (parseFloat(balance) * usdPrice).toFixed(2);
  
      return {
        success: true,
        balance,
        balanceWei: rawBalance.toString(),
        usdPrice: usdPrice.toFixed(2),
        balanceUSD: balanceInUSD,
        symbol: networkConfig.symbol,
        network,
        address,
        timestamp: new Date().toISOString()
      };
  
    } catch (error) {
      return {
        success: false,
        error: error.message,
        network,
        address
      };
    }
  }
  

  // Clear cache
  clearCache() {
    this.realtimeCache.clear();
    console.log("🧹 Real-time cache cleared");
  }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.realtimeCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.realtimeCache.keys())
    };
  }
}

module.exports = new RPCTransactionService();