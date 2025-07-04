// routes/sendTransaction.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

// Fix TronWeb import - try different import methods
let TronWeb;
try {
  // Try ES6 import style first
  TronWeb = require('tronweb').default;
  if (!TronWeb) {
    // Fallback to CommonJS import
    TronWeb = require('tronweb');
  }
  console.log('TronWeb imported successfully:', typeof TronWeb);
} catch (error) {
  console.error('Failed to import TronWeb:', error.message);
  TronWeb = null;
}

// Network configurations for EVM chains
const EVM_NETWORKS = {
  ethereum: {
    rpcUrl: process.env.ETH_RPC_URL,
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    decimals: 18
  },
  bsc: {
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/',
    chainId: 56,
    name: 'BSC Mainnet',
    symbol: 'BNB',
    decimals: 18
  },
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/',
    chainId: 137,
    name: 'Polygon Mainnet',
    symbol: 'MATIC',
    decimals: 18
  },
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    name: 'Arbitrum One',
    symbol: 'ETH',
    decimals: 18
  },
  linea: {
    rpcUrl: process.env.LINEA_RPC_URL || 'https://rpc.linea.build',
    chainId: 59144,
    name: 'Linea Mainnet',
    symbol: 'ETH',
    decimals: 18
  }
};

// Helper function to send EVM transactions
async function sendEVMTransaction(network, privateKey, to, amount, gasPrice = null, gasLimit = null) {
  try {
    const networkConfig = EVM_NETWORKS[network];
    if (!networkConfig) {
      throw new Error(`Unsupported EVM network: ${network}`);
    }

    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    

    // Prepare transaction object
    const txData = {
      to: to,
      value: ethers.parseEther(amount.toString())
    };

    // Add gas price if specified
    if (gasPrice) {
      txData.gasPrice = ethers.parseUnits(gasPrice.toString(), 'gwei');
    }

    // Add gas limit if specified
    if (gasLimit) {
      txData.gasLimit = gasLimit;
    }

    // Send transaction
    const tx = await wallet.sendTransaction(txData);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.gasPrice?.toString(),
      network: networkConfig.name,
      from: wallet.address,
      to: to,
      amount: amount,
      symbol: networkConfig.symbol
    };

  } catch (error) {
    throw new Error(`EVM transaction failed: ${error.message}`);
  }
}

// Helper function to derive Bitcoin address from private key
function getBitcoinAddressFromPrivateKey(privateKeyHex) {
  const bitcoin = require('bitcoinjs-lib');
  const ECPair = require('ecpair');
  const tinysecp = require('tiny-secp256k1');
  
  const ECPairFactory = ECPair.ECPairFactory(tinysecp);
  
  // Remove '0x' prefix if present
  const cleanPrivateKey = privateKeyHex.replace('0x', '');
  const keyPair = ECPairFactory.fromPrivateKey(Buffer.from(cleanPrivateKey, 'hex'));
  
  const { address } = bitcoin.payments.p2wpkh({ 
    pubkey: keyPair.publicKey,
    network: bitcoin.networks.bitcoin 
  });
  
  return { address, keyPair };
}

// Helper function to derive Dogecoin address from private key
function getDogecoinAddressFromPrivateKey(privateKeyHex) {
  const bitcoin = require('bitcoinjs-lib');
  const ECPair = require('ecpair');
  const tinysecp = require('tiny-secp256k1');
  
  const ECPairFactory = ECPair.ECPairFactory(tinysecp);
  
  // Dogecoin network parameters
  const DOGECOIN_NETWORK = {
    messagePrefix: '\x19Dogecoin Signed Message:\n',
    bech32: 'doge',
    bip32: {
      public: 0x02facafd,
      private: 0x02fac398
    },
    pubKeyHash: 0x1e, // Dogecoin address version
    scriptHash: 0x16,
    wif: 0x9e
  };
  
  const cleanPrivateKey = privateKeyHex.replace('0x', '');
  const keyPair = ECPairFactory.fromPrivateKey(Buffer.from(cleanPrivateKey, 'hex'));
  
  const { address } = bitcoin.payments.p2pkh({ 
    pubkey: keyPair.publicKey,
    network: DOGECOIN_NETWORK 
  });
  
  return { address, keyPair };
}

