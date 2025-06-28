// =====================================
// Updated dogeTransactionService.js - Ensure Latest Transactions
const axios = require("axios");

const BLOCKCYPHER_API = "https://api.blockcypher.com/v1/doge/main";
const API_TOKEN = process.env.BLOCKCYPHER_API_TOKEN || "fee568d35a7d43e0a2d175e6de4eb483";

const getDOGETransactions = async (address, limit = 10) => {
  try {
    const response = await axios.get(
      `${BLOCKCYPHER_API}/addrs/${address}/full?limit=${limit}`,
      {
        params: { token: API_TOKEN }
      }
    );

    if (!response.data.txs) {
      return { symbol: "DOGE", transactions: [], error: "No transactions found" };
    }

    const transactions = response.data.txs
      .sort((a, b) => new Date(b.received) - new Date(a.received)) // Ensure latest first
      .slice(0, limit)
      .map(tx => {
        const isIncoming = tx.outputs.some(output => output.addresses && output.addresses.includes(address));
        const isOutgoing = tx.inputs.some(input => input.addresses && input.addresses.includes(address));

        return {
          hash: tx.hash,
          timestamp: new Date(tx.received).toISOString(),
          confirmations: tx.confirmations,
          inputs: tx.inputs.map(input => ({
            address: input.addresses?.[0] || 'Unknown',
            value: (input.output_value || 0) / 1e8
          })),
          outputs: tx.outputs.map(output => ({
            address: output.addresses?.[0] || 'Unknown',
            value: (output.value || 0) / 1e8
          })),
          fee: (tx.fees || 0) / 1e8,
          totalValue: (tx.total || 0) / 1e8,
          type: isOutgoing ? 'sent' : 'received'
        };
      });

    return { symbol: "DOGE", transactions };
  } catch (err) {
    console.error("Error fetching DOGE transactions:", err.message);
    return { symbol: "DOGE", transactions: [], error: err.message };
  }
};

module.exports = { getDOGETransactions };