// Import required modules
require("./strategy"); // Just require strategy to initialize the WebSocket listeners
const { placeOrder } = require("./trader");
const { marketDataEmitter } = require("./okx-client");

const SYMBOL = "BTC-USDT";
const TRADE_SIZE = "0.001"; // Adjust based on capital

// Track last trade to avoid excessive trading
let lastTradeTime = 0;
const TRADE_COOLDOWN = 60000; // 1 minute cooldown between trades

// Listen for trading signals from the strategy
marketDataEmitter.on("marketData", (marketData) => {
  // Initialize the bot
  console.log(` Bot monitoring ${SYMBOL} at $${marketData.price}`);
});

// Create a separate event listener for trading signals
// This could be added to strategy.js instead, but keeping it here for clarity
const { EMA } = require("ta.js");
let priceHistory = [];
let lastDecision = "HOLD";

marketDataEmitter.on("marketData", async (marketData) => {
  // Update price history
  priceHistory.push(marketData.price);
  if (priceHistory.length > 21) priceHistory.shift(); // Keep last 21 prices

  if (priceHistory.length < 21) return; // Wait until we have enough data

  // Calculate EMAs
  const ema9 = EMA.calculate(9, priceHistory);
  const ema21 = EMA.calculate(21, priceHistory);

  // Determine trading decision
  let decision = "HOLD";
  if (ema9 > ema21) {
    decision = "BUY";
  } else if (ema9 < ema21) {
    decision = "SELL";
  }

  // Only log when decision changes
  if (decision !== lastDecision) {
    console.log(` Trading Signal: ${decision}`);
    lastDecision = decision;
  }

  // Check if we should execute a trade
  const now = Date.now();
  if ((decision === "BUY" || decision === "SELL") &&
      now - lastTradeTime > TRADE_COOLDOWN) {

    console.log(` Executing ${decision} order...`);
    try {
      await placeOrder(SYMBOL, decision, TRADE_SIZE);
      lastTradeTime = now;
    } catch (error) {
      console.error(" Trade execution error:", error);
    }
  }
});

// Log startup message
console.log(" OKX Scalping Bot Starting...");
console.log(` Monitoring ${SYMBOL}`);
console.log(" Waiting for enough price data to generate signals...");
