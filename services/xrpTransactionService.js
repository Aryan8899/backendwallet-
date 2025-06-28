// xrpTransactionService.js
const axios = require('axios');

const getXRPTransactions = async (address, limit = 10) => {
  try {
    const response = await axios.get(
      `https://data.ripple.com/v2/accounts/${address}/transactions?limit=${limit}&type=Payment`
    );

    if (!response.data || !response.data.transactions) {
      return { symbol: "XRP", transactions: [], error: "Invalid response from Ripple API" };
    }

    const transactions = response.data.transactions.map(tx => ({
      hash: tx.hash,
      timestamp: tx.date,
      ledgerIndex: tx.ledger_index,
      from: tx.Account,
      to: tx.Destination,
      value: parseFloat(tx.Amount) / 1e6, // Convert drops to XRP
      fee: parseFloat(tx.Fee) / 1e6,
      status: tx.meta && tx.meta.TransactionResult === 'tesSUCCESS' ? 'Success' : 'Failed',
      type: tx.Account.toLowerCase() === address.toLowerCase() ? 'sent' : 'received'
    }));

    return { symbol: "XRP", transactions };
  } catch (err) {
    console.error("Error fetching XRP transactions:", err.message);
    return { symbol: "XRP", transactions: [], error: err.message };
  }
};

module.exports = { getXRPTransactions };
