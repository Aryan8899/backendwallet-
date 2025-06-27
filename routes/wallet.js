const express = require("express");
const router = express.Router();

const { getTokenPrice, getTxHistory, getETHBalance } = require("../services/ethService");
const { getBNBBalance } = require("../services/bscService");
//const { getTRXBalance } = require("../services/trxService");


router.get("/balance/:address", async (req, res) => {
    const address = req.params.address;

    try {
      // Removed BTC from here as it's only relevant for Bitcoin addresses
      const [eth, bnb] = await Promise.all([
        getETHBalance(address),
        getBNBBalance(address),
      
       
      ]);

      res.json({ eth, bnb});  // Return only relevant balances
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
});

router.get("/txs/:address", async (req, res) => {
  try {
    const txs = await getTxHistory(req.params.address);
    res.json({ txs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/token-price/:symbol", async (req, res) => {
  try {
    const price = await getTokenPrice(req.params.symbol);
    res.json({ price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
