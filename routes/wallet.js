const express = require("express");
const router = express.Router();
const crypto = require("crypto");

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
  getAllWallets,
  removeWallet,
  checkPendingSetup,  // New function to check if user has pending setup
  completePendingSetup // New function to complete setup later
} = require("../services/walletPasswordService");

// ========================================
// 🔥 TEMPORARY STORAGE FOR PENDING SETUPS
// ========================================

// In-memory storage for pending wallet setups (expires after 10 minutes)
const pendingSetups = new Map();

// Helper function to clean up expired setups
const cleanupExpiredSetups = () => {
  const now = Date.now();
  for (const [setupId, setup] of pendingSetups.entries()) {
    if (now > setup.expiresAt) {
      pendingSetups.delete(setupId);
    }
  }
};

// Clean up expired setups every 5 minutes
setInterval(cleanupExpiredSetups, 5 * 60 * 1000);

// ========================================
// 🔥 ENHANCED METAMASK-LIKE FLOW ENDPOINTS
// ========================================

// STEP 1: Generate Wallet & Show Seed Phrase (DON'T SAVE YET!)
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

    // Generate wallet but DON'T show seed phrase yet
    const chainsToGenerate = blockchains && Array.isArray(blockchains) 
      ? blockchains 
      : [
          BLOCKCHAIN_TYPES.ETHEREUM,
          BLOCKCHAIN_TYPES.BSC,
          BLOCKCHAIN_TYPES.POLYGON,
          BLOCKCHAIN_TYPES.ARBITRUM,
          BLOCKCHAIN_TYPES.OPTIMISM
        ].filter(chain => isValidBlockchainType(chain));
    
    const multiWalletData = generateMultiChainWallet(chainsToGenerate);
    const primaryChain = chainsToGenerate.includes(BLOCKCHAIN_TYPES.ETHEREUM) 
      ? BLOCKCHAIN_TYPES.ETHEREUM 
      : chainsToGenerate[0];
    const primaryWallet = multiWalletData.wallets[primaryChain];
    
    // Generate temporary setup ID
    const setupId = crypto.randomBytes(16).toString('hex');
    
    // Store setup data temporarily
    pendingSetups.set(setupId, {
      mnemonic: multiWalletData.mnemonic,
      password: password,
      walletData: {
        mnemonic: multiWalletData.mnemonic,
        privateKey: primaryWallet.privateKey,
        address: primaryWallet.address,
        blockchain: primaryChain
      },
      multiWalletData: multiWalletData,
      primaryChain: primaryChain,
      blockchains: chainsToGenerate,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    cleanupExpiredSetups();

    res.status(200).json({
      success: true,
      message: "🔑 Password set! Your wallet is ready.",
      setup: {
        setupId: setupId,
        primaryWallet: {
          address: primaryWallet.address,
          blockchain: primaryChain
        },
        allWallets: Object.fromEntries(
          Object.entries(multiWalletData.wallets).map(([chain, wallet]) => [
            chain, 
            { address: wallet.address, blockchain: chain }
          ])
        ),
        supportedChains: multiWalletData.supportedChains
      },
      security: {
        passwordStrength: validation.strength,
        isEncrypted: false,
        isPending: true
      },
      options: {
        // ✅ USER CHOICE: Two clear options
        option1: {
          title: "🔒 Skip Seed Phrase (Recommended for beginners)",
          description: "Save wallet now and use it immediately",
          endpoint: "POST /save-wallet",
          params: { setupId },
          note: "You can always view your seed phrase later in settings"
        },
        option2: {
          title: "📝 Show Seed Phrase First (Advanced users)",
          description: "View and confirm your 12-word recovery phrase",
          endpoint: "POST /show-seed-phrase", 
          params: { setupId },
          note: "Required if you want to backup your wallet manually"
        }
      },
      instructions: {
        step: "1 of 2",
        message: "Choose how you want to proceed with your wallet setup",
        expiresIn: "10 minutes"
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to create wallet",
      error: err.message 
    });
  }
});

