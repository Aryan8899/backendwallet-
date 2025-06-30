const express = require("express");
const axios = require("axios"); // ✅ ADD THIS LINE - axios was missing!
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

// ✅ Route to fetch TRON transaction history
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;

  try {
    const response = await axios.get(
      `https://api.trongrid.io/v1/accounts/${address}/transactions`,
      {
        params: {
          limit: 25,
          order_by: "block_timestamp,desc",
        },
        headers: {
          'TRON-PRO-API-KEY': process.env.TRON_API_KEY, // ✅ Add API key from environment
        },
      }
    );

    const transactions = response.data.data.map((tx) => {
      const contract = tx.raw_data?.contract?.[0]?.parameter?.value || {};
      return {
        hash: tx.txID,
        type: tx.raw_data?.contract?.[0]?.type || "UNKNOWN",
        from: contract.owner_address || "N/A",
        to: contract.to_address || "N/A",
        amount: contract.amount || 0,
        timestamp: new Date(tx.block_timestamp).toISOString(),
        confirmed: tx.ret?.[0]?.contractRet || "UNKNOWN",
      };
    });

    res.json({
      address,
      txCount: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error("Error fetching TRX transactions:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;