require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  RSI, MACD, SMA, EMA, StochasticRSI, BollingerBands, CCI, ADX
} = require("technicalindicators");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/analyze", async (req, res) => {
  const { symbol, timeframe } = req.body;
  const interval = timeframe === "1" ? "1min" : "5min";

  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&apikey=${process.env.TWELVE_API_KEY}&outputsize=50`;

  try {
    const response = await fetch(url);
    const result = await response.json();

    const candles = result?.values;
    if (!candles || candles.length < 30) {
      return res.status(500).json({ error: "❌ بيانات غير كافية للتحليل." });
    }

    const closes = candles.map(c => parseFloat(c.close)).reverse();
    const highs = candles.map(c => parseFloat(c.high)).reverse();
    const lows = candles.map(c => parseFloat(c.low)).reverse();

    // المؤشرات الفنية
    const rsi = RSI.calculate({ values: closes, period: 14 });
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    const sma = SMA.calculate({ values: closes, period: 14 });
    const ema = EMA.calculate({ values: closes, period: 21 });
    const stoch = StochasticRSI.calculate({ values: closes, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 });
    const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    const cci = CCI.calculate({ high: highs, low: lows, close: closes, period: 20 });
    const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });

    // آخر القيم
    const lastRSI = rsi.at(-1);
    const lastMACD = macd.at(-1);
    const lastStoch = stoch.at(-1);
    const lastCCI = cci.at(-1);
    const lastADX = adx.at(-1);
    const lastBB = bb.at(-1);
    const lastPrice = closes.at(-1);
    const lastSMA = sma.at(-1);
    const lastEMA = ema.at(-1);

    // الشروط
    let conditions = [];

    if (lastRSI < 30) conditions.push("RSI: Oversold");
    if (lastRSI > 70) conditions.push("RSI: Overbought");

    if (lastMACD?.MACD > lastMACD?.signal) conditions.push("MACD: Bullish");
    if (lastMACD?.MACD < lastMACD?.signal) conditions.push("MACD: Bearish");

    if (lastStoch?.k < 20 && lastStoch?.d < 20) conditions.push("StochRSI: Oversold");
    if (lastStoch?.k > 80 && lastStoch?.d > 80) conditions.push("StochRSI: Overbought");

    if (lastCCI > 100) conditions.push("CCI: Bullish");
    if (lastCCI < -100) conditions.push("CCI: Bearish");

    if (lastADX?.adx > 20) conditions.push("ADX: Trending");

    if (lastBB && lastPrice < lastBB.lower) conditions.push("Bollinger: Below Band");
    if (lastBB && lastPrice > lastBB.upper) conditions.push("Bollinger: Above Band");

    if (lastPrice > lastSMA) conditions.push("Price > SMA");
    if (lastPrice > lastEMA) conditions.push("Price > EMA");

    // إشارة التداول
    let signal = "↔ لا توجد إشارة قوية";
    let strength = `${conditions.length}/10`;

    if (conditions.length >= 3) {
      const buyConditions = ["RSI: Oversold", "MACD: Bullish", "StochRSI: Oversold", "CCI: Bullish", "Bollinger: Below Band", "Price > SMA", "Price > EMA"];
      const sellConditions = ["RSI: Overbought", "MACD: Bearish", "StochRSI: Overbought", "CCI: Bearish", "Bollinger: Above Band"];

      const buyMatches = buyConditions.filter(c => conditions.includes(c)).length;
      const sellMatches = sellConditions.filter(c => conditions.includes(c)).length;

      if (buyMatches > sellMatches) {
        signal = "⬆ CALL";
      } else if (sellMatches > buyMatches) {
        signal = "⬇ PUT";
      }
    }

    // حساب وقت الدخول حسب الفريم
    const now = new Date();
    now.setSeconds(0, 0);
    if (timeframe === "1") {
      now.setMinutes(now.getMinutes() + 1);
    } else {
      now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
    }
    const entryTime = now.toTimeString().split(" ")[0].slice(0, 5);

    return res.json({
      pair: symbol,
      timeframe: `M${timeframe}`,
      time: entryTime,
      signal,
      strength,
      conditions
    });
  } catch (err) {
    console.error("❌ خطأ:", err.message);
    return res.status(500).json({ error: "⚠️ فشل الاتصال أو التحليل." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
