const axios = require("axios");

const TRON_API_KEY = process.env.TRON_API_KEY;
const TRONGRID_API_URL = "https://api.trongrid.io/v1/accounts";

const getTRXTransactions = async (address, limit = 10) => {
  try {
    // Get TRX transactions from TronGrid API
    const response = await axios.get(`${TRONGRID_API_URL}/${address}/transactions`, {
      headers: {
        'TRON-PRO-API-KEY': TRON_API_KEY,
      },
      params: {
        limit: limit,
        order_by: 'timestamp,desc' // Get latest transactions first
      }
    });

    if (!response.data || !response.data.data) {
      return { symbol: "TRX", transactions: [], error: "Invalid response from TRON API" };
    }

    const transactions = response.data.data.map(tx => {
      const contract = tx.raw_data?.contract?.[0];
      const contractType = contract?.type;
      let fromAddress = '';
      let toAddress = '';
      let value = 0;

      if (contractType === 'TransferContract') {
        fromAddress = contract.parameter.value.owner_address;
        toAddress = contract.parameter.value.to_address;
        value = (contract.parameter.value.amount || 0) / 1e6; // Convert from Sun to TRX
      }

      return {
        hash: tx.txID,
        timestamp: new Date(tx.block_timestamp).toISOString(),
        blockNumber: tx.blockNumber,
        from: fromAddress,
        to: toAddress,
        value: value,
        contractType: contractType,
        fee: (tx.fee || 0) / 1e6,
        energyUsage: tx.energy_usage || 0,
        netUsage: tx.net_usage || 0,
        result: tx.ret?.[0]?.contractRet || 'SUCCESS',
        type: fromAddress.toLowerCase() === address.toLowerCase() ? 'sent' : 'received'
      };
    });

    return { symbol: "TRX", transactions };
  } catch (err) {
    console.error("Error fetching TRX transactions:", err.message);
    return { symbol: "TRX", transactions: [], error: err.message };
  }
};

module.exports = { getTRXTransactions };