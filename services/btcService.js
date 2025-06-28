const axios = require("axios");
const BTC_API = process.env.BTC_API;

const getBTCBalance = async (address) => {
  const res = await axios.get(`${BTC_API}/addrs/${address}/balance`);
  const btc = res.data.final_balance / 1e8;
  return { symbol: "BTC", balance: btc.toFixed(6) };
};


module.exports = { getBTCBalance };
