// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const xrpRoutes = require("./routes/xrp");
const btcRoutes = require("./routes/btc");
const dogeBalanceRoutes = require("./routes/dogeBalance");
const trxRoutes = require("./routes/trx");



const app = express();
app.use(cors());
app.use(express.json());

// Import routes
const walletRoutes = require("./routes/wallet");
const authRoutes = require("./routes/auth");


app.use("/api/wallet", walletRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/wallet/xrp", xrpRoutes);
app.use("/api/wallet/btc", btcRoutes);
app.use("/api/wallet/doge", dogeBalanceRoutes);
app.use("/api/wallet/trx", trxRoutes);  // New route for TRON


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
