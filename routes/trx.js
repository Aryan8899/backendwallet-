const express = require("express");
const router = express.Router();

// Import the TRON balance service
const { getTRXBalance } = require("../services/trxService");

// Route to fetch TRON balance
router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;  // Get the address from the route parameter

  try {
    const trx = await getTRXBalance(address);
    res.json({ trx });  // Return the TRON balance
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