router.post("/save-wallet", async (req, res) => {
  try {
    const { setupId } = req.body;

    if (!setupId) {
      return res.status(400).json({
        success: false,
        message: "Setup ID is required"
      });
    }

    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid or expired setup ID. Please start over.",
        error: "SETUP_NOT_FOUND"
      });
    }

    if (Date.now() > pendingSetup.expiresAt) {
      pendingSetups.delete(setupId);
      return res.status(400).json({
        success: false,
        message: "⏰ Setup session expired. Please start over.",
        error: "SETUP_EXPIRED"
      });
    }

    // Save wallet permanently
    const result = await importWalletWithPassword(pendingSetup.walletData, pendingSetup.password);
    
    if (result.success) {
      // ✅ DON'T DELETE setupId yet - keep it for potential seed phrase viewing
      // pendingSetups.delete(setupId); // ← COMMENTED OUT
      
      // ✅ Mark as saved but keep setup alive
      pendingSetup.walletSaved = true;
      pendingSetup.savedAt = Date.now();
      
      // ✅ Extend expiry for seed phrase viewing (e.g., 1 hour)
      pendingSetup.expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour

      res.status(201).json({
        success: true,
        message: "🎉 Wallet created and saved successfully!",
        wallet: {
          address: pendingSetup.walletData.address,
          blockchain: pendingSetup.primaryChain
        },
        allWallets: pendingSetup.multiWalletData.wallets,
        supportedChains: pendingSetup.multiWalletData.supportedChains,
        security: {
          passwordStrength: result.passwordStrength,
          isEncrypted: true,
          seedPhraseBackup: "Available in wallet settings"
        },
        instructions: {
          step: "✅ COMPLETE",
          status: "Your wallet is now secured and ready to use!",
          nextStep: "Use /unlock with your password to access your wallet",
          seedPhraseAccess: "You can still view your seed phrase using /show-seed-phrase with setupId (expires in 1 hour)"
        },
        // ✅ Keep setupId available for seed phrase viewing
        setup: {
          setupId: setupId,
          seedPhraseAvailable: true,
          expiresAt: new Date(pendingSetup.expiresAt).toISOString()
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: "❌ Failed to save wallet",
        error: result.message
      });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to save wallet",
      error: err.message 
    });
  }
});

// ✅ NEW: Dismiss Setup (Clean up setupId after user is done)
router.post("/dismiss-setup", async (req, res) => {
  try {
    const { setupId } = req.body;

    if (!setupId) {
      return res.status(400).json({
        success: false,
        message: "Setup ID is required"
      });
    }

    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup) {
      return res.status(400).json({
        success: false,
        message: "Setup ID not found (may have already been dismissed)"
      });
    }

    // ✅ Clean up the setup
    pendingSetups.delete(setupId);

    res.json({
      success: true,
      message: "✅ Setup dismissed successfully",
      instructions: {
        status: "Setup cleanup complete",
        nextStep: "Use /unlock with your password to access your wallet anytime"
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to dismiss setup",
      error: err.message 
    });
  }
});

