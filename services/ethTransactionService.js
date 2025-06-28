
// Updated ethTransactionService.js - Simplified for Latest Transactions
const axios = require("axios");
const ALCHEMY = process.env.ALCHEMY_ETH_MAINNET;

const getETHTransactions = async (address, limit = 10) => {
  try {
    console.log("Fetching latest ETH transactions for:", address);

    // Get outgoing transactions
    const outgoingRes = await axios.post(ALCHEMY, {
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0",
        toBlock: "latest",
        fromAddress: address,
        category: ["external", "internal"],
        maxCount: `0x${Math.min(limit * 2, 1000).toString(16)}`, // Get more to ensure we have enough after combining
        excludeZeroValue: false,
        order: "desc" // Latest first
      }],
      id: 1
    });

    // Get incoming transactions
    const incomingRes = await axios.post(ALCHEMY, {
      jsonrpc: "2.0",
      method: "alchemy_getAssetTransfers",
      params: [{
        fromBlock: "0x0", 
        toBlock: "latest",
        toAddress: address,
        category: ["external", "internal"],
        maxCount: `0x${Math.min(limit * 2, 1000).toString(16)}`,
        excludeZeroValue: false,
        order: "desc" // Latest first
      }],
      id: 2
    });

    // Combine and process transactions
    const outgoingTransfers = outgoingRes.data.result?.transfers || [];
    const incomingTransfers = incomingRes.data.result?.transfers || [];
    
    const allTransfers = [...outgoingTransfers, ...incomingTransfers];

    if (allTransfers.length > 0) {
      // Remove duplicates and get latest transactions
      const uniqueTransfers = allTransfers.filter((transfer, index, self) => 
        index === self.findIndex(t => t.hash === transfer.hash && t.uniqueId === transfer.uniqueId)
      );

      const transactions = uniqueTransfers
        .filter(transfer => transfer && transfer.hash)
        .sort((a, b) => {
          // Sort by block number (latest first)
          const blockA = parseInt(a.blockNum, 16) || 0;
          const blockB = parseInt(b.blockNum, 16) || 0;
          return blockB - blockA;
        })
        .slice(0, limit) // Take only the requested number of latest transactions
        .map(transfer => {
          const timestamp = transfer.metadata?.blockTimestamp || new Date().toISOString();
          const blockNumber = transfer.blockNum ? parseInt(transfer.blockNum, 16) : 0;
          
          return {
            hash: transfer.hash,
            timestamp: timestamp,
            blockNumber: blockNumber,
            from: transfer.from || 'Unknown',
            to: transfer.to || 'Unknown',
            value: parseFloat(transfer.value || 0),
            asset: transfer.asset || 'ETH',
            category: transfer.category || 'external',
            type: (transfer.from && transfer.from.toLowerCase() === address.toLowerCase()) ? 'sent' : 'received'
          };
        });

      return { symbol: "ETH", transactions };
    }

    return { symbol: "ETH", transactions: [], info: "No transactions found for this address" };

  } catch (err) {
    console.error("Error fetching ETH transactions:", err.message);
    return { symbol: "ETH", transactions: [], error: err.message };
  }
};

module.exports = { getETHTransactions };