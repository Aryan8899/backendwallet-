const bip39 = require("bip39");
const { hdkey } = require("ethereumjs-wallet");
const bitcoin = require("bitcoinjs-lib");
const { payments } = bitcoin;

// Supported blockchain types
const BLOCKCHAIN_TYPES = {
  ETHEREUM: 'ethereum',
  BITCOIN: 'bitcoin', 
  DOGECOIN: 'dogecoin',
  LITECOIN: 'litecoin',
  TRON: 'tron',
  XRP: 'xrp'
};

// Derivation paths for different cryptocurrencies
const DERIVATION_PATHS = {
  [BLOCKCHAIN_TYPES.ETHEREUM]: "m/44'/60'/0'/0/0",
  [BLOCKCHAIN_TYPES.BITCOIN]: "m/44'/0'/0'/0/0",
  [BLOCKCHAIN_TYPES.DOGECOIN]: "m/44'/3'/0'/0/0",
  [BLOCKCHAIN_TYPES.LITECOIN]: "m/44'/2'/0'/0/0",
  [BLOCKCHAIN_TYPES.TRON]: "m/44'/195'/0'/0/0",
  [BLOCKCHAIN_TYPES.XRP]: "m/44'/144'/0'/0/0"
};

// Bitcoin network configurations
const BITCOIN_NETWORKS = {
  [BLOCKCHAIN_TYPES.BITCOIN]: bitcoin.networks.bitcoin,
  [BLOCKCHAIN_TYPES.DOGECOIN]: {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bech32: 'dc',
    bip32: { public: 0x02facafd, private: 0x02fac398 },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e
  },
  [BLOCKCHAIN_TYPES.LITECOIN]: {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'ltc1',
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0
  }
};

// Generate wallet for multiple blockchains
const generateMultiChainWallet = (blockchainTypes = [BLOCKCHAIN_TYPES.ETHEREUM]) => {
  // Generate mnemonic (12 words)
  const mnemonic = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  const wallets = {};
  
  blockchainTypes.forEach(blockchainType => {
    try {
      const wallet = generateWalletForBlockchain(mnemonic, blockchainType);
      wallets[blockchainType] = wallet;
    } catch (error) {
      console.error(`Error generating ${blockchainType} wallet:`, error.message);
      wallets[blockchainType] = { error: error.message };
    }
  });
  
  return {
    mnemonic,
    wallets,
    supportedChains: blockchainTypes
  };
};

// Generate wallet from mnemonic for specific blockchain
const generateWalletForBlockchain = (mnemonic, blockchainType) => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derivationPath = DERIVATION_PATHS[blockchainType];
  
  if (!derivationPath) {
    throw new Error(`Unsupported blockchain type: ${blockchainType}`);
  }
  
  switch (blockchainType) {
    case BLOCKCHAIN_TYPES.ETHEREUM:
      return generateEthereumWallet(seed, derivationPath);
    
    case BLOCKCHAIN_TYPES.BITCOIN:
    case BLOCKCHAIN_TYPES.DOGECOIN:
    case BLOCKCHAIN_TYPES.LITECOIN:
      return generateBitcoinLikeWallet(seed, derivationPath, blockchainType);
    
    case BLOCKCHAIN_TYPES.TRON:
      return generateTronWallet(seed, derivationPath);
    
    case BLOCKCHAIN_TYPES.XRP:
      return generateXRPWallet(seed, derivationPath);
    
    default:
      throw new Error(`Unsupported blockchain type: ${blockchainType}`);
  }
};

// Generate Ethereum/EVM wallet
const generateEthereumWallet = (seed, derivationPath) => {
  const hdWallet = hdkey.fromMasterSeed(seed);
  const key = hdWallet.derivePath(derivationPath);
  const wallet = key.getWallet();
  
  return {
    blockchain: BLOCKCHAIN_TYPES.ETHEREUM,
    privateKey: wallet.getPrivateKeyString(),
    publicKey: wallet.getPublicKeyString(),
    address: wallet.getAddressString(),
    format: 'EVM Compatible'
  };
};

// Generate Bitcoin-like wallets (Bitcoin, Dogecoin, Litecoin)
const generateBitcoinLikeWallet = (seed, derivationPath, blockchainType) => {
  const root = bitcoin.bip32.fromSeed(seed);
  const child = root.derivePath(derivationPath);
  const network = BITCOIN_NETWORKS[blockchainType];
  
  // Generate different address formats
  const keyPair = bitcoin.ECPair.fromPrivateKey(child.privateKey, { network });
  
  // P2PKH address (Legacy format)
  const p2pkh = payments.p2pkh({ pubkey: keyPair.publicKey, network });
  
  // P2SH-P2WPKH (SegWit wrapped in P2SH) - only for Bitcoin and Litecoin
  let p2sh, bech32;
  if (blockchainType === BLOCKCHAIN_TYPES.BITCOIN || blockchainType === BLOCKCHAIN_TYPES.LITECOIN) {
    const p2wpkh = payments.p2wpkh({ pubkey: keyPair.publicKey, network });
    p2sh = payments.p2sh({ redeem: p2wpkh, network });
    bech32 = p2wpkh.address;
  }
  
  return {
    blockchain: blockchainType,
    privateKey: keyPair.toWIF(),
    publicKey: keyPair.publicKey.toString('hex'),
    addresses: {
      legacy: p2pkh.address,
      segwit: p2sh?.address || null,
      bech32: bech32 || null
    },
    // Use legacy as default for compatibility
    address: p2pkh.address,
    format: 'UTXO'
  };
};

