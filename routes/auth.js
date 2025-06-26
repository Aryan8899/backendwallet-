const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

router.post("/verify", async (req, res) => {
  const { message, signature, expectedAddress } = req.body;

  try {
    const signer = ethers.utils.verifyMessage(message, signature);
    if (signer.toLowerCase() === expectedAddress.toLowerCase()) {
      return res.json({ success: true });
    } else {
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
