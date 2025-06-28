
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const NetworkModel = require('../modals/Network');

// Send transaction on custom network
router.post('/send', async (req, res) => {
  try {
    const { 
      fromPrivateKey, 
      toAddress, 
      amount, 
      chainId, 
      gasLimit, 
      gasPrice 
    } = req.body;

    if (!fromPrivateKey || !toAddress || !amount || !chainId) {
      return res.status(400).json({
        success: false,
        error: 'Private key, to address, amount, and chain ID are required'
      });
    }

    if (!ethers.isAddress(toAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient address'
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
    const wallet = new ethers.Wallet(fromPrivateKey, provider);

    // Prepare transaction
    const tx = {
      to: toAddress,
      value: ethers.parseEther(amount.toString()),
      gasLimit: gasLimit || 21000,
      gasPrice: gasPrice ? ethers.parseUnits(gasPrice.toString(), 'gwei') : undefined
    };

    // If no gas price provided, get current gas price
    if (!tx.gasPrice) {
      const feeData = await provider.getFeeData();
      tx.gasPrice = feeData.gasPrice;
    }

    // Send transaction
    const transaction = await wallet.sendTransaction(tx);

    res.json({
      success: true,
      data: {
        transactionHash: transaction.hash,
        from: wallet.address,
        to: toAddress,
        amount,
        network: network.networkName,
        chainId: network.chainId,
        gasPrice: ethers.formatUnits(tx.gasPrice, 'gwei'),
        gasLimit: tx.gasLimit.toString(),
        blockExplorerUrl: network.blockExplorerUrl ? 
          `${network.blockExplorerUrl}/tx/${transaction.hash}` : null
      }
    });

  } catch (error) {
    console.error('Error sending transaction:', error);
    res.status(500).json({ 
      success: false, 
      error: `Transaction failed: ${error.message}` 
    });
  }
});

// Get transaction receipt
router.get('/receipt/:txHash/:chainId', async (req, res) => {
  try {
    const { txHash, chainId } = req.params;

    const network = NetworkModel.getNetwork(chainId);
    if (!network) {
      return res.status(404).json({
        success: false,
        error: 'Network not found'
      });
    }

    const provider = new ethers.JsonRpcProvider(network.rpcUrl);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Transaction receipt not found'
      });
    }

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
        network: network.networkName,
        chainId: network.chainId
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: `Failed to get receipt: ${error.message}` 
    });
  }
});

module.exports = router;
