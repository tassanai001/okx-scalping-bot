/**
 * Strategy module for OKX Scalping Bot
 * Implements technical analysis strategies for trading signals
 */
const { marketDataEmitter } = require("./okx-client");
const config = require("./config");
const ta = require("ta.js");
const EventEmitter = require("events");

// Create signal emitter
class SignalEmitter extends EventEmitter {}
const signalEmitter = new SignalEmitter();

// Store price history
let priceHistory = [];
let ohlcHistory = [];

// Track last processed candle timestamp
let lastCandleTimestamp = 0;

// Track bot state for signal generation
let inPosition = false;
let positionType = null; // "long" or "short"

// Validate configuration
function validateConfig() {
  const requiredConfigs = [
    "TRADING_PAIR", "TRADE_SIZE", "TRADE_COOLDOWN", 
    "STRATEGY", "TIMEFRAME", "EMA_SHORT_PERIOD", "EMA_LONG_PERIOD",
    "TLBB_FRACTALS_PERIOD", "BB_LENGTH", "BB_DEVIATION",
    "ST_PERIOD", "ST_MULTIPLIER"
  ];
  
  const missingConfigs = requiredConfigs.filter(key => typeof config[key] === "undefined");
  
  if (missingConfigs.length > 0) {
    throw new Error(`Missing required config parameters: ${missingConfigs.join(", ")}`);
  }
  
  console.log("✅ Configuration validated successfully");
}

/**
 * Calculate Bollinger Bands
 * @param {Array} prices - Array of price objects with close property
 * @param {number} length - Bollinger Band length
 * @param {number} deviation - Standard deviation multiplier
 * @returns {Object} Bollinger Bands (upper, middle, lower)
 */
function calculateBollingerBands(prices, length = config.BB_LENGTH, deviation = config.BB_DEVIATION) {
  if (prices.length < length) {
    return null;
  }
  
  try {
    const closePrices = prices.map(candle => candle.close);
    const sma = ta.sma(closePrices, length);
    const stdDev = ta.stdev(closePrices, length);
    
    return {
      upper: sma + (stdDev * deviation),
      middle: sma,
      lower: sma - (stdDev * deviation)
    };
  } catch (error) {
    console.error("❌ Error calculating Bollinger Bands:", error.message);
    return null;
  }
}

/**
 * Calculate Supertrend indicator
 * @param {Array} candles - Array of OHLC candles
 * @param {number} period - ATR period
 * @param {number} multiplier - ATR multiplier
 * @returns {Object} Supertrend indicator values
 */
function calculateSupertrend(candles, period = config.ST_PERIOD, multiplier = config.ST_MULTIPLIER) {
  if (candles.length < period) {
    return null;
  }
  
  try {
    // Calculate ATR
    const highs = candles.map(candle => candle.high);
    const lows = candles.map(candle => candle.low);
    const closes = candles.map(candle => candle.close);
    
    // Calculate ATR using ta.js
    const atr = ta.atr(highs, lows, closes, period);
    
    // Calculate basic upper and lower bands
    const upperBand = (highs[highs.length-1] + lows[lows.length-1]) / 2 + (multiplier * atr);
    const lowerBand = (highs[highs.length-1] + lows[lows.length-1]) / 2 - (multiplier * atr);
    
    // Determine trend direction based on previous close and current bands
    const previousClose = closes[closes.length-2];
    const currentClose = closes[closes.length-1];
    
    let trend;
    if (currentClose > upperBand) {
      trend = "up";
    } else if (currentClose < lowerBand) {
      trend = "down";
    } else {
      // Maintain previous trend
      if (previousClose > upperBand) {
        trend = "up";
      } else if (previousClose < lowerBand) {
        trend = "down";
      } else {
        trend = "neutral";
      }
    }
    
    return {
      trend,
      atr,
      upperBand,
      lowerBand
    };
  } catch (error) {
    console.error("❌ Error calculating Supertrend:", error.message);
    return null;
  }
}

/**
 * Calculate TrendLine Indicator based on price action and Bollinger Bands
 * @param {Array} candles - Array of OHLC candles
 * @returns {Object} TrendLine indicator values
 */
function calculateTrendLine(candles) {
  if (candles.length < config.TLBB_FRACTALS_PERIOD) {
    return null;
  }
  
  try {
    const prices = candles.map(candle => candle.close);
    
    // Calculate Bollinger Bands
    const bb = calculateBollingerBands(candles);
    if (!bb) return null;
    
    // Find recent swing points (simple implementation)
    const swingHigh = Math.max(...prices.slice(-config.TLBB_FRACTALS_PERIOD));
    const swingLow = Math.min(...prices.slice(-config.TLBB_FRACTALS_PERIOD));
    
    // Determine trend based on price position relative to BB
    const currentPrice = prices[prices.length-1];
    let trend;
    
    if (currentPrice > bb.upper) {
      trend = "strongly_bullish";
    } else if (currentPrice < bb.lower) {
      trend = "strongly_bearish";
    } else if (currentPrice > bb.middle) {
      trend = "moderately_bullish";
    } else {
      trend = "moderately_bearish";
    }
    
    return {
      trend,
      swingHigh,
      swingLow,
      bb
    };
  } catch (error) {
    console.error("❌ Error calculating TrendLine:", error.message);
    return null;
  }
}

/**
 * Handle market data updates and generate signals
 * @param {Object} marketData - Market data object
 */
