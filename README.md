# OKX Scalping Bot for Futures Trading

A Node.js trading bot for OKX exchange, designed for BTC-USDT futures trading with support for technical analysis strategies.

## Features

- Trade BTC-USDT futures on OKX
- Leverage and cross-margin support
- Dynamic position sizing (percentage of account balance)
- Configurable stop-loss and take-profit levels
- Combined strategy using Bollinger Bands, TrendLine, and Supertrend indicators
- Simulated trading mode for safe testing
- Automatic stop-loss and take-profit orders
- WebSocket connection for real-time market data

## Configuration

The bot is highly configurable through the `config.js` file:

```javascript
module.exports = {
  // Trading settings
  TRADING_PAIR: "BTC-USDT-SWAP",  // Using perpetual futures contract
  TRADE_SIZE: "0.001",            // Default trade size if dynamic sizing fails
  
  // Dynamic position sizing
  USE_PERCENTAGE_OF_BALANCE: 10,  // Use 10% of available balance for each trade
  
  // Risk management
  STOP_LOSS_PERCENTAGE: 1.5,      // Stop loss percentage from entry price
  TAKE_PROFIT_PERCENTAGE: 3,      // Take profit percentage from entry price
  
  // Futures specific settings
  TRADE_MODE: "cross",            // Options: "cross" or "isolated"
  LEVERAGE: "3",                  // Leverage multiplier (3x)
  
  // Simulated trading (Demo mode)
  USE_SIMULATED_TRADING: true,    // Set to true for paper trading
  
  // Strategy settings
  STRATEGY: "COMBINED",           // Options: "EMA", "COMBINED"
  TIMEFRAME: "4h",                // Timeframe for candles
}
```

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with your OKX API credentials:
   ```
   OKX_API_KEY=your_api_key_here
   OKX_SECRET_KEY=your_secret_key_here
   OKX_PASSPHRASE=your_passphrase_here
   ```
4. Configure your strategy in `config.js`
5. Start the bot:
   ```
   npm start
   ```

## Simulated Trading Mode

The bot supports simulated trading (paper trading) for risk-free testing:

1. Create Demo API keys from your OKX account
2. Set `USE_SIMULATED_TRADING: true` in `config.js`
3. Run the bot as normal

## Risk Management

The bot includes configurable risk management settings:

- **Stop Loss**: Set as a percentage from entry price (default: 1.5%)
- **Take Profit**: Set as a percentage from entry price (default: 3%)
- **Position Sizing**: Uses a percentage of your available balance

These values can be adjusted in the `config.js` file to match your risk tolerance and trading strategy.

## Important Notes

- Always start with simulated trading to test your strategy
- Be aware of the risks involved with leveraged trading
- Monitor the bot's performance and adjust parameters as needed
- Trading fees are not factored into the profit calculations

## License

MIT
