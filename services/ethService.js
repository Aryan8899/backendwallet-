const axios = require("axios");
//const axios = require("axios");
const ALCHEMY = process.env.ETH_RPC_URL;  // Ensure you are using the Mainnet endpoint

const getETHBalance = async (address) => {
  try {
    const res = await axios.post(ALCHEMY, {
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: [address, "latest"],  // Query latest balance
      id: 1
    });

    // Convert the balance from hex to wei, then divide by 1e18 to get the balance in ETH
    const wei = parseInt(res.data.result, 16);  // Convert from hex to decimal (Wei)
    const eth = wei / 1e18;  // Convert from Wei to Ether

    // Log the raw balance and final rounded value
    console.log("Raw ETH Balance (Wei):", wei);
    console.log("Converted ETH Balance:", eth);
    
    // Round ETH to 18 decimal places (since ETH supports 18 decimals)
    const roundedEth = eth.toFixed(18);
    
    return { symbol: "ETH", balance: roundedEth };  // Return balance with 18 decimal places
  } catch (error) {
    console.error('Error fetching ETH balance:', error.message);
    return { symbol: "ETH", balance: "0.000000000000000000", error: error.message };
  }
};








module.exports = { getETHBalance };
