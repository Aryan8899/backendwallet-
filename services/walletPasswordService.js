// services/walletPasswordService.js - Fixed with Primary Wallet Support
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

// ✅ PERSISTENT STORAGE - File-based wallet store
const WALLETS_DIR = path.join(process.cwd(), 'wallets_data');
const WALLETS_FILE = path.join(WALLETS_DIR, 'wallets.json');
const JWT_SECRET = process.env.JWT_SECRET || "wallet-secret-key-change-in-production";

// Ensure wallets directory exists
if (!fs.existsSync(WALLETS_DIR)) {
  fs.mkdirSync(WALLETS_DIR, { recursive: true });
}

// ✅ LOAD/SAVE wallet data to persistent storage
const loadWallets = () => {
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      const data = fs.readFileSync(WALLETS_FILE, 'utf8');
      return new Map(JSON.parse(data));
    }
  } catch (error) {
    console.error('Error loading wallets:', error.message);
  }
  return new Map();
};

const saveWallets = (wallets) => {
  try {
    const data = JSON.stringify([...wallets.entries()], null, 2);
    fs.writeFileSync(WALLETS_FILE, data, 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving wallets:', error.message);
    return false;
  }
};

// ✅ LOAD wallets from persistent storage on startup
let wallets = loadWallets();

// ✅ METAMASK-LIKE: Derive encryption key from user's password
const deriveKeyFromPassword = (password, salt) => {
  // Use PBKDF2 like MetaMask (100,000 iterations for security)
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
};

// ✅ METAMASK-LIKE: Encrypt using password-derived key
const encryptWithPassword = (text, password) => {
  const salt = crypto.randomBytes(16); // Random salt for each wallet
  const key = deriveKeyFromPassword(password, salt);
  const iv = crypto.randomBytes(12); // 12 bytes for GCM
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  
  // Return: salt:iv:encrypted:authTag
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + 
         encrypted.toString('hex') + ':' + authTag.toString('hex');
};

// ✅ METAMASK-LIKE: Decrypt using password-derived key
const decryptWithPassword = (encryptedData, password) => {
  const [saltHex, ivHex, encryptedHex, authTagHex] = encryptedData.split(':');
  
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Derive the same key using password + salt
  const key = deriveKeyFromPassword(password, salt);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

// Password validation
const validatePassword = (password) => {
  const minLength = 6;
  const errors = [];
  
  if (!password) {
    errors.push("Password is required");
  }
  
  if (password && password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }

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

// ✅ NEW: Get primary wallet address
const getPrimaryWalletAddress = () => {
  for (const [address, wallet] of wallets.entries()) {
    if (wallet.isPrimary) {
      return address;
    }
  }
  return null;
};

// ✅ NEW: Set primary wallet
const setPrimaryWallet = (address) => {
  // Clear all primary flags first
  for (const [addr, wallet] of wallets.entries()) {
    wallet.isPrimary = false;
  }
  
  // Set the specified wallet as primary
  const wallet = wallets.get(address);
  if (wallet) {
    wallet.isPrimary = true;
    saveWallets(wallets);
    return true;
  }
  return false;
};

// ✅ FIXED: Remove wallet function (was missing!)
const removeWallet = (address) => {
  try {
    if (wallets.has(address)) {
      wallets.delete(address);
      return saveWallets(wallets);
    }
    return false;
  } catch (error) {
    console.error('Error removing wallet:', error.message);
    return false;
  }
};

// ✅ FIXED: Import wallet with PRIMARY flag support
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

    // ✅ ENCRYPT WITH PASSWORD (like MetaMask)
    const encryptedMnemonic = encryptWithPassword(mnemonic, password);
    const encryptedPrivateKey = encryptWithPassword(privateKey, password);

    // ✅ NEW: Clear other primary flags and set this as primary
    for (const [addr, wallet] of wallets.entries()) {
      wallet.isPrimary = false;
    }

    // Store wallet with encrypted data
    const walletRecord = {
      address: address,
      encryptedMnemonic: encryptedMnemonic,
      encryptedPrivateKey: encryptedPrivateKey,
      createdAt: new Date().toISOString(),
      lastAccess: null,
      accessCount: 0,
      isImported: true,
      isPrimary: true // ✅ NEW: Mark as primary wallet
    };

    wallets.set(address, walletRecord);
    
    // ✅ SAVE TO PERSISTENT STORAGE
    const saved = saveWallets(wallets);
    if (!saved) {
      // Rollback if save failed
      wallets.delete(address);
      return {
        success: false,
        message: "Failed to save wallet to persistent storage"
      };
    }

    return {
      success: true,
      message: "Wallet imported and secured with password",
      address: address, // ✅ IMPORTANT: Return address for frontend
      passwordStrength: passwordValidation.strength,
      isPrimary: true
    };

  } catch (error) {
    return {
      success: false,
      message: "Failed to import wallet",
      error: error.message
    };
  }
};

// ✅ FIXED: Unlock wallet with IMPROVED logic
const unlockWallet = async (addressOrPassword, password) => {
  try {
    let wallet;
    let address;
    let userPassword;

    // Support both modes: unlockWallet(password) or unlockWallet(address, password)
    if (password === undefined) {
      // Password-only mode: Use PRIMARY wallet first, then try others
      userPassword = addressOrPassword;
      
      // ✅ FIRST: Try primary wallet
      const primaryAddress = getPrimaryWalletAddress();
      if (primaryAddress) {
        const primaryWallet = wallets.get(primaryAddress);
        try {
          decryptWithPassword(primaryWallet.encryptedMnemonic, userPassword);
          wallet = primaryWallet;
          address = primaryAddress;
        } catch (error) {
          // Primary wallet doesn't match password, continue to try others
        }
      }
      
      // ✅ FALLBACK: If primary didn't work, try all wallets (sorted by creation date)
      if (!wallet) {
        const sortedWallets = Array.from(wallets.entries())
          .sort(([,a], [,b]) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
        
        for (const [addr, walletData] of sortedWallets) {
          if (addr === primaryAddress) continue; // Skip primary, already tried
          
          try {
            decryptWithPassword(walletData.encryptedMnemonic, userPassword);
            wallet = walletData;
            address = addr;
            break;
          } catch (error) {
            continue;
          }
        }
      }
      
      if (!wallet) {
        return {
          success: false,
          message: "Incorrect password or no wallet found"
        };
      }
    } else {
      // Address + password mode (most secure)
      address = addressOrPassword;
      userPassword = password;
      wallet = wallets.get(address);
      
      if (!wallet) {
        return {
          success: false,
          message: "Wallet not found. Please import your wallet first."
        };
      }
    }

    // ✅ DECRYPT WITH PASSWORD (like MetaMask)
    try {
      const mnemonic = decryptWithPassword(wallet.encryptedMnemonic, userPassword);
      const privateKey = decryptWithPassword(wallet.encryptedPrivateKey, userPassword);

      // Update access info
      wallet.lastAccess = new Date().toISOString();
      wallet.accessCount += 1;
      
      // Save updated access info
      saveWallets(wallets);

      // Generate access token
      const accessToken = jwt.sign(
        { walletAddress: address, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      return {
        success: true,
        message: "Wallet unlocked successfully",
        wallet: {
          address: address,
          mnemonic: mnemonic,
          privateKey: privateKey
        },
        accessToken: accessToken,
        lastAccess: wallet.lastAccess,
        accessCount: wallet.accessCount,
        isPrimary: wallet.isPrimary || false
      };

    } catch (decryptError) {
      return {
        success: false,
        message: "Incorrect password"
      };
    }

  } catch (error) {
    return {
      success: false,
      message: "Failed to unlock wallet",
      error: error.message
    };
  }
};

// ✅ METAMASK-LIKE: Change password by re-encrypting with new password
const changeWalletPassword = async (address, currentPassword, newPassword) => {
  try {
    const wallet = wallets.get(address);
    if (!wallet) {
      return {
        success: false,
        message: "Wallet not found"
      };
    }

    // Try to decrypt with current password
    let mnemonic, privateKey;
    try {
      mnemonic = decryptWithPassword(wallet.encryptedMnemonic, currentPassword);
      privateKey = decryptWithPassword(wallet.encryptedPrivateKey, currentPassword);
    } catch (error) {
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

    // Re-encrypt with new password
    wallet.encryptedMnemonic = encryptWithPassword(mnemonic, newPassword);
    wallet.encryptedPrivateKey = encryptWithPassword(privateKey, newPassword);

    // Save to persistent storage
    const saved = saveWallets(wallets);
    if (!saved) {
      return {
        success: false,
        message: "Failed to save password change"
      };
    }

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

// Other helper functions
const getWalletInfo = (address) => {
  const wallet = wallets.get(address);
  if (!wallet) {
    return { success: false, message: "Wallet not found" };
  }

  return {
    success: true,
    wallet: {
      address: wallet.address,
      createdAt: wallet.createdAt,
      lastAccess: wallet.lastAccess,
      accessCount: wallet.accessCount,
      isImported: wallet.isImported || false,
      isPrimary: wallet.isPrimary || false
    }
  };
};

const walletExists = (address) => wallets.has(address);
const isWalletProtected = (address) => wallets.has(address);

const authenticateWallet = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.walletAddress = decoded.walletAddress;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const getAllWallets = () => {
  const walletList = [];
  for (const [address, wallet] of wallets.entries()) {
    walletList.push({
      address: wallet.address,
      createdAt: wallet.createdAt,
      lastAccess: wallet.lastAccess,
      accessCount: wallet.accessCount,
      isImported: wallet.isImported || false,
      isPrimary: wallet.isPrimary || false
    });
  }
  // Sort by primary first, then by creation date (newest first)
  return walletList.sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
};

// ✅ GRACEFUL SHUTDOWN - Save wallets before exit
process.on('SIGINT', () => {
  console.log('Saving wallets before shutdown...');
  saveWallets(wallets);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Saving wallets before shutdown...');
  saveWallets(wallets);
  process.exit(0);
});

module.exports = {
  validatePassword,
  importWalletWithPassword,
  unlockWallet,
  changeWalletPassword,
  getWalletInfo,
  walletExists,
  isWalletProtected,
  authenticateWallet,
  getAllWallets,
  removeWallet,
  getPrimaryWalletAddress, // ✅ NEW
  setPrimaryWallet, // ✅ NEW
  // Legacy alias
  createWalletWithPassword: importWalletWithPassword
};