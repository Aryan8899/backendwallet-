// Fast and Efficient ETH Transaction Service
const axios = require("axios");
const ALCHEMY = process.env.ETH_RPC_URL;

const getETHTransactions = async (address, limit = 10, type = 'all', page = 1) => {
  try {
    console.log("=== Getting ETH Transactions (Fast Method) ===");
    console.log("Address:", address);
    console.log("Type:", type);
    console.log("Limit:", limit);
    console.log("Page:", page);

    const normalizedAddress = address.toLowerCase();

    // Get current block number for confirmation calculation
    const getCurrentBlockNumber = async () => {
      try {
        const response = await axios.post(ALCHEMY, {
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1
        });
        return parseInt(response.data.result, 16);
      } catch (err) {
        console.log("Error getting current block number:", err.message);
        return 0;
      }
    };

    const currentBlockNumber = await getCurrentBlockNumber();

    // Method 1: Use Alchemy's getAssetTransfers (Most Efficient)
    const getTransactionsWithAlchemyTransfers = async () => {
      console.log("Using Alchemy getAssetTransfers...");
      
      try {
        // Calculate pagination
        const pageSize = limit;
        const offset = (page - 1) * pageSize;
        
        // Prepare parameters based on transaction type
        let params = {
          fromBlock: "0x0",
          toBlock: "latest",
          order: "desc",
          withMetadata: true,
          excludeZeroValue: false,
          maxCount: `0x${Math.min(pageSize * 2, 1000).toString(16)}` // Get more than needed for filtering
        };

        // Set from/to addresses based on type
        if (type === 'sent') {
          params.fromAddress = address;
        } else if (type === 'received') {
          params.toAddress = address;
        } else {
          // For 'all', we need to make two separate calls and combine
          params.fromAddress = address;
        }

        // Add category filters
        params.category = ["external", "internal", "erc20", "erc721", "erc1155"];

        let allTransfers = [];

        // Get sent transactions
        if (type === 'sent' || type === 'all') {
          const sentResponse = await axios.post(ALCHEMY, {
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [{
              ...params,
              fromAddress: address,
              toAddress: undefined
            }],
            id: 1
          });

          if (sentResponse.data.result && sentResponse.data.result.transfers) {
            allTransfers = [...allTransfers, ...sentResponse.data.result.transfers];
          }
        }

        // Get received transactions
        if (type === 'received' || type === 'all') {
          const receivedResponse = await axios.post(ALCHEMY, {
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [{
              ...params,
              fromAddress: undefined,
              toAddress: address
            }],
            id: 2
          });

          if (receivedResponse.data.result && receivedResponse.data.result.transfers) {
            allTransfers = [...allTransfers, ...receivedResponse.data.result.transfers];
          }
        }

        console.log(`Found ${allTransfers.length} total transfers`);

        // Filter for ETH only and format
        const ethTransfers = allTransfers
          .filter(transfer => transfer.asset === "ETH" || (!transfer.asset && transfer.value > 0))
          .map(transfer => {
            const fromAddr = (transfer.from || '').toLowerCase();
            const toAddr = (transfer.to || '').toLowerCase();
            const confirmationCount = currentBlockNumber - parseInt(transfer.blockNum, 16);
            
            return {
              hash: transfer.hash,
              blockNumber: parseInt(transfer.blockNum, 16),
              transactionIndex: transfer.transactionIndex || 0,
              timestamp: transfer.metadata?.blockTimestamp ? 
                new Date(transfer.metadata.blockTimestamp).toISOString() : 
                new Date().toISOString(),
              from: transfer.from,
              to: transfer.to,
              value: parseFloat(transfer.value || '0'),
              gasUsed: 0,
              gasPrice: 0,
              type: fromAddr === normalizedAddress ? 'sent' : 'received',
              asset: 'ETH',
              category: transfer.category || 'external',
              nonce: 0,
              uniqueId: transfer.uniqueId || transfer.hash,
              
              // BOOLEAN CONFIRMATION - Choose one of these approaches:
              
              // Option 1: Simple boolean (12+ confirmations = confirmed)
              confirmed: confirmationCount >= 12,
              
              // Option 2: Multiple confirmation levels
              confirmationStatus: {
                confirmed: confirmationCount >= 12,
                safeConfirmed: confirmationCount >= 6,
                finalConfirmed: confirmationCount >= 64,
                confirmationCount: confirmationCount
              },
              
              // Option 3: Just true/false based on minimum confirmations
              // isConfirmed: confirmationCount >= 1, // 1+ blocks = confirmed
              
              // Keep the original number if needed for debugging
              confirmations: confirmationCount
            };
          });

        return ethTransfers;

      } catch (err) {
        console.log("Alchemy getAssetTransfers error:", err.message);
        return [];
      }
    };

    // Method 2: Use Etherscan API (if you have API key)
    const getTransactionsWithEtherscan = async () => {
      console.log("Using Etherscan API fallback...");
      
      // This requires ETHERSCAN_API_KEY in environment
      const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
      if (!ETHERSCAN_API_KEY) {
        console.log("No Etherscan API key found");
        return [];
      }

      try {
        const pageSize = limit;
        const pageNum = page;
        
        let url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${pageNum}&offset=${pageSize}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

        if (type === 'sent') {
          // Etherscan doesn't have direct sent/received filters, we'll filter after
        }

        const response = await axios.get(url);
        
        if (response.data.status === '1' && response.data.result) {
          const transactions = response.data.result.map(tx => {
            const fromAddr = (tx.from || '').toLowerCase();
            const toAddr = (tx.to || '').toLowerCase();
            const confirmationCount = parseInt(tx.confirmations);
            
            return {
              hash: tx.hash,
              blockNumber: parseInt(tx.blockNumber),
              transactionIndex: parseInt(tx.transactionIndex),
              timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
              from: tx.from,
              to: tx.to,
              value: parseFloat(tx.value) / Math.pow(10, 18), // Convert wei to ETH
              gasUsed: parseInt(tx.gasUsed),
              gasPrice: parseInt(tx.gasPrice),
              type: fromAddr === normalizedAddress ? 'sent' : 'received',
              asset: 'ETH',
              category: 'external',
              nonce: parseInt(tx.nonce),
              
              // BOOLEAN CONFIRMATION
              confirmed: confirmationCount >= 12,
              confirmationStatus: {
                confirmed: confirmationCount >= 12,
                safeConfirmed: confirmationCount >= 6,
                finalConfirmed: confirmationCount >= 64,
                confirmationCount: confirmationCount
              },
              confirmations: confirmationCount
            };
          });

          // Filter by type
          if (type === 'sent') {
            return transactions.filter(tx => tx.type === 'sent');
          } else if (type === 'received') {
            return transactions.filter(tx => tx.type === 'received');
          }
          
          return transactions;
        }
      } catch (err) {
        console.log("Etherscan API error:", err.message);
        return [];
      }
      
      return [];
    };

    // Method 3: Use Moralis API (if you have API key)
    const getTransactionsWithMoralis = async () => {
      console.log("Using Moralis API fallback...");
      
      const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
      if (!MORALIS_API_KEY) {
        console.log("No Moralis API key found");
        return [];
      }

      try {
        const pageSize = limit;
        const offset = (page - 1) * pageSize;
        
        let url = `https://deep-index.moralis.io/api/v2.2/${address}?chain=eth&limit=${pageSize}&offset=${offset}`;

        const response = await axios.get(url, {
          headers: {
            'X-API-Key': MORALIS_API_KEY
          }
        });

        if (response.data.result) {
          const transactions = response.data.result.map(tx => {
            const fromAddr = (tx.from_address || '').toLowerCase();
            const toAddr = (tx.to_address || '').toLowerCase();
            const confirmationCount = currentBlockNumber - parseInt(tx.block_number);
            
            return {
              hash: tx.hash,
              blockNumber: parseInt(tx.block_number),
              transactionIndex: parseInt(tx.transaction_index),
              timestamp: new Date(tx.block_timestamp).toISOString(),
              from: tx.from_address,
              to: tx.to_address,
              value: parseFloat(tx.value) / Math.pow(10, 18), // Convert wei to ETH
              gasUsed: parseInt(tx.gas_used || 0),
              gasPrice: parseInt(tx.gas_price || 0),
              type: fromAddr === normalizedAddress ? 'sent' : 'received',
              asset: 'ETH',
              category: 'external',
              nonce: parseInt(tx.nonce || 0),
              
              // BOOLEAN CONFIRMATION
              confirmed: confirmationCount >= 12,
              confirmationStatus: {
                confirmed: confirmationCount >= 12,
                safeConfirmed: confirmationCount >= 6,
                finalConfirmed: confirmationCount >= 64,
                confirmationCount: confirmationCount
              },
              confirmations: confirmationCount
            };
          });

          // Filter by type
          if (type === 'sent') {
            return transactions.filter(tx => tx.type === 'sent');
          } else if (type === 'received') {
            return transactions.filter(tx => tx.type === 'received');
          }
          
          return transactions;
        }
      } catch (err) {
        console.log("Moralis API error:", err.message);
        return [];
      }
      
      return [];
    };

    // Try methods in order of preference
    let allTransactions = [];

    // Try Alchemy first (fastest)
    allTransactions = await getTransactionsWithAlchemyTransfers();
    
    // Try Etherscan if Alchemy fails
    if (allTransactions.length === 0) {
      allTransactions = await getTransactionsWithEtherscan();
    }
    
    // Try Moralis if both fail
    if (allTransactions.length === 0) {
      allTransactions = await getTransactionsWithMoralis();
    }

    console.log("Total transactions found:", allTransactions.length);

    if (allTransactions.length === 0) {
      return {
        symbol: "ETH",
        transactions: [],
        info: "No transactions found for this address",
        pagination: {
          currentPage: page,
          itemsPerPage: limit,
          totalItems: 0,
          totalPages: 0
        }
      };
    }

    // Remove duplicates by hash
    const uniqueTransactions = allTransactions.filter((tx, index, self) =>
      index === self.findIndex(t => t.hash === tx.hash)
    );

    console.log("Unique transactions:", uniqueTransactions.length);

    // Sort by block number (latest first), then by transaction index
    uniqueTransactions.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return b.blockNumber - a.blockNumber;
      }
      return b.transactionIndex - a.transactionIndex;
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = uniqueTransactions.slice(startIndex, endIndex);

    // Log results
    console.log("\n=== Final Results ===");
    paginatedTransactions.forEach((tx, i) => {
      console.log(`${i + 1}. Hash: ${tx.hash}`);
      console.log(`   Block: ${tx.blockNumber}, Index: ${tx.transactionIndex}`);
      console.log(`   From: ${tx.from} To: ${tx.to}`);
      console.log(`   Value: ${tx.value} ETH, Type: ${tx.type}`);
      console.log(`   Confirmed: ${tx.confirmed} (${tx.confirmations} confirmations)`);
      console.log(`   Timestamp: ${tx.timestamp}`);
      console.log('');
    });

    return {
      symbol: "ETH",
      transactions: paginatedTransactions,
      totalFound: uniqueTransactions.length,
      requestedType: type,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: uniqueTransactions.length,
        totalPages: Math.ceil(uniqueTransactions.length / limit),
        hasNextPage: endIndex < uniqueTransactions.length,
        hasPreviousPage: page > 1
      }
    };

  } catch (err) {
    console.error("=== ERROR ===");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    
    return {
      symbol: "ETH",
      transactions: [],
      error: err.message,
      requestedType: type,
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: 0,
        totalPages: 0
      }
    };
  }
};

module.exports = { getETHTransactions };