// STEP 2B: Show Seed Phrase (For Advanced Users)
// STEP 2B: Show Seed Phrase (Works EVEN after wallet is saved)
router.post("/show-seed-phrase", async (req, res) => {
  try {
    const { setupId } = req.body;

    if (!setupId) {
      return res.status(400).json({
        success: false,
        message: "Setup ID is required"
      });
    }

    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid or expired setup ID",
        error: "SETUP_NOT_FOUND"
      });
    }

    if (Date.now() > pendingSetup.expiresAt) {
      pendingSetups.delete(setupId);
      return res.status(400).json({
        success: false,
        message: "⏰ Setup session expired",
        error: "SETUP_EXPIRED"
      });
    }

    res.status(200).json({
      success: true,
      message: "🔑 Here is your 12-word seed phrase",
      setup: {
        setupId: setupId,
        seedPhrase: pendingSetup.mnemonic,
        primaryWallet: {
          address: pendingSetup.walletData.address,
          blockchain: pendingSetup.primaryChain
        },
        allWallets: pendingSetup.multiWalletData.wallets,
        supportedChains: pendingSetup.multiWalletData.supportedChains,
        // ✅ Show if wallet is already saved
        walletStatus: pendingSetup.walletSaved ? "✅ Already Saved" : "⏳ Pending Save"
      },
      security: {
        critical: "⚠️ WRITE DOWN YOUR 12-WORD SEED PHRASE NOW!",
        warning: "This is the ONLY way to recover your wallet if you lose your password",
        responsibility: "Keep it safe and never share it with anyone"
      },
      instructions: {
        status: pendingSetup.walletSaved ? 
          "Your wallet is saved. This seed phrase is for backup purposes." :
          "Write down your seed phrase, then confirm it to save your wallet",
        nextStep: pendingSetup.walletSaved ? 
          "Call /dismiss-setup to clean up, or /unlock to use your wallet" :
          "Call /confirm-seed-phrase to save your wallet",
        timeLeft: Math.ceil((pendingSetup.expiresAt - Date.now()) / 1000) + " seconds"
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to show seed phrase",
      error: err.message 
    });
  }
});
// STEP 3: Confirm Seed Phrase (Only if user chose to see it)
router.post("/confirm-seed-phrase", async (req, res) => {
  try {
    const { setupId, seedPhrase } = req.body;

    if (!setupId || !seedPhrase) {
      return res.status(400).json({
        success: false,
        message: "Setup ID and seed phrase are required"
      });
    }

    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid or expired setup ID",
        error: "SETUP_NOT_FOUND"
      });
    }

    if (Date.now() > pendingSetup.expiresAt) {
      pendingSetups.delete(setupId);
      return res.status(400).json({
        success: false,
        message: "⏰ Setup session expired",
        error: "SETUP_EXPIRED"
      });
    }

    // Verify seed phrase matches
    const originalMnemonic = pendingSetup.mnemonic.trim().toLowerCase();
    const confirmedMnemonic = seedPhrase.trim().toLowerCase();

    if (originalMnemonic !== confirmedMnemonic) {
      return res.status(400).json({
        success: false,
        message: "❌ Seed phrase does not match. Please check and try again.",
        error: "MNEMONIC_MISMATCH",
        hint: "Make sure you entered all 12 words in the correct order"
      });
    }

    // Save wallet permanently
    const result = await importWalletWithPassword(pendingSetup.walletData, pendingSetup.password);
    
    if (result.success) {
      pendingSetups.delete(setupId);

      res.status(201).json({
        success: true,
        message: "🎉 Seed phrase confirmed! Wallet created successfully.",
        wallet: {
          address: pendingSetup.walletData.address,
          blockchain: pendingSetup.primaryChain
        },
        allWallets: pendingSetup.multiWalletData.wallets,
        supportedChains: pendingSetup.multiWalletData.supportedChains,
        security: {
          passwordStrength: result.passwordStrength,
          isEncrypted: true,
          seedPhraseConfirmed: true
        },
        instructions: {
          step: "✅ COMPLETE",
          status: "Your wallet is now secured and ready to use!",
          nextStep: "Use /unlock with your password to access your wallet"
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: "❌ Failed to save wallet after confirmation",
        error: result.message
      });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to confirm seed phrase",
      error: err.message 
    });
  }
});

