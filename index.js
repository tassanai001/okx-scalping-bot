require("dotenv").config();
const config = require("./config");
const { connectWebSocket, marketDataEmitter } = require("./okx-client");
const { processCandle } = require("./strategy");
const { placeOrder, setLeverage, getTradeSize } = require("./trader");

// Global variables
let lastTradeTime = 0;
let isTrading = false;

// Initialize the bot
async function initBot() {
  try {
    console.log("🤖 OKX Scalping Bot for Futures");
    console.log("==============================");
    console.log(`📊 Trading Pair: ${config.TRADING_PAIR}`);
    console.log(`⏱️ Timeframe: ${config.TIMEFRAME}`);
    console.log(`🔧 Strategy: ${config.STRATEGY}`);
    console.log(`⚙️ Mode: ${config.TRADE_MODE}`);
    console.log(`📈 Leverage: ${config.LEVERAGE}x`);
    console.log(`💰 Using ${config.USE_PERCENTAGE_OF_BALANCE}% of ${config.USE_PERCENTAGE_OF_BALANCE_CURRENCY} balance per trade`);
    console.log(`🛑 Stop Loss: ${config.STOP_LOSS_PERCENTAGE}% from entry price`);
    console.log(`🎯 Take Profit: ${config.TAKE_PROFIT_PERCENTAGE}% from entry price`);
    if (config.USE_SIMULATED_TRADING) {
      console.log(`🧪 SIMULATED TRADING MODE ENABLED (Demo)`);
    }
    console.log("==============================");
  } catch (error) {
    console.error("❌ Initialization error:", error.message);
    process.exit(1);
  }

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
  
  // Get dynamic trade size
  try {
    await getTradeSize(config.USE_PERCENTAGE_OF_BALANCE_CURRENCY, config.USE_PERCENTAGE_OF_BALANCE);
  } catch (error) {
    console.error("❌ Failed to get trade size:", error.message);
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
      // Place order with dynamic size (passing null tells the trader to calculate size)
      await placeOrder(config.TRADING_PAIR, signal.action, null);
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
initBot().catch(error => {
  console.error("❌ Initialization error:", error.message);
  process.exit(1);
});
