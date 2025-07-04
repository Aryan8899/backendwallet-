const axios = require("axios");
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;

const getBNBTransactions = async (address, limit = 10) => {
  try {
    const res = await axios.get(
      `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${BSCSCAN_API_KEY}`
    );

    if (res.data.status !== "1") {
      return { symbol: "BNB", transactions: [], error: "Invalid response from BscScan API" };
    }

    const transactions = res.data.result
      .sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp)) // Ensure latest first
      .slice(0, limit) // Take only the requested limit
      .map(tx => ({
        hash: tx.hash,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        blockNumber: parseInt(tx.blockNumber),
        from: tx.from,
        to: tx.to,
        value: parseFloat(tx.value) / 1e18,
        gasPrice: parseFloat(tx.gasPrice) / 1e9, // Convert to Gwei
        gasUsed: parseInt(tx.gasUsed),
        fee: (parseFloat(tx.gasPrice) * parseInt(tx.gasUsed)) / 1e18,
        status: tx.txreceipt_status === "1" ? "Success" : "Failed",
        type: tx.from.toLowerCase() === address.toLowerCase() ? 'sent' : 'received'
      }));

    return { symbol: "BNB", transactions };
  } catch (err) {
    console.error("Error fetching BNB transactions:", err.message);
    return { symbol: "BNB", transactions: [], error: err.message };
  }
};

const getSentTransactions = async (address, limit = 10) => {
  try {
    const res = await axios.get(
      `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${BSCSCAN_API_KEY}`
    );

    if (res.data.status !== "1") {
      return { symbol: "BNB", transactions: [], error: "Invalid response from BscScan API" };
    }

    const sentTransactions = res.data.result
      .filter(tx => tx.from.toLowerCase() === address.toLowerCase()) // Only sent transactions
      .sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp)) // Ensure latest first
      .slice(0, limit) // Take only the requested limit
      .map(tx => ({
        hash: tx.hash,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        blockNumber: parseInt(tx.blockNumber),
        from: tx.from,
        to: tx.to,
        value: parseFloat(tx.value) / 1e18,
        gasPrice: parseFloat(tx.gasPrice) / 1e9, // Convert to Gwei
        gasUsed: parseInt(tx.gasUsed),
        fee: (parseFloat(tx.gasPrice) * parseInt(tx.gasUsed)) / 1e18,
        status: tx.txreceipt_status === "1" ? "Success" : "Failed",
        type: 'sent'
      }));

    return { 
      symbol: "BNB", 
      transactions: sentTransactions,
      transactionType: "sent",
      total: sentTransactions.length
    };
  } catch (err) {
    console.error("Error fetching sent BNB transactions:", err.message);
    return { symbol: "BNB", transactions: [], error: err.message };
  }
};

const getReceivedTransactions = async (address, limit = 10) => {
  try {
    const res = await axios.get(
      `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=desc&apikey=${BSCSCAN_API_KEY}`
    );

    if (res.data.status !== "1") {
      return { symbol: "BNB", transactions: [], error: "Invalid response from BscScan API" };
    }

    const receivedTransactions = res.data.result
      .filter(tx => tx.to.toLowerCase() === address.toLowerCase()) // Only received transactions
      .sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp)) // Ensure latest first
      .slice(0, limit) // Take only the requested limit
      .map(tx => ({
        hash: tx.hash,
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        blockNumber: parseInt(tx.blockNumber),
        from: tx.from,
        to: tx.to,
        value: parseFloat(tx.value) / 1e18,
        gasPrice: parseFloat(tx.gasPrice) / 1e9, // Convert to Gwei
        gasUsed: parseInt(tx.gasUsed),
        fee: (parseFloat(tx.gasPrice) * parseInt(tx.gasUsed)) / 1e18,
        status: tx.txreceipt_status === "1" ? "Success" : "Failed",
        type: 'received'
      }));

    return { 
      symbol: "BNB", 
      transactions: receivedTransactions,
      transactionType: "received",
      total: receivedTransactions.length
    };
  } catch (err) {
    console.error("Error fetching received BNB transactions:", err.message);
    return { symbol: "BNB", transactions: [], error: err.message };
  }
};

module.exports = { getBNBTransactions, getSentTransactions, getReceivedTransactions };