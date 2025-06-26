const axios = require("axios");
const ALCHEMY = process.env.ALCHEMY_ETH_MAINNET;

const getETHBalance = async (address) => {
  const res = await axios.post(ALCHEMY, {
    jsonrpc: "2.0",
    method: "eth_getBalance",
    params: [address, "latest"],
    id: 1
  });
  const wei = parseInt(res.data.result, 16);
  const eth = wei / 1e18;
  return { symbol: "ETH", balance: eth.toFixed(6) };
};

module.exports = { getETHBalance };
