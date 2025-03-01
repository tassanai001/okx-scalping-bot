const WebSocket = require("ws");
const EventEmitter = require("events");
const config = require("./config");

let ws;
let reconnectAttempts = 0;

class MarketDataEmitter extends EventEmitter {}
const marketDataEmitter = new MarketDataEmitter();

function connectWebSocket() {
  ws = new WebSocket(config.OKX_WS_URL);
  
  ws.on("open", function open() {
    console.log("✅ Connected to OKX WebSocket");
    reconnectAttempts = 0; // Reset reconnect counter
    
    // Subscribe to ticker updates for futures
    const subscribeMsg = JSON.stringify({
      op: "subscribe",
      args: [{ channel: "tickers", instId: config.TRADING_PAIR }]
    });
    
    // Subscribe to candlestick data
    const candleSubscribeMsg = JSON.stringify({
      op: "subscribe",
      args: [{ 
        channel: "candle" + config.TIMEFRAME, 
        instId: config.TRADING_PAIR 
      }]
    });
    
    ws.send(subscribeMsg);
    ws.send(candleSubscribeMsg);
    
    console.log(`📝 Subscribed to ${config.TRADING_PAIR} futures market data`);
    console.log(`📊 Timeframe: ${config.TIMEFRAME}`);
  });
  
  ws.on("message", function incoming(data) {
    try {
      const json = JSON.parse(data);
      
      if (json.event === "subscribe") {
        console.log(`✅ Subscribed to channel: ${json.arg.channel}`);
      } else if (json.data) {
        // Handle ticker updates
        if (json.arg && json.arg.channel === "tickers") {
          const serverTime = parseInt(json.data[0].ts);
          const localTime = Date.now();
          
          // Check time synchronization
          if (Math.abs(serverTime - localTime) > config.TIME_SYNC_THRESHOLD) {
            console.warn(`⚠️ Time synchronization issue detected! Server-client time difference: ${Math.abs(serverTime - localTime)}ms`);
          }
          
          const marketData = {
            price: parseFloat(json.data[0].last),
            volume: parseFloat(json.data[0].vol24h),
            timestamp: localTime,
            serverTime: serverTime
          };
          
          marketDataEmitter.emit("marketData", marketData);
        }
        
        // Handle candlestick data
        if (json.arg && json.arg.channel.startsWith("candle")) {
          const candleData = {
            open: parseFloat(json.data[0][1]),
            high: parseFloat(json.data[0][2]),
            low: parseFloat(json.data[0][3]),
            close: parseFloat(json.data[0][4]),
            volume: parseFloat(json.data[0][5]),
            timestamp: parseInt(json.data[0][0])
          };
          
          marketDataEmitter.emit("candle", candleData);
        }
      }
    } catch (error) {
      console.error("🚨 WebSocket message parsing error:", error.message);
    }
  });

  ws.on("error", function error(err) {
    console.error("🚨 WebSocket Error:", err.message);
  });

  ws.on("close", function close() {
    console.log("❌ WebSocket connection closed");
    attemptReconnect();
  });

  // Set a ping interval to keep the connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // Send ping every 30 seconds
}

function attemptReconnect() {
  if (reconnectAttempts >= config.MAX_RECONNECT_ATTEMPTS) {
    console.error(`😵 Maximum reconnection attempts (${config.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    process.exit(1);
    return;
  }

  reconnectAttempts++;
  
  const delay = config.INITIAL_RECONNECT_DELAY * Math.pow(config.RECONNECT_MULTIPLIER, reconnectAttempts - 1);
  
  console.log(`🔄 Attempting to reconnect in ${delay / 1000} seconds... (Attempt ${reconnectAttempts}/${config.MAX_RECONNECT_ATTEMPTS})`);
  
  setTimeout(() => {
    connectWebSocket();
  }, delay);
}

// Graceful shutdown handling
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

function gracefulShutdown() {
  console.log("🛑 Shutting down gracefully...");
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  
  setTimeout(() => {
    console.log("👋 Goodbye!");
    process.exit(0);
  }, 1000);
}

module.exports = { 
  connectWebSocket,
  marketDataEmitter
};