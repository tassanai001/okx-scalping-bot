require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const config = require("./config");

const apiKey = process.env.OKX_API_KEY;
const secretKey = process.env.OKX_SECRET_KEY;
const passphrase = process.env.OKX_PASSPHRASE;

// Validate required environment variables
if (!apiKey || !secretKey || !passphrase) {
  console.error("🚨 ERROR: Missing required API credentials in .env file!");
  console.error("Please ensure OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE are set.");
  process.exit(1);
}

/**
 * Generate OKX API signature
 * @param {string} timestamp - ISO timestamp
 * @param {string} method - HTTP method (GET/POST)
 * @param {string} requestPath - API endpoint path
 * @param {object|null} body - Request body for POST requests
 * @returns {string} Base64 encoded HMAC signature
 */
function generateSignature(timestamp, method, requestPath, body = null) {
  const message = timestamp + method + requestPath + (body ? JSON.stringify(body) : '');
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

/**
 * Create headers for OKX API requests
 * @param {string} method - HTTP method (GET/POST)
 * @param {string} requestPath - API endpoint path
 * @param {object|null} body - Request body for POST requests
 * @returns {object} Headers object
 */
function createHeaders(method, requestPath, body = null) {
  const timestamp = new Date().toISOString();
  const signature = generateSignature(timestamp, method, requestPath, body);

  const headers = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json"
  };

  // Add simulated trading header if enabled
  if (config.USE_SIMULATED_TRADING) {
    headers["x-simulated-trading"] = "1";
    console.log("🧪 Using simulated trading mode (demo)");
  }

  return headers;
}

/**
 * Get account balance and calculate trade size as percentage of assets
 * @param {string} currency - Currency to check balance for (e.g., "USDT")
 * @param {number} percentage - Percentage of balance to use for trading
 * @returns {Promise<string>} Trade size
 */
async function getTradeSize(currency = "USDT", percentage = 10) {
  try {
    const balancePath = "/api/v5/account/balance";
    const queryParams = currency ? `?ccy=${currency}` : '';
    const fullPath = balancePath + queryParams;
    const headers = createHeaders("GET", fullPath, null);

    const response = await axios.get(
      `${config.OKX_API_URL}${fullPath}`,
      { headers }
    );

    if (!response.data || !response.data.data || !response.data.data.length) {
      console.error("🚨 Failed to fetch account balance");
      return config.TRADE_SIZE; // Fall back to config value
    }

    // Find the currency in the balance data
    let balance = 0;
    for (const account of response.data.data) {
      for (const detail of account.details) {
        if (detail.ccy === currency) {
          balance = parseFloat(detail.availEq || detail.availBal);
          break;
        }
      }
    }

    if (balance <= 0) {
      console.error(`🚨 No available balance found for ${currency}`);
      return config.TRADE_SIZE; // Fall back to config value
    }

    // Calculate trade size as percentage of balance
    const tradeSize = (balance * (percentage / 100)).toFixed(6);
    console.log(`💰 Account Balance: ${balance} ${currency}`);
    console.log(`📊 Using ${percentage}% for trade: ${tradeSize} ${currency}`);

    // For BTC-USDT-SWAP, we need to convert USDT value to BTC quantity
    // This requires getting the current BTC price
    const tickerPath = `/api/v5/market/ticker?instId=${config.TRADING_PAIR}`;
    const marketData = await axios.get(`${config.OKX_API_URL}${tickerPath}`);

    if (!marketData.data || !marketData.data.data || !marketData.data.data.length) {
      console.error("🚨 Failed to fetch market price");
      return tradeSize;
    }

    const btcPrice = parseFloat(marketData.data.data[0].last);
    // Calculate BTC quantity based on USDT value
    const btcQuantity = (tradeSize / btcPrice).toFixed(6);
    console.log(`🔄 Converting to BTC: ${btcQuantity} BTC at price $${btcPrice}`);

    return btcQuantity;
  } catch (error) {
    console.error("🚨 Error calculating trade size:", error.response && error.response.data ? error.response.data : error.message);
    return config.TRADE_SIZE; // Fall back to config value
  }
}

/**
 * Set leverage for trading
 * @param {string} symbol - Trading pair symbol
 * @param {string} leverage - Leverage value
 * @returns {Promise<boolean>} Success status
 */
async function setLeverage(symbol = config.TRADING_PAIR, leverage = config.LEVERAGE) {
  try {
    console.log(`📈 Setting ${leverage}x leverage for ${symbol}...`);
    
    // Update to correct API endpoint (account not trade)
    const leveragePath = "/api/v5/account/set-leverage";
    
    // For SWAP instruments like BTC-USDT-SWAP, follow the correct format based on trade mode
    const leverageBody = {
      instId: symbol,
      lever: leverage,
      mgnMode: config.TRADE_MODE
    };
    
    // Add posSide parameter if using long/short position mode
    if (config.POSITION_MODE === 'long_short_mode') {
      leverageBody.posSide = "long"; // Set leverage for long positions
      // Note: You would need to make a separate call for short positions
    }

    const headers = createHeaders("POST", leveragePath, leverageBody);

    const response = await axios.post(
      `${config.OKX_API_URL}${leveragePath}`,
      leverageBody,
      { headers }
    );

    if (response.data && response.data.code === "0") {
      console.log(`📈 Leverage set to ${leverage}x for ${symbol} in ${config.TRADE_MODE} mode`);
      return true;
    } else {
      console.error("🚨 Failed to set leverage:", response.data);
      return false;
    }
  } catch (error) {
    console.error("🚨 Error setting leverage:", error.response && error.response.data ? error.response.data : error.message);
    return false;
  }
}

