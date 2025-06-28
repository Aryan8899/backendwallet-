// routes/rpcTransactions.js - Unified RPC-based transaction routes
const express = require("express");
const router = express.Router();
const rpcTransactionService = require("../services/rpcTransactionService");

// Get transaction history for any supported network
router.get("/transactions/:network/:address", async (req, res) => {
  try {
    const { network, address } = req.params;
    const {
      limit = 10,
      startBlock = 0,
      endBlock = "latest",
      includeTokenTransfers = true
    } = req.query;

    // Validate network support
    const supportedNetworks = rpcTransactionService.getSupportedNetworks();
    if (!supportedNetworks.includes(network)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported network: ${network}`,
        supportedNetworks
      });
    }

    // Validate address format (basic check)
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid address format"
      });
    }

    const options = {
      limit: parseInt(limit),
      startBlock: parseInt(startBlock),
      endBlock: endBlock === "latest" ? "latest" : parseInt(endBlock),
      includeTokenTransfers: includeTokenTransfers === "true"
    };

    const result = await rpcTransactionService.getTransactionHistory(
      address,
      network,
      options
    );

    res.json(result);
  } catch (error) {
    console.error("Error in transaction history route:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific transaction by hash
router.get("/transaction/:network/:hash", async (req, res) => {
  try {
    const { network, hash } = req.params;

    // Validate network support
    const supportedNetworks = rpcTransactionService.getSupportedNetworks();
    if (!supportedNetworks.includes(network)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported network: ${network}`,
        supportedNetworks
      });
    }

    // Validate transaction hash format
    if (!hash || !hash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid transaction hash format"
      });
    }

    const result = await rpcTransactionService.getTransactionByHash(hash, network);
    res.json(result);
  } catch (error) {
    console.error("Error in get transaction route:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get balance for address on specific network
router.get("/balance/:network/:address", async (req, res) => {
  try {
    const { network, address } = req.params;

    // Validate network support
    const supportedNetworks = rpcTransactionService.getSupportedNetworks();
    if (!supportedNetworks.includes(network)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported network: ${network}`,
        supportedNetworks
      });
    }

    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid address format"
      });
    }

    const result = await rpcTransactionService.getBalance(address, network);
    res.json(result);
  } catch (error) {
    console.error("Error in balance route:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get supported networks
router.get("/networks", (req, res) => {
  try {
    const networks = rpcTransactionService.getSupportedNetworks();
    res.json({
      success: true,
      networks,
      message: "List of supported networks for RPC queries"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add custom network (admin endpoint)
router.post("/networks/add", async (req, res) => {
  try {
    const { networkName, rpcUrl, chainId, symbol, decimals } = req.body;

    if (!networkName || !rpcUrl || !chainId || !symbol) {
      return res.status(400).json({
        success: false,
        error: "networkName, rpcUrl, chainId, and symbol are required"
      });
    }

    // Validate the network by trying to connect
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    try {
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(chainId)) {
        return res.status(400).json({
          success: false,
          error: `Chain ID mismatch: expected ${chainId}, got ${network.chainId}`
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `Failed to connect to RPC: ${error.message}`
      });
    }

    // Add the network
    rpcTransactionService.addCustomNetwork(networkName, {
      rpcUrl,
      chainId,
      symbol,
      decimals: decimals || 18
    });

    res.json({
      success: true,
      message: `Network ${networkName} added successfully`,
      network: {
        name: networkName,
        rpcUrl,
        chainId,
        symbol,
        decimals: decimals || 18
      }
    });
  } catch (error) {
    console.error("Error adding custom network:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

// Updated individual network routes for backward compatibility

// routes/ethTransactionsRPC.js
const ethRouter = express.Router();

ethRouter.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const includeTokenTransfers = req.query.includeTokenTransfers !== "false";

  try {
    const result = await rpcTransactionService.getTransactionHistory(
      address,
      "ethereum",
      { limit, includeTokenTransfers }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

ethRouter.get("/balance/:address", async (req, res) => {
  const { address } = req.params;

  try {
    const result = await rpcTransactionService.getBalance(address, "ethereum");
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// routes/bscTransactionsRPC.js
const bscRouter = express.Router();

bscRouter.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const includeTokenTransfers = req.query.includeTokenTransfers !== "false";

  try {
    const result = await rpcTransactionService.getTransactionHistory(
      address,
      "bsc",
      { limit, includeTokenTransfers }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

bscRouter.get("/balance/:address", async (req, res) => {
  const { address } = req.params;

  try {
    const result = await rpcTransactionService.getBalance(address, "bsc");
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export all routers
module.exports = {
  rpcTransactionRouter: router,
  ethRPCRouter: ethRouter,
  bscRPCRouter: bscRouter
};