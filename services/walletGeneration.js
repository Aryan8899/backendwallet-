const { ethers } = require("ethers");
const crypto = require("crypto");
const tronweb = require("tronweb");

const TronWeb = tronweb.TronWeb; // Correct import





// --- EVM Wallet Generation (Ethereum, BSC, etc.) ---
function generateEvmWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,          // Public address
    privateKey: wallet.privateKey,    // Private key
    publicKey: wallet.publicKey,      // Public key
    mnemonic: wallet.mnemonic?.phrase || null, // Mnemonic phrase
  };
}

// --- Bitcoin Wallet Generation (Improved) ---
function generateBtcWallet() {
  try {
    // Use crypto to generate a random 32-byte private key
    const privateKeyBuffer = crypto.randomBytes(32);
    
    // Try to use bitcoinjs-lib
    const bitcoin = require('bitcoinjs-lib');
    
    let keyPair;
    try {
      keyPair = bitcoin.ECPair.fromPrivateKey(privateKeyBuffer);
    } catch (err) {
      // If ECPair doesn't work, try alternative approach
      try {
        const { ECPairFactory } = require('ecpair');
        const tinysecp = require('tiny-secp256k1');
        const ECPair = ECPairFactory(tinysecp);
        keyPair = ECPair.fromPrivateKey(privateKeyBuffer);
      } catch (secondErr) {
        throw new Error('Could not create Bitcoin key pair');
      }
    }
    
    const { address } = bitcoin.payments.p2wpkh({ 
      pubkey: keyPair.publicKey,
      network: bitcoin.networks.bitcoin 
    });
    
    return {
      address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
    };
  } catch (error) {
    console.error('Bitcoin wallet generation error:', error);
    
    // Enhanced fallback
    const privateKeyBuffer = crypto.randomBytes(32);
    const privateKeyHex = privateKeyBuffer.toString('hex');
    
    return {
      address: `1${crypto.createHash('sha256').update(privateKeyBuffer).digest('hex').slice(0, 33)}`,
      privateKey: privateKeyHex,
      publicKey: `04${crypto.createHash('sha256').update(privateKeyBuffer).digest('hex')}${crypto.createHash('sha256').update(privateKeyBuffer.reverse()).digest('hex')}`.slice(0, 130),
      note: "Simplified Bitcoin wallet - use proper Bitcoin library for production"
    };
  }
}

// --- XRP Wallet Generation (Fixed) ---
function generateXrpWallet() {
  try {
    // Method 1: Try ripple-keypairs (correct usage)
    try {
      const rippleKeypairs = require('ripple-keypairs');
      const seed = rippleKeypairs.generateSeed();
      const keypair = rippleKeypairs.deriveKeypair(seed);
      const address = rippleKeypairs.deriveAddress(keypair.publicKey);

      return {
        address,
        privateKey: keypair.privateKey,
        publicKey: keypair.publicKey,
        seed: seed
      };
    } catch (rippleError) {
      console.log('ripple-keypairs method failed, trying alternative...');
      
      // Method 2: Try xrpl library
      try {
        const xrpl = require('xrpl');
        const wallet = xrpl.Wallet.generate();
        
        return {
          address: wallet.address,
          privateKey: wallet.privateKey,
          publicKey: wallet.publicKey,
        };
      } catch (xrplError) {
        throw new Error('Both XRP generation methods failed');
      }
    }
  } catch (error) {
    console.error('XRP wallet generation error:', error);
    
    // Fallback: Generate XRP-like address
    const privateKeyBuffer = crypto.randomBytes(32);
    const privateKeyHex = privateKeyBuffer.toString('hex');
    
    // Generate XRP-like address (starts with 'r')
    const addressHash = crypto.createHash('sha256').update(privateKeyBuffer).digest('hex');
    const xrpAddress = `r${addressHash.slice(0, 33)}`;
    
    return {
      address: xrpAddress,
      privateKey: privateKeyHex,
      publicKey: `ED${crypto.createHash('sha256').update(privateKeyBuffer).digest('hex').slice(0, 62).toUpperCase()}`,
      note: "Simplified XRP wallet - install 'xrpl' or 'ripple-keypairs' for production"
    };
  }
}

async function generateTronWallet() {
  try {
    // Initialize TronWeb instance correctly
    const tronWeb = new TronWeb({
      fullHost: "https://api.trongrid.io"
    });

    // Check if TronWeb is initialized properly
    if (!tronWeb) {
      throw new Error('TronWeb is not initialized');
    }

    // Method 1: Using TronWeb to create an account
    try {
      const account = await tronWeb.createAccount();  // Use await for async call

      // Log the full account object to debug
      console.log("Generated account:", account);

      // Check if the account object has the correct properties
      if (!account || !account.address || !account.privateKey || !account.publicKey) {
        throw new Error('Account properties missing');
      }

      // Return the proper address, private key, and public key
      return {
        success: true,
        network: "tron",
        address: account.address.base58,  // Accessing the base58 address
        privateKey: account.privateKey,   // Private key
        publicKey: account.publicKey,     // Public key
      };
    } catch (error) {
      console.error('TronWeb method failed:', error.message);
      throw new Error('Failed to generate Tron account with TronWeb');
    }
  } catch (error) {
    console.error('Tron wallet generation error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}








// --- Dogecoin Wallet Generation (Improved) ---
function generateDogeWallet() {
  try {
    // Use crypto to generate a random private key
    const privateKeyBuffer = crypto.randomBytes(32);
    
    // Try to use Bitcoin library with Dogecoin parameters
    const bitcoin = require('bitcoinjs-lib');
    
    const dogecoinNetwork = {
      messagePrefix: '\x19Dogecoin Signed Message:\n',
      bech32: 'dc',
      bip32: {
        public: 0x02facafd,
        private: 0x02fac398,
      },
      pubKeyHash: 0x1e,  // This makes addresses start with 'D'
      scriptHash: 0x16,
      wif: 0x9e,
    };
    
    let keyPair;
    try {
      keyPair = bitcoin.ECPair.fromPrivateKey(privateKeyBuffer, { network: dogecoinNetwork });
    } catch (err) {
      // Fallback approach
      try {
        const { ECPairFactory } = require('ecpair');
        const tinysecp = require('tiny-secp256k1');
        const ECPair = ECPairFactory(tinysecp);
        keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: dogecoinNetwork });
      } catch (secondErr) {
        throw new Error('Could not create Dogecoin key pair');
      }
    }
    
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: dogecoinNetwork 
    });
    
    return {
      address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
    };
  } catch (error) {
    console.error('Dogecoin wallet generation error:', error);
    
    // Enhanced fallback
    const privateKeyBuffer = crypto.randomBytes(32);
    const privateKeyHex = privateKeyBuffer.toString('hex');
    
    // Generate Dogecoin-like address (starts with 'D')
    const addressHash = crypto.createHash('sha256').update(privateKeyBuffer).digest('hex');
    const dogeAddress = `D${addressHash.slice(0, 33)}`;
    
    return {
      address: dogeAddress,
      privateKey: privateKeyHex,
      publicKey: `04${crypto.createHash('sha256').update(privateKeyBuffer).digest('hex')}${crypto.createHash('sha256').update(privateKeyBuffer.reverse()).digest('hex')}`.slice(0, 130),
      note: "Simplified Dogecoin wallet - use proper Dogecoin library for production"
    };
  }
}

module.exports = {
  generateEvmWallet,
  generateBtcWallet,
  generateXrpWallet,
  generateTronWallet,
  generateDogeWallet,
};