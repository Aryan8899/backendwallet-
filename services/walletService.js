const bip39 = require("bip39");
const { hdkey } = require("ethereumjs-wallet");

const generateWallet = () => {
  // Generate mnemonic (12 words)
  const mnemonic = bip39.generateMnemonic();

  // Convert mnemonic to seed
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // Generate wallet from seed
  const hdWallet = hdkey.fromMasterSeed(seed);
  const key = hdWallet.derivePath("m/44'/60'/0'/0/0");  // Standard Ethereum path
  const wallet = key.getWallet();

  // Extract private key and address
  const privateKey = wallet.getPrivateKeyString();
  const address = wallet.getAddressString();

  return { mnemonic, privateKey, address };
};

module.exports = { generateWallet };
