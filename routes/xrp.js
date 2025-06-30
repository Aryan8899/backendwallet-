const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getXRPBalance } = require("../services/xrpService");
const { generateWallet, generateWalletFromMnemonic } = require("../services/walletService");
const xrpl = require("xrpl");

// ✅ XRP address validator
const isValidXRPAddress = (address) => {
  return /^r[1-9A-HJ-NP-Za-km-z]{25,35}$/.test(address);
};

// ✅ GET XRP Balance
router.get("/balance/:address", async (req, res) => {
  const { address } = req.params;

  if (!isValidXRPAddress(address)) {
    return res.status(400).json({ error: "Invalid XRP address format" });
  }

  try {
    const balance = await getXRPBalance(address);
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET XRP Transaction History


// ✅ GET XRP Transaction History using xrpl.js


// ✅ GET XRP Transaction History using xrpl.js
// ✅ GET XRP Transaction History using xrpl.js (Improved with better debugging)
router.get("/transactions/:address", async (req, res) => {
  const { address } = req.params;
  const { limit = 25, marker } = req.query; // Add pagination support

  if (!isValidXRPAddress(address)) {
    return res.status(400).json({ error: "Invalid XRP address format" });
  }

  const client = new xrpl.Client("wss://s1.ripple.com"); // XRPL Mainnet
  try {
    await client.connect();
    console.log(`🔍 Fetching transactions for address: ${address}`);

    // First, check if the account exists
    try {
      const accountInfo = await client.request({
        command: "account_info",
        account: address,
        ledger_index: "validated"
      });
      console.log(`✅ Account exists with balance: ${xrpl.dropsToXrp(accountInfo.result.account_data.Balance)} XRP`);
    } catch (accountError) {
      console.log(`❌ Account error: ${accountError.message}`);
      if (accountError.data?.error === 'actNotFound') {
        return res.json({
          address,
          txCount: 0,
          transactions: [],
          message: "Account not found or has no transactions yet"
        });
      }
    }

    // Build transaction request
    const txRequest = {
      command: "account_tx",
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: parseInt(limit),
      forward: false // Get most recent transactions first
    };

    // Add marker for pagination if provided
    if (marker) {
      txRequest.marker = marker;
    }

    console.log(`📡 Making transaction request:`, txRequest);

    const txResponse = await client.request(txRequest);
    console.log(`📊 Raw response:`, {
      txCount: txResponse.result.transactions?.length || 0,
      marker: txResponse.result.marker,
      validated: txResponse.result.validated
    });

    if (!txResponse.result.transactions || txResponse.result.transactions.length === 0) {
      return res.json({
        address,
        txCount: 0,
        transactions: [],
        message: "No transactions found for this address",
        marker: txResponse.result.marker
      });
    }

    const transactions = txResponse.result.transactions
      .filter((tx) => {
        // Check for either tx or tx_json (XRPL can return either format)
        if (!tx.tx && !tx.tx_json) {
          console.log(`⚠️ Skipping transaction without tx/tx_json data:`, tx);
          return false;
        }
        return true;
      })
      .map((tx, index) => {
        // Use tx_json if available, otherwise fall back to tx
        const t = tx.tx_json || tx.tx;
        console.log(`🔄 Processing transaction ${index + 1}:`, {
          hash: t.hash,
          type: t.TransactionType,
          account: t.Account,
          destination: t.Destination
        });

        // Handle different transaction types and amounts
        let amount = "0";
        let currency = "XRP";
        
        // For Payment transactions, check Amount field
        if (t.Amount) {
          if (typeof t.Amount === "string") {
            // XRP amount in drops
            amount = xrpl.dropsToXrp(t.Amount);
            currency = "XRP";
          } else if (typeof t.Amount === "object") {
            // Issued currency
            amount = t.Amount.value || "0";
            currency = t.Amount.currency || "Unknown";
          }
        } 
        // For other transaction types, check DeliverMax or TakerGets/TakerPays
        else if (t.DeliverMax) {
          if (typeof t.DeliverMax === "string") {
            amount = xrpl.dropsToXrp(t.DeliverMax);
            currency = "XRP";
          } else if (typeof t.DeliverMax === "object") {
            amount = t.DeliverMax.value || "0";
            currency = t.DeliverMax.currency || "Unknown";
          }
        }
        // For OfferCreate transactions
        else if (t.TakerGets && t.TransactionType === "OfferCreate") {
          if (typeof t.TakerGets === "string") {
            amount = xrpl.dropsToXrp(t.TakerGets);
            currency = "XRP";
          } else if (typeof t.TakerGets === "object") {
            amount = t.TakerGets.value || "0";
            currency = t.TakerGets.currency || "Unknown";
          }
        }

        // Determine transaction direction
        let direction = "unknown";
        if (t.Account === address) {
          direction = "outgoing";
        } else if (t.Destination === address) {
          direction = "incoming";
        }

        // Calculate date (Ripple epoch starts at January 1, 2000)
        let dateString = "N/A";
        if (tx.date || t.date) {
          const rippleTimestamp = tx.date || t.date;
          const rippleDate = new Date((rippleTimestamp + 946684800) * 1000);
          dateString = rippleDate.toISOString();
        } else if (tx.close_time_iso) {
          // Use close_time_iso if available
          dateString = tx.close_time_iso;
        }

        return {
          hash: t.hash || tx.hash,
          type: t.TransactionType,
          source: t.Account,
          destination: t.Destination || t.RegularKey || "N/A", // Include RegularKey for SetRegularKey transactions
          amount: amount,
          currency: currency,
          fee: xrpl.dropsToXrp(t.Fee || "0"),
          date: dateString,
          direction: direction,
          result: tx.meta?.TransactionResult || "UNKNOWN",
          ledgerIndex: tx.ledger_index || t.ledger_index || "N/A",
          // Additional transaction-specific data
          sequence: t.Sequence,
          flags: t.Flags,
          // Add memo if present
          memo: t.Memos && t.Memos[0] ? t.Memos[0] : undefined,
          // For offers, include TakerPays info
          takerPays: t.TakerPays || undefined,
          takerGets: t.TakerGets || undefined,
          // Raw data for debugging (only in development)
          raw: process.env.NODE_ENV === 'development' ? tx : undefined
        };
      });

    console.log(`✅ Processed ${transactions.length} transactions`);

    res.json({
      address,
      txCount: transactions.length,
      transactions,
      marker: txResponse.result.marker, // For pagination
      validated: txResponse.result.validated
    });

  } catch (err) {
    console.error("❌ Error fetching XRP transactions:", err);
    console.error("Error details:", {
      message: err.message,
      data: err.data,
      stack: err.stack
    });
    
    res.status(500).json({ 
      error: err.message,
      details: err.data?.error_message || "Unknown error occurred",
      address: address
    });
  } finally {
    try {
      await client.disconnect();
      console.log("🔌 Disconnected from XRPL");
    } catch (disconnectError) {
      console.error("Error disconnecting:", disconnectError.message);
    }
  }
});

// ✅ Test endpoint with a known active address
router.get("/test-transactions", async (req, res) => {
  // Using a known active XRP address (Binance hot wallet)
  const testAddress = "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w";
  
  const client = new xrpl.Client("wss://s1.ripple.com");
  try {
    await client.connect();
    
    const txResponse = await client.request({
      command: "account_tx",
      account: testAddress,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 5
    });

    res.json({
      testAddress,
      rawTransactionCount: txResponse.result.transactions?.length || 0,
      hasTransactions: txResponse.result.transactions?.length > 0,
      sampleTransaction: txResponse.result.transactions?.[0] || null
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await client.disconnect();
  }
});

// ✅ Add a separate endpoint to test account existence
router.get("/account-info/:address", async (req, res) => {
  const { address } = req.params;

  if (!isValidXRPAddress(address)) {
    return res.status(400).json({ error: "Invalid XRP address format" });
  }

  const client = new xrpl.Client("wss://s1.ripple.com");
  try {
    await client.connect();
    
    const accountInfo = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated"
    });

    res.json({
      address,
      exists: true,
      balance: xrpl.dropsToXrp(accountInfo.result.account_data.Balance),
      sequence: accountInfo.result.account_data.Sequence,
      flags: accountInfo.result.account_data.Flags,
      ledgerIndex: accountInfo.result.ledger_index
    });

  } catch (err) {
    if (err.data?.error === 'actNotFound') {
      res.json({
        address,
        exists: false,
        message: "Account not found - may not be activated yet"
      });
    } else {
      res.status(500).json({ error: err.message });
    }
  } finally {
    await client.disconnect();
  }
});


module.exports = router;
