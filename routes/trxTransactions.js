// routes/trxTransactions.js
const express = require("express");
const router = express.Router();
const { 
  getTRXTransactions, 
  getSentTRXTransactions, 
  getReceivedTRXTransactions 
} = require("../services/trxTransactionService");

// IMPORTANT: Order matters! More specific routes should come BEFORE general ones

// Get only sent transactions
router.get("/transactions/sent/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getSentTRXTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get only received transactions
router.get("/transactions/received/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getReceivedTRXTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get transaction summary
router.get("/transactions/:address/summary", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 50; // Higher limit for summary

  try {
    const result = await getTRXTransactions(address, limit);
    
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    
    // Calculate total amounts
    const totalSent = result.sentTransactions?.reduce((sum, tx) => sum + tx.value, 0) || 0;
    const totalReceived = result.receivedTransactions?.reduce((sum, tx) => sum + tx.value, 0) || 0;
    
    res.json({
      symbol: "TRX",
      address: address,
      summary: {
        ...result.summary,
        totalSentAmount: totalSent,
        totalReceivedAmount: totalReceived,
        netBalance: totalReceived - totalSent
      },
      latestTransactions: result.transactions?.slice(0, 5) || [] // Show last 5 transactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all transactions (both sent and received) - This should come LAST
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getTRXTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;