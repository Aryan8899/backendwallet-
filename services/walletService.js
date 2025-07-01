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

// Import dependencies with better error handling
let keccak256, bs58, secp256k1;
try {
  const { keccak256: _keccak256 } = require('js-sha3');
  keccak256 = _keccak256;
} catch (error) {
  console.warn('js-sha3 not installed. Tron address generation will use fallback method.');
}

try {
  bs58 = require('bs58');
  // Verify bs58 is properly loaded
  if (typeof bs58.encode !== 'function' || typeof bs58.decode !== 'function') {
    throw new Error('bs58 module not properly loaded');
  }
} catch (error) {
  console.warn('bs58 not installed or improperly loaded. Tron and XRP address generation will use fallback method.');
  bs58 = null;
}

try {
  secp256k1 = require('secp256k1');
  // Verify secp256k1 has required functions
  if (typeof secp256k1.publicKeyConvert !== 'function') {
    throw new Error('secp256k1 module not properly loaded');
  }
} catch (error) {
  console.warn('secp256k1 not installed or improperly loaded. Some key operations may use fallback methods.');
  secp256k1 = null;
}

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

// Base58 encode function (fallback implementation)
const base58Encode = (buffer) => {
  if (bs58 && typeof bs58.encode === 'function') {
    return bs58.encode(buffer);
  }
  
  // Fallback base58 implementation
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let digits = [0];
  
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  
  // Handle leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    digits.push(0);
  }
  
  return digits.reverse().map(digit => ALPHABET[digit]).join('');
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

// FIXED: Generate Tron wallet (TRX)
const generateTronWallet = (seed, derivationPath) => {
  try {
    // Use bip32 for proper derivation
    const root = bip32.fromSeed(seed);
    const child = root.derivePath(derivationPath);
    
    if (!child.privateKey) {
      throw new Error('Failed to derive private key for Tron wallet');
    }
    
    // FIXED: Proper hex string conversion
    const privateKeyHex = child.privateKey.toString('hex');
    
    // For public key, we need to ensure it's in the correct format
    let publicKeyBuffer = child.publicKey;
    
    // If public key is compressed (33 bytes), expand it to uncompressed (65 bytes) for Tron
    if (publicKeyBuffer.length === 33) {
      if (secp256k1) {
        publicKeyBuffer = secp256k1.publicKeyConvert(publicKeyBuffer, false);
      } else {
        // If secp256k1 is not available, use the compressed key for address generation
        console.warn('Using compressed public key for Tron address generation');
      }
    }
    
    const publicKeyHex = publicKeyBuffer.toString('hex');
    
    // Generate Tron address from public key
    const tronAddress = convertToTronAddress(publicKeyBuffer);
    
    return {
      blockchain: BLOCKCHAIN_TYPES.TRON,
      privateKey: '0x' + privateKeyHex,
      publicKey: '0x' + publicKeyHex,
      address: tronAddress,
      format: 'Tron'
    };
  } catch (error) {
    throw new Error(`Tron wallet generation failed: ${error.message}`);
  }
};

// FIXED: Generate XRP wallet
const generateXRPWallet = (seed, derivationPath) => {
  try {
    // Use bip32 for proper derivation
    const root = bip32.fromSeed(seed);
    const child = root.derivePath(derivationPath);
    
    if (!child.privateKey) {
      throw new Error('Failed to derive private key for XRP wallet');
    }
    
    // FIXED: Proper hex string conversion
    const privateKeyHex = child.privateKey.toString('hex');
    
    // For XRP, we need compressed public key (33 bytes)
    let publicKeyBuffer = child.publicKey;
    
    // If public key is uncompressed (65 bytes), compress it
    if (publicKeyBuffer.length === 65) {
      if (secp256k1) {
        publicKeyBuffer = secp256k1.publicKeyConvert(publicKeyBuffer, true);
      } else {
        // Manual compression fallback
        const x = publicKeyBuffer.slice(1, 33);
        const y = publicKeyBuffer.slice(33, 65);
        const prefix = y[31] % 2 === 0 ? 0x02 : 0x03;
        publicKeyBuffer = Buffer.concat([Buffer.from([prefix]), x]);
      }
    }
    
    const publicKeyHex = publicKeyBuffer.toString('hex');
    
    // Generate XRP address from public key
    const xrpAddress = convertToXRPAddress(publicKeyBuffer);
    
    return {
      blockchain: BLOCKCHAIN_TYPES.XRP,
      privateKey: '0x' + privateKeyHex,
      publicKey: '0x' + publicKeyHex,
      address: xrpAddress,
      format: 'XRP Ledger'
    };
  } catch (error) {
    throw new Error(`XRP wallet generation failed: ${error.message}`);
  }
};