// Helper function to get UTXOs from BlockCypher
async function getUTXOs(address, network = 'btc') {
  try {
    const baseUrl = network === 'btc' ? 'https://api.blockcypher.com/v1/btc/main' : 'https://api.blockcypher.com/v1/doge/main';
    const response = await axios.get(`${baseUrl}/addrs/${address}?unspentOnly=true`);
    
    if (!response.data.txrefs) {
      throw new Error('No UTXOs found for this address');
    }
    
    return response.data.txrefs.map(utxo => ({
      txid: utxo.tx_hash,
      vout: utxo.tx_output_n,
      value: utxo.value,
      confirmations: utxo.confirmations
    }));
  } catch (error) {
    throw new Error(`Failed to fetch UTXOs: ${error.message}`);
  }
}

// Helper function to broadcast transaction
async function broadcastTransaction(txHex, network = 'btc') {
  try {
    const baseUrl = network === 'btc' ? 'https://api.blockcypher.com/v1/btc/main' : 'https://api.blockcypher.com/v1/doge/main';
    const response = await axios.post(`${baseUrl}/txs/push`, {
      tx: txHex
    });
    
    return response.data.tx.hash;
  } catch (error) {
    throw new Error(`Failed to broadcast transaction: ${error.message}`);
  }
}

// Helper function to send Bitcoin transaction
async function sendBTCTransaction(privateKey, to, amount, feeRate = 10) {
  try {
    const bitcoin = require('bitcoinjs-lib');
    const ECPair = require('ecpair');
    const tinysecp = require('tiny-secp256k1');
    
    const ECPairFactory = ECPair.ECPairFactory(tinysecp);
    
    // Remove '0x' prefix if present
    const isWIF = /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(privateKey);
    const keyPair = isWIF
      ? ECPairFactory.fromWIF(privateKey, bitcoin.networks.bitcoin)
      : ECPairFactory.fromPrivateKey(Buffer.from(privateKey.replace(/^0x/, ''), 'hex'));
    

    // Get address from keypair
    const { address: fromAddress } = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network: bitcoin.networks.bitcoin
      });
      
    
    // Get UTXOs
    const utxos = await getUTXOs(fromAddress, 'btc');
    
    // Convert amount to satoshis
    const amountSatoshis = Math.floor(amount * 100000000);
    
    // Calculate total available
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    if (totalAvailable < amountSatoshis) {
      throw new Error(`Insufficient balance. Available: ${totalAvailable / 100000000} BTC, Required: ${amount} BTC`);
    }
    
    // Create transaction builder
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    
    // Add inputs
    let inputTotal = 0;
    const neededInputs = [];
    for (const utxo of utxos) {
      if (inputTotal >= amountSatoshis + (feeRate * 250)) break; // Rough fee estimation
      neededInputs.push(utxo);
      inputTotal += utxo.value;
    }
    
    // Add inputs to PSBT
    for (const utxo of neededInputs) {
      try {
        // Get transaction details for the UTXO
        const txResponse = await axios.get(`https://api.blockcypher.com/v1/btc/main/txs/${utxo.txid}?includeHex=true`);
        const rawTx = txResponse.data.hex;
        
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
              script: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.bitcoin }).output,
              value: utxo.value
            }
          });
          
      } catch (error) {
        console.error(`Error adding input ${utxo.txid}:`, error.message);
        throw new Error(`Failed to add input: ${error.message}`);
      }
    }
    
    // Add output to recipient
    psbt.addOutput({
      address: to,
      value: amountSatoshis
    });
    
    // Calculate fee and change
    const estimatedFee = feeRate * 250; // Rough estimation
    const changeAmount = inputTotal - amountSatoshis - estimatedFee;
    
    // Add change output if necessary
    if (changeAmount > 546) { // Bitcoin dust limit
      psbt.addOutput({
        address: fromAddress,
        value: changeAmount
      });
    }
    
    // Sign all inputs
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.error(`Error signing input ${i}:`, error.message);
        throw new Error(`Failed to sign input ${i}: ${error.message}`);
      }
    }
    
    // Validate signatures
    for (let i = 0; i < psbt.inputCount; i++) {
      const isValid = psbt.validateSignaturesOfInput(i, () => true);
      if (!isValid) {
        throw new Error(`Invalid signature for input ${i}`);
      }
    }
    
    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();
    
    // Broadcast transaction
    const txHash = await broadcastTransaction(txHex, 'btc');
    
    return {
      success: true,
      txHash: txHash,
      network: "Bitcoin Mainnet",
      symbol: "BTC",
      from: fromAddress,
      to: to,
      amount: amount,
      fee: estimatedFee / 100000000
    };

  } catch (error) {
    throw new Error(`Bitcoin transaction failed: ${error.message}`);
  }
}

