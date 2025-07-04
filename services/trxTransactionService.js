// services/trxTransactionService.js
const axios = require("axios");
const crypto = require("crypto");

const TRON_API_KEY = process.env.TRON_API_KEY;
const TRONGRID_API_URL = "https://api.trongrid.io/v1/accounts";

// Base58 alphabet used by TRON
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Manual Base58 to hex conversion for TRON addresses
const base58ToHex = (base58) => {
  if (!base58) return '';
  
  try {
    // Convert base58 to big integer
    let num = BigInt(0);
    let multi = BigInt(1);
    
    for (let i = base58.length - 1; i >= 0; i--) {
      const char = base58[i];
      const index = BASE58_ALPHABET.indexOf(char);
      if (index === -1) throw new Error('Invalid base58 character');
      
      num += BigInt(index) * multi;
      multi *= BigInt(58);
    }
    
    // Convert to hex
    let hex = num.toString(16);
    
    // Add leading zeros for leading '1's in base58
    for (let i = 0; i < base58.length && base58[i] === '1'; i++) {
      hex = '00' + hex;
    }
    
    // Remove checksum (last 8 characters) and return the address part
    if (hex.length >= 8) {
      hex = hex.slice(0, -8);
    }
    
    return hex;
  } catch (error) {
    console.error('Error converting base58 to hex:', error.message);
    return '';
  }
};

// Helper function to normalize address for comparison
const normalizeAddress = (address) => {
  if (!address) return '';
  
  try {
    // Convert to lowercase for comparison
    let normalized = address.toLowerCase();
    
    // If it's already a hex address (41...), return as is
    if (normalized.startsWith('41') && normalized.length === 42) {
      return normalized;
    }
    
    // If it's a base58 address (starts with 'T'), convert to hex
    if (normalized.startsWith('t')) {
      // Convert base58 to hex manually
      const hexAddress = base58ToHex(address);
      return hexAddress.toLowerCase();
    }
    
    // If it's a hex without 41 prefix, add it
    if (normalized.length === 40) {
      normalized = '41' + normalized;
    }
    
    return normalized;
  } catch (error) {
    console.error('Error normalizing address:', address, error.message);
    return address.toLowerCase();
  }
};

// Helper function to process transaction data
const processTransactionData = (tx, normalizedTargetAddress, isUnconfirmed = false) => {
  const contract = tx.raw_data?.contract?.[0];
  const contractType = contract?.type;
  let fromAddress = '';
  let toAddress = '';
  let value = 0;
  let transactionType = 'unknown';

  if (contractType === 'TransferContract') {
    fromAddress = contract.parameter.value.owner_address;
    toAddress = contract.parameter.value.to_address;
    value = (contract.parameter.value.amount || 0) / 1e6; // Convert from Sun to TRX
    
    // Normalize addresses for comparison
    const normalizedFromAddress = normalizeAddress(fromAddress);
    const normalizedToAddress = normalizeAddress(toAddress);
    
    console.log(`Transaction ${tx.txID.substring(0, 8)}... (${isUnconfirmed ? 'UNCONFIRMED' : 'CONFIRMED'}):`);
    console.log(`  Target: ${normalizedTargetAddress}`);
    console.log(`  From: ${normalizedFromAddress}`);
    console.log(`  To: ${normalizedToAddress}`);
    
    // Compare addresses
    if (normalizedFromAddress === normalizedTargetAddress) {
      transactionType = 'sent';
      console.log(`  -> SENT (from matches target)`);
    } else if (normalizedToAddress === normalizedTargetAddress) {
      transactionType = 'received';
      console.log(`  -> RECEIVED (to matches target)`);
    } else {
      transactionType = 'other';
      console.log(`  -> OTHER (neither matches target)`);
    }
  } else if (contractType === 'TriggerSmartContract') {
    // For smart contract transactions
    const contractParameter = contract.parameter.value;
    if (contractParameter) {
      fromAddress = contractParameter.owner_address || '';
      toAddress = contractParameter.contract_address || '';
      
      const normalizedFromAddress = normalizeAddress(fromAddress);
      
      if (normalizedFromAddress === normalizedTargetAddress) {
        transactionType = 'sent'; // User initiated the smart contract call
      } else {
        transactionType = 'other';
      }
    }
  } else if (contractType === 'DelegateResourceContract') {
    const contractParameter = contract.parameter.value;
    if (contractParameter) {
      fromAddress = contractParameter.owner_address || '';
      toAddress = contractParameter.receiver_address || '';
      
      const normalizedFromAddress = normalizeAddress(fromAddress);
      const normalizedToAddress = normalizeAddress(toAddress);
      
      if (normalizedFromAddress === normalizedTargetAddress) {
        transactionType = 'sent';
      } else if (normalizedToAddress === normalizedTargetAddress) {
        transactionType = 'received';
      } else {
        transactionType = 'other';
      }
    }
  } else if (contractType === 'UnDelegateResourceContract') {
    const contractParameter = contract.parameter.value;
    if (contractParameter) {
      fromAddress = contractParameter.owner_address || '';
      toAddress = contractParameter.receiver_address || '';
      
      const normalizedFromAddress = normalizeAddress(fromAddress);
      const normalizedToAddress = normalizeAddress(toAddress);
      
      if (normalizedFromAddress === normalizedTargetAddress) {
        transactionType = 'sent';
      } else if (normalizedToAddress === normalizedTargetAddress) {
        transactionType = 'received';
      } else {
        transactionType = 'other';
      }
    }
  } else if (contractType === 'FreezeBalanceContract') {
    const contractParameter = contract.parameter.value;
    if (contractParameter) {
      fromAddress = contractParameter.owner_address || '';
      
      const normalizedFromAddress = normalizeAddress(fromAddress);
      
      if (normalizedFromAddress === normalizedTargetAddress) {
        transactionType = 'sent';
      } else {
        transactionType = 'other';
      }
    }
  } else if (contractType === 'UnfreezeBalanceContract') {
    const contractParameter = contract.parameter.value;
    if (contractParameter) {
      fromAddress = contractParameter.owner_address || '';
      
      const normalizedFromAddress = normalizeAddress(fromAddress);
      
      if (normalizedFromAddress === normalizedTargetAddress) {
        transactionType = 'sent';
      } else {
        transactionType = 'other';
      }
    }
  }

  return {
    hash: tx.txID,
    timestamp: tx.block_timestamp ? new Date(tx.block_timestamp).toISOString() : new Date().toISOString(),
    blockNumber: tx.blockNumber || null,
    from: fromAddress,
    to: toAddress,
    value: value,
    contractType: contractType,
    fee: (tx.fee || 0) / 1e6,
    energyUsage: tx.energy_usage || 0,
    netUsage: tx.net_usage || 0,
    result: tx.ret?.[0]?.contractRet || 'SUCCESS',
    type: transactionType,
    confirmed: !isUnconfirmed,
    status: isUnconfirmed ? 'pending' : 'confirmed'
  };
};