// Generate Tron wallet (TRX)
const generateTronWallet = (seed, derivationPath) => {
  try {
    // For now, we'll use Ethereum-style generation as Tron uses similar cryptography
    // In production, you'd want to use proper Tron libraries like tronweb
    const hdWallet = hdkey.fromMasterSeed(seed);
    const key = hdWallet.derivePath(derivationPath);
    const wallet = key.getWallet();
    
    // Convert Ethereum address to Tron format (this is simplified)
    // In reality, you'd use proper Tron address conversion
    const ethAddress = wallet.getAddressString();
    const tronAddress = convertEthToTronAddress(ethAddress);
    
    return {
      blockchain: BLOCKCHAIN_TYPES.TRON,
      privateKey: wallet.getPrivateKeyString(),
      publicKey: wallet.getPublicKeyString(),
      address: tronAddress,
      format: 'Tron'
    };
  } catch (error) {
    throw new Error(`Tron wallet generation failed: ${error.message}`);
  }
};

// Generate XRP wallet
const generateXRPWallet = (seed, derivationPath) => {
  try {
    // For XRP, we need specific libraries. This is a simplified version.
    // In production, use ripple-lib or xrpl library
    const hdWallet = hdkey.fromMasterSeed(seed);
    const key = hdWallet.derivePath(derivationPath);
    const wallet = key.getWallet();
    
    // Generate XRP address (this is simplified - use proper XRP libraries)
    const xrpAddress = generateXRPAddressFromKey(wallet.getPublicKey());
    
    return {
      blockchain: BLOCKCHAIN_TYPES.XRP,
      privateKey: wallet.getPrivateKeyString(),
      publicKey: wallet.getPublicKeyString(),
      address: xrpAddress,
      format: 'XRP Ledger'
    };
  } catch (error) {
    throw new Error(`XRP wallet generation failed: ${error.message}`);
  }
};

// Helper function to convert Ethereum address to Tron format
const convertEthToTronAddress = (ethAddress) => {
  // This is a simplified conversion - in production use proper Tron libraries
  // Tron addresses start with 'T' and are base58 encoded
  // For now, return a placeholder that looks like a Tron address
  return 'T' + ethAddress.slice(2, 36); // Simplified - not a real conversion
};

// Helper function to generate XRP address
const generateXRPAddressFromKey = (publicKey) => {
  // This is a placeholder - in production use proper XRP libraries
  // XRP addresses start with 'r' and are base58 encoded
  return 'r' + publicKey.toString('hex').slice(0, 32); // Simplified - not a real conversion
};

// Generate wallet from existing mnemonic for multiple chains
const generateMultiChainWalletFromMnemonic = (mnemonic, blockchainTypes = [BLOCKCHAIN_TYPES.ETHEREUM]) => {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  
  const wallets = {};
  
  blockchainTypes.forEach(blockchainType => {
    try {
      const wallet = generateWalletForBlockchain(mnemonic, blockchainType);
      wallets[blockchainType] = wallet;
    } catch (error) {
      console.error(`Error generating ${blockchainType} wallet:`, error.message);
      wallets[blockchainType] = { error: error.message };
    }
  });
  
  return {
    mnemonic,
    wallets,
    supportedChains: blockchainTypes
  };
};

// Legacy functions for backward compatibility
const generateWallet = () => {
  const result = generateMultiChainWallet([BLOCKCHAIN_TYPES.ETHEREUM]);
  const ethWallet = result.wallets[BLOCKCHAIN_TYPES.ETHEREUM];
  
  return {
    mnemonic: result.mnemonic,
    privateKey: ethWallet.privateKey,
    address: ethWallet.address
  };
};

const generateWalletFromMnemonic = (mnemonic) => {
  const result = generateMultiChainWalletFromMnemonic(mnemonic, [BLOCKCHAIN_TYPES.ETHEREUM]);
  const ethWallet = result.wallets[BLOCKCHAIN_TYPES.ETHEREUM];
  
  return {
    mnemonic: result.mnemonic,
    privateKey: ethWallet.privateKey,
    address: ethWallet.address
  };
};

// Get supported blockchain types
const getSupportedBlockchains = () => {
  return Object.values(BLOCKCHAIN_TYPES);
};

// Validate blockchain type
const isValidBlockchainType = (blockchainType) => {
  return Object.values(BLOCKCHAIN_TYPES).includes(blockchainType);
};

module.exports = {
  // New multi-chain functions
  generateMultiChainWallet,
  generateMultiChainWalletFromMnemonic,
  generateWalletForBlockchain,
  getSupportedBlockchains,
  isValidBlockchainType,
  BLOCKCHAIN_TYPES,
  
  // Legacy functions (backward compatibility)
  generateWallet,
  generateWalletFromMnemonic
};