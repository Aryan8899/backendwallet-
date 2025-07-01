const express = require("express");
const router = express.Router();

const { getTokenPrice, getTxHistory, getETHBalance } = require("../services/ethService");
const { getBNBBalance } = require("../services/bscService");
const { 
  generateWallet, 
  generateWalletFromMnemonic,
  generateMultiChainWallet,
  generateMultiChainWalletFromMnemonic,
  generateWalletForBlockchain,
  getSupportedBlockchains,
  isValidBlockchainType,
  BLOCKCHAIN_TYPES
} = require("../services/walletService");
const {
  validatePassword,
  importWalletWithPassword,
  unlockWallet,
  changeWalletPassword,
  getWalletInfo,
  walletExists,
  isWalletProtected,
  authenticateWallet,
  getAllWallets
} = require("../services/walletPasswordService");

// ========================================
// 🔥 METAMASK-LIKE FLOW ENDPOINTS (PASSWORD FIRST)
// ========================================

// STEP 1: Create Password First + Generate Multi-chain Wallet (MetaMask flow)
router.post("/create-password", async (req, res) => {
  try {
    const { password, blockchains } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    // Validate password strength
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet requirements",
        errors: validation.errors
      });
    }

    // Default to Ethereum if no blockchains specified
    const chainsToGenerate = blockchains && Array.isArray(blockchains) 
      ? blockchains 
      : [BLOCKCHAIN_TYPES.ETHEREUM];
    
    // Validate blockchain types
    const invalidChains = chainsToGenerate.filter(chain => !isValidBlockchainType(chain));
    if (invalidChains.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid blockchain types: ${invalidChains.join(', ')}`,
        supportedBlockchains: getSupportedBlockchains()
      });
    }

    // Generate multi-chain wallet
    const multiWalletData = generateMultiChainWallet(chainsToGenerate);
    
    // For compatibility, import the primary wallet (Ethereum) with password
    const primaryChain = chainsToGenerate.includes(BLOCKCHAIN_TYPES.ETHEREUM) 
      ? BLOCKCHAIN_TYPES.ETHEREUM 
      : chainsToGenerate[0];
    
    const primaryWallet = multiWalletData.wallets[primaryChain];
    const walletDataForEncryption = {
      mnemonic: multiWalletData.mnemonic,
      privateKey: primaryWallet.privateKey,
      address: primaryWallet.address,
      blockchain: primaryChain
    };
    
    // Import and encrypt the primary wallet
    const result = await importWalletWithPassword(walletDataForEncryption, password);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        message: "Multi-chain wallet created and secured with password",
        primaryWallet: {
          address: primaryWallet.address,
          blockchain: primaryChain
        },
        mnemonic: multiWalletData.mnemonic, // Show mnemonic for backup
        allWallets: multiWalletData.wallets,
        supportedChains: multiWalletData.supportedChains,
        passwordStrength: validation.strength,
        note: "IMPORTANT: Save your mnemonic phrase securely. You'll need your password to unlock your wallet."
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to create multi-chain wallet",
      error: err.message 
    });
  }
});

// STEP 2: Import Existing Multi-chain Wallet with Password
// STEP 2: Import Existing Multi-chain Wallet with Password (MODIFIED)
router.post("/import-with-password", async (req, res) => {
  try {
    const { mnemonic, password, blockchains, primaryBlockchain, overwrite } = req.body;

    if (!mnemonic || !password) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic phrase and password are required"
      });
    }

    // Validate mnemonic format
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic must be 12 or 24 words"
      });
    }

    // Validate password
    const validation = validatePassword(password);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet requirements",
        errors: validation.errors
      });
    }

    // Default to Ethereum if no blockchains specified
    const chainsToGenerate = blockchains && Array.isArray(blockchains) 
      ? blockchains 
      : [BLOCKCHAIN_TYPES.ETHEREUM];

    // Validate blockchain types
    const invalidChains = chainsToGenerate.filter(chain => !isValidBlockchainType(chain));
    if (invalidChains.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid blockchain types: ${invalidChains.join(', ')}`,
        supportedBlockchains: getSupportedBlockchains()
      });
    }

    // Generate multi-chain wallet data from mnemonic
    let multiWalletData;
    try {
      multiWalletData = generateMultiChainWalletFromMnemonic(mnemonic, chainsToGenerate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid mnemonic phrase",
        error: error.message
      });
    }

    // Determine primary blockchain for encryption
    const primaryChain = primaryBlockchain && isValidBlockchainType(primaryBlockchain) 
      ? primaryBlockchain 
      : (chainsToGenerate.includes(BLOCKCHAIN_TYPES.ETHEREUM) ? BLOCKCHAIN_TYPES.ETHEREUM : chainsToGenerate[0]);
    
    const primaryWallet = multiWalletData.wallets[primaryChain];
    if (!primaryWallet || primaryWallet.error) {
      return res.status(400).json({
        success: false,
        message: `Failed to generate ${primaryChain} wallet from mnemonic`
      });
    }

    // Check if wallet already exists
    const walletAddress = primaryWallet.address;
    const exists = walletExists(walletAddress);
    const isProtected = isWalletProtected(walletAddress);

    if (exists && isProtected && !overwrite) {
      return res.status(409).json({
        success: false,
        message: "Wallet already exists and is password protected",
        address: walletAddress,
        suggestion: "Use the unlock endpoint to access existing wallet, or add 'overwrite: true' to replace it",
        conflictType: "WALLET_EXISTS"
      });
    }

    const importResults = {};
    let failedImports = [];
    
    for (const chain of chainsToGenerate) {
      const wallet = multiWalletData.wallets[chain];
      const address = wallet.address;
    
      const walletData = {
        mnemonic: multiWalletData.mnemonic,
        privateKey: wallet.privateKey,
        address: address,
        blockchain: chain
      };
    
      const exists = walletExists(address);
      const isProtected = isWalletProtected(address);
      const shouldOverwrite = overwrite && exists && isProtected;
    
      let result;
      if (shouldOverwrite) {
        result = await importWalletWithPassword(walletData, password, { overwrite: true });
      } else {
        result = await importWalletWithPassword(walletData, password);
      }
    
      if (result.success) {
        importResults[chain] = {
          ...result,
          address,
          blockchain: chain
        };
      } else {
        failedImports.push({ chain, error: result.message });
      }
    }
    
    
   
      res.status(201).json({
        success: true,
        message: failedImports.length === 0
          ? "All wallets imported and secured with password"
          : "Some wallets failed to import",
        importedWallets: importResults,
        failedWallets: failedImports,
        allWallets: multiWalletData.wallets,
        supportedChains: multiWalletData.supportedChains,
        passwordStrength: validation.strength,
        wasReplaced: overwrite
      });
      
    

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to import multi-chain wallet",
      error: err.message 
    });
  }
});
// STEP 3: Unlock Wallet with Password (MetaMask login)
router.post("/unlock", async (req, res) => {
  try {
    const { password, address, regenerateChains } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    let result;
    
    if (address) {
      // Unlock specific wallet
      result = await unlockWallet(address, password);
    } else {
      // Password-only unlock (tries all wallets)
      result = await unlockWallet(password);
    }
    
    if (result.success) {
      let response = {
        success: true,
        message: "Wallet unlocked successfully",
        wallet: {
          address: result.wallet.address,
          mnemonic: result.wallet.mnemonic,
          privateKey: result.wallet.privateKey,
          blockchain: result.wallet.blockchain || BLOCKCHAIN_TYPES.ETHEREUM
        },
        accessToken: result.accessToken,
        accessInfo: {
          lastAccess: result.lastAccess,
          accessCount: result.accessCount
        }
      };

      // Optionally regenerate multi-chain wallets from mnemonic
      if (regenerateChains && Array.isArray(regenerateChains) && regenerateChains.length > 0) {
        try {
          const multiWalletData = generateMultiChainWalletFromMnemonic(
            result.wallet.mnemonic, 
            regenerateChains
          );
          response.allWallets = multiWalletData.wallets;
          response.supportedChains = multiWalletData.supportedChains;
        } catch (error) {
          console.warn("Failed to regenerate multi-chain wallets:", error.message);
        }
      }

      res.json(response);
    } else {
      res.status(401).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to unlock wallet",
      error: err.message 
    });
  }
});

