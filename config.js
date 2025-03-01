/**
 * Central configuration for OKX Scalping Bot
 */
module.exports = {
  // Trading settings
  TRADING_PAIR: "BTC-USDT-SWAP",  // Using perpetual futures contract
  TRADE_SIZE: "0.001",            // Default trade size if dynamic sizing fails
  TRADE_COOLDOWN: 60000,          // 1 minute cooldown between trades
  
  // Dynamic position sizing
  USE_PERCENTAGE_OF_BALANCE: 10,       // Use 10% of available balance for each trade
  USE_PERCENTAGE_OF_BALANCE_CURRENCY: "USDT", // Currency to check balance
  
  // Risk management
  STOP_LOSS_PERCENTAGE: 1.5,      // Stop loss percentage from entry price
  TAKE_PROFIT_PERCENTAGE: 3,      // Take profit percentage from entry price
  
  // Futures specific settings
  TRADE_MODE: "cross",    // Options: "cross" or "isolated"
  LEVERAGE: "3",          // Leverage multiplier (3x)
  
  // Simulated trading (Demo mode)
  USE_SIMULATED_TRADING: true,    // Set to true to use simulated trading (demo)
  
  // Strategy settings
  STRATEGY: "COMBINED",   // Options: "EMA", "COMBINED"
  TIMEFRAME: "4h",        // 4-hour candles (optimized timeframe)
  
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
  OKX_WS_URL_SIMULATED: "wss://wspap.okx.com:8443/ws/v5/public",  // Simulated WebSocket URL
  MAX_RECONNECT_ATTEMPTS: 10,
  INITIAL_RECONNECT_DELAY: 1000,
  RECONNECT_MULTIPLIER: 1.5,
  TIME_SYNC_THRESHOLD: 5000, // 5 seconds threshold for time sync warnings
  
  // API settings
  OKX_API_URL: "https://www.okx.com",
  
  // Memory Management
  MAX_PRICE_HISTORY: 1000,
  MAX_OHLC_HISTORY: 500
}
