const axios = require("axios");

const TRON_API_KEY = process.env.TRON_API_KEY;  // Load the TRON API Key from environment
const TRONGRID_API_URL = "https://api.trongrid.io/v1/accounts";  // TRON API base URL

// Fetch TRON balance for a specific address
const getTRXBalance = async (address) => {
  try {
    const response = await axios.get(`${TRONGRID_API_URL}/${address}`, {
      headers: {
        'TRON-PRO-API-KEY': TRON_API_KEY,  // Use the API key in the header
      },
    });

    // If data is not available, return an error
    if (!response.data || !response.data.data || response.data.data.length === 0) {
      return { symbol: "TRX", balance: "0.000000", error: "Invalid response from TRON API" };
    }

    // Convert the balance from Sun to TRX (1 TRX = 1 million Sun)
    const trxBalance = response.data.data[0].balance / 1e6;

    return { symbol: "TRX", balance: trxBalance.toFixed(6) };
  } catch (err) {
    console.error('Error fetching TRX balance:', err.message);
    return { symbol: "TRX", balance: "0.000000", error: err.message };
  }
};

module.exports = { getTRXBalance };
