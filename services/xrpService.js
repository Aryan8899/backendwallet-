const axios = require("axios");

const getXRPBalance = async (address) => {
  const res = await axios.get(`https://data.ripple.com/v2/accounts/${address}/balances`);
  const xrpEntry = res.data.balances.find(b => b.currency === "XRP");
  const xrp = parseFloat(xrpEntry?.value || 0);
  return { symbol: "XRP", balance: xrp.toFixed(6) };
};

module.exports = { getXRPBalance };
