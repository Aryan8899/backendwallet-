// cryptoController.js

const { getPrices } = require('../CoinMarket/coinMarketCap');

const getCryptoPrices = async (req, res) => {
    try {
        const prices = await getPrices();
        res.status(200).json(prices);
    } catch (error) {
        res.status(500).json({ error: 'Unable to fetch crypto prices' });
    }
};

module.exports = { getCryptoPrices };