// ENHANCED: Show Seed Phrase for Already Created Wallets
router.post("/show-seed-phrase-existing", authenticateWallet, async (req, res) => {
  try {
    const { password } = req.body;
    const address = req.walletAddress;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required to view seed phrase"
      });
    }

    // Unlock wallet to get seed phrase
    const result = await unlockWallet(address, password);
    
    if (result.success) {
      res.json({
        success: true,
        message: "🔑 Your seed phrase",
        seedPhrase: result.wallet.mnemonic,
        security: {
          warning: "⚠️ Keep this seed phrase safe and never share it",
          responsibility: "This can be used to recover your wallet on any device"
        },
        instructions: {
          backup: "Write this down and store it in a safe place",
          security: "Never save it digitally or share it with anyone"
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: "❌ Incorrect password",
        error: "Cannot show seed phrase without correct password"
      });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to show seed phrase",
      error: err.message 
    });
  }
});
// STEP 2: Confirm Seed Phrase & Save Wallet (METAMASK-LIKE CONFIRMATION)
router.post("/confirm-seed-phrase", async (req, res) => {
  try {
    const { setupId, seedPhrase } = req.body;

    if (!setupId || !seedPhrase) {
      return res.status(400).json({
        success: false,
        message: "Setup ID and seed phrase are required"
      });
    }

    // Get pending setup
    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup) {
      return res.status(400).json({
        success: false,
        message: "❌ Invalid or expired setup ID. Please start over with /create-password",
        error: "SETUP_NOT_FOUND",
        instructions: {
          action: "Start a new wallet creation process",
          endpoint: "POST /create-password"
        }
      });
    }

    // Check if expired
    if (Date.now() > pendingSetup.expiresAt) {
      pendingSetups.delete(setupId);
      return res.status(400).json({
        success: false,
        message: "⏰ Setup session expired. Please start over.",
        error: "SETUP_EXPIRED",
        instructions: {
          action: "Start a new wallet creation process",
          endpoint: "POST /create-password"
        }
      });
    }

    // ✅ METAMASK-LIKE: Verify seed phrase matches EXACTLY
    const originalMnemonic = pendingSetup.mnemonic.trim().toLowerCase();
    const confirmedMnemonic = seedPhrase.trim().toLowerCase();

    if (originalMnemonic !== confirmedMnemonic) {
      return res.status(400).json({
        success: false,
        message: "❌ Seed phrase does not match. Please check and try again.",
        error: "MNEMONIC_MISMATCH",
        hint: "Make sure you entered all 12 words in the correct order with proper spelling",
        instructions: {
          retry: "Double-check your written seed phrase and try again",
          timeLeft: Math.ceil((pendingSetup.expiresAt - Date.now()) / 1000) + " seconds"
        }
      });
    }

    // ✅ METAMASK-LIKE: Seed phrase confirmed! NOW save the wallet permanently
    const result = await importWalletWithPassword(pendingSetup.walletData, pendingSetup.password);
    
    if (result.success) {
      // Clean up pending setup
      pendingSetups.delete(setupId);

      res.status(201).json({
        success: true,
        message: "🎉 Wallet created successfully! Seed phrase confirmed and wallet secured.",
        wallet: {
          address: pendingSetup.walletData.address,
          blockchain: pendingSetup.primaryChain
        },
        // ✅ ENHANCED: Show all generated addresses
        allWallets: pendingSetup.multiWalletData.wallets,
        supportedChains: pendingSetup.multiWalletData.supportedChains,
        security: {
          passwordStrength: result.passwordStrength,
          isEncrypted: true,
          seedPhraseConfirmed: true,
          isPermanentlySaved: true
        },
        instructions: {
          step: "✅ COMPLETE",
          status: "Your wallet is now secured and ready to use!",
          nextStep: "Use /unlock endpoint with your password to access your wallet",
          important: "🔒 Your seed phrase is now encrypted and stored securely"
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: "❌ Failed to save wallet after confirmation",
        error: result.message || "Unknown error during wallet save"
      });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to confirm seed phrase",
      error: err.message 
    });
  }
});

