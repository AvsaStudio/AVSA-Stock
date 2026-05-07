/**
 * Bloomberg Financial Dashboard - Express Server
 * Serves REST API for real-time stock data, news, and analytics
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const {
  generateAllPrices,
  generateNews,
  generateMarketSummary,
} = require("./dataGenerator");
const redisService = require("./services/redisService");

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Middleware
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/stocks", require("./routes/stocks"));
app.use("/api/news", require("./routes/news"));
app.use("/api/analytics", require("./routes/analytics"));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      api: "running",
      kafka: process.env.KAFKA_BROKERS ? "configured" : "not configured",
      redis: process.env.REDIS_HOST ? "configured" : "not configured",
      cassandra: process.env.CASSANDRA_CONTACT_POINTS
        ? "configured"
        : "not configured",
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Create HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

// Connected WebSocket clients
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WebSocket] Client connected (total: ${clients.size})`);

  // Send initial snapshot
  const snapshot = {
    type: "snapshot",
    prices: generateAllPrices(),
    news: generateNews(10),
    summary: generateMarketSummary(),
    timestamp: new Date().toISOString(),
  };
  ws.send(JSON.stringify(snapshot));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WebSocket] Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", () => clients.delete(ws));
});

// Broadcast real-time price updates to all WS clients every second
setInterval(async () => {
  if (clients.size === 0) return;

  const prices = generateAllPrices();

  // Cache in Redis
  redisService.setAllPrices(prices).catch(() => {});

  const message = JSON.stringify({
    type: "price_update",
    data: prices,
    timestamp: new Date().toISOString(),
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}, 1000);

// Broadcast news every 30 seconds
setInterval(async () => {
  if (clients.size === 0) return;

  const news = generateNews(3);
  redisService.setNews(news).catch(() => {});

  const message = JSON.stringify({
    type: "news_update",
    data: news,
    timestamp: new Date().toISOString(),
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Bloomberg Financial Dashboard API          ║
  ║   REST:      http://localhost:${PORT}           ║
  ║   WebSocket: ws://localhost:${PORT}/ws          ║
  ║   Health:    http://localhost:${PORT}/health     ║
  ╚══════════════════════════════════════════════╝
  `);
});
