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
  
  return {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json"
  };
}

/**
 * Set leverage for the trading pair
 * @param {string} symbol - Trading pair symbol
 * @param {string} leverage - Leverage value
 * @returns {Promise<boolean>} Success status
 */
async function setLeverage(symbol = config.TRADING_PAIR, leverage = config.LEVERAGE) {
  try {
    const leveragePath = "/trade/set-leverage";
    const leverageBody = {
      instId: symbol,
      lever: leverage,
      mgnMode: config.TRADE_MODE
    };
    
    const headers = createHeaders("POST", leveragePath, leverageBody);
    
    const response = await axios.post(
      `${config.OKX_API_URL}${leveragePath.substring(1)}`,
      leverageBody,
      { headers }
    );
    
    if (response.data && response.data.code === "0") {
      console.log(`📈 Leverage set to ${leverage}x for ${symbol} in ${config.TRADE_MODE} mode`);
      return true;
    } else {
      console.error(`🚨 Failed to set leverage: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.error("🚨 Leverage Error:", error.response && error.response.data ? error.response.data : error.message);
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
async function placeOrder(symbol = config.TRADING_PAIR, side, size = config.TRADE_SIZE) {
  try {
    console.log(`🔄 Preparing ${side} order for ${size} ${symbol}...`);
    
    // Ensure leverage is set correctly
    await setLeverage(symbol, config.LEVERAGE);
    
    // Get latest price
    const tickerPath = `/market/ticker?instId=${symbol}`;
    const marketData = await axios.get(`${config.OKX_API_URL}${tickerPath.substring(1)}`);
    
    if (!marketData.data || !marketData.data.data || !marketData.data.data.length) {
      throw new Error("Failed to fetch market data");
    }
    
    const lastPrice = parseFloat(marketData.data.data[0].last);
    console.log(`📊 Current price: $${lastPrice}`);

    // Define position side
    const posSide = side.toLowerCase() === "buy" ? "long" : "short";
    
    // Define SL & TP levels (0.5% SL, 1% TP)
    const stopLoss = side === "BUY" ? (lastPrice * 0.995).toFixed(2) : (lastPrice * 1.005).toFixed(2);
    const takeProfit = side === "BUY" ? (lastPrice * 1.01).toFixed(2) : (lastPrice * 0.99).toFixed(2);

    // API paths
    const orderPath = "/trade/order";
    
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
      `${config.OKX_API_URL}${orderPath.substring(1)}`, 
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
      `${config.OKX_API_URL}${orderPath.substring(1)}`,
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
      `${config.OKX_API_URL}${orderPath.substring(1)}`,
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

module.exports = { placeOrder, setLeverage };
