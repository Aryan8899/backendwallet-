// =====================================
// Updated Router with All Transactions Endpoint
const express = require("express");
const router = express.Router();
const { getBTCTransactions } = require("../services/btcTransactionService");

// Route for All Transactions (both sent and received)
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getBTCTransactions(address, limit, 'all'); // Pass 'all' for all transactions
    res.json({
      confirmedTransactions: result.confirmedTransactions,
      unconfirmedTransactions: result.unconfirmedTransactions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Sent Transactions
router.get("/sent-transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getBTCTransactions(address, limit, 'sent');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route for Received Transactions
router.get("/received-transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getBTCTransactions(address, limit, 'received');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;