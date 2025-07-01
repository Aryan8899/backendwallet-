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
  createWalletWithPassword,
  importWalletWithPassword,
  unlockWallet,
  changeWalletPassword,
  getWalletInfo,
  walletExists,
  isWalletProtected,
  authenticateWallet,
  getAllWallets
} = require("../services/walletPasswordService");

// ✅ NEW: Generate multi-chain wallet
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
      message: "Multi-chain wallet generated successfully",
      mnemonic: walletData.mnemonic,
      wallets: walletData.wallets,
      supportedChains: walletData.supportedChains,
      note: "Please save your mnemonic phrase securely. You can set a password to protect this wallet locally."
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Failed to generate multi-chain wallet",
      error: err.message 
    });
  }
});

// ✅ NEW: Import multi-chain wallet from mnemonic
router.post("/import-multichain", async (req, res) => {
  try {
    const { mnemonic, password, blockchains } = req.body;

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
    let walletData;
    try {
      walletData = generateMultiChainWalletFromMnemonic(mnemonic, chainsToGenerate);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid mnemonic phrase",
        error: error.message
      });
    }

    // For now, we'll import the Ethereum wallet to maintain compatibility
    // In the future, you might want to store all wallets
    const ethWallet = walletData.wallets[BLOCKCHAIN_TYPES.ETHEREUM];
    if (!ethWallet || ethWallet.error) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate Ethereum wallet from mnemonic"
      });
    }

    const ethWalletData = {
      mnemonic: walletData.mnemonic,
      privateKey: ethWallet.privateKey,
      address: ethWallet.address
    };

    // Import the Ethereum wallet with password (for backward compatibility)
    const result = await importWalletWithPassword(ethWalletData, password);
    
    if (result.success) {
      res.status(201).json({
        ...result,
        wallets: walletData.wallets,
        supportedChains: walletData.supportedChains,
        message: "Multi-chain wallet imported successfully from mnemonic"
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to import multi-chain wallet from mnemonic",
      error: err.message 
    });
  }
});

// ✅ NEW: Generate wallet for specific blockchain
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
      message: `${blockchain.toUpperCase()} wallet generated successfully`,
      wallet: walletData,
      blockchain: blockchain
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: `Failed to generate ${req.params.blockchain} wallet`,
      error: err.message 
    });
  }
});

// ✅ NEW: Get supported blockchains
router.get("/blockchains", (req, res) => {
  res.json({
    success: true,
    supportedBlockchains: getSupportedBlockchains(),
    blockchainTypes: BLOCKCHAIN_TYPES,
    message: "List of supported blockchain types"
  });
});

// ✅ ENHANCED: Import wallet from mnemonic only (now supports multi-chain)
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

// ORIGINAL ROUTES (keeping for backward compatibility)

// STEP 1: Generate a new wallet (mnemonic, private key, address)
router.post("/generate", async (req, res) => {
  try {
    const wallet = generateWallet();
    res.json({
      success: true,
      message: "New wallet generated successfully",
      wallet: wallet,
      note: "Please save your mnemonic phrase securely. You can set a password to protect this wallet locally."
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Failed to generate wallet",
      error: err.message 
    });
  }
});

// STEP 2: Import/Set password for existing wallet (complete data)
router.post("/import", async (req, res) => {
  try {
    const { mnemonic, privateKey, address, password } = req.body;

    if (!mnemonic || !privateKey || !address || !password) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic, private key, address, and password are all required. Use /import-mnemonic if you only have the mnemonic phrase."
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

// STEP 3: Login/Unlock wallet with password
router.post("/login", async (req, res) => {
  try {
    const { address, password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    let result;
    
    if (!address) {
      // Password-only login
      result = await unlockWallet(password);
    } else {
      // Address + password login
      result = await unlockWallet(address, password);
    }
    
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

// Alternative: Simple password-only login endpoint
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

// Check if wallet is protected (has password set)
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

// LEGACY ROUTES (keeping for backward compatibility)

// POST route to create wallet with password (now redirects to import)
router.post("/create", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required. But first, you need to generate a wallet."
      });
    }

    // Generate new wallet first
    const walletData = generateWallet();
    
    // Then import it with password
    const result = await importWalletWithPassword(walletData, password);
    
    if (result.success) {
      // Return the wallet data along with success message
      res.status(201).json({
        ...result,
        wallet: walletData, // Include the generated wallet data
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

// POST route to unlock wallet with password (alias for login)
router.post("/unlock", async (req, res) => {
  try {
    const { address, password } = req.body;

    if (!address || !password) {
      return res.status(400).json({
        success: false,
        message: "Wallet address and password are required"
      });
    }

    const result = await unlockWallet(address, password);
    
    if (result.success) {
      res.json(result);
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

// POST route to change wallet password
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
      res.json(result);
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

// GET route to check if wallet exists
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

// GET route to get wallet info (requires authentication)
router.get("/info", authenticateWallet, (req, res) => {
  try {
    const address = req.walletAddress;
    const result = getWalletInfo(address);
    
    if (result.success) {
      res.json(result);
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

// POST route to validate password strength
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

// Get wallet balance

router.get("/balance/:address", async (req, res) => {
  const address = req.params.address;

  try {
    const [eth, bnb] = await Promise.all([
      getETHBalance(address),
      getBNBBalance(address),
    ]);

    res.json({ eth, bnb });
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