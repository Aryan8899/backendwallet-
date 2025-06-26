const express = require("express");
const axios = require("axios");

const router = express.Router();

const BLOCKCYPHER_API = "https://api.blockcypher.com/v1/doge/main";
const API_TOKEN = "fee568d35a7d43e0a2d175e6de4eb483";  // Your BlockCypher API token

// Validate Dogecoin address format
const isValidDogeAddress = (address) => {
  return /^([D3bc1])[a-zA-Z0-9]{25,39}$/.test(address); // Starts with D, 3, or bc1
};

// Route to get Dogecoin balance
router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;

  // Check if address is valid
  if (!isValidDogeAddress(address)) {
    return res.status(400).json({ error: "Invalid Dogecoin address format" });
  }

  try {
    // Make API request to BlockCypher to fetch the balance
    const response = await axios.get(`${BLOCKCYPHER_API}/addrs/${address}/balance`, {
      params: { token: API_TOKEN }  // Pass your BlockCypher API token
    });

    const dogeBalance = response.data.balance / 1e8;  // Convert satoshis to DOGE
    res.json({ symbol: "DOGE", balance: dogeBalance.toFixed(6) });
  } catch (err) {
    console.error("Error fetching DOGE balance:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