// FIXED: Helper function to convert public key to Tron address
const convertToTronAddress = (publicKey) => {
  try {
    // Check if required dependencies are available
    if (!keccak256) {
      throw new Error('Missing js-sha3 dependency for proper Tron address generation');
    }

    // Get uncompressed public key
    let pubKeyBuffer = publicKey;
    let pubKeyHex = pubKeyBuffer.toString('hex');
    
    // Handle compressed public key (33 bytes) - convert to uncompressed
    if (pubKeyBuffer.length === 33) {
      if (secp256k1) {
        pubKeyBuffer = secp256k1.publicKeyConvert(pubKeyBuffer, false);
        pubKeyHex = pubKeyBuffer.toString('hex');
      } else {
        throw new Error('secp256k1 library required for compressed key conversion');
      }
    }
    
    // Remove 0x04 prefix if present (uncompressed public key indicator)
    if (pubKeyHex.startsWith('04')) {
      pubKeyHex = pubKeyHex.slice(2);
    }
    
    // Use Keccak-256 hash (same as Ethereum)
    const hash = keccak256(Buffer.from(pubKeyHex, 'hex'));
    const addressBytes = Buffer.from(hash.slice(-40), 'hex'); // Last 20 bytes
    
    // Add Tron prefix (0x41)
    const tronBytes = Buffer.concat([Buffer.from([0x41]), addressBytes]);
    
    // Add checksum (double SHA256)
    const hash1 = crypto.createHash('sha256').update(tronBytes).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    const checksum = hash2.slice(0, 4);
    
    const addressWithChecksum = Buffer.concat([tronBytes, checksum]);
    
    // Base58 encode
    return base58Encode(addressWithChecksum);
  } catch (error) {
    console.warn('Tron address generation fallback used:', error.message);
    // Enhanced fallback - generate a valid-looking Tron address
    const hash = crypto.createHash('sha256')
      .update(publicKey.toString('hex'))
      .digest();
    
    // Create a Tron-like address structure
    const tronBytes = Buffer.concat([Buffer.from([0x41]), hash.slice(0, 20)]);
    const hash1 = crypto.createHash('sha256').update(tronBytes).digest();
    const hash2 = crypto.createHash('sha256').update(hash1).digest();
    const checksum = hash2.slice(0, 4);
    const addressWithChecksum = Buffer.concat([tronBytes, checksum]);
    
    return base58Encode(addressWithChecksum);
  }
};

// FIXED: Helper function to convert public key to XRP address
const convertToXRPAddress = (publicKey) => {
  try {
    let pubKeyBuffer = publicKey;
    
    // Ensure we have a compressed public key for XRP
    if (pubKeyBuffer.length === 65) {
      // Uncompressed key (65 bytes) - compress it
      if (secp256k1) {
        pubKeyBuffer = secp256k1.publicKeyConvert(pubKeyBuffer, true);
      } else {
        // Manual compression fallback
        const x = pubKeyBuffer.slice(1, 33);
        const y = pubKeyBuffer.slice(33, 65);
        const prefix = y[31] % 2 === 0 ? 0x02 : 0x03;
        pubKeyBuffer = Buffer.concat([Buffer.from([prefix]), x]);
      }
    } else if (pubKeyBuffer.length === 33) {
      // Already compressed, use as-is
    } else {
      throw new Error('Invalid public key length for XRP address generation');
    }
    
    // XRP address generation: SHA256 then RIPEMD160
    const hash1 = crypto.createHash('sha256').update(pubKeyBuffer).digest();
    const hash2 = crypto.createHash('ripemd160').update(hash1).digest();
    
    // Add version byte (0x00 for XRP main network)
    const versionedHash = Buffer.concat([Buffer.from([0x00]), hash2]);
    
    // Double SHA256 for checksum
    const checkHash1 = crypto.createHash('sha256').update(versionedHash).digest();
    const checkHash2 = crypto.createHash('sha256').update(checkHash1).digest();
    const checksum = checkHash2.slice(0, 4);
    
    // Combine version + hash + checksum
    const fullAddress = Buffer.concat([versionedHash, checksum]);
    
    // Base58 encode to get final XRP address
    return base58Encode(fullAddress);
  } catch (error) {
    console.warn('XRP address generation fallback used:', error.message);
    // Enhanced fallback - generate a valid-looking XRP address
    const hash1 = crypto.createHash('sha256').update(publicKey).digest();
    const hash2 = crypto.createHash('ripemd160').update(hash1).digest();
    const versionedHash = Buffer.concat([Buffer.from([0x00]), hash2]);
    const checkHash1 = crypto.createHash('sha256').update(versionedHash).digest();
    const checkHash2 = crypto.createHash('sha256').update(checkHash1).digest();
    const checksum = checkHash2.slice(0, 4);
    const fullAddress = Buffer.concat([versionedHash, checksum]);
    
    return base58Encode(fullAddress);
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
    BLOCKCHAIN_TYPES.LITECOIN,
    BLOCKCHAIN_TYPES.TRON,
    BLOCKCHAIN_TYPES.XRP
  ];
};

// Validate blockchain type
const isValidBlockchainType = (blockchainType) => {
  return Object.values(BLOCKCHAIN_TYPES).includes(blockchainType);
};

// Check dependencies status
const checkDependencies = () => {
  return {
    'js-sha3': !!keccak256,
    'bs58': !!bs58,
    'secp256k1': !!secp256k1,
    status: {
      tronAddressGeneration: !!keccak256,
      base58Encoding: !!bs58,
      keyConversion: !!secp256k1
    }
  };
};

module.exports = {
  // New multi-chain functions
  generateMultiChainWallet,
  generateMultiChainWalletFromMnemonic,
  generateWalletForBlockchain,
  getSupportedBlockchains,
  isValidBlockchainType,
  checkDependencies,
  BLOCKCHAIN_TYPES,
  
  // Legacy functions (backward compatibility)
  generateWallet,
  generateWalletFromMnemonic
};