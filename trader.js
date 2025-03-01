require("dotenv").config();
const axios = require("axios");

const OKX_API_URL = "https://www.okx.com/api/v5/";
const apiKey = process.env.OKX_API_KEY;
const secretKey = process.env.OKX_SECRET_KEY;
const passphrase = process.env.OKX_PASSPHRASE;

// Function to place a market order with SL & TP
async function placeOrder(symbol, side, size = "0.001") {
    try {
        // Get latest price
        const marketData = await axios.get(`${OKX_API_URL}market/ticker?instId=${symbol}`);
        const lastPrice = parseFloat(marketData.data.data[0].last);

        // Define SL & TP levels
        const stopLoss = side === "BUY" ? (lastPrice * 0.995).toFixed(2) : (lastPrice * 1.005).toFixed(2);
        const takeProfit = side === "BUY" ? (lastPrice * 1.01).toFixed(2) : (lastPrice * 0.99).toFixed(2);

        // Place Market Order
        const order = await axios.post(`${OKX_API_URL}trade/order`, {
            instId: symbol,
            tdMode: "cash",
            side: side.toLowerCase(),
            ordType: "market",
            sz: size,
        }, {
            headers: {
                "OK-ACCESS-KEY": apiKey,
                "OK-ACCESS-SIGN": secretKey,
                "OK-ACCESS-TIMESTAMP": new Date().toISOString(),
                "OK-ACCESS-PASSPHRASE": passphrase,
            },
        });

        console.log(`✅ Market Order Placed: ${side} ${size} of ${symbol} at $${lastPrice}`);

        // Get Order ID
        const orderId = order.data.data[0].ordId;

        // Place Stop-Loss Order
        await axios.post(`${OKX_API_URL}trade/order`, {
            instId: symbol,
            tdMode: "cash",
            side: side === "BUY" ? "sell" : "buy",
            ordType: "stop",
            sz: size,
            stopPx: stopLoss,  // Stop-Loss Price
            triggerPxType: "last",
        }, {
            headers: {
                "OK-ACCESS-KEY": apiKey,
                "OK-ACCESS-SIGN": secretKey,
                "OK-ACCESS-TIMESTAMP": new Date().toISOString(),
                "OK-ACCESS-PASSPHRASE": passphrase,
            },
        });

        console.log(`🛑 Stop-Loss Set at $${stopLoss}`);

        // Place Take-Profit Order
        await axios.post(`${OKX_API_URL}trade/order`, {
            instId: symbol,
            tdMode: "cash",
            side: side === "BUY" ? "sell" : "buy",
            ordType: "take_profit",
            sz: size,
            tpTriggerPx: takeProfit,  // Take-Profit Price
            triggerPxType: "last",
        }, {
            headers: {
                "OK-ACCESS-KEY": apiKey,
                "OK-ACCESS-SIGN": secretKey,
                "OK-ACCESS-TIMESTAMP": new Date().toISOString(),
                "OK-ACCESS-PASSPHRASE": passphrase,
            },
        });

        console.log(`🎯 Take-Profit Set at $${takeProfit}`);

    } catch (error) {
        console.error("🚨 Order Error:", error.response?.data || error.message);
    }
}

module.exports = { placeOrder };
