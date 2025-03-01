const WebSocket = require("ws");
const EventEmitter = require("events");

const OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";
const ws = new WebSocket(OKX_WS_URL);

class MarketDataEmitter extends EventEmitter {}
const marketDataEmitter = new MarketDataEmitter();

ws.on("open", function open() {
  console.log("✅ Connected to OKX WebSocket");

  // Subscribe to BTC-USDT ticker updates
  const subscribeMsg = JSON.stringify({
    op: "subscribe",
    args: [{ channel: "tickers", instId: "BTC-USDT" }]
  });

  ws.send(subscribeMsg);
});

ws.on("message", function incoming(data) {
  const json = JSON.parse(data);

  if (json.event === "subscribe") {
    console.log("✅ Subscribed to market data!");
  } else if (json.data) {
    const marketData = {
      price: parseFloat(json.data[0].last),
      volume: parseFloat(json.data[0].vol24h),
      timestamp: Date.now()
    };

    console.log("📊 Market Update:", marketData);

    // Emit market data event
    marketDataEmitter.emit("marketData", marketData);
  }
});

ws.on("error", function error(err) {
  console.error("🚨 WebSocket Error:", err);
});

module.exports = { marketDataEmitter };