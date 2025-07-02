// services/walletPasswordService.js - MetaMask-like Implementation
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// In-memory wallet store
const wallets = new Map();
const JWT_SECRET = process.env.JWT_SECRET || "wallet-secret-key-change-in-production";

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

// Password validation (same as your code)
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

// ✅ METAMASK-LIKE: Import wallet with password-based encryption
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

    // ✅ ENCRYPT WITH PASSWORD (like MetaMask)
    const encryptedMnemonic = encryptWithPassword(mnemonic, password);
    const encryptedPrivateKey = encryptWithPassword(privateKey, password);

    // Store wallet with encrypted data (NO password hash needed!)
    const walletRecord = {
      address: address,
      encryptedMnemonic: encryptedMnemonic,
      encryptedPrivateKey: encryptedPrivateKey,
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

// ✅ METAMASK-LIKE: Unlock wallet by trying to decrypt with password
const unlockWallet = async (addressOrPassword, password) => {
  try {
    let wallet;
    let address;
    let userPassword;

    // Support both modes: unlockWallet(password) or unlockWallet(address, password)
    if (password === undefined) {
      // Password-only mode: try to decrypt all wallets
      userPassword = addressOrPassword;
      
      for (const [addr, walletData] of wallets.entries()) {
        try {
          // Try to decrypt with this password
          decryptWithPassword(walletData.encryptedMnemonic, userPassword);
          wallet = walletData;
          address = addr;
          break; // Success! Found the right wallet
        } catch (error) {
          // Wrong password for this wallet, continue searching
          continue;
        }
      }
      
      if (!wallet) {
        return {
          success: false,
          message: "Incorrect password or no wallet found"
        };
      }
    } else {
      // Address + password mode
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
      wallet.lastAccess = new Date();
      wallet.accessCount += 1;

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
        accessCount: wallet.accessCount
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



// Other helper functions (same as your code)
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
      isImported: wallet.isImported || false
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
      isImported: wallet.isImported || false
    });
  }
  return walletList;
};

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
  // Legacy alias
  createWalletWithPassword: importWalletWithPassword
};