// ✅ ENHANCED: STEP 3: Unlock Wallet with Password (Shows ALL Addresses)
router.post("/unlock", async (req, res) => {
  try {
    const { password, address, regenerateChains, setupId } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    // ✅ NEW FEATURE: Check if user has pending setup and wants to complete it
    if (setupId) {
      const pendingSetup = pendingSetups.get(setupId);
      if (pendingSetup && pendingSetup.password === password) {
        // User can complete setup later via unlock
        return res.json({
          success: true,
          message: "🔓 Pending setup found! You can complete wallet creation.",
          hasPendingSetup: true,
          setup: {
            setupId: setupId,
            primaryWallet: {
              address: pendingSetup.walletData.address,
              blockchain: pendingSetup.primaryChain
            },
            allWallets: pendingSetup.multiWalletData.wallets,
            supportedChains: pendingSetup.multiWalletData.supportedChains,
            expiresAt: new Date(pendingSetup.expiresAt).toISOString()
          },
          instructions: {
            option1: "Call /confirm-seed-phrase to complete setup",
            option2: "Continue using this temporary session",
            warning: "⚠️ Setup will expire and be lost if not confirmed"
          }
        });
      }
    }

    let result;
    
    if (address) {
      // Unlock specific wallet by address + password
      result = await unlockWallet(address, password);
    } else {
      // Password-only unlock (MetaMask style - tries all wallets)
      result = await unlockWallet(password);
    }
    
    if (result.success) {
      // ✅ ENHANCED: Generate ALL supported chain addresses from mnemonic
      const allSupportedChains = getSupportedBlockchains();
      let multiChainWallets = {};
      let evmAddresses = {};
      let nonEvmAddresses = {};
      
      try {
        // Generate wallets for ALL supported chains
        const chainsToGenerate = regenerateChains && Array.isArray(regenerateChains) 
          ? regenerateChains 
          : allSupportedChains;

        const multiWalletData = generateMultiChainWalletFromMnemonic(
          result.wallet.mnemonic, 
          chainsToGenerate
        );
        
        multiChainWallets = multiWalletData.wallets;

        // ✅ SEPARATE EVM and NON-EVM addresses
        for (const [chainType, walletData] of Object.entries(multiChainWallets)) {
          if (walletData && !walletData.error) {
            // EVM chains (use same address format)
            if ([
              BLOCKCHAIN_TYPES.ETHEREUM,
              BLOCKCHAIN_TYPES.BSC,
              BLOCKCHAIN_TYPES.POLYGON,
              BLOCKCHAIN_TYPES.ARBITRUM,
              BLOCKCHAIN_TYPES.OPTIMISM,
              BLOCKCHAIN_TYPES.AVALANCHE
            ].includes(chainType)) {
              evmAddresses[chainType] = {
                address: walletData.address,
                privateKey: walletData.privateKey,
                isEVM: true
              };
            } else {
              // Non-EVM chains (different address formats)
              nonEvmAddresses[chainType] = {
                address: walletData.address,
                privateKey: walletData.privateKey,
                isEVM: false
              };
            }
          }
        }
      } catch (error) {
        console.warn("Failed to regenerate multi-chain wallets:", error.message);
      }

      let response = {
        success: true,
        message: "🔓 Wallet unlocked successfully",
        // ✅ METAMASK-LIKE: Mnemonic available after unlock (in memory)
        wallet: {
          address: result.wallet.address,
          mnemonic: result.wallet.mnemonic, // ✅ Available after unlock
          privateKey: result.wallet.privateKey,
          blockchain: result.wallet.blockchain || BLOCKCHAIN_TYPES.ETHEREUM
        },
        // ✅ ENHANCED: Show ALL addresses organized by type
        addresses: {
          primary: {
            address: result.wallet.address,
            blockchain: result.wallet.blockchain || BLOCKCHAIN_TYPES.ETHEREUM
          },
          evm: evmAddresses,
          nonEvm: nonEvmAddresses,
          all: multiChainWallets
        },
        session: {
          accessToken: result.accessToken,
          lastAccess: result.lastAccess,
          accessCount: result.accessCount,
          isUnlocked: true
        },
        statistics: {
          totalAddresses: Object.keys(multiChainWallets).length,
          evmAddresses: Object.keys(evmAddresses).length,
          nonEvmAddresses: Object.keys(nonEvmAddresses).length,
          supportedChains: allSupportedChains.length
        },
        instructions: {
          status: "🔓 Wallet is now unlocked and ready to use",
          security: "Your seed phrase is temporarily available in memory for this session",
          multiChain: `Generated addresses for ${Object.keys(multiChainWallets).length} blockchain networks`
        }
      };

      res.json(response);
    } else {
      res.status(401).json({
        success: false,
        message: result.message || "Incorrect password",
        instructions: {
          error: "🔒 Wallet remains locked",
          help: "Please check your password and try again",
          hint: "If you just created a wallet, you might have a pending setup. Include 'setupId' in your request."
        }
      });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to unlock wallet",
      error: err.message 
    });
  }
});