// Helper function to send Dogecoin transaction
async function sendDOGETransaction(privateKey, to, amount, feeRate = 1000000) {
  try {
    const bitcoin = require('bitcoinjs-lib');
    const ECPair = require('ecpair');
    const tinysecp = require('tiny-secp256k1');
    
    const ECPairFactory = ECPair.ECPairFactory(tinysecp);
    
    // Dogecoin network parameters
    const DOGECOIN_NETWORK = {
      messagePrefix: '\x19Dogecoin Signed Message:\n',
      bech32: 'doge',
      bip32: {
        public: 0x02facafd,
        private: 0x02fac398
      },
      pubKeyHash: 0x1e,
      scriptHash: 0x16,
      wif: 0x9e
    };
    
    // Remove '0x' prefix if present
    const keyPair = ECPairFactory.fromWIF(privateKey, DOGECOIN_NETWORK);

    // Get address from keypair
    const { address: fromAddress } = bitcoin.payments.p2pkh({ 
      pubkey: keyPair.publicKey,
      network: DOGECOIN_NETWORK 
    });
    
    // Get UTXOs
    const utxos = await getUTXOs(fromAddress, 'doge');
    
    // Convert amount to koinu (Dogecoin's smallest unit)
    const amountKoinu = Math.floor(amount * 100000000);
    
    // Calculate total available
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    if (totalAvailable < amountKoinu) {
      throw new Error(`Insufficient balance. Available: ${totalAvailable / 100000000} DOGE, Required: ${amount} DOGE`);
    }
    
    // Create transaction builder
    const psbt = new bitcoin.Psbt({ network: DOGECOIN_NETWORK });
    
    // Add inputs
    let inputTotal = 0;
    const neededInputs = [];
    for (const utxo of utxos) {
      if (inputTotal >= amountKoinu + feeRate) break;
      neededInputs.push(utxo);
      inputTotal += utxo.value;
    }
    
    // Add inputs to PSBT
    for (const utxo of neededInputs) {
      try {
        // Get transaction details for the UTXO
        const txResponse = await axios.get(`https://api.blockcypher.com/v1/doge/main/txs/${utxo.txid}?includeHex=true`);
        const rawTx = txResponse.data.hex;
        
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          nonWitnessUtxo: Buffer.from(rawTx, 'hex')
        });
      } catch (error) {
        console.error(`Error adding input ${utxo.txid}:`, error.message);
        throw new Error(`Failed to add input: ${error.message}`);
      }
    }
    
    // Add output to recipient
    psbt.addOutput({
      address: to,
      value: amountKoinu
    });
    
    // Calculate change
    const changeAmount = inputTotal - amountKoinu - feeRate;
    
    // Add change output if necessary
    if (changeAmount > 100000000) { // 1 DOGE dust limit
      psbt.addOutput({
        address: fromAddress,
        value: changeAmount
      });
    }
    
    // Sign all inputs
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.signInput(i, keyPair);
      } catch (error) {
        console.error(`Error signing input ${i}:`, error.message);
        throw new Error(`Failed to sign input ${i}: ${error.message}`);
      }
    }
    
    // Validate signatures
    for (let i = 0; i < psbt.inputCount; i++) {
      const isValid = psbt.validateSignaturesOfInput(i, () => true);
      if (!isValid) {
        throw new Error(`Invalid signature for input ${i}`);
      }
    }
    
    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();
    
    // Broadcast transaction
    const txHash = await broadcastTransaction(txHex, 'doge');
    
    return {
      success: true,
      txHash: txHash,
      network: "Dogecoin Mainnet",
      symbol: "DOGE",
      from: fromAddress,
      to: to,
      amount: amount,
      fee: feeRate / 100000000
    };

  } catch (error) {
    throw new Error(`Dogecoin transaction failed: ${error.message}`);
  }
}

