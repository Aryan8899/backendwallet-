// services/rpcTransactionService.js
const { ethers } = require("ethers");
const axios = require("axios");


 
class RPCTransactionService {
  constructor() {
    // RPC endpoints for different networks
    this.rpcEndpoints = {
      ethereum: process.env.ETH_RPC_URL ,
      bsc: process.env.BSC_RPC_URL ,
      polygon: process.env.POLYGON_RPC_URL ,
      arbitrum: process.env.ARBITRUM_RPC_URL ,
      avalanche: process.env.AVALANCHE_RPC_URL ,
      fantom: process.env.FANTOM_RPC_URL ,
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
      optimism: { chainId: 10, symbol: "ETH", decimals: 18 }
    };
  }

  // Get provider for specific network
  getProvider(network) {
    const rpcUrl = this.rpcEndpoints[network];
    if (!rpcUrl) {
      throw new Error(`Unsupported network: ${network}`);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  // Get transaction history using RPC calls
  async getTransactionHistory(address, network = "ethereum", options = {}) {
    try {
      const {
        limit = 10,
        startBlock = 0,
        endBlock = "latest",
        includeTokenTransfers = true
      } = options;

      const provider = this.getProvider(network);
      const networkConfig = this.networkConfigs[network];

      // Get current block number if endBlock is "latest"
      const currentBlock = endBlock === "latest" ? await provider.getBlockNumber() : endBlock;
      
      // Calculate block range for scanning
      const fromBlock = Math.max(startBlock, currentBlock - 10000); // Limit to last 10k blocks for performance
      const toBlock = currentBlock;

      console.log(`Scanning blocks ${fromBlock} to ${toBlock} for address ${address}`);

      const transactions = [];
      const tokenTransfers = [];

      // Method 1: Scan recent blocks for transactions
      const recentTxs = await this.scanBlocksForTransactions(
        provider, 
        address, 
        fromBlock, 
        toBlock, 
        limit
      );
      transactions.push(...recentTxs);

      // Method 2: Get token transfers if enabled
      if (includeTokenTransfers) {
        const tokenTxs = await this.getTokenTransfers(
          provider, 
          address, 
          fromBlock, 
          toBlock, 
          network
        );
        tokenTransfers.push(...tokenTxs);
      }

      // Combine and sort all transactions
      const allTransactions = [...transactions, ...tokenTransfers]
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, limit);

      return {
        success: true,
        network,
        address,
        transactions: allTransactions,
        totalFound: allTransactions.length,
        scannedBlocks: {
          from: fromBlock,
          to: toBlock,
          total: toBlock - fromBlock + 1
        }
      };

    } catch (error) {
      console.error(`Error fetching transaction history for ${network}:`, error);
      return {
        success: false,
        error: error.message,
        network,
        address,
        transactions: []
      };
    }
  }

  // Scan blocks for native transactions
  async scanBlocksForTransactions(provider, address, fromBlock, toBlock, limit) {
    const transactions = [];
    const batchSize = 100; // Process blocks in batches
    
    try {
      // Scan blocks in reverse order (newest first)
      for (let blockNum = toBlock; blockNum >= fromBlock && transactions.length < limit; blockNum -= batchSize) {
        const startBlock = Math.max(fromBlock, blockNum - batchSize + 1);
        const endBlock = blockNum;

        console.log(`Processing blocks ${startBlock} to ${endBlock}`);

        // Get blocks in batch
        const blockPromises = [];
        for (let i = startBlock; i <= endBlock; i++) {
          blockPromises.push(this.getBlockWithTransactions(provider, i));
        }

        const blocks = await Promise.allSettled(blockPromises);

        // Process each block
        for (const blockResult of blocks) {
          if (blockResult.status === 'fulfilled' && blockResult.value) {
            const block = blockResult.value;
            
            // Check each transaction in the block
            for (const tx of block.transactions || []) {
              if (transactions.length >= limit) break;

              // Check if transaction involves our address
              if (tx.from?.toLowerCase() === address.toLowerCase() || 
                  tx.to?.toLowerCase() === address.toLowerCase()) {
                
                const processedTx = await this.processTransaction(provider, tx, block, address);
                if (processedTx) {
                  transactions.push(processedTx);
                }
              }
            }
          }
        }
      }

      return transactions;
    } catch (error) {
      console.error("Error scanning blocks:", error);
      return transactions;
    }
  }

  // Get block with transactions (with retry logic)
  async getBlockWithTransactions(provider, blockNumber, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await provider.getBlock(blockNumber, true);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  // Process individual transaction
  async processTransaction(provider, tx, block, userAddress) {
    try {
      // Get transaction receipt for status and gas used
      const receipt = await provider.getTransactionReceipt(tx.hash);
      
      const isIncoming = tx.to?.toLowerCase() === userAddress.toLowerCase();
      const isOutgoing = tx.from?.toLowerCase() === userAddress.toLowerCase();

      return {
        hash: tx.hash,
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: block.timestamp,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value || "0"),
        gasPrice: ethers.formatUnits(tx.gasPrice || "0", "gwei"),
        gasLimit: tx.gasLimit?.toString(),
        gasUsed: receipt?.gasUsed?.toString(),
        status: receipt?.status === 1 ? "success" : "failed",
        nonce: tx.nonce,
        type: isIncoming ? "received" : isOutgoing ? "sent" : "unknown",
        isIncoming,
        isOutgoing,
        confirmations: await provider.getBlockNumber() - block.number,
        input: tx.data,
        transactionType: "native"
      };
    } catch (error) {
      console.error(`Error processing transaction ${tx.hash}:`, error);
      return null;
    }
  }

  // Get ERC-20 token transfers using event logs
  async getTokenTransfers(provider, address, fromBlock, toBlock, network) {
    try {
      // ERC-20 Transfer event signature
      const transferEventSignature = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      
      // Get logs for token transfers
      const logs = await provider.getLogs({
        fromBlock,
        toBlock,
        topics: [
          transferEventSignature,
          null, // from address (any)
          null  // to address (any)
        ]
      });

      const tokenTransfers = [];
      const processedTokens = new Set();

      for (const log of logs) {
        try {
          // Decode the transfer event
          const fromAddress = "0x" + log.topics[1].slice(26);
          const toAddress = "0x" + log.topics[2].slice(26);
          
          // Check if our address is involved
          if (fromAddress.toLowerCase() === address.toLowerCase() || 
              toAddress.toLowerCase() === address.toLowerCase()) {
            
            const tokenAddress = log.address;
            const amount = ethers.getBigInt(log.data);
            
            // Get token info (with caching)
            let tokenInfo;
            if (!processedTokens.has(tokenAddress)) {
              tokenInfo = await this.getTokenInfo(provider, tokenAddress);
              processedTokens.add(tokenAddress);
            }

            // Get block info
            const block = await provider.getBlock(log.blockNumber);
            const tx = await provider.getTransaction(log.transactionHash);

            const isIncoming = toAddress.toLowerCase() === address.toLowerCase();
            
            tokenTransfers.push({
              hash: log.transactionHash,
              blockNumber: log.blockNumber,
              blockHash: log.blockHash,
              timestamp: block.timestamp,
              from: fromAddress,
              to: toAddress,
              tokenAddress,
              tokenName: tokenInfo?.name || "Unknown Token",
              tokenSymbol: tokenInfo?.symbol || "???",
              tokenDecimals: tokenInfo?.decimals || 18,
              value: ethers.formatUnits(amount, tokenInfo?.decimals || 18),
              rawValue: amount.toString(),
              type: isIncoming ? "received" : "sent",
              isIncoming,
              isOutgoing: !isIncoming,
              transactionType: "token",
              logIndex: log.logIndex
            });
          }
        } catch (error) {
          console.error("Error processing token transfer log:", error);
        }
      }

      return tokenTransfers;
    } catch (error) {
      console.error("Error fetching token transfers:", error);
      return [];
    }
  }

  // Get token information (name, symbol, decimals)
  async getTokenInfo(provider, tokenAddress) {
    try {
      // ERC-20 ABI for basic info
      const erc20ABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
      ];

      const contract = new ethers.Contract(tokenAddress, erc20ABI, provider);
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => "Unknown"),
        contract.symbol().catch(() => "???"),
        contract.decimals().catch(() => 18)
      ]);

      return { name, symbol, decimals };
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error);
      return { name: "Unknown Token", symbol: "???", decimals: 18 };
    }
  }

  // Get transaction by hash
  async getTransactionByHash(txHash, network = "ethereum") {
    try {
      const provider = this.getProvider(network);
      const tx = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);
      const block = await provider.getBlock(tx.blockNumber);

      return {
        success: true,
        transaction: {
          ...tx,
          status: receipt.status === 1 ? "success" : "failed",
          gasUsed: receipt.gasUsed.toString(),
          timestamp: block.timestamp,
          confirmations: await provider.getBlockNumber() - tx.blockNumber
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get balance for address
  async getBalance(address, network = "ethereum") {
    try {
      const provider = this.getProvider(network);
      const balance = await provider.getBalance(address);
      const networkConfig = this.networkConfigs[network];

      return {
        success: true,
        balance: ethers.formatEther(balance),
        symbol: networkConfig.symbol,
        network,
        address
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

  // Add custom network support
  addCustomNetwork(networkName, config) {
    this.rpcEndpoints[networkName] = config.rpcUrl;
    this.networkConfigs[networkName] = {
      chainId: config.chainId,
      symbol: config.symbol,
      decimals: config.decimals || 18
    };
  }

  // Get supported networks
  getSupportedNetworks() {
    return Object.keys(this.networkConfigs);
  }
}

module.exports = new RPCTransactionService();