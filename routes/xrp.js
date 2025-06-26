const express = require("express");
const router = express.Router();
const { getXRPBalance } = require("../services/xrpService");

router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;

  try {
    // Optional: validate XRP address format
    if (!/^r[1-9A-HJ-NP-Za-km-z]{25,35}$/.test(address)) {
      return res.status(400).json({ error: "Invalid XRP address format" });
    }

    const balance = await getXRPBalance(address);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
