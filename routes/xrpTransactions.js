// routes/xrpTransactions.js
const express = require("express");
const router = express.Router();
const { getXRPTransactions } = require("../services/xrpTransactionService");

router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await getXRPTransactions(address, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
