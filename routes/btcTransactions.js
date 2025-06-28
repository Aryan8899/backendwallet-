// routes/btcTransactions.js
const express = require("express");
const router = express.Router();
const { getBTCTransactions } = require("../services/btcTransactionService");

router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getBTCTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;