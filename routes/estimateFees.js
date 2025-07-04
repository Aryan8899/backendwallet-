// routes/estimateFees.js - FIXED VERSION
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

// Network configurations for EVM chains
const EVM_NETWORKS = {
  ethereum: {
    rpcUrl: process.env.ETH_RPC_URL,
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    decimals: 18
  },
  bsc: {
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
    chainId: 56,
    name: 'BSC Mainnet',
    symbol: 'BNB',
    decimals: 18
  },
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
    chainId: 137,
    name: 'Polygon Mainnet',
    symbol: 'MATIC',
    decimals: 18
  },
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18
  },
  linea: {
    rpcUrl: process.env.LINEA_RPC_URL || 'https://rpc.linea.build',
    chainId: 59144,
    name: 'Linea Mainnet',
    symbol: 'ETH',
    decimals: 18
  }
};

// Fee estimation for all networks
router.post("/estimate", async (req, res) => {
  const { network, from, to, amount } = req.body;

  if (!network || !to || !amount) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: network, to, amount"
    });
  }

  try {
    let feeEstimate;

    switch (network.toLowerCase()) {
      // EVM chains
      case 'ethereum':
      case 'eth':
        feeEstimate = await estimateEVMFees('ethereum', from, to, amount);
        break;
      
      case 'bsc':
        feeEstimate = await estimateEVMFees('bsc', from, to, amount);
        break;
      
      case 'polygon':
        feeEstimate = await estimateEVMFees('polygon', from, to, amount);
        break;
      
      case 'arbitrum':
        feeEstimate = await estimateEVMFees('arbitrum', from, to, amount);
        break;
      
      case 'linea':
        feeEstimate = await estimateEVMFees('linea', from, to, amount);
        break;

      // Non-EVM chains
      case 'bitcoin':
      case 'btc':
        feeEstimate = await estimateBTCFees(from, to, amount);
        break;
      
      case 'dogecoin':
      case 'doge':
        feeEstimate = await estimateDOGEFees(from, to, amount);
        break;
      
      case 'xrp':
        feeEstimate = await estimateXRPFees(from, to, amount);
        break;
      
      case 'tron':
      case 'trx':
        feeEstimate = await estimateTRXFees(from, to, amount);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported network: ${network}`
        });
    }

    res.json({
      success: true,
      network: network,
      amount: amount,
      feeEstimate: feeEstimate,
      totalCost: parseFloat(amount) + parseFloat(feeEstimate.estimatedFee)
    });

  } catch (error) {
    console.error(`Fee estimation error for ${network}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// EVM fee estimation - FIXED VERSION
async function estimateEVMFees(network, from, to, amount) {
  const networkConfig = EVM_NETWORKS[network];
  const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

  try {
    // Get current gas price
    const feeData = await provider.getFeeData();
    
    // Use a dummy address with sufficient balance for gas estimation
    // Or use the actual from address if provided and valid
    let estimatorAddress = from;
    
    // If no from address or estimation fails, use a dummy address
    if (!estimatorAddress) {
      estimatorAddress = '0x742d35Cc6634C0532925a3b8D82B59ac8e0db8Ad'; // Random address with ETH
    }

    let gasEstimate;
    
    try {
      // Try to estimate gas with the provided/dummy address
      gasEstimate = await provider.estimateGas({
        from: estimatorAddress,
        to: to,
        value: ethers.parseEther(amount.toString())
      });
    } catch (estimateError) {
      // If estimation fails, use default gas limits
      console.log(`Gas estimation failed for ${network}, using defaults:`, estimateError.message);
      
      // Default gas limits for different networks
      const defaultGasLimits = {
        ethereum: 21000n,
        bsc: 21000n,
        polygon: 21000n,
        arbitrum: 21000n,
        linea: 21000n
      };
      
      gasEstimate = defaultGasLimits[network] || 21000n;
    }

    // Calculate fees
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei'); // Fallback gas price
    const maxFeePerGas = feeData.maxFeePerGas;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

    const estimatedFee = gasEstimate * gasPrice;
    const estimatedFeeEther = ethers.formatEther(estimatedFee);

    return {
      gasEstimate: gasEstimate.toString(),
      gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
      maxFeePerGas: maxFeePerGas ? ethers.formatUnits(maxFeePerGas, 'gwei') : null,
      maxPriorityFeePerGas: maxPriorityFeePerGas ? ethers.formatUnits(maxPriorityFeePerGas, 'gwei') : null,
      estimatedFee: estimatedFeeEther,
      currency: networkConfig.symbol,
      feeOptions: {
        slow: {
          gasPrice: ethers.formatUnits(gasPrice * 80n / 100n, 'gwei'), // 80% of current
          estimatedFee: ethers.formatEther(gasEstimate * gasPrice * 80n / 100n),
          estimatedTime: '5-10 minutes'
        },
        standard: {
          gasPrice: ethers.formatUnits(gasPrice, 'gwei'),
          estimatedFee: estimatedFeeEther,
          estimatedTime: '2-5 minutes'
        },
        fast: {
          gasPrice: ethers.formatUnits(gasPrice * 120n / 100n, 'gwei'), // 120% of current
          estimatedFee: ethers.formatEther(gasEstimate * gasPrice * 120n / 100n),
          estimatedTime: '1-2 minutes'
        }
      }
    };
  } catch (error) {
    console.error(`EVM fee estimation error for ${network}:`, error);
    throw error;
  }
}

// Bitcoin fee estimation
async function estimateBTCFees(from, to, amount) {
  try {
    // Get recommended fee rates from mempool.space
    const feeResponse = await axios.get('https://mempool.space/api/v1/fees/recommended');
    const feeRates = feeResponse.data;

    // Estimate transaction size (simplified)
    const inputSize = 148; // bytes per input
    const outputSize = 34; // bytes per output
    const baseSize = 10; // base transaction size

    // For now, assume 2 inputs and 2 outputs (change)
    const estimatedSize = baseSize + (2 * inputSize) + (2 * outputSize);

    return {
      estimatedSize: estimatedSize,
      feeOptions: {
        slow: {
          feeRate: feeRates.hourFee,
          estimatedFee: (estimatedSize * feeRates.hourFee / 100000000).toFixed(8),
          estimatedTime: '~1 hour'
        },
        standard: {
          feeRate: feeRates.halfHourFee,
          estimatedFee: (estimatedSize * feeRates.halfHourFee / 100000000).toFixed(8),
          estimatedTime: '~30 minutes'
        },
        fast: {
          feeRate: feeRates.fastestFee,
          estimatedFee: (estimatedSize * feeRates.fastestFee / 100000000).toFixed(8),
          estimatedTime: '~10 minutes'
        }
      },
      estimatedFee: (estimatedSize * feeRates.halfHourFee / 100000000).toFixed(8),
      currency: 'BTC'
    };
  } catch (error) {
    console.log('Bitcoin fee API error, using fallback:', error.message);
    // Fallback to fixed rates if API fails
    return {
      estimatedSize: 250,
      feeOptions: {
        slow: { feeRate: 10, estimatedFee: '0.00002500', estimatedTime: '~1 hour' },
        standard: { feeRate: 20, estimatedFee: '0.00005000', estimatedTime: '~30 minutes' },
        fast: { feeRate: 40, estimatedFee: '0.00010000', estimatedTime: '~10 minutes' }
      },
      estimatedFee: '0.00005000',
      currency: 'BTC'
    };
  }
}

// Dogecoin fee estimation
async function estimateDOGEFees(from, to, amount) {
  // Dogecoin typically uses fixed fees
  const fixedFee = 1.0; // 1 DOGE fixed fee

  return {
    estimatedFee: fixedFee.toString(),
    currency: 'DOGE',
    feeType: 'fixed',
    feeOptions: {
      standard: {
        estimatedFee: fixedFee.toString(),
        estimatedTime: '~1 minute'
      }
    }
  };
}

// XRP fee estimation
async function estimateXRPFees(from, to, amount) {
  try {
    const xrpl = require('xrpl');
    const client = new xrpl.Client('wss://xrplcluster.com');
    await client.connect();

    const serverInfo = await client.request({ command: 'server_info' });
    const baseFee = serverInfo.result.info.base_fee_xrp || 0.000012;

    await client.disconnect();

    return {
      estimatedFee: baseFee.toString(),
      currency: 'XRP',
      feeType: 'fixed',
      feeOptions: {
        standard: {
          estimatedFee: baseFee.toString(),
          estimatedTime: '~4 seconds'
        }
      }
    };
  } catch (error) {
    console.log('XRP fee estimation error, using fallback:', error.message);
    return {
      estimatedFee: '0.000012',
      currency: 'XRP',
      feeType: 'fixed',
      feeOptions: {
        standard: {
          estimatedFee: '0.000012',
          estimatedTime: '~4 seconds'
        }
      }
    };
  }
}

// TRON fee estimation
async function estimateTRXFees(from, to, amount) {
  // TRON transactions consume bandwidth and energy
  // Most simple transfers are free if you have enough bandwidth
  // Otherwise, it costs ~0.1 TRX

  return {
    estimatedFee: '0', // Free if enough bandwidth
    currency: 'TRX',
    feeType: 'bandwidth',
    feeOptions: {
      standard: {
        estimatedFee: '0',
        estimatedTime: '~3 seconds',
        note: 'Free if sufficient bandwidth, otherwise ~0.1 TRX'
      }
    },
    bandwidth: {
      required: 268,
      fallbackFee: '0.1'
    }
  };
}

// Get supported networks
router.get("/networks", (req, res) => {
  const networks = {
    evm: Object.keys(EVM_NETWORKS).map(key => ({
      id: key,
      name: EVM_NETWORKS[key].name,
      symbol: EVM_NETWORKS[key].symbol,
      chainId: EVM_NETWORKS[key].chainId
    })),
    nonEvm: [
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
      { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
      { id: 'xrp', name: 'XRP Ledger', symbol: 'XRP' },
      { id: 'tron', name: 'TRON', symbol: 'TRX' }
    ]
  };

  res.json({
    success: true,
    networks: networks
  });
});

module.exports = router;