// Function to get unconfirmed transactions
const getUnconfirmedTRXTransactions = async (address, limit = 10) => {
  try {
    const normalizedTargetAddress = normalizeAddress(address);
    console.log(`Fetching unconfirmed transactions for: ${normalizedTargetAddress}`);
    
    // Get unconfirmed transactions from TronGrid API
    const response = await axios.get(`${TRONGRID_API_URL}/${address}/transactions/unconfirmed`, {
      headers: {
        'TRON-PRO-API-KEY': TRON_API_KEY,
      },
      params: {
        limit: limit
      }
    });

    if (!response.data || !response.data.data) {
      return [];
    }

    const transactions = response.data.data.map(tx => {
      return processTransactionData(tx, normalizedTargetAddress, true);
    });

    console.log(`Found ${transactions.length} unconfirmed transactions`);
    return transactions;
  } catch (err) {
    console.error("Error fetching unconfirmed TRX transactions:", err.message);
    return [];
  }
};

const getTRXTransactions = async (address, limit = 10, includeUnconfirmed = true) => {
  try {
    const normalizedTargetAddress = normalizeAddress(address);
    console.log(`Original address: ${address}`);
    console.log(`Target address for comparison: ${normalizedTargetAddress}`);
    
    // Get confirmed TRX transactions from TronGrid API
    const response = await axios.get(`${TRONGRID_API_URL}/${address}/transactions`, {
      headers: {
        'TRON-PRO-API-KEY': TRON_API_KEY,
      },
      params: {
        limit: limit,
        order_by: 'timestamp,desc' // Get latest transactions first
      }
    });

    if (!response.data || !response.data.data) {
      return { symbol: "TRX", transactions: [], error: "Invalid response from TRON API" };
    }

    // Process confirmed transactions
    const confirmedTransactions = response.data.data.map(tx => {
      return processTransactionData(tx, normalizedTargetAddress, false);
    });

    let allTransactions = [...confirmedTransactions];
    let unconfirmedTransactions = [];

    // Get unconfirmed transactions if requested
    if (includeUnconfirmed) {
      unconfirmedTransactions = await getUnconfirmedTRXTransactions(address, limit);
      allTransactions = [...unconfirmedTransactions, ...confirmedTransactions];
    }

    // Sort all transactions by timestamp (newest first)
    allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Separate transactions by type
    const sentTransactions = allTransactions.filter(tx => tx.type === 'sent');
    const receivedTransactions = allTransactions.filter(tx => tx.type === 'received');
    const otherTransactions = allTransactions.filter(tx => tx.type === 'other');
    const unknownTransactions = allTransactions.filter(tx => tx.type === 'unknown');

    console.log(`Final classification:
      Total: ${allTransactions.length}
      Confirmed: ${confirmedTransactions.length}
      Unconfirmed: ${unconfirmedTransactions.length}
      Sent: ${sentTransactions.length}
      Received: ${receivedTransactions.length}
      Other: ${otherTransactions.length}
      Unknown: ${unknownTransactions.length}`);

    return { 
      symbol: "TRX", 
      transactions: allTransactions, // All transactions (confirmed + unconfirmed)
      confirmedTransactions: confirmedTransactions,
      unconfirmedTransactions: unconfirmedTransactions,
      sentTransactions: sentTransactions,
      receivedTransactions: receivedTransactions,
      otherTransactions: otherTransactions,
      unknownTransactions: unknownTransactions,
      summary: {
        total: allTransactions.length,
        confirmed: confirmedTransactions.length,
        unconfirmed: unconfirmedTransactions.length,
        sent: sentTransactions.length,
        received: receivedTransactions.length,
        other: otherTransactions.length,
        unknown: unknownTransactions.length
      }
    };
  } catch (err) {
    console.error("Error fetching TRX transactions:", err.message);
    return { symbol: "TRX", transactions: [], error: err.message };
  }
};

