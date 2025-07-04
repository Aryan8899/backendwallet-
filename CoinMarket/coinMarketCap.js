// coinMarketCap.js - FIXED VERSION

const axios = require('axios');

const API_KEY = '1b4ba938-3c82-44b4-95be-3b99bfe5b6e6';  // CoinMarketCap API Key

// Use the quotes/latest endpoint for specific symbols
const BASE_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

const getPrices = async (symbols = ['BTC', 'ETH', 'BNB', 'TRX', 'DOGE', 'XRP']) => {
    try {
        // Use the correct endpoint for fetching specific cryptocurrency prices
        const response = await axios.get(BASE_URL, {
            headers: {
                'X-CMC_PRO_API_KEY': API_KEY,
                'Accept': 'application/json'
            },
            params: {
                'symbol': symbols.join(','), // Fetching by symbols
                'convert': 'USD' // Convert prices to USD
            }
        });

        // The response structure for quotes/latest is different
        const prices = {};
        
        // Handle the response data structure
        if (response.data && response.data.data) {
            Object.keys(response.data.data).forEach(symbol => {
                const coinData = response.data.data[symbol];
                if (coinData && coinData.quote && coinData.quote.USD) {
                    prices[symbol] = coinData.quote.USD.price;
                }
            });
        }

        return prices; // Return the prices object
    } catch (error) {
        console.error('Error fetching CoinMarketCap data:', error.message);
        
        // Log more details about the error
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        throw error; // Re-throw the error for higher level handling
    }
};

// Alternative function using listings/latest endpoint (gets top coins by market cap)
const getTopCoinPrices = async (limit = 10) => {
    try {
        const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest', {
            headers: {
                'X-CMC_PRO_API_KEY': API_KEY,
                'Accept': 'application/json'
            },
            params: {
                'limit': limit, // Number of top coins to fetch
                'convert': 'USD'
            }
        });

        const prices = {};
        
        if (response.data && response.data.data) {
            response.data.data.forEach(coin => {
                if (coin.quote && coin.quote.USD) {
                    prices[coin.symbol] = coin.quote.USD.price;
                }
            });
        }

        return prices;
    } catch (error) {
        console.error('Error fetching top coin prices:', error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        throw error;
    }
};

module.exports = { getPrices, getTopCoinPrices };