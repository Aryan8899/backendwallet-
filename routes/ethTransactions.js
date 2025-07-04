// Fast and Efficient ETH Transaction Routes
const express = require("express");
const router = express.Router();
const { getETHTransactions } = require("../services/ethTransactionService");

// Route for All Transactions (sent + received)
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;
  
  try {
    const result = await getETHTransactions(address, limit, 'all', page);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Sent Transactions
router.get("/sent-transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;

  try {
    const result = await getETHTransactions(address, limit, 'sent', page);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Received Transactions
router.get("/received-transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const page = parseInt(req.query.page) || 1;

  try {
    const result = await getETHTransactions(address, limit, 'received', page);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Latest Transactions (optimized for recent activity)
router.get("/latest-transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const type = req.query.type || 'all'; // 'all', 'sent', 'received'

  try {
    // For latest transactions, we can use a smaller limit for better performance
    const result = await getETHTransactions(address, limit, type);
    
    res.json({
      ...result,
      info: "Latest transactions (most recent first)",
      isLatest: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Transaction Count (useful for pagination)
router.get("/transaction-count/:address", async (req, res) => {
  const { address } = req.params;
  const type = req.query.type || 'all';

  try {
    // Get a large number to count total transactions
    const result = await getETHTransactions(address, 10000, type);
    
    res.json({
      address: address,
      type: type,
      totalTransactions: result.totalFound || result.transactions.length,
      debug: result.debug
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;