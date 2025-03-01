const { marketDataEmitter } = require("./okx-client");
const { EMA } = require("ta.js");
const EventEmitter = require("events");

// Create a trading signal emitter
class TradingSignalEmitter extends EventEmitter {}
const tradingSignalEmitter = new TradingSignalEmitter();

let priceHistory = [];
let lastSignal = "HOLD";

marketDataEmitter.on("marketData", (marketData) => {
  console.log(`📈 New Price Update: ${marketData.price}`);

  priceHistory.push(marketData.price);
  if (priceHistory.length > 21) priceHistory.shift(); // Keep last 21 prices

  if (priceHistory.length < 21) {
    console.log(`⏳ Collecting price data: ${priceHistory.length}/21`);
    return; // Wait until we have enough data
  }

  const ema9 = EMA.calculate(9, priceHistory);
  const ema21 = EMA.calculate(21, priceHistory);

  let signal = "HOLD";

  if (ema9 > ema21) {
    signal = "BUY";
  } else if (ema9 < ema21) {
    signal = "SELL";
  }

  // Only log and emit when signal changes
  if (signal !== lastSignal) {
    console.log(`📢 Signal: ${signal}`);

    // Emit the trading signal with relevant data
    tradingSignalEmitter.emit("signal", {
      type: signal,
      price: marketData.price,
      timestamp: Date.now(),
      ema9: ema9,
      ema21: ema21
    });

    lastSignal = signal;
  }
});

module.exports = { tradingSignalEmitter };