// Helper function to send XRP transaction
// Improved XRP transaction function with comprehensive error handling and validation
async function sendXRPTransaction(privateKey, to, amount) {
    let client;
    
    try {
      const xrpl = require('xrpl');
      
      console.log('Starting XRP transaction...');
      console.log('Amount:', amount, 'XRP');
      console.log('Destination:', to);
  
      // Initialize client with multiple server options for redundancy
      const servers = [
        'wss://xrplcluster.com',
        'wss://s1.ripple.com',
        'wss://s2.ripple.com'
      ];
  
      let connected = false;
      let lastError;
  
      // Try connecting to different servers
      for (const server of servers) {
        try {
          console.log(`Attempting to connect to: ${server}`);
          client = new xrpl.Client(server, { connectionTimeout: 10000 }); // 10 sec timeout

          await client.connect();
          connected = true;
          console.log(`Successfully connected to: ${server}`);
          break;
        } catch (connectError) {
          console.warn(`Failed to connect to ${server}:`, connectError.message);
          lastError = connectError;
          if (client) {
            try {
              await client.disconnect();
            } catch (e) {}
          }
        }
      }
  
      if (!connected) {
        throw new Error(`Failed to connect to any XRP server. Last error: ${lastError?.message}`);
      }
  
      // Validate and create wallet from seed/private key
      let wallet;
      try {
        // XRP uses seeds, not traditional private keys
        // Check if it's a seed format (starts with 's')
        if (privateKey.startsWith('s') && privateKey.length >= 25) {
          wallet = xrpl.Wallet.fromSeed(privateKey);
        } else {
          // Try as entropy/secret (hex format)
          wallet = xrpl.Wallet.fromEntropy(privateKey);
        }
      } catch (walletError) {
        try {
          // Alternative: try as secret
          wallet = xrpl.Wallet.fromSecret(privateKey);
        } catch (secretError) {
          throw new Error(`Invalid XRP seed/secret format. Expected XRP seed (starts with 's') or valid secret. Error: ${walletError.message}`);
        }
      }
  
      const fromAddress = wallet.address;
      console.log('From Address:', fromAddress);
  
      // Validate destination address
      if (!xrpl.isValidClassicAddress(to) && !xrpl.isValidXAddress(to)) {
        throw new Error(`Invalid XRP destination address: ${to}`);
      }
  
      // Convert X-Address to classic address if needed
      let destinationAddress = to;
      if (xrpl.isValidXAddress(to)) {
        const decoded = xrpl.xAddressToClassicAddress(to, false);
        destinationAddress = decoded.classicAddress;
        console.log('Converted X-Address to classic address:', destinationAddress);
      }
  
      // Check account info and balance
      let accountInfo;
      let currentBalance = 0;
      
      try {
        accountInfo = await client.request({
          command: 'account_info',
          account: fromAddress,
          ledger_index: 'validated'
        });
        
        if (accountInfo.result && accountInfo.result.account_data) {
          currentBalance = parseFloat(xrpl.dropsToXrp(accountInfo.result.account_data.Balance));
          console.log('Current Balance:', currentBalance, 'XRP');
          
          // Check if account exists and is activated
          if (!accountInfo.result.account_data.Sequence) {
            throw new Error(`Account ${fromAddress} exists but may not be fully activated`);
          }
          
        } else {
          throw new Error(`Account ${fromAddress} not found or not activated`);
        }
      } catch (accountError) {
        if (accountError.message.includes('actNotFound')) {
          throw new Error(`Account ${fromAddress} does not exist. You need to activate it by receiving at least 10 XRP (minimum reserve).`);
        }
        throw new Error(`Failed to get account info: ${accountError.message}`);
      }
  
      // Validate amount
      const sendAmount = parseFloat(amount);
      if (sendAmount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
  
      // Check balance (including reserve requirements)
      const minReserve = 10; // XRP minimum account reserve
      const availableBalance = currentBalance - minReserve;
      
      if (availableBalance <= 0) {
        throw new Error(`Insufficient balance. Account needs to maintain minimum reserve of ${minReserve} XRP. Current balance: ${currentBalance} XRP`);
      }
      
      if (sendAmount > availableBalance) {
        throw new Error(`Insufficient balance. Available: ${availableBalance} XRP (after ${minReserve} XRP reserve), Required: ${sendAmount} XRP`);
      }
  
      // Check destination account (for new accounts, minimum 10 XRP required)
      try {
        const destAccountInfo = await client.request({
          command: 'account_info',
          account: destinationAddress,
          ledger_index: 'validated'
        });
      } catch (destError) {
        if (destError.message.includes('actNotFound')) {
          if (sendAmount < 10) {
            throw new Error(`Destination account ${destinationAddress} does not exist. First transaction to a new account must be at least 10 XRP to activate it.`);
          }
          console.log('Destination is new account, will be activated with this transaction');
        }
      }
  
      // Prepare payment transaction
      const payment = {
        TransactionType: 'Payment',
        Account: fromAddress,
        Amount: xrpl.xrpToDrops(sendAmount.toString()),
        Destination: destinationAddress,
        Fee: '12' // 12 drops = 0.000012 XRP (standard fee)
      };
  
      console.log('Payment object:', payment);
  
      // Auto-fill transaction (adds sequence, fee, etc.)
      let prepared;
      try {
        prepared = await client.autofill(payment);
        console.log('Transaction prepared:', prepared);
      } catch (autofillError) {
        throw new Error(`Failed to prepare transaction: ${autofillError.message}`);
      }
  
      // Sign transaction
      let signed;
      try {
        signed = wallet.sign(prepared);
        console.log('Transaction signed successfully');
      } catch (signError) {
        throw new Error(`Failed to sign transaction: ${signError.message}`);
      }
  
      // Submit and wait for validation
      console.log('Submitting transaction...');
      let result;
      try {
        result = await client.submitAndWait(signed.tx_blob);
        console.log('Transaction result:', JSON.stringify(result, null, 2));
      } catch (submitError) {
        throw new Error(`Failed to submit transaction: ${submitError.message}`);
      }
  
      // Check transaction result
      if (!result || !result.result) {
        throw new Error('No result returned from transaction submission');
      }
  
      const txResult = result.result;
      
      // Check for successful validation
      if (txResult.validated !== true) {
        throw new Error(`Transaction not validated. Status: ${txResult.engine_result || 'Unknown'}`);
      }
  
      // Check transaction success
      if (txResult.engine_result !== 'tesSUCCESS') {
        const errorCode = txResult.engine_result;
        const errorMessage = getXRPErrorMessage(errorCode);
        throw new Error(`Transaction failed: ${errorCode} - ${errorMessage}`);
      }
  
      const txHash = txResult.hash;
      if (!txHash) {
        throw new Error('No transaction hash returned');
      }
  
      console.log('Transaction successful! Hash:', txHash);
  
      // Get final balance
      let finalBalance = currentBalance;
      try {
        const finalAccountInfo = await client.request({
          command: 'account_info',
          account: fromAddress,
          ledger_index: 'validated'
        });
        if (finalAccountInfo.result && finalAccountInfo.result.account_data) {
          finalBalance = parseFloat(xrpl.dropsToXrp(finalAccountInfo.result.account_data.Balance));
        }
      } catch (e) {
        console.warn('Could not fetch final balance:', e.message);
      }
  
      return {
        success: true,
        txHash: txHash,
        network: "XRP Ledger",
        symbol: "XRP",
        from: fromAddress,
        to: destinationAddress,
        amount: sendAmount,
        balanceBefore: currentBalance,
        balanceAfter: finalBalance,
        fee: parseFloat(xrpl.dropsToXrp(prepared.Fee || '12')),
        ledgerIndex: txResult.ledger_index,
        explorerUrl: `https://livenet.xrpl.org/transactions/${txHash}`,
        xrplExplorer: `https://xrpscan.com/tx/${txHash}`
      };
  
    } catch (error) {
      console.error('XRP Transaction Error:', error);
      
      // Provide more specific error messages
      let errorMessage = error.message;
      
      if (error.message.includes('Invalid XRP seed')) {
        errorMessage = 'Invalid XRP seed/secret format. Use a valid XRP seed (starting with "s") or secret.';
      } else if (error.message.includes('does not exist')) {
        errorMessage = error.message + '\n\nTo activate an XRP account, send at least 10 XRP to it.';
      } else if (error.message.includes('minimum reserve')) {
        errorMessage = error.message + '\n\nXRP accounts must maintain a minimum reserve of 10 XRP.';
      } else if (error.message.includes('Insufficient balance')) {
        errorMessage = error.message;
      } else if (error.message.includes('Connection failed') || error.message.includes('connect')) {
        errorMessage = 'Failed to connect to XRP network. Please check your internet connection and try again.';
      }
      
      throw new Error(errorMessage);
      
    } finally {
      // Always disconnect the client
      if (client && client.isConnected()) {
        try {
          await client.disconnect();
          console.log('XRP client disconnected');
        } catch (disconnectError) {
          console.error('Error disconnecting XRP client:', disconnectError.message);
        }
      }
    }
  }

// Helper function to send TRON transaction - COMPLETELY REWRITTEN
// Fixed sendTRXTransaction function with proper error handling
async function sendTRXTransaction(privateKey, to, amount) {
    try {
      console.log('Starting TRON transaction...');
      console.log('TronWeb availability:', !!TronWeb, typeof TronWeb);
  
      // Check if TronWeb is available
      if (!TronWeb) {
        throw new Error('TronWeb library not found. Please reinstall: npm uninstall tronweb && npm install tronweb');
      }
  
      // Ensure TronWeb is a constructor
      if (typeof TronWeb !== 'function') {
        console.error('TronWeb type:', typeof TronWeb);
        console.error('TronWeb keys:', Object.keys(TronWeb));
        
        // Try to access the constructor from the module
        if (TronWeb.TronWeb && typeof TronWeb.TronWeb === 'function') {
          TronWeb = TronWeb.TronWeb;
        } else if (TronWeb.default && typeof TronWeb.default === 'function') {
          TronWeb = TronWeb.default;
        } else {
          throw new Error('Cannot find TronWeb constructor. Module structure: ' + JSON.stringify(Object.keys(TronWeb)));
        }
      }
  
      // Clean private key (remove 0x prefix if present)
      let cleanPrivateKey = privateKey;
      if (privateKey.startsWith('0x')) {
        cleanPrivateKey = privateKey.slice(2);
      }
  
      // Validate private key format (should be 64 hex characters)
      if (!/^[0-9a-fA-F]{64}$/.test(cleanPrivateKey)) {
        throw new Error('Invalid private key format. Expected 64 hex characters.');
      }
  
      console.log('Initializing TronWeb...');
  
      // Initialize TronWeb instance
      const tronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 
          'TRON-PRO-API-KEY': process.env.TRON_API_KEY || ''
        },
        privateKey: cleanPrivateKey
      });
  
      // Verify TronWeb instance
      if (!tronWeb || !tronWeb.trx) {
        throw new Error('Failed to initialize TronWeb instance properly');
      }
  
      console.log('TronWeb initialized successfully');
  
      // Get from address
      const fromAddress = tronWeb.address.fromPrivateKey(cleanPrivateKey);
      console.log('From Address:', fromAddress);
      console.log('To Address:', to);
      console.log('Amount:', amount, 'TRX');
  
      // Validate addresses
      if (!tronWeb.isAddress(fromAddress)) {
        throw new Error('Invalid from address derived from private key');
      }
      
      if (!tronWeb.isAddress(to)) {
        throw new Error('Invalid destination address format');
      }
  
      // Check if account exists and has balance
      let accountInfo;
      let currentBalance = 0;
      
      try {
        accountInfo = await tronWeb.trx.getAccount(fromAddress);
        console.log('Account info:', accountInfo);
        
        if (!accountInfo || Object.keys(accountInfo).length === 0) {
          throw new Error(`Account ${fromAddress} does not exist on TRON network. You need to activate it first by receiving some TRX.`);
        }
        
        if (accountInfo.balance) {
          currentBalance = tronWeb.fromSun(accountInfo.balance);
        }
        
        console.log('Current Balance:', currentBalance, 'TRX');
        
        if (parseFloat(currentBalance) < parseFloat(amount)) {
          throw new Error(`Insufficient balance. Available: ${currentBalance} TRX, Required: ${amount} TRX`);
        }
        
        // Check if account has enough TRX (minimum 0.1 TRX should remain for future transactions)
        if (parseFloat(currentBalance) - parseFloat(amount) < 0.1) {
          throw new Error(`Transaction would leave insufficient TRX for future transactions. Current: ${currentBalance} TRX, Sending: ${amount} TRX. Please leave at least 0.1 TRX in account.`);
        }
        
      } catch (accountError) {
        if (accountError.message.includes('does not exist')) {
          throw accountError;
        }
        console.warn('Account check failed:', accountError.message);
        throw new Error(`Failed to verify account: ${accountError.message}`);
      }
  
      // Convert amount to SUN (1 TRX = 1,000,000 SUN)
      const amountInSun = tronWeb.toSun(amount);
      console.log('Amount in SUN:', amountInSun);
  
      // Create transaction
      console.log('Creating transaction...');
      const transaction = await tronWeb.transactionBuilder.sendTrx(
        to,
        amountInSun,
        fromAddress
      );
  
      if (!transaction) {
        throw new Error('Failed to create transaction object');
      }
  
      console.log('Transaction created successfully');
  
      // Sign transaction
      console.log('Signing transaction...');
      const signedTransaction = await tronWeb.trx.sign(transaction, cleanPrivateKey);
      
      if (!signedTransaction) {
        throw new Error('Failed to sign transaction');
      }
  
      console.log('Transaction signed successfully');
  
      // Broadcast transaction
      console.log('Broadcasting transaction...');
      const broadcastResult = await tronWeb.trx.sendRawTransaction(signedTransaction);
      
      console.log('Broadcast result:', JSON.stringify(broadcastResult, null, 2));
  
      // *** FIXED ERROR HANDLING ***
      // Check for various error conditions in broadcast result
      if (!broadcastResult) {
        throw new Error('No response from transaction broadcast');
      }
  
      // Check for explicit failure
      if (broadcastResult.result === false) {
        let errorMsg = 'Transaction broadcast failed';
        
        if (broadcastResult.message) {
          // Decode hex error message if present
          try {
            const hexMsg = broadcastResult.message;
            const decodedMsg = Buffer.from(hexMsg, 'hex').toString('utf8');
            errorMsg = `Transaction failed: ${decodedMsg}`;
          } catch (e) {
            errorMsg = `Transaction failed: ${broadcastResult.message}`;
          }
        }
        
        if (broadcastResult.code) {
          errorMsg += ` (Code: ${broadcastResult.code})`;
        }
        
        throw new Error(errorMsg);
      }
  
      // Check for error codes even when result is not explicitly false
      if (broadcastResult.code && broadcastResult.code !== 'SUCCESS') {
        let errorMsg = `Transaction failed with code: ${broadcastResult.code}`;
        
        if (broadcastResult.message) {
          try {
            const hexMsg = broadcastResult.message;
            const decodedMsg = Buffer.from(hexMsg, 'hex').toString('utf8');
            errorMsg += ` - ${decodedMsg}`;
          } catch (e) {
            errorMsg += ` - ${broadcastResult.message}`;
          }
        }
        
        throw new Error(errorMsg);
      }
  
      // Check for specific error patterns
      if (broadcastResult.message && typeof broadcastResult.message === 'string') {
        try {
          const decodedMsg = Buffer.from(broadcastResult.message, 'hex').toString('utf8');
          if (decodedMsg.includes('does not exist') || decodedMsg.includes('account') || decodedMsg.includes('validate error')) {
            throw new Error(`Transaction validation failed: ${decodedMsg}`);
          }
        } catch (e) {
          // If hex decoding fails, check raw message
          if (broadcastResult.message.includes('ERROR') || broadcastResult.message.includes('FAIL')) {
            throw new Error(`Transaction failed: ${broadcastResult.message}`);
          }
        }
      }
  
      // Get transaction ID
      const txId = broadcastResult.txid || broadcastResult.transaction?.txID;
      
      if (!txId) {
        throw new Error('No transaction ID returned from broadcast - transaction may have failed');
      }
  
      console.log('Transaction successful! TX ID:', txId);
  
      // Wait a moment and verify transaction was actually broadcast
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        const txInfo = await tronWeb.trx.getTransaction(txId);
        console.log('Transaction verification:', txInfo);
        
        if (!txInfo || Object.keys(txInfo).length === 0) {
          throw new Error('Transaction was broadcast but not found on network. Please check manually.');
        }
      } catch (verifyError) {
        console.warn('Transaction verification failed:', verifyError.message);
        // Don't throw here, transaction might still be valid
      }
  
      return {
        success: true,
        txHash: txId,
        network: "TRON Mainnet",
        symbol: "TRX",
        from: fromAddress,
        to: to,
        amount: amount,
        balanceBefore: currentBalance,
        explorerUrl: `https://tronscan.org/#/transaction/${txId}`
      };
  
    } catch (error) {
      console.error('TRON Transaction Error:', error);
  
      // Provide more specific error messages
      let errorMessage = error.message;
      
      if (error.message.includes('TronWeb is not a constructor')) {
        errorMessage = 'TronWeb import issue. Try: npm uninstall tronweb && npm install tronweb@latest';
      } else if (error.message.includes('Cannot find TronWeb constructor')) {
        errorMessage = 'TronWeb module structure issue. Try reinstalling: npm install tronweb@latest';
      } else if (error.message.includes('Invalid private key')) {
        errorMessage = 'Invalid private key format. Ensure it\'s a 64-character hex string.';
      } else if (error.message.includes('Invalid address')) {
        errorMessage = `Invalid TRON address format: ${to}`;
      } else if (error.message.includes('does not exist')) {
        errorMessage = error.message + '\n\nTo activate a TRON account, you need to receive at least 0.1 TRX from another active account.';
      } else if (error.message.includes('Insufficient balance')) {
        errorMessage = error.message;
      } else if (error.message.includes('bandwidth') || error.message.includes('BANDWIDTH')) {
        errorMessage = 'Insufficient bandwidth. Please freeze TRX for resources or wait for bandwidth to replenish.';
      } else if (error.message.includes('energy') || error.message.includes('ENERGY')) {
        errorMessage = 'Insufficient energy. Please freeze TRX for energy resources.';
      }
      
      throw new Error(errorMessage);
    }
  }