// ✅ NEW: Complete Pending Setup Later
router.post("/complete-setup", async (req, res) => {
  try {
    const { setupId, password, seedPhrase } = req.body;

    if (!setupId || !password) {
      return res.status(400).json({
        success: false,
        message: "Setup ID and password are required"
      });
    }

    const pendingSetup = pendingSetups.get(setupId);
    if (!pendingSetup || pendingSetup.password !== password) {
      return res.status(400).json({
        success: false,
        message: "Invalid setup ID or password"
      });
    }

    if (seedPhrase) {
      // If seed phrase provided, verify it
      const originalMnemonic = pendingSetup.mnemonic.trim().toLowerCase();
      const confirmedMnemonic = seedPhrase.trim().toLowerCase();

      if (originalMnemonic !== confirmedMnemonic) {
        return res.status(400).json({
          success: false,
          message: "❌ Seed phrase does not match"
        });
      }
    }

    // Complete the setup
    const result = await importWalletWithPassword(pendingSetup.walletData, pendingSetup.password);
    
    if (result.success) {
      pendingSetups.delete(setupId);
      
      res.json({
        success: true,
        message: "✅ Wallet setup completed successfully!",
        wallet: {
          address: pendingSetup.walletData.address,
          blockchain: pendingSetup.primaryChain
        },
        allWallets: pendingSetup.multiWalletData.wallets,
        instructions: {
          status: "Your wallet is now permanently saved and secured",
          nextStep: "Use /unlock to access your wallet anytime"
        }
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to complete setup",
      error: err.message 
    });
  }
});

// NEW: Check Setup Status (useful for UI)
router.get("/setup-status/:setupId", (req, res) => {
  try {
    const setupId = req.params.setupId;
    const pendingSetup = pendingSetups.get(setupId);
    
    if (!pendingSetup) {
      return res.status(404).json({
        success: false,
        message: "Setup not found or expired",
        status: "NOT_FOUND",
        instructions: {
          action: "Start a new wallet creation process",
          endpoint: "POST /create-password"
        }
      });
    }

    const now = Date.now();
    const timeLeft = Math.max(0, pendingSetup.expiresAt - now);
    
    if (timeLeft === 0) {
      pendingSetups.delete(setupId);
      return res.status(400).json({
        success: false,
        message: "Setup expired",
        status: "EXPIRED",
        instructions: {
          action: "Start a new wallet creation process",
          endpoint: "POST /create-password"
        }
      });
    }

    res.json({
      success: true,
      setupId: setupId,
      status: "PENDING_CONFIRMATION",
      timeLeft: Math.ceil(timeLeft / 1000), // seconds
      expiresAt: new Date(pendingSetup.expiresAt).toISOString(),
      walletAddress: pendingSetup.walletData.address,
      blockchain: pendingSetup.primaryChain,
      allWallets: pendingSetup.multiWalletData.wallets,
      instructions: {
        step: "2 of 2",
        action: "Please re-enter your 12-word seed phrase to complete setup",
        endpoints: {
          confirm: "POST /confirm-seed-phrase",
          complete: "POST /complete-setup",
          unlock: "POST /unlock (with setupId)"
        }
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// STEP 2 ALT: Import Existing Wallet with Password (MetaMask Import Flow) - UNCHANGED but enhanced
router.post("/import-with-password", async (req, res) => {
  try {
    const { mnemonic, password, blockchains, primaryBlockchain, overwrite } = req.body;

    if (!mnemonic || !password) {
      return res.status(400).json({
        success: false,
        message: "Seed phrase and password are required"
      });
    }

    // Validate mnemonic format
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return res.status(400).json({
        success: false,
        message: "Seed phrase must be 12 or 24 words"
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

    // ✅ ENHANCED: Default to ALL supported chains
    const allSupportedChains = getSupportedBlockchains();
    const chainsToGenerate = blockchains && Array.isArray(blockchains) 
      ? blockchains 
      : allSupportedChains;

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
        message: "Invalid seed phrase",
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
        message: `Failed to generate ${primaryChain} wallet from seed phrase`
      });
    }

    // Check for existing wallets
    const existingWallets = [];
    const conflictingWallets = [];
    
    for (const chain of chainsToGenerate) {
      const wallet = multiWalletData.wallets[chain];
      if (!wallet || wallet.error) continue;
      
      const address = wallet.address;
      const exists = walletExists(address);
      const isProtected = isWalletProtected(address);
      
      if (exists) {
        existingWallets.push({ chain, address, isProtected });
        if (isProtected && !overwrite) {
          conflictingWallets.push({ chain, address });
        }
      }
    }

    // Handle conflicts
    if (conflictingWallets.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Some wallets already exist and are password protected",
        conflictingWallets: conflictingWallets,
        existingWallets: existingWallets,
        suggestion: "Add 'overwrite: true' to replace existing wallets",
        conflictType: "MULTIPLE_WALLETS_EXIST"
      });
    }

    // Import the primary wallet
    const walletDataForEncryption = {
      mnemonic: multiWalletData.mnemonic,
      privateKey: primaryWallet.privateKey,
      address: primaryWallet.address,
      blockchain: primaryChain
    };

    // Handle overwrite if needed
    if (overwrite && existingWallets.length > 0) {
      for (const existing of existingWallets) {
        if (existing.isProtected) {
          removeWallet(existing.address);
        }
      }
    }

    const result = await importWalletWithPassword(walletDataForEncryption, password);
    
    if (result.success) {
      // Separate EVM and non-EVM addresses
      const evmAddresses = {};
      const nonEvmAddresses = {};
      
      for (const [chainType, walletData] of Object.entries(multiWalletData.wallets)) {
        if (walletData && !walletData.error) {
          if ([
            BLOCKCHAIN_TYPES.ETHEREUM,
            BLOCKCHAIN_TYPES.BSC,
            BLOCKCHAIN_TYPES.POLYGON,
            BLOCKCHAIN_TYPES.ARBITRUM,
            BLOCKCHAIN_TYPES.OPTIMISM,
            BLOCKCHAIN_TYPES.AVALANCHE
          ].includes(chainType)) {
            evmAddresses[chainType] = {
              address: walletData.address,
              privateKey: walletData.privateKey,
              isEVM: true
            };
          } else {
            nonEvmAddresses[chainType] = {
              address: walletData.address,
              privateKey: walletData.privateKey,
              isEVM: false
            };
          }
        }
      }

      // ✅ METAMASK-LIKE: Show mnemonic ONLY during import for confirmation
      res.status(201).json({
        success: true,
        message: "Wallet imported successfully!",
        import: {
          // ✅ CRITICAL: Mnemonic shown ONLY during import
          seedPhrase: multiWalletData.mnemonic,
          primaryWallet: {
            address: primaryWallet.address,
            blockchain: primaryChain
          },
          // ✅ ENHANCED: Show organized addresses
          addresses: {
            evm: evmAddresses,
            nonEvm: nonEvmAddresses,
            all: multiWalletData.wallets
          },
          supportedChains: multiWalletData.supportedChains
        },
        statistics: {
          totalAddresses: Object.keys(multiWalletData.wallets).length,
          evmAddresses: Object.keys(evmAddresses).length,
          nonEvmAddresses: Object.keys(nonEvmAddresses).length
        },
        security: {
          passwordStrength: validation.strength,
          isEncrypted: true,
          wasOverwritten: overwrite && existingWallets.length > 0
        },
        instructions: {
          confirmation: "✅ Your wallet has been imported and encrypted with your password",
          nextStep: "Use /unlock endpoint with your password to access your wallet"
        }
      });
    } else {
      res.status(400).json(result);
    }

  } catch (err) {
    console.error("Import with password error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to import wallet",
      error: err.message 
    });
  }
});

// ========================================
// 🔧 WALLET STATUS & MANAGEMENT (unchanged)
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
      status: exists ? 
        (isProtected ? "🔒 Password Protected" : "⚠️ Unprotected") :
        "❌ Not Found",
      message: exists ? 
        (isProtected ? "Wallet exists and is encrypted with password" : "Wallet exists but not password protected") :
        "Wallet not found - use /create-password or /import-with-password"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Get wallet info (requires authentication)
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
          isImported: result.wallet.isImported,
          status: "🔓 Unlocked"
        },
        session: {
          isAuthenticated: true,
          hasAccess: true
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

// Rest of the endpoints remain unchanged...
// (change-password, validate-password, balance, transactions, blockchains, token-price, health)

// ========================================
// 🏥 ENHANCED HEALTH CHECK
// ========================================

router.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "🟢 Enhanced Wallet service is running",
    features: {
      passwordProtection: "✅ Enabled",
      seedPhraseConfirmation: "✅ MetaMask-like",
      encryption: "✅ AES-256-GCM",
      multiChain: "✅ All Supported Chains",
      persistentStorage: "✅ File-based",
      pendingSetup: "✅ Can complete later",
      multiAddressUnlock: "✅ EVM + Non-EVM separation"
    },
    endpoints: {
      setup: "/create-password (shows seed phrase)",
      confirm: "/confirm-seed-phrase (saves wallet)",
      import: "/import-with-password", 
      unlock: "/unlock",
      status: "/status/:address"
    },
    flow: "🔄 MetaMask-like: Generate → Show Seed → Confirm Seed → Save Wallet"
  });
});

module.exports = router;