// services/walletPasswordService.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// In-memory wallet store (in production, use database)
const wallets = new Map();

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || "wallet-secret-key-change-in-production";

// Encryption key for wallet data
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);

// Encrypt wallet data
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Decrypt wallet data
const decrypt = (encryptedData) => {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Simple password validation
const validatePassword = (password) => {
  const minLength = 6;
  const errors = [];
  
  if (!password) {
    errors.push("Password is required");
  }
  
  if (password && password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

  // Optional: Add more security requirements
  const hasNumbers = /\d/.test(password);
  const hasLetters = /[a-zA-Z]/.test(password);
  
  if (password && password.length >= minLength) {
    if (!hasNumbers || !hasLetters) {
      errors.push("Password should contain both letters and numbers for better security");
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    strength: calculatePasswordStrength(password)
  };
};

// Calculate password strength
const calculatePasswordStrength = (password) => {
  if (!password) return "None";
  
  let score = 0;
  
  if (password.length >= 6) score += 1;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return "Weak";
  if (score <= 4) return "Medium";
  return "Strong";
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Verify password
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Generate access token
const generateAccessToken = (walletAddress) => {
  return jwt.sign(
    { walletAddress, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// Verify access token
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// NEW: Import existing wallet with password protection
const importWalletWithPassword = async (walletData, password) => {
  try {
    const { mnemonic, privateKey, address } = walletData;

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return {
        success: false,
        message: "Invalid password",
        errors: passwordValidation.errors
      };
    }

    // Check if wallet already exists
    if (wallets.has(address)) {
      return {
        success: false,
        message: "Wallet already exists and is password protected"
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Encrypt sensitive data
    const encryptedMnemonic = encrypt(mnemonic);
    const encryptedPrivateKey = encrypt(privateKey);

    // Store wallet with encrypted data
    const walletRecord = {
      address: address,
      encryptedMnemonic: encryptedMnemonic,
      encryptedPrivateKey: encryptedPrivateKey,
      hashedPassword: hashedPassword,
      createdAt: new Date(),
      lastAccess: null,
      accessCount: 0,
      isImported: true
    };

    wallets.set(address, walletRecord);

    return {
      success: true,
      message: "Wallet imported and secured with password",
      address: address,
      passwordStrength: passwordValidation.strength
    };

  } catch (error) {
    return {
      success: false,
      message: "Failed to import wallet",
      error: error.message
    };
  }
};

// MODIFIED: Create wallet with password (now called import)
const createWalletWithPassword = async (walletData, password) => {
  return await importWalletWithPassword(walletData, password);
};

// Unlock wallet with password
const unlockWallet = async (address, password) => {
  try {
    // Find wallet
    const wallet = wallets.get(address);
    if (!wallet) {
      return {
        success: false,
        message: "Wallet not found. Please import your wallet first."
      };
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, wallet.hashedPassword);
    if (!isPasswordValid) {
      return {
        success: false,
        message: "Incorrect password"
      };
    }

    // Decrypt sensitive data
    const mnemonic = decrypt(wallet.encryptedMnemonic);
    const privateKey = decrypt(wallet.encryptedPrivateKey);

    // Update access info
    wallet.lastAccess = new Date();
    wallet.accessCount += 1;

    // Generate access token
    const accessToken = generateAccessToken(address);

    return {
      success: true,
      message: "Wallet unlocked successfully",
      wallet: {
        address: wallet.address,
        mnemonic: mnemonic,
        privateKey: privateKey
      },
      accessToken: accessToken,
      lastAccess: wallet.lastAccess,
      accessCount: wallet.accessCount
    };

  } catch (error) {
    return {
      success: false,
      message: "Failed to unlock wallet",
      error: error.message
    };
  }
};

// Change wallet password
const changeWalletPassword = async (address, currentPassword, newPassword) => {
  try {
    const wallet = wallets.get(address);
    if (!wallet) {
      return {
        success: false,
        message: "Wallet not found"
      };
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, wallet.hashedPassword);
    if (!isCurrentPasswordValid) {
      return {
        success: false,
        message: "Current password is incorrect"
      };
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return {
        success: false,
        message: "New password is invalid",
        errors: passwordValidation.errors
      };
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);
    wallet.hashedPassword = hashedNewPassword;

    return {
      success: true,
      message: "Wallet password changed successfully",
      passwordStrength: passwordValidation.strength
    };

  } catch (error) {
    return {
      success: false,
      message: "Failed to change password",
      error: error.message
    };
  }
};

// Get wallet info (without sensitive data)
const getWalletInfo = (address) => {
  const wallet = wallets.get(address);
  if (!wallet) {
    return {
      success: false,
      message: "Wallet not found"
    };
  }

  return {
    success: true,
    wallet: {
      address: wallet.address,
      createdAt: wallet.createdAt,
      lastAccess: wallet.lastAccess,
      accessCount: wallet.accessCount,
      isImported: wallet.isImported || false
    }
  };
};

// Check if wallet exists
const walletExists = (address) => {
  return wallets.has(address);
};

// NEW: Check if address needs password (is imported)
const isWalletProtected = (address) => {
  return wallets.has(address);
};

// Middleware to authenticate wallet access
const authenticateWallet = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }

  req.walletAddress = decoded.walletAddress;
  next();
};

// Get all wallets (for debugging)
const getAllWallets = () => {
  const walletList = [];
  for (const [address, wallet] of wallets.entries()) {
    walletList.push({
      address: wallet.address,
      createdAt: wallet.createdAt,
      lastAccess: wallet.lastAccess,
      accessCount: wallet.accessCount,
      isImported: wallet.isImported || false
    });
  }
  return walletList;
};

module.exports = {
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
};