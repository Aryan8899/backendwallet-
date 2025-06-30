const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
require("dotenv").config();

router.post("/", async (req, res) => {
  const { privateKey, to, amount } = req.body;

  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
      to,
      value: ethers.utils.parseEther(amount),
    });

    const receipt = await tx.wait();
    res.json({ success: true, txHash: receipt.transactionHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
