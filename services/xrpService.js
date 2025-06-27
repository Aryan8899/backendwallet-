const axios = require('axios');

// Function to get XRP balance from the XRPL public API
const getXRPBalance = async (address) => {
  try {
    const response = await axios.get(`https://data.ripple.com/v2/accounts/${address}/balances`);
    const xrpEntry = response.data.balances.find(b => b.currency === "XRP");

    const xrpBalance = parseFloat(xrpEntry?.value || 0);
    return { symbol: "XRP", balance: xrpBalance.toFixed(6) };
  } catch (err) {
    console.error("Error fetching XRP balance:", err.message);
    return { symbol: "XRP", balance: "0.000000", error: err.message };
  }
};

module.exports = { getXRPBalance };
