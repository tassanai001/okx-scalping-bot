const { marketDataEmitter } = require("./okx-client");
const { EMA, SMA, ATR, SD } = require("ta.js");
const EventEmitter = require("events");

// Create a trading signal emitter
class TradingSignalEmitter extends EventEmitter {}
const tradingSignalEmitter = new TradingSignalEmitter();

// Strategy configuration
const CONFIG = {
  strategy: "COMBINED", // Options: "EMA", "COMBINED"
  timeframe: "30m",     // 30-minute candles
  
  // EMA Strategy Config
  emaShortPeriod: 9,
  emaLongPeriod: 21,
  
  // Combined Strategy Config
  // Trend Line & BB Settings
  tlbbFractalsPeriod: 15,
  bbLength: 20,
  bbDeviation: 2.0,
  
  // Supertrend Settings
  stPeriod: 10,
  stMultiplier: 3.0
};

// Convert timeframe to milliseconds for comparison
const TIMEFRAME_MS = (() => {
  const [value, unit] = CONFIG.timeframe.match(/(\d+)([a-z]+)/i).slice(1);
  const multipliers = {
    m: 60 * 1000,        // minutes
    h: 60 * 60 * 1000,   // hours
    d: 24 * 60 * 60 * 1000 // days
  };
  return parseInt(value) * multipliers[unit.toLowerCase()];
})();

// Price history and OHLC data
let priceHistory = [];
let ohlcHistory = [];
let lastSignal = "HOLD";

// Current candle being built
let currentCandle = null;

// Function to calculate median of array
const median = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  
  return sorted[middle];
};

// Function to calculate Bollinger Bands
const calculateBollingerBands = (prices, length, deviation) => {
  const basis = SMA.calculate(length, prices);
  const stdDev = SD.calculate(length, prices);
  const upper = basis + (deviation * stdDev);
  const lower = basis - (deviation * stdDev);
  
  return { upper, basis, lower };
};

// Function to calculate Supertrend
const calculateSupertrend = (ohlcData, period, multiplier) => {
  // Need at least period + 1 candles to calculate
  if (ohlcData.length < period + 1) return { trend: 1, up: 0, down: 0 };
  
  // Calculate ATR
  const trValues = ohlcData.map(candle => {
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - candle.close),
      Math.abs(candle.low - candle.close)
    );
  });
  
  const atr = SMA.calculate(period, trValues);
  
  // Get last candle
  const lastCandle = ohlcData[ohlcData.length - 1];
  const prevCandle = ohlcData[ohlcData.length - 2];
  
  // Calculate basic bands
  const hl2 = (lastCandle.high + lastCandle.low) / 2;
  const hl2Prev = (prevCandle.high + prevCandle.low) / 2;
  
  let up = hl2 - (multiplier * atr);
  let down = hl2 + (multiplier * atr);
  
  // Need to determine previous trend and bands for proper calculation
  let prevTrend = 1; // Default to uptrend
  let prevUp = hl2Prev - (multiplier * atr);
  let prevDown = hl2Prev + (multiplier * atr);
  
  // Adjust bands based on previous values (simplified calculation)
  up = prevCandle.close > prevUp ? Math.max(up, prevUp) : up;
  down = prevCandle.close < prevDown ? Math.min(down, prevDown) : down;
  
  // Determine current trend
  let trend;
  if (prevCandle.close > prevDown) {
    trend = 1; // Uptrend
  } else if (prevCandle.close < prevUp) {
    trend = -1; // Downtrend
  } else {
    trend = prevTrend; // Continue previous trend
  }
  
  return { trend, up, down };
};

// Function to calculate TrendLine signals (simplified version of Pine Script logic)
const calculateTrendLineSignal = (ohlcData, price, prevPrice, fractalsPeriod) => {
  if (ohlcData.length < fractalsPeriod) return { buy: false, sell: false };
  
  // Find local highs and lows for fractals (simplified approach)
  const mid = Math.floor(fractalsPeriod / 2);
  
  // Get recent price data
  const last = ohlcData.slice(-fractalsPeriod);
  
  // Check if current bar is a fractal high/low point
  let isHighFractal = true;
  let isLowFractal = true;
  
  for (let i = 0; i < fractalsPeriod; i++) {
    if (i === mid) continue; // Skip the middle point
    if (last[mid].high <= last[i].high) isHighFractal = false;
    if (last[mid].low >= last[i].low) isLowFractal = false;
  }
  
  // Get the latest calculated Bollinger Bands
  const bb = calculateBollingerBands(
    ohlcData.map(candle => candle.close),
    CONFIG.bbLength,
    CONFIG.bbDeviation
  );
  
  // Simplified trendline signals
  // In a real implementation, this would track and maintain actual trendlines
  // For this simplified version, we just use fractals and BB for signals
  
  const buy = isLowFractal && prevPrice < last[mid].low && price > last[mid].low && price > bb.lower;
  const sell = isHighFractal && prevPrice > last[mid].high && price < last[mid].high && price < bb.upper;
  
  return { buy, sell };
};

// Function to determine if a candle is complete based on timeframe
const isCandleComplete = (candle, currentTime) => {
  const candleEndTime = candle.openTime + TIMEFRAME_MS;
  return currentTime >= candleEndTime;
};

