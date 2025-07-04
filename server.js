// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ethers } = require("ethers");
const cryptoRoutes = require('./routes/cryptoRoutes');
const { generateEvmWallet, generateBtcWallet, generateTronWallet, generateXrpWallet ,  generateDogeWallet} = require("./services/walletGeneration");

const app = express();
app.use(cors());
app.use(express.json());

// Import routes
const walletRoutes = require("./routes/wallet");
const authRoutes = require("./routes/auth");
const xrpRoutes = require("./routes/xrp");
const btcRoutes = require("./routes/btc");
const dogeBalanceRoutes = require("./routes/dogeBalance");
const trxRoutes = require("./routes/trx");

const { 
  rpcTransactionRouter, 
  ethRPCRouter, 
  bscRPCRouter 
} = require('./routes/rpcTransactions');

// Import custom network routes
const customNetworkRoutes = require('./routes/customNetwork');
const customNetworkBalanceRoutes = require('./routes/customNetworkBalance');
const customNetworkTransactionRoutes = require('./routes/customNetworkTransactions');

// NEW: Import transaction history routes
const btcTransactionRoutes = require('./routes/btcTransactions');
const ethTransactionRoutes = require('./routes/ethTransactions');
const bscTransactionRoutes = require('./routes/bscTransactions');
const trxTransactionRoutes = require('./routes/trxTransactions');
const xrpTransactionRoutes = require('./routes/xrpTransactions');
const dogeTransactionRoutes = require('./routes/dogeTransactions');
const estimateFeesRoutes = require('./routes/estimateFees');
const universalTransactionRouter = require('./routes/sendTransaction');


console.log("📁 Routes loaded successfully");

// Import NEW custom network routes
// const customNetworkRoutes = require('./routes/customNetwork');
// const customNetworkBalanceRoutes = require('./routes/customNetworkBalance');
// const customNetworkTransactionRoutes = require('./routes/customNetworkTransactions');



// Add debugging
//console.log("📁 Routes loaded successfully");

// Use routes
app.use("/api/wallet", walletRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/wallet/xrp", xrpRoutes);
app.use("/api/wallet/btc", btcRoutes);
app.use("/api/wallet/doge", dogeBalanceRoutes);
app.use("/api/wallet/trx", trxRoutes);
app.use('/api/fees', estimateFeesRoutes);

app.use('/api/crypto', cryptoRoutes);


// --- Wallet Generation Based on Network ---
// --- Wallet Generation Based on Network ---
app.post("/api/wallet/generate-address", async (req, res) => {
  const { network } = req.body; // 'EVM' or 'Bitcoin' or 'XRP' or 'Tron' or 'Dogecoin'

  if (!network) {
    return res.status(400).json({ error: "Missing network type" });
  }

  try {
    let wallet;

    switch (network.toLowerCase()) {
      case "evm":
      case "ethereum":
      case "eth":
        wallet = generateEvmWallet();
        break;
        
      case "bitcoin":
      case "btc":
        wallet = generateBtcWallet();
        break;
        
      case "xrp":
      case "ripple":
        wallet = generateXrpWallet();
        break;
        
      case "tron":
      case "trx":
        wallet = await generateTronWallet();
        break;
        
      case "dogecoin":
      case "doge":
        wallet = generateDogeWallet();
        break;
        
      default:
        return res.status(400).json({ 
          error: "Unsupported network type",
          supportedNetworks: ["EVM", "Bitcoin", "XRP", "Tron", "Dogecoin"]
        });
    }

    res.json({
      success: true,
      network: network,
      address: wallet.address,
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
      ...(wallet.mnemonic && { mnemonic: wallet.mnemonic }) // Include mnemonic if available
    });
  } catch (error) {
    console.error(`Error generating ${network} wallet:`, error);
    res.status(500).json({ 
      error: "Failed to generate wallet", 
      message: error.message,
      network: network
    });
  }
});


// Endpoint to add a custom network
// app.post("/add-custom-network", async (req, res) => {
//     const { networkName, rpcUrl, chainId, currencySymbol } = req.body;
  
//     // Validate input
//     if (!networkName || !rpcUrl || !chainId || !currencySymbol) {
//       return res.status(400).json({ error: "All fields are required" });
//     }
  
//     try {
//       // Connect to the provided RPC URL
//       const provider = new ethers.JsonRpcProvider(rpcUrl);
  
//       // Verify the Chain ID
//       const network = await provider.getNetwork();
  
//       if (network.chainId !== chainId) {
//         return res.status(400).json({
//           error: `Chain ID mismatch: expected ${chainId}, got ${network.chainId}`,
//         });
//       }
  
//       // Optionally, verify the currency symbol (if needed)
//       // If you have a method to fetch the token symbol, you can verify it here
  
//       // Respond with success if the network details are correct
//       res.json({
//         success: true,
//         message: `${networkName} network successfully added!`,
//         network: {
//           networkName,
//           rpcUrl,
//           chainId,
//           currencySymbol,
//           actualChainId: network.chainId,
//         },
//       });
//     } catch (err) {
//       res.status(500).json({ error: `Error connecting to the RPC URL: ${err.message}` });
//     }
//   });

// NEW: RPC-based transaction routes (recommended)
app.use('/api/rpc', rpcTransactionRouter);

// NEW: Network-specific RPC routes (backward compatible)
app.use('/api/eth-rpc', ethRPCRouter);
app.use('/api/bsc-rpc', bscRPCRouter);

  
app.use('/api/btc', btcTransactionRoutes);
app.use('/api/eth', ethTransactionRoutes);
app.use('/api/bsc', bscTransactionRoutes);
app.use('/api/trx', trxTransactionRoutes);
app.use('/api/xrp', xrpTransactionRoutes);
app.use('/api/doge', dogeTransactionRoutes);


// Use NEW custom network routes
app.use('/api/custom-network', customNetworkRoutes);
app.use('/api/custom-network', customNetworkBalanceRoutes);
app.use('/api/custom-network', customNetworkTransactionRoutes);

app.use('/api/transaction', universalTransactionRouter);


app.post("/add-custom-network", async (req, res) => {
    // Redirect to new endpoint
    res.redirect(307, '/api/custom-network/add');
  });

console.log("🛣️  Routes registered successfully");

// Add a test route to verify server is working
app.get("/test", (req, res) => {
  res.json({ message: "Server is working!" });
});

app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Test server at: http://localhost:${PORT}/test`);
});