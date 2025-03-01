require("dotenv").config();
const config = require("./config");
const { connectWebSocket, marketDataEmitter } = require("./okx-client");
const { processCandle } = require("./strategy");
const { placeOrder, setLeverage } = require("./trader");

// Global variables
let lastTradeTime = 0;
let isTrading = false;

// Initialize the bot
async function init() {
  console.log("🚀 Starting OKX Trading Bot...");
  console.log(`💱 Trading ${config.TRADING_PAIR} with ${config.LEVERAGE}x leverage in ${config.TRADE_MODE} mode (FUTURES)`);
  console.log(`📊 Strategy: ${config.STRATEGY} with ${config.TIMEFRAME} timeframe`);
  
  // Setup error handling
  process.on("uncaughtException", (error) => {
    console.error("🔥 CRITICAL ERROR:", error);
    // Attempt graceful shutdown
    process.exit(1);
  });
  
  process.on("unhandledRejection", (reason, promise) => {
    console.error("🔥 Unhandled Promise Rejection:", reason);
  });
  
  // Connect to the OKX WebSocket
  connectWebSocket();
  
  // Initialize leverage
  try {
    await setLeverage();
    console.log("✅ Leverage set successfully");
  } catch (error) {
    console.error("❌ Failed to set leverage:", error.message);
  }
}

// Handle trading signals
marketDataEmitter.on("signal", async (signal) => {
  console.log(`🔔 Received signal: ${signal.action} at $${signal.price}`);
  
  // Check if trading is allowed (cooldown period)
  const now = Date.now();
  if (now - lastTradeTime < config.TRADE_COOLDOWN) {
    console.log("⏳ Trade cooldown in effect, skipping this signal...");
    return;
  }
  
  if (!isTrading) {
    isTrading = true;
    try {
      await placeOrder(config.TRADING_PAIR, signal.action, config.TRADE_SIZE);
      lastTradeTime = Date.now();
    } catch (error) {
      console.error("❌ Error executing trade:", error.message);
    } finally {
      isTrading = false;
    }
  } else {
    console.log("🔒 Trading in progress, skipping this signal...");
  }
});

// Start the bot
init().catch(error => {
  console.error("❌ Initialization error:", error.message);
  process.exit(1);
});
