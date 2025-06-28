
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const NetworkModel = require('../modals/Network');

// Add custom network
router.post('/add', async (req, res) => {
  try {
    const { networkName, rpcUrl, chainId, currencySymbol, blockExplorerUrl } = req.body;

    // Validate required fields
    if (!networkName || !rpcUrl || !chainId || !currencySymbol) {
      return res.status(400).json({ 
        success: false, 
        error: "Network name, RPC URL, Chain ID, and currency symbol are required" 
      });
    }

    // Check if network already exists
    const existingNetwork = NetworkModel.getNetwork(chainId);
    if (existingNetwork) {
      return res.status(409).json({
        success: false,
        error: `Network with Chain ID ${chainId} already exists`
      });
    }

    // Validate RPC URL and Chain ID
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();

    if (network.chainId !== BigInt(chainId)) {
      return res.status(400).json({
        success: false,
        error: `Chain ID mismatch: expected ${chainId}, got ${network.chainId.toString()}`
      });
    }

    // Test basic RPC functionality
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Network validation successful. Latest block: ${blockNumber}`);

    // Add network to storage
    const newNetwork = NetworkModel.addNetwork({
      networkName,
      rpcUrl,
      chainId,
      currencySymbol,
      blockExplorerUrl
    });

    res.json({
      success: true,
      message: `${networkName} network successfully added!`,
      network: newNetwork,
      latestBlock: blockNumber
    });

  } catch (error) {
    console.error('Error adding custom network:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to add network: ${error.message}` 
    });
  }
});

// Get all custom networks
router.get('/list', (req, res) => {
  try {
    const customNetworks = NetworkModel.getCustomNetworks();
    res.json({
      success: true,
      networks: customNetworks,
      count: customNetworks.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get specific network
router.get('/:chainId', (req, res) => {
  try {
    const { chainId } = req.params;
    const network = NetworkModel.getNetwork(chainId);
    
    if (!network) {
      return res.status(404).json({ 
        success: false, 
        error: 'Network not found' 
      });
    }

    res.json({ success: true, network });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove custom network
router.delete('/:chainId', (req, res) => {
  try {
    const { chainId } = req.params;
    const removed = NetworkModel.removeNetwork(chainId);
    
    if (!removed) {
      return res.status(404).json({ 
        success: false, 
        error: 'Network not found or cannot be removed' 
      });
    }

    res.json({ 
      success: true, 
      message: `Network with Chain ID ${chainId} removed successfully` 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test network connectivity
router.post('/test', async (req, res) => {
  try {
    const { rpcUrl, chainId } = req.body;
    
    if (!rpcUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'RPC URL is required' 
      });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getFeeData();

    const networkInfo = {
      chainId: network.chainId.toString(),
      name: network.name,
      blockNumber,
      gasPrice: ethers.formatUnits(gasPrice.gasPrice || 0, 'gwei'),
      isConnected: true
    };

    // Validate chain ID if provided
    if (chainId && network.chainId !== BigInt(chainId)) {
      return res.status(400).json({
        success: false,
        error: `Chain ID mismatch: expected ${chainId}, got ${network.chainId.toString()}`,
        actualNetwork: networkInfo
      });
    }

    res.json({
      success: true,
      message: 'Network connection successful',
      network: networkInfo
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: `Network test failed: ${error.message}` 
    });
  }
});

module.exports = router;
