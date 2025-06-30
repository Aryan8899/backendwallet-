const express = require("express");
const router = express.Router();
const { getBTCBalance } = require("../services/btcService");
const axios = require("axios");

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

// Get BTC transaction history using BlockCypher
router.get("/transactions/:address", async (req, res) => {
  const address = req.params.address;

  // Validate address again
  const isBTC = /^([13]|bc1)[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);
  if (!isBTC) {
    return res.status(400).json({ error: "Invalid BTC address format" });
  }

  try {
    const response = await axios.get(
      `https://api.blockcypher.com/v1/btc/main/addrs/${address}`,
      {
        params: {
          token: process.env.BLOCKCYPHER_API_TOKEN,
          limit: 50  // adjust as needed
        }
      }
    );

    const txs = response.data.txrefs || [];
    const formatted = txs.map(tx => ({
      tx_hash: tx.tx_hash,
      block_height: tx.block_height,
      confirmed: tx.confirmed,
      value: tx.value / 1e8,
      confirmations: tx.confirmations
    }));

    res.json({ address, txCount: formatted.length, transactions: formatted });
  } catch (err) {
    console.error("Error fetching BTC transaction history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
