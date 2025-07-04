// cryptoRoutes.js

const express = require('express');
const { getCryptoPrices } = require('../controller/cryptoController');

const router = express.Router();

// Endpoint to fetch the latest crypto prices
router.get('/prices', getCryptoPrices);

module.exports = router;
