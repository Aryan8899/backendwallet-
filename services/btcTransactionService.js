// =====================================
// Updated btcTransactionService.js - Ensure Latest Transactions
const axios = require("axios");
const BTC_API = process.env.BTC_API;

const getBTCTransactions = async (address, limit = 10) => {
  try {
    // Use BlockCypher API for better transaction ordering
    const res = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/full?limit=${limit}&includeScript=false`);
    
    if (!res.data.txs) {
      return { symbol: "BTC", transactions: [], error: "No transactions found" };
    }

    const transactions = res.data.txs
      .sort((a, b) => new Date(b.received) - new Date(a.received)) // Sort by latest first
      .slice(0, limit)
      .map(tx => {
        // Determine transaction type and value for this address
        const isIncoming = tx.outputs.some(output => output.addresses && output.addresses.includes(address));
        const isOutgoing = tx.inputs.some(input => input.addresses && input.addresses.includes(address));
        
        let transactionValue = 0;
        if (isIncoming && !isOutgoing) {
          // Pure incoming transaction
          transactionValue = tx.outputs
            .filter(output => output.addresses && output.addresses.includes(address))
            .reduce((sum, output) => sum + (output.value || 0), 0) / 1e8;
        } else if (isOutgoing && !isIncoming) {
          // Pure outgoing transaction
          transactionValue = tx.outputs.reduce((sum, output) => sum + (output.value || 0), 0) / 1e8;
        } else {
          // Self-transaction or complex transaction
          transactionValue = tx.total / 1e8;
        }

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
          totalValue: transactionValue,
          type: isOutgoing ? 'sent' : 'received'
        };
      });

    return { symbol: "BTC", transactions };
  } catch (err) {
    console.error("Error fetching BTC transactions:", err.message);
    return { symbol: "BTC", transactions: [], error: err.message };
  }
};

module.exports = { getBTCTransactions };
