// config/networks.js
require('dotenv').config();

const networkConfigs = {
  // Ethereum Mainnet
  ethereum: {
    name: "Ethereum",
    chainId: 1,
    symbol: "ETH",
    decimals: 18,
    rpcUrls: [
      process.env.ETH_RPC_URL,
      "https://eth-mainnet.g.alchemy.com/v2/your-api-key",
      "https://mainnet.infura.io/v3/your-project-id",
      "https://ethereum.publicnode.com",
      "https://rpc.ankr.com/eth"
    ].filter(Boolean), // Remove null/undefined values
    blockExplorer: "https://etherscan.io",
    isTestnet: false
  },

  // Binance Smart Chain
  bsc: {
    name: "BNB Smart Chain",
    chainId: 56,
    symbol: "BNB",
    decimals: 18,
    rpcUrls: [
      process.env.BSC_RPC_URL,
      "https://bsc-dataseed1.binance.org/",
      "https://bsc-dataseed2.binance.org/",
      "https://bsc-dataseed3.binance.org/",
      "https://bsc.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://bscscan.com",
    isTestnet: false
  },

  // Polygon
  polygon: {
    name: "Polygon",
    chainId: 137,
    symbol: "MATIC",
    decimals: 18,
    rpcUrls: [
      process.env.POLYGON_RPC_URL,
      "https://polygon-rpc.com/",
      "https://rpc-mainnet.maticvigil.com/",
      "https://polygon.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://polygonscan.com",
    isTestnet: false
  },

  // Arbitrum
  arbitrum: {
    name: "Arbitrum One",
    chainId: 42161,
    symbol: "ETH",
    decimals: 18,
    rpcUrls: [
      process.env.ARBITRUM_RPC_URL,
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://arbiscan.io",
    isTestnet: false
  },

  // Optimism
  optimism: {
    name: "Optimism",
    chainId: 10,
    symbol: "ETH",
    decimals: 18,
    rpcUrls: [
      process.env.OPTIMISM_RPC_URL,
      "https://mainnet.optimism.io",
      "https://optimism.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://optimistic.etherscan.io",
    isTestnet: false
  },

  // Avalanche
  avalanche: {
    name: "Avalanche",
    chainId: 43114,
    symbol: "AVAX",
    decimals: 18,
    rpcUrls: [
      process.env.AVALANCHE_RPC_URL,
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avalanche.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://snowtrace.io",
    isTestnet: false
  },

  // Fantom
  fantom: {
    name: "Fantom",
    chainId: 250,
    symbol: "FTM",
    decimals: 18,
    rpcUrls: [
      process.env.FANTOM_RPC_URL,
      "https://rpc.ftm.tools/",
      "https://fantom.publicnode.com"
    ].filter(Boolean),
    blockExplorer: "https://ftmscan.com",
    isTestnet: false
  },

  // Testnets

};

// Environment configuration
const environment = {
  // Maximum number of blocks to scan in one request
  MAX_BLOCK_RANGE: process.env.MAX_BLOCK_RANGE || 10000,
  
  // Default number of transactions to return
  DEFAULT_TX_LIMIT: process.env.DEFAULT_TX_LIMIT || 10,
  
  // Request timeout in milliseconds
  RPC_TIMEOUT: process.env.RPC_TIMEOUT || 30000,
  
  // Retry configuration
  MAX_RETRIES: process.env.MAX_RETRIES || 3,
  RETRY_DELAY: process.env.RETRY_DELAY || 1000,
  
  // Cache configuration
  CACHE_TTL: process.env.CACHE_TTL || 300, // 5 minutes
  
  // Rate limiting
  RATE_LIMIT_REQUESTS: process.env.RATE_LIMIT_REQUESTS || 100,
  RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW || 60000, // 1 minute
};

// Get network configuration
function getNetworkConfig(networkName) {
  const config = networkConfigs[networkName];
  if (!config) {
    throw new Error(`Network ${networkName} is not supported`);
  }
  return config;
}

// Get working RPC URL for a network
function getWorkingRpcUrl(networkName) {
  const config = getNetworkConfig(networkName);
  return config.rpcUrls[0]; // Return first available RPC URL
}

// Get all supported networks
function getAllNetworks() {
  return Object.keys(networkConfigs);
}

// Get mainnet networks only
function getMainnetNetworks() {
  return Object.keys(networkConfigs).filter(key => !networkConfigs[key].isTestnet);
}

// Get testnet networks only
function getTestnetNetworks() {
  return Object.keys(networkConfigs).filter(key => networkConfigs[key].isTestnet);
}

// Add custom network
function addCustomNetwork(networkName, config) {
  if (networkConfigs[networkName]) {
    throw new Error(`Network ${networkName} already exists`);
  }
  
  networkConfigs[networkName] = {
    name: config.name || networkName,
    chainId: config.chainId,
    symbol: config.symbol,
    decimals: config.decimals || 18,
    rpcUrls: Array.isArray(config.rpcUrls) ? config.rpcUrls : [config.rpcUrls],
    blockExplorer: config.blockExplorer,
    isTestnet: config.isTestnet || false
  };
}

// Validate network configuration
function validateNetworkConfig(config) {
  const required = ['chainId', 'symbol', 'rpcUrls'];
  const missing = required.filter(field => !config[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  if (!Array.isArray(config.rpcUrls) && typeof config.rpcUrls !== 'string') {
    throw new Error('rpcUrls must be an array or string');
  }
  
  if (typeof config.chainId !== 'number' || config.chainId <= 0) {
    throw new Error('chainId must be a positive number');
  }
}

module.exports = {
  networkConfigs,
  environment,
  getNetworkConfig,
  getWorkingRpcUrl,
  getAllNetworks,
  getMainnetNetworks,
  getTestnetNetworks,
  addCustomNetwork,
  validateNetworkConfig
};