// Process strategy signals based on completed candles
const processStrategy = (completedCandle) => {
  // Add to price history (for EMA calculation)
  priceHistory.push(completedCandle.close);
  if (priceHistory.length > Math.max(CONFIG.emaLongPeriod, CONFIG.bbLength) + 1) {
    priceHistory.shift();
  }
  
  // Add to OHLC history
  ohlcHistory.push(completedCandle);
  if (ohlcHistory.length > Math.max(CONFIG.stPeriod, CONFIG.tlbbFractalsPeriod) + 1) {
    ohlcHistory.shift();
  }
  
  let signal = "HOLD";
  
  // Determine which strategy to use
  if (CONFIG.strategy === "EMA") {
    // Original EMA Strategy
    if (priceHistory.length < CONFIG.emaLongPeriod) {
      console.log(`⏳ Collecting price data: ${priceHistory.length}/${CONFIG.emaLongPeriod}`);
      return; // Wait until we have enough data
    }
    
    const emaShort = EMA.calculate(CONFIG.emaShortPeriod, priceHistory);
    const emaLong = EMA.calculate(CONFIG.emaLongPeriod, priceHistory);
    
    if (emaShort > emaLong) {
      signal = "BUY";
    } else if (emaShort < emaLong) {
      signal = "SELL";
    }
    
  } else if (CONFIG.strategy === "COMBINED") {
    // Combined TrendLine BB & Supertrend Strategy
    if (ohlcHistory.length < Math.max(CONFIG.stPeriod, CONFIG.tlbbFractalsPeriod) + 1) {
      console.log(`⏳ Collecting OHLC data: ${ohlcHistory.length}/${Math.max(CONFIG.stPeriod, CONFIG.tlbbFractalsPeriod) + 1}`);
      return; // Wait until we have enough data
    }
    
    // Calculate Supertrend
    const st = calculateSupertrend(ohlcHistory, CONFIG.stPeriod, CONFIG.stMultiplier);
    
    // Determine Supertrend signals
    const stBuySignal = st.trend === 1 && (ohlcHistory.length > 1 ? 
                        calculateSupertrend(ohlcHistory.slice(0, -1), CONFIG.stPeriod, CONFIG.stMultiplier).trend === -1 : false);
    const stSellSignal = st.trend === -1 && (ohlcHistory.length > 1 ? 
                         calculateSupertrend(ohlcHistory.slice(0, -1), CONFIG.stPeriod, CONFIG.stMultiplier).trend === 1 : false);
    
    // Calculate Trend Line & Bollinger Bands signals
    const prevPrice = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2] : completedCandle.close;
    const tlbb = calculateTrendLineSignal(ohlcHistory, completedCandle.close, prevPrice, CONFIG.tlbbFractalsPeriod);
    
    // Combined signals
    const combinedBuySignal = tlbb.buy && stBuySignal;
    const combinedSellSignal = tlbb.sell && stSellSignal;
    
    if (combinedBuySignal) {
      signal = "BUY";
    } else if (combinedSellSignal) {
      signal = "SELL";
    }
    
    // Log indicator values for debugging
    console.log(`🔍 Indicators - ST: ${st.trend > 0 ? "UPTREND" : "DOWNTREND"}, TLBB: ${tlbb.buy ? "BUY" : tlbb.sell ? "SELL" : "NEUTRAL"}`);
  }
  
  // Only log and emit when signal changes
  if (signal !== lastSignal) {
    console.log(`📢 Signal: ${signal} (Strategy: ${CONFIG.strategy})`);
    
    // Emit the trading signal with relevant data
    tradingSignalEmitter.emit("signal", {
      type: signal,
      price: completedCandle.close,
      timestamp: Date.now(),
      strategy: CONFIG.strategy,
      timeframe: CONFIG.timeframe,
      candle: completedCandle
    });
    
    lastSignal = signal;
  }
};

// Initialize the first candle when we start receiving market data
let isFirstData = true;

marketDataEmitter.on("marketData", (marketData) => {
  const currentPrice = parseFloat(marketData.price);
  const currentTime = Date.now();
  
  console.log(`📈 New Price Update: ${currentPrice} @ ${new Date(currentTime).toLocaleTimeString()}`);
  
  // Initialize the first candle
  if (isFirstData) {
    // Round down to nearest timeframe boundary
    const timeframeBoundary = Math.floor(currentTime / TIMEFRAME_MS) * TIMEFRAME_MS;
    
    currentCandle = {
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      openTime: timeframeBoundary,
      volume: 0
    };
    
    isFirstData = false;
    console.log(`🕒 Started new ${CONFIG.timeframe} candle at ${new Date(timeframeBoundary).toLocaleTimeString()}`);
    return;
  }
  
  // Check if we need to close the current candle and start a new one
  if (isCandleComplete(currentCandle, currentTime)) {
    console.log(`🕒 Completed ${CONFIG.timeframe} candle: O:${currentCandle.open} H:${currentCandle.high} L:${currentCandle.low} C:${currentCandle.close}`);
    
    // Process strategy with the completed candle
    processStrategy(currentCandle);
    
    // Start a new candle
    const newCandleOpenTime = currentCandle.openTime + TIMEFRAME_MS;
    currentCandle = {
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      openTime: newCandleOpenTime,
      volume: 0
    };
    
    console.log(`🕒 Started new ${CONFIG.timeframe} candle at ${new Date(newCandleOpenTime).toLocaleTimeString()}`);
  } else {
    // Update the current candle
    currentCandle.high = Math.max(currentCandle.high, currentPrice);
    currentCandle.low = Math.min(currentCandle.low, currentPrice);
    currentCandle.close = currentPrice;
    currentCandle.volume += 1; // This is just a count of updates, not actual volume
  }
});

module.exports = { tradingSignalEmitter };