function handleMarketData(marketData) {
  // Add price to history
  priceHistory.push(marketData);
  
  // Memory management - limit history size
  if (priceHistory.length > config.MAX_PRICE_HISTORY) {
    priceHistory = priceHistory.slice(-config.MAX_PRICE_HISTORY);
  }
}

/**
 * Process candle data and generate signals
 * @param {Object} candle - Candle data object
 */
function processCandle(candle) {
  try {
    // Prevent duplicate candle processing
    if (candle.timestamp <= lastCandleTimestamp) {
      return;
    }
    
    // Update last processed candle timestamp
    lastCandleTimestamp = candle.timestamp;
    
    // Add candle to history
    ohlcHistory.push(candle);
    
    // Memory management - limit history size
    if (ohlcHistory.length > config.MAX_OHLC_HISTORY) {
      ohlcHistory = ohlcHistory.slice(-config.MAX_OHLC_HISTORY);
    }
    
    // Only generate signals if we have enough data
    if (ohlcHistory.length < Math.max(
      config.EMA_LONG_PERIOD,
      config.BB_LENGTH,
      config.ST_PERIOD,
      config.TLBB_FRACTALS_PERIOD
    )) {
      console.log(`📊 Building price history... (${ohlcHistory.length} candles collected)`);
      return;
    }
    
    // Generate trading signal based on selected strategy
    generateSignal();
  } catch (error) {
    console.error("❌ Error processing candle:", error.message);
  }
}

/**
 * Generate trading signal based on strategy
 */
function generateSignal() {
  try {
    // Get latest price
    const currentPrice = ohlcHistory[ohlcHistory.length-1].close;
    
    // Select strategy
    switch (config.STRATEGY) {
      case "EMA":
        generateEMASignal(currentPrice);
        break;
      case "COMBINED":
        generateCombinedSignal(currentPrice);
        break;
      default:
        console.warn(`⚠️ Unknown strategy: ${config.STRATEGY}`);
    }
  } catch (error) {
    console.error("❌ Error generating signal:", error.message);
  }
}

/**
 * Generate signal based on EMA crossover strategy
 * @param {number} currentPrice - Current price
 */
function generateEMASignal(currentPrice) {
  try {
    const prices = ohlcHistory.map(candle => candle.close);
    const emaShort = ta.ema(prices, config.EMA_SHORT_PERIOD);
    const emaLong = ta.ema(prices, config.EMA_LONG_PERIOD);
    
    // Check for crossover
    const previousEmaShort = emaShort[emaShort.length-2];
    const previousEmaLong = emaLong[emaLong.length-2];
    const currentEmaShort = emaShort[emaShort.length-1];
    const currentEmaLong = emaLong[emaLong.length-1];
    
    // Generate signal on crossover
    if (previousEmaShort < previousEmaLong && currentEmaShort > currentEmaLong) {
      // Buy signal - short EMA crosses above long EMA
      emitSignal("BUY", currentPrice);
      
    } else if (previousEmaShort > previousEmaLong && currentEmaShort < currentEmaLong) {
      // Sell signal - short EMA crosses below long EMA
      emitSignal("SELL", currentPrice);
    }
  } catch (error) {
    console.error("❌ Error generating EMA signal:", error.message);
  }
}

/**
 * Generate signal based on combined strategy (Trend Line & Supertrend)
 * @param {number} currentPrice - Current price
 */
function generateCombinedSignal(currentPrice) {
  try {
    // Calculate TrendLine BB
    const tl = calculateTrendLine(ohlcHistory);
    
    // Calculate Supertrend
    const st = calculateSupertrend(ohlcHistory);
    
    if (!tl || !st) {
      return;
    }
    
    // Check for trade conditions
    if (tl.trend.includes("bullish") && st.trend === "up") {
      if (!inPosition || positionType === "short") {
        // Buy signal when both indicators are bullish
        inPosition = true;
        positionType = "long";
        emitSignal("BUY", currentPrice);
      }
    } else if (tl.trend.includes("bearish") && st.trend === "down") {
      if (!inPosition || positionType === "long") {
        // Sell signal when both indicators are bearish
        inPosition = true;
        positionType = "short";
        emitSignal("SELL", currentPrice);
      }
    } else if (
      (tl.trend.includes("bearish") && positionType === "long") ||
      (tl.trend.includes("bullish") && positionType === "short")
    ) {
      // Exit signal when trend changes against our position
      inPosition = false;
      const signal = positionType === "long" ? "SELL" : "BUY";
      positionType = null;
      emitSignal(signal, currentPrice);
    }
  } catch (error) {
    console.error("❌ Error generating Combined signal:", error.message);
  }
}

/**
 * Emit trading signal
 * @param {string} action - Signal action (BUY/SELL)
 * @param {number} price - Current price
 */
function emitSignal(action, price) {
  const signal = {
    action,
    price,
    timestamp: Date.now(),
    strategy: config.STRATEGY,
  };
  
  console.log("🚀 Generated Signal:", signal);
  
  // Emit the signal
  marketDataEmitter.emit("signal", signal);
  signalEmitter.emit("signal", signal);
}

// Initialize by validating configuration
validateConfig();

// Subscribe to market data events
marketDataEmitter.on("marketData", handleMarketData);
marketDataEmitter.on("candle", processCandle);

// Export functions for testing
module.exports = {
  processCandle,
  calculateBollingerBands,
  calculateSupertrend,
  calculateTrendLine,
  signalEmitter
};
