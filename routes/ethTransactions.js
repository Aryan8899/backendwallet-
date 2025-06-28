
// routes/ethTransactions.js
const express = require("express");
const router = express.Router();
const { getETHTransactions } = require("../services/ethTransactionService");

router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getETHTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
