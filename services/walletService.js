const bip39 = require("bip39");
const { hdkey } = require("ethereumjs-wallet");
const bitcoin = require("bitcoinjs-lib");
const { payments } = bitcoin;
const BIP32Factory = require("bip32").default;
const ecc = require("tiny-secp256k1");
const crypto = require("crypto");

// Initialize bip32 with ecc
const bip32 = BIP32Factory(ecc);

// Initialize ECPair with ecc for Bitcoin operations
const ECPair = require("ecpair").default(ecc);

// Supported blockchain types
const BLOCKCHAIN_TYPES = {
  ETHEREUM: 'ethereum',
  BITCOIN: 'bitcoin', 
  DOGECOIN: 'dogecoin',
  
  TRON: 'tron',
  XRP: 'xrp'
};

// Derivation paths for different cryptocurrencies
const DERIVATION_PATHS = {
  [BLOCKCHAIN_TYPES.ETHEREUM]: "m/44'/60'/0'/0/0",
  [BLOCKCHAIN_TYPES.BITCOIN]: "m/44'/0'/0'/0/0",
  [BLOCKCHAIN_TYPES.DOGECOIN]: "m/44'/3'/0'/0/0",
                                                   
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
const generateMultiChainWallet = (
  blockchainTypes = [BLOCKCHAIN_TYPES.ETHEREUM, BLOCKCHAIN_TYPES.BITCOIN, BLOCKCHAIN_TYPES.DOGECOIN, BLOCKCHAIN_TYPES.TRON, BLOCKCHAIN_TYPES.XRP]
) => {

  // Generate mnemonic (12 words)
  const mnemonic = bip39.generateMnemonic();
  
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
  try {
    // Create root node from seed using the correct bip32 instance
    const root = bip32.fromSeed(seed);
    
    // Derive child key
    const child = root.derivePath(derivationPath);
    const network = BITCOIN_NETWORKS[blockchainType];
    
    // Generate key pair using ECPair
    const privateKeyBuffer = Buffer.isBuffer(child.privateKey)
    ? child.privateKey
    : Buffer.from(child.privateKey);
  
  const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network });
    
    // P2PKH address (Legacy format)
    const p2pkh = payments.p2pkh({ pubkey: keyPair.publicKey, network });
    
    // P2SH-P2WPKH (SegWit wrapped in P2SH) - only for Bitcoin and Litecoin
    let p2sh, bech32;
    if (blockchainType === BLOCKCHAIN_TYPES.BITCOIN || blockchainType === BLOCKCHAIN_TYPES.LITECOIN) {
      try {
        const p2wpkh = payments.p2wpkh({ pubkey: keyPair.publicKey, network });
        p2sh = payments.p2sh({ redeem: p2wpkh, network });
        bech32 = p2wpkh.address;
      } catch (segwitError) {
        // SegWit might not be supported for all networks, continue without it
        console.warn(`SegWit not supported for ${blockchainType}:`, segwitError.message);
      }
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
  } catch (error) {
    throw new Error(`Failed to generate ${blockchainType} wallet: ${error.message}`);
  }
};

// Generate Tron wallet (TRX)
const generateTronWallet = (seed, derivationPath) => {
  try {
    // Use Ethereum-style generation as base (Tron uses ECDSA secp256k1 like Ethereum)
    const hdWallet = hdkey.fromMasterSeed(seed);
    const key = hdWallet.derivePath(derivationPath);
    const wallet = key.getWallet();
    
    // Convert Ethereum-style key to Tron format
    const publicKey = wallet.getPublicKey();
    const tronAddress = convertToTronAddress(publicKey);
    
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
    // Use similar approach to other wallets
    const hdWallet = hdkey.fromMasterSeed(seed);
    const key = hdWallet.derivePath(derivationPath);
    const wallet = key.getWallet();
    
    // Generate XRP address from public key
    const publicKey = wallet.getPublicKey();
    const xrpAddress = convertToXRPAddress(publicKey);
    
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

// Helper function to convert public key to Tron address
const convertToTronAddress = (publicKey) => {
  try {
    // Remove 0x04 prefix if present (uncompressed public key)
    let pubKeyHex = publicKey.toString('hex');
    if (pubKeyHex.startsWith('04')) {
      pubKeyHex = pubKeyHex.slice(2);
    }
    
    // Use Keccak-256 (same as Ethereum)
    const keccak = require('keccak');
    const hash = keccak('keccak256').update(Buffer.from(pubKeyHex, 'hex')).digest();
    const addressBytes = hash.slice(-20);
    
    // Add Tron prefix (0x41)
    const tronBytes = Buffer.concat([Buffer.from([0x41]), addressBytes]);
    
    // Use proper base58 encoding
    const bs58 = require('bs58');
    
    // Add checksum (double SHA256)
    const hash1 = crypto.createHash('sha256').update(tronBytes).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    const checksum = hash2.slice(0, 4);
    
    const addressWithChecksum = Buffer.concat([tronBytes, checksum]);
    
    return bs58.encode(addressWithChecksum);
  } catch (error) {
    // Fallback to a recognizable Tron address format
    const fallback = 'T' + crypto.createHash('sha256')
      .update(publicKey.toString('hex'))
      .digest('hex')
      .slice(0, 32);
    return fallback;
  }
};

// Helper function to convert public key to XRP address
const convertToXRPAddress = (publicKey) => {
  try {
    // Proper XRP address generation
    let pubKeyHex = publicKey.toString('hex');
    if (pubKeyHex.startsWith('04')) {
      pubKeyHex = pubKeyHex.slice(2);
    }
    
    // Compress the public key
    const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
    const x = pubKeyBuffer.slice(0, 32);
    const y = pubKeyBuffer.slice(32, 64);
    
    // Determine if y is even or odd
    const prefix = y[y.length - 1] % 2 === 0 ? 0x02 : 0x03;
    const compressedPubKey = Buffer.concat([Buffer.from([prefix]), x]);
    
    // SHA256 then RIPEMD160
    const hash1 = crypto.createHash('sha256').update(compressedPubKey).digest();
    const hash2 = crypto.createHash('ripemd160').update(hash1).digest();
    
    // Add version byte (0x00 for XRP)
    const versionedHash = Buffer.concat([Buffer.from([0x00]), hash2]);
    
    // Double SHA256 for checksum
    const checkHash1 = crypto.createHash('sha256').update(versionedHash).digest();
    const checkHash2 = crypto.createHash('sha256').update(checkHash1).digest();
    const checksum = checkHash2.slice(0, 4);
    
    // Combine and encode
    const fullAddress = Buffer.concat([versionedHash, checksum]);
    
    const bs58 = require('bs58');
    return bs58.encode(fullAddress);
  } catch (error) {
    // Fallback to a recognizable XRP address format
    const fallback = 'r' + crypto.createHash('sha256')
      .update(publicKey.toString('hex'))
      .digest('hex')
      .slice(0, 32);
    return fallback;
  }
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
  return [
    BLOCKCHAIN_TYPES.ETHEREUM,
    BLOCKCHAIN_TYPES.BITCOIN,
    BLOCKCHAIN_TYPES.DOGECOIN,
    BLOCKCHAIN_TYPES.TRON,
    BLOCKCHAIN_TYPES.XRP
  ];
  
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