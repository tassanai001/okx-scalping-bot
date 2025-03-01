/**
 * Central configuration for OKX Scalping Bot
 */
module.exports = {
  // Trading settings
  TRADING_PAIR: "BTC-USDT-SWAP",  // Using perpetual futures contract
  TRADE_SIZE: "0.001",
  TRADE_COOLDOWN: 60000, // 1 minute cooldown between trades
  
  // Futures specific settings
  TRADE_MODE: "cross",    // Options: "cross" or "isolated"
  LEVERAGE: "5",          // Leverage multiplier (e.g., 5x)
  
  // Strategy settings
  STRATEGY: "COMBINED", // Options: "EMA", "COMBINED"
  TIMEFRAME: "30m",     // 30-minute candles
  
  // EMA Strategy Config
  EMA_SHORT_PERIOD: 9,
  EMA_LONG_PERIOD: 21,
  
  // Combined Strategy Config
  // Trend Line & BB Settings
  TLBB_FRACTALS_PERIOD: 15,
  BB_LENGTH: 20,
  BB_DEVIATION: 2.0,
  
  // Supertrend Settings
  ST_PERIOD: 10,
  ST_MULTIPLIER: 3.0,

  // WebSocket settings
  OKX_WS_URL: "wss://ws.okx.com:8443/ws/v5/public",
  MAX_RECONNECT_ATTEMPTS: 10,
  INITIAL_RECONNECT_DELAY: 1000,
  RECONNECT_MULTIPLIER: 1.5,
  TIME_SYNC_THRESHOLD: 5000, // 5 seconds threshold for time sync warnings
  
  // API settings
  OKX_API_URL: "https://www.okx.com/api/v5/",
  
  // Memory Management
  MAX_PRICE_HISTORY: 1000,
  MAX_OHLC_HISTORY: 500
}