// Main transaction endpoint
router.post("/send", async (req, res) => {
  const { network, privateKey, to, amount, gasPrice, gasLimit, feeRate } = req.body;

  // Validation
  if (!network || !privateKey || !to || !amount) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: network, privateKey, to, amount"
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      error: "Amount must be greater than 0"
    });
  }

  try {
    let result;

    // Route to appropriate handler based on network
    switch (network.toLowerCase()) {
      // EVM chains
      case 'ethereum':
      case 'eth':
        result = await sendEVMTransaction('ethereum', privateKey, to, amount, gasPrice, gasLimit);
        break;
      
      case 'bsc':
      case 'binance':
        result = await sendEVMTransaction('bsc', privateKey, to, amount, gasPrice, gasLimit);
        break;
      
      case 'polygon':
      case 'matic':
        result = await sendEVMTransaction('polygon', privateKey, to, amount, gasPrice, gasLimit);
        break;
      
      case 'arbitrum':
      case 'arb':
        result = await sendEVMTransaction('arbitrum', privateKey, to, amount, gasPrice, gasLimit);
        break;
      
      case 'linea':
        result = await sendEVMTransaction('linea', privateKey, to, amount, gasPrice, gasLimit);
        break;

      // Non-EVM chains
      case 'bitcoin':
      case 'btc':
        result = await sendBTCTransaction(privateKey, to, amount, feeRate);
        break;
      
      case 'dogecoin':
      case 'doge':
        result = await sendDOGETransaction(privateKey, to, amount, feeRate);
        break;
      
      case 'xrp':
      case 'ripple':
        result = await sendXRPTransaction(privateKey, to, amount);
        break;
      
      case 'tron':
      case 'trx':
        result = await sendTRXTransaction(privateKey, to, amount);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unsupported network: ${network}. Supported networks: ethereum, bsc, polygon, arbitrum, linea, bitcoin, dogecoin, xrp, tron`
        });
    }

    res.json(result);

  } catch (error) {
    console.error(`Transaction error for ${network}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      network: network
    });
  }
});

