const axios = require("axios");
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;

const getBNBBalance = async (address) => {
  try {
    // Log the address being queried for
    console.log("Fetching balance for address:", address);

    // Make the API request to BscScan
    const res = await axios.get(
      `https://api.bscscan.com/api?module=account&action=balance&address=${address}&apikey=${BSCSCAN_API_KEY}`
    );

    // Log the entire response for debugging
    console.log("BSC Response: ", res.data);

    // Check if the response contains a valid result
    if (res.data.status !== "1" || !res.data.result) {
      return { symbol: "BNB", balance: "0.000000", error: "Invalid response from BscScan API" };
    }

    // Log the raw balance (in Wei)
    console.log("Raw BNB balance in Wei:", res.data.result);

    // Convert Wei to BNB (divide by 1e18)
    const bnb = parseFloat(res.data.result) / 1e18;

    // Check if the result is NaN
    if (isNaN(bnb)) {
      console.error("Parsed BNB balance is NaN!");
      return { symbol: "BNB", balance: "0.000000", error: "Invalid BNB balance" };
    }

    // Log the final balance
    console.log("Converted BNB balance:", bnb);

    // Return the formatted BNB balance
    return { symbol: "BNB", balance: bnb.toFixed(6) };

  } catch (err) {
    // Catch any errors during the request
    console.error("Error fetching BNB balance:", err.message);
    return { symbol: "BNB", balance: "0.000000", error: err.message };
  }
};

module.exports = { getBNBBalance };