/**
 * Place a futures market order with SL & TP
 * @param {string} symbol - Trading pair symbol
 * @param {string} side - Order side (BUY/SELL)
 * @param {string} size - Order size
 * @returns {Promise<object>} Order details
 */
async function placeOrder(symbol = config.TRADING_PAIR, side, size = null) {
  try {
    console.log(`🔄 Preparing ${side} order for ${symbol}...`);

    // Dynamically calculate trade size if not provided
    if (!size) {
      size = await getTradeSize(config.USE_PERCENTAGE_OF_BALANCE_CURRENCY, config.USE_PERCENTAGE_OF_BALANCE);
    }

    console.log(`💱 Order size: ${size} for ${symbol}`);

    // Ensure leverage is set correctly
    await setLeverage(symbol, config.LEVERAGE);

    // Get latest price
    const tickerPath = `/api/v5/market/ticker?instId=${symbol}`;
    const marketData = await axios.get(`${config.OKX_API_URL}${tickerPath}`);

    if (!marketData.data || !marketData.data.data || !marketData.data.data.length) {
      throw new Error("Failed to fetch market data");
    }

    const lastPrice = parseFloat(marketData.data.data[0].last);
    console.log(`📊 Current price: $${lastPrice}`);

    // Define position side
    const posSide = side.toLowerCase() === "buy" ? "long" : "short";

    // Calculate SL & TP levels based on configuration
    const slPercent = config.STOP_LOSS_PERCENTAGE / 100;
    const tpPercent = config.TAKE_PROFIT_PERCENTAGE / 100;

    // For BUY/LONG: SL is below entry, TP is above entry
    // For SELL/SHORT: SL is above entry, TP is below entry
    const stopLoss = side === "BUY"
      ? (lastPrice * (1 - slPercent)).toFixed(2)
      : (lastPrice * (1 + slPercent)).toFixed(2);

    const takeProfit = side === "BUY"
      ? (lastPrice * (1 + tpPercent)).toFixed(2)
      : (lastPrice * (1 - tpPercent)).toFixed(2);

    console.log(`🛑 Stop Loss: ${stopLoss} (${config.STOP_LOSS_PERCENTAGE}% from entry)`);
    console.log(`🎯 Take Profit: ${takeProfit} (${config.TAKE_PROFIT_PERCENTAGE}% from entry)`);

    // API paths
    const orderPath = "/api/v5/trade/order";

    // Place Futures Market Order
    const orderBody = {
      instId: symbol,
      tdMode: config.TRADE_MODE,  // "cross" or "isolated"
      side: side.toLowerCase(),
      posSide: posSide,           // "long" or "short"
      ordType: "market",
      sz: size,
      lever: config.LEVERAGE
    };

    const orderHeaders = createHeaders("POST", orderPath, orderBody);

    const order = await axios.post(
      `${config.OKX_API_URL}${orderPath}`,
      orderBody,
      { headers: orderHeaders }
    );

    if (!order.data || !order.data.data || !order.data.data.length) {
      throw new Error("Order placement failed: Invalid response");
    }

    console.log(`✅ Futures Market Order Placed: ${side} ${size} of ${symbol} at $${lastPrice}`);

    // Get Order ID
    const orderId = order.data.data[0].ordId;
    console.log(`🔑 Order ID: ${orderId}`);

    // Place Stop-Loss Order
    const slOrderBody = {
      instId: symbol,
      tdMode: config.TRADE_MODE,
      side: side === "BUY" ? "sell" : "buy",
      posSide: posSide,
      ordType: "conditional",
      sz: size,
      tpTriggerPx: "",
      tpOrdPx: "",
      slTriggerPx: stopLoss,
      slOrdPx: "-1",   // Market price
      triggerPxType: "last",
    };

    const slOrderHeaders = createHeaders("POST", orderPath, slOrderBody);

    const slOrder = await axios.post(
      `${config.OKX_API_URL}${orderPath}`,
      slOrderBody,
      { headers: slOrderHeaders }
    );

    console.log(`🛑 Stop-Loss Set at $${stopLoss}`);

    // Place Take-Profit Order
    const tpOrderBody = {
      instId: symbol,
      tdMode: config.TRADE_MODE,
      side: side === "BUY" ? "sell" : "buy",
      posSide: posSide,
      ordType: "conditional",
      sz: size,
      tpTriggerPx: takeProfit,
      tpOrdPx: "-1",  // Market price
      slTriggerPx: "",
      slOrdPx: "",
      triggerPxType: "last",
    };

    const tpOrderHeaders = createHeaders("POST", orderPath, tpOrderBody);

    const tpOrder = await axios.post(
      `${config.OKX_API_URL}${orderPath}`,
      tpOrderBody,
      { headers: tpOrderHeaders }
    );

    console.log(`🎯 Take-Profit Set at $${takeProfit}`);

    return {
      orderId,
      symbol,
      side,
      size,
      price: lastPrice,
      stopLoss,
      takeProfit,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error("🚨 Order Error:", error.response && error.response.data ? error.response.data : error.message);
    throw error; // Re-throw so calling code can handle it
  }
}

module.exports = { placeOrder, setLeverage, getTradeSize };