// ========================================
// 🔧 MULTI-CHAIN WALLET ENDPOINTS
// ========================================

// Generate multi-chain wallet (insecure - no password)
router.post("/generate-multichain", async (req, res) => {
  try {
    const { blockchains } = req.body;
    
    // Default to Ethereum if no blockchains specified
    const chainsToGenerate = blockchains && Array.isArray(blockchains) 
      ? blockchains 
      : [BLOCKCHAIN_TYPES.ETHEREUM];
    
    // Validate blockchain types
    const invalidChains = chainsToGenerate.filter(chain => !isValidBlockchainType(chain));
    if (invalidChains.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid blockchain types: ${invalidChains.join(', ')}`,
        supportedBlockchains: getSupportedBlockchains()
      });
    }
    
    const walletData = generateMultiChainWallet(chainsToGenerate);
    
    res.json({
      success: true,
      message: "⚠️ INSECURE: Multi-chain wallet generated without password protection",
      mnemonic: walletData.mnemonic,
      wallets: walletData.wallets,
      supportedChains: walletData.supportedChains,
      recommendation: "Use /create-password endpoint for secure wallet creation"
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Failed to generate multi-chain wallet",
      error: err.message 
    });
  }
});

// Generate wallet for specific blockchain
router.post("/generate-blockchain/:blockchain", async (req, res) => {
  try {
    const { blockchain } = req.params;
    const { mnemonic } = req.body;

    if (!isValidBlockchainType(blockchain)) {
      return res.status(400).json({
        success: false,
        message: `Invalid blockchain type: ${blockchain}`,
        supportedBlockchains: getSupportedBlockchains()
      });
    }

    let walletData;
    
    if (mnemonic) {
      // Generate from existing mnemonic
      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        return res.status(400).json({
          success: false,
          message: "Mnemonic must be 12 or 24 words"
        });
      }
      
      try {
        walletData = generateWalletForBlockchain(mnemonic, blockchain);
        walletData.mnemonic = mnemonic;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid mnemonic phrase",
          error: error.message
        });
      }
    } else {
      // Generate new wallet for specific blockchain
      const multiWallet = generateMultiChainWallet([blockchain]);
      walletData = {
        mnemonic: multiWallet.mnemonic,
        ...multiWallet.wallets[blockchain]
      };
    }

    res.json({
      success: true,
      message: `⚠️ INSECURE: ${blockchain.toUpperCase()} wallet generated without password protection`,
      wallet: walletData,
      blockchain: blockchain,
      recommendation: "Use /create-password or /import-with-password for secure wallet creation"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: `Failed to generate ${req.params.blockchain} wallet`,
      error: err.message 
    });
  }
});

// Get supported blockchains
router.get("/blockchains", (req, res) => {
  res.json({
    success: true,
    supportedBlockchains: getSupportedBlockchains(),
    blockchainTypes: BLOCKCHAIN_TYPES,
    message: "List of supported blockchain types"
  });
});

// ========================================
// 🔐 WALLET MANAGEMENT ENDPOINTS
// ========================================

// STEP 4: Get Wallet Info (requires authentication)
router.get("/info", authenticateWallet, (req, res) => {
  try {
    const address = req.walletAddress;
    const result = getWalletInfo(address);
    
    if (result.success) {
      res.json({
        success: true,
        wallet: {
          address: result.wallet.address,
          createdAt: result.wallet.createdAt,
          lastAccess: result.wallet.lastAccess,
          accessCount: result.wallet.accessCount,
          isImported: result.wallet.isImported
        }
      });
    } else {
      res.status(404).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Change Password (requires authentication)
router.post("/change-password", authenticateWallet, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const address = req.walletAddress;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    const result = await changeWalletPassword(address, currentPassword, newPassword);
    
    if (result.success) {
      res.json({
        success: true,
        message: "Password changed successfully",
        passwordStrength: result.passwordStrength
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to change password",
      error: err.message 
    });
  }
});

// ========================================
// 🔧 UTILITY ENDPOINTS
// ========================================

// Check wallet status
router.get("/status/:address", (req, res) => {
  try {
    const address = req.params.address;
    const exists = walletExists(address);
    const isProtected = isWalletProtected(address);
    
    res.json({
      success: true,
      address: address,
      exists: exists,
      isProtected: isProtected,
      message: exists ? 
        (isProtected ? "Wallet exists and is password protected" : "Wallet exists but not protected") :
        "Wallet does not exist"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Validate password strength
router.post("/validate-password", (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    const validation = validatePassword(password);
    
    res.json({
      success: true,
      isValid: validation.isValid,
      strength: validation.strength,
      errors: validation.errors
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// List all wallets (admin endpoint)
router.get("/list", (req, res) => {
  try {
    const wallets = getAllWallets();
    
    res.json({
      success: true,
      count: wallets.length,
      wallets: wallets.map(wallet => ({
        address: wallet.address,
        createdAt: wallet.createdAt,
        lastAccess: wallet.lastAccess,
        accessCount: wallet.accessCount,
        isImported: wallet.isImported
      }))
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ========================================
// 🔗 BLOCKCHAIN INTERACTION ENDPOINTS
// ========================================

// Get wallet balance (requires authentication)
router.get("/balance", authenticateWallet, async (req, res) => {
  try {
    const address = req.walletAddress;

    const [eth, bnb] = await Promise.all([
      getETHBalance(address),
      getBNBBalance(address),
    ]);

    res.json({ 
      success: true,
      address: address,
      balances: { eth, bnb }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Get wallet balance by address (public endpoint)
router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;

  try {
    const [eth, bnb] = await Promise.all([
      getETHBalance(address),
      getBNBBalance(address),
    ]);

    res.json({ 
      success: true,
      address: address,
      balances: { eth, bnb }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Get transaction history (requires authentication)
router.get("/transactions", authenticateWallet, async (req, res) => {
  try {
    const address = req.walletAddress;
    const txs = await getTxHistory(address);
    
    res.json({ 
      success: true,
      address: address,
      transactions: txs 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Get transaction history by address (public endpoint)
router.get("/txs/:address", async (req, res) => {
  try {
    const address = req.params.address;
    const txs = await getTxHistory(address);
    res.json({ 
      success: true,
      address: address,
      transactions: txs 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Get token price
router.get("/token-price/:symbol", async (req, res) => {
  try {
    const price = await getTokenPrice(req.params.symbol);
    res.json({ 
      success: true,
      symbol: req.params.symbol.toUpperCase(),
      price: price 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// ========================================
// 📱 LEGACY ENDPOINTS (for backward compatibility)
// ========================================

// Legacy: Generate wallet (insecure)
router.post("/generate", async (req, res) => {
  try {
    const wallet = generateWallet();
    res.json({
      success: true,
      message: "⚠️ INSECURE: Wallet generated without password protection",
      wallet: wallet,
      recommendation: "Use /create-password endpoint for secure wallet creation"
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Failed to generate wallet",
      error: err.message 
    });
  }
});

// Legacy: Import from mnemonic only
router.post("/import-mnemonic", async (req, res) => {
  try {
    const { mnemonic, password, blockchain } = req.body;

    if (!mnemonic || !password) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic phrase and password are required"
      });
    }

    // Validate mnemonic format
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic must be 12 or 24 words"
      });
    }

    // Generate wallet data from mnemonic
    let walletData;
    try {
      if (blockchain && isValidBlockchainType(blockchain)) {
        // Generate for specific blockchain
        walletData = generateWalletForBlockchain(mnemonic, blockchain);
        walletData.mnemonic = mnemonic;
      } else {
        // Default to Ethereum for backward compatibility
        walletData = generateWalletFromMnemonic(mnemonic);
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid mnemonic phrase",
        error: error.message
      });
    }

    // Import the wallet with password
    const result = await importWalletWithPassword(walletData, password);
    
    if (result.success) {
      res.status(201).json({
        ...result,
        wallet: {
          address: walletData.address,
          privateKey: walletData.privateKey,
          mnemonic: walletData.mnemonic,
          blockchain: walletData.blockchain || BLOCKCHAIN_TYPES.ETHEREUM
        },
        message: "Wallet imported successfully from mnemonic"
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to import wallet from mnemonic",
      error: err.message 
    });
  }
});

// Legacy: Import multichain (redirects to new endpoint)
router.post("/import-multichain", async (req, res) => {
  try {
    const { mnemonic, password, blockchains } = req.body;

    if (!mnemonic || !password) {
      return res.status(400).json({
        success: false,
        message: "Use /import-with-password endpoint for secure multi-chain wallet import"
      });
    }

    // Redirect to new secure endpoint
    return res.status(301).json({
      success: false,
      message: "This endpoint is deprecated. Use /import-with-password for secure multi-chain wallet import",
      redirectTo: "/wallet/import-with-password",
      parameters: {
        mnemonic,
        password,
        blockchains
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Use /import-with-password endpoint instead",
      error: err.message 
    });
  }
});

// Legacy: Login (alias for unlock)
router.post("/login", async (req, res) => {
  try {
    const { address, password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    const result = await unlockWallet(address || password, address ? password : undefined);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to login to wallet",
      error: err.message 
    });
  }
});

// Legacy: Simple password login
router.post("/login-simple", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    const result = await unlockWallet(password);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to login to wallet",
      error: err.message 
    });
  }
});

// Legacy: Create wallet with password
router.post("/create", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Use /create-password endpoint for secure wallet creation"
      });
    }

    // Generate new wallet first
    const walletData = generateWallet();
    
    // Then import it with password
    const result = await importWalletWithPassword(walletData, password);
    
    if (result.success) {
      res.status(201).json({
        ...result,
        wallet: walletData,
        message: "Wallet created and secured with password"
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to create wallet",
      error: err.message 
    });
  }
});

// Legacy: Import complete wallet data
router.post("/import", async (req, res) => {
  try {
    const { mnemonic, privateKey, address, password } = req.body;

    if (!mnemonic || !privateKey || !address || !password) {
      return res.status(400).json({
        success: false,
        message: "Use /import-with-password for secure wallet import with just mnemonic and password"
      });
    }

    const walletData = { mnemonic, privateKey, address };
    const result = await importWalletWithPassword(walletData, password);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to import wallet",
      error: err.message 
    });
  }
});

// Legacy: Check if wallet is protected
router.get("/protected/:address", (req, res) => {
  try {
    const address = req.params.address;
    const isProtected = isWalletProtected(address);
    
    res.json({
      success: true,
      address: address,
      isProtected: isProtected,
      message: isProtected ? "Wallet is password protected" : "Wallet is not imported/protected"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Legacy: Check if wallet exists
router.get("/exists/:address", (req, res) => {
  try {
    const address = req.params.address;
    const exists = walletExists(address);
    
    res.json({
      success: true,
      exists: exists,
      address: address
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;