// Function to get only sent transactions (including unconfirmed)
const getSentTRXTransactions = async (address, limit = 10, includeUnconfirmed = true) => {
  try {
    const result = await getTRXTransactions(address, limit, includeUnconfirmed);
    
    if (result.error) {
      return { symbol: "TRX", transactions: [], error: result.error };
    }
    
    return {
      symbol: "TRX",
      transactions: result.sentTransactions || [],
      count: result.sentTransactions?.length || 0,
      summary: {
        total: result.sentTransactions?.length || 0,
        confirmed: result.sentTransactions?.filter(tx => tx.confirmed).length || 0,
        unconfirmed: result.sentTransactions?.filter(tx => !tx.confirmed).length || 0
      }
    };
  } catch (err) {
    console.error("Error fetching sent TRX transactions:", err.message);
    return { symbol: "TRX", transactions: [], error: err.message };
  }
};

// Function to get only received transactions (including unconfirmed)
const getReceivedTRXTransactions = async (address, limit = 10, includeUnconfirmed = true) => {
  try {
    const result = await getTRXTransactions(address, limit, includeUnconfirmed);
    
    if (result.error) {
      return { symbol: "TRX", transactions: [], error: result.error };
    }
    
    return {
      symbol: "TRX",
      transactions: result.receivedTransactions || [],
      count: result.receivedTransactions?.length || 0,
      summary: {
        total: result.receivedTransactions?.length || 0,
        confirmed: result.receivedTransactions?.filter(tx => tx.confirmed).length || 0,
        unconfirmed: result.receivedTransactions?.filter(tx => !tx.confirmed).length || 0
      }
    };
  } catch (err) {
    console.error("Error fetching received TRX transactions:", err.message);
    return { symbol: "TRX", transactions: [], error: err.message };
  }
};

// Function to get only unconfirmed transactions
const getOnlyUnconfirmedTRXTransactions = async (address, limit = 10) => {
  try {
    const normalizedTargetAddress = normalizeAddress(address);
    const unconfirmedTransactions = await getUnconfirmedTRXTransactions(address, limit);
    
    // Separate unconfirmed transactions by type
    const sentTransactions = unconfirmedTransactions.filter(tx => tx.type === 'sent');
    const receivedTransactions = unconfirmedTransactions.filter(tx => tx.type === 'received');
    const otherTransactions = unconfirmedTransactions.filter(tx => tx.type === 'other');
    const unknownTransactions = unconfirmedTransactions.filter(tx => tx.type === 'unknown');
    
    return {
      symbol: "TRX",
      transactions: unconfirmedTransactions,
      sentTransactions: sentTransactions,
      receivedTransactions: receivedTransactions,
      otherTransactions: otherTransactions,
      unknownTransactions: unknownTransactions,
      summary: {
        total: unconfirmedTransactions.length,
        sent: sentTransactions.length,
        received: receivedTransactions.length,
        other: otherTransactions.length,
        unknown: unknownTransactions.length
      }
    };
  } catch (err) {
    console.error("Error fetching unconfirmed TRX transactions:", err.message);
    return { symbol: "TRX", transactions: [], error: err.message };
  }
};

module.exports = { 
  getTRXTransactions, 
  getSentTRXTransactions, 
  getReceivedTRXTransactions,
  getOnlyUnconfirmedTRXTransactions,
  getUnconfirmedTRXTransactions
};