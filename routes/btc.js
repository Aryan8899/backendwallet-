const express = require("express");
const router = express.Router();
const { getBTCBalance } = require("../services/btcService");

router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;

  // ✅ Basic BTC address format check (1, 3, or bc1)
  const isBTC = /^([13]|bc1)[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);
  if (!isBTC) {
    return res.status(400).json({ error: "Invalid BTC address format" });
  }

  try {
    const balance = await getBTCBalance(address);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
