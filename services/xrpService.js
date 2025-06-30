// services/xrpService.js
const xrpl = require("xrpl");

const getXRPBalance = async (address) => {
  try {
    const client = new xrpl.Client("wss://s1.ripple.com"); // Ripple Mainnet WebSocket
    await client.connect();

    const response = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated"
    });

    const drops = response.result.account_data.Balance;
    const xrp = (parseFloat(drops) / 1_000_000).toFixed(6);

    await client.disconnect();

    return { symbol: "XRP", balance: xrp };
  } catch (error) {
    return {
      symbol: "XRP",
      balance: "0.000000",
      error: error?.data?.error_message || error.message
    };
  }
};

module.exports = { getXRPBalance };