// Get supported networks
router.get("/networks", (req, res) => {
  const networks = {
    evm: Object.keys(EVM_NETWORKS).map(key => ({
      id: key,
      name: EVM_NETWORKS[key].name,
      symbol: EVM_NETWORKS[key].symbol,
      chainId: EVM_NETWORKS[key].chainId
    })),
    nonEvm: [
      { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
      { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
      { id: 'xrp', name: 'XRP Ledger', symbol: 'XRP' },
      { id: 'tron', name: 'TRON', symbol: 'TRX', available: !!TronWeb }
    ]
  };

  res.json({
    success: true,
    networks: networks,
    tronWebStatus: {
      available: !!TronWeb,
      type: typeof TronWeb
    }
  });
});

// Estimate gas for EVM transactions
router.post("/estimate-gas", async (req, res) => {
  const { network, from, to, amount } = req.body;

  if (!EVM_NETWORKS[network]) {
    return res.status(400).json({
      success: false,
      error: "Network not supported for gas estimation"
    });
  }

  try {
    const networkConfig = EVM_NETWORKS[network];
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

    const gasEstimate = await provider.estimateGas({
      from: from,
      to: to,
      value: ethers.parseEther(amount.toString())
    });

    const gasPrice = await provider.getFeeData();

    res.json({
      success: true,
      gasEstimate: gasEstimate.toString(),
      gasPrice: {
        gasPrice: gasPrice.gasPrice?.toString(),
        maxFeePerGas: gasPrice.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas?.toString()
      },
      network: networkConfig.name
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;