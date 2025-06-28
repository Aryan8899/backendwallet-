// Network.js
const networks = {};

const NetworkModel = class {
  static addNetwork(networkData) {
    const { chainId, networkName, rpcUrl, currencySymbol, blockExplorerUrl, isCustom = true } = networkData;

    networks[chainId] = {
      chainId: parseInt(chainId),
      networkName,
      rpcUrl,
      currencySymbol,
      blockExplorerUrl: blockExplorerUrl || '',
      isCustom,
      createdAt: new Date().toISOString()
    };

    return networks[chainId];
  }

  static getNetwork(chainId) {
    return networks[chainId] || null;
  }

  static getAllNetworks() {
    return networks;
  }

  static getCustomNetworks() {
    return Object.values(networks).filter(network => network.isCustom);
  }

  static removeNetwork(chainId) {
    const network = networks[chainId];
    if (network && network.isCustom) {
      delete networks[chainId];
      return true;
    }
    return false;
  }

  static updateNetwork(chainId, updateData) {
    if (networks[chainId]) {
      networks[chainId] = { ...networks[chainId], ...updateData };
      return networks[chainId];
    }
    return null;
  }
};

module.exports = NetworkModel;
