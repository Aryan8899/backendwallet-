const express = require("express");
const router = express.Router();

const { getTokenPrice, getTxHistory, getETHBalance } = require("../services/ethService");
const { getBNBBalance } = require("../services/bscService");
const { generateWallet } = require("../services/walletService");
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

// STEP 2: Import/Set password for existing wallet
router.post("/import", async (req, res) => {
  try {
    const { mnemonic, privateKey, address, password } = req.body;

    if (!mnemonic || !privateKey || !address || !password) {
      return res.status(400).json({
        success: false,
        message: "Mnemonic, private key, address, and password are all required"
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

    // Support both modes:
    // Mode 1: Only password (searches all wallets)
    // Mode 2: Address + password (traditional)
    
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
