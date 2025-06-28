
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const NetworkModel = require('../modals/Network');

// Get balance for address on custom network
router.post('/balance', async (req, res) => {
  try {
    const { address, chainId } = req.body;

    if (!address || !chainId) {
      return res.status(400).json({
        success: false,
        error: 'Address and Chain ID are required'
      });
    }

    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Ethereum address format'
      });
    }

    // Get network configuration
    const network = NetworkModel.getNetwork(chainId);
    if (!network) {
      return res.status(404).json({
        success: false,
        error: 'Network not found. Please add the network first.'
      });
    }

    // Connect to network
    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    
    // Get balance
    const balance = await provider.getBalance(address);
    const formattedBalance = ethers.formatEther(balance);

    // Get transaction count (nonce)
    const transactionCount = await provider.getTransactionCount(address);

    res.json({
      success: true,
      data: {
        address,
        network: network.networkName,
        chainId: network.chainId,
        balance: formattedBalance,
        balanceWei: balance.toString(),
        currencySymbol: network.currencySymbol,
        transactionCount
      }
    });

  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to fetch balance: ${error.message}` 
    });
  }
});

// Get token balance on custom network
router.post('/token-balance', async (req, res) => {
  try {
    const { address, tokenAddress, chainId } = req.body;

    if (!address || !tokenAddress || !chainId) {
      return res.status(400).json({
        success: false,
        error: 'Address, token address, and Chain ID are required'
      });
    }

    if (!ethers.isAddress(address) || !ethers.isAddress(tokenAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    const network = NetworkModel.getNetwork(chainId);
    if (!network) {
      return res.status(404).json({
        success: false,
        error: 'Network not found'
      });
    }

    const provider = new ethers.JsonRpcProvider(network.rpcUrl);

    // ERC-20 token ABI (minimal)
    const tokenABI = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)'
    ];

    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);

    // Get token details
    const [balance, decimals, symbol, name] = await Promise.all([
      tokenContract.balanceOf(address),
      tokenContract.decimals(),
      tokenContract.symbol(),
      tokenContract.name()
    ]);

    const formattedBalance = ethers.formatUnits(balance, decimals);

    res.json({
      success: true,
      data: {
        address,
        tokenAddress,
        network: network.networkName,
        chainId: network.chainId,
        tokenName: name,
        tokenSymbol: symbol,
        decimals,
        balance: formattedBalance,
        balanceWei: balance.toString()
      }
    });

  } catch (error) {
    console.error('Error fetching token balance:', error);
    res.status(500).json({ 
      success: false, 
      error: `Failed to fetch token balance: ${error.message}` 
    });
  }
});

module.exports = router;