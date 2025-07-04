// routes/bscTransactions.js
const express = require("express");
const router = express.Router();
const { getBNBTransactions, getSentTransactions, getReceivedTransactions } = require("../services/bscTransactionService");

// Get all transactions
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getBNBTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get only sent transactions
router.get("/send/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getSentTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get only received transactions
router.get("/receive/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getReceivedTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;