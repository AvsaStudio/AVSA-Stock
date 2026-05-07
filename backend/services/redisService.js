/**
 * Redis Service
 * Fast in-memory cache for latest prices and trending symbols
 */

const { createClient } = require('redis');

let client = null;
let connected = false;

async function getClient() {
  if (client && connected) return client;

  client = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      reconnectStrategy: (retries) => {
        if (retries > 5) return new Error('Redis max retries reached');
        return Math.min(retries * 100, 3000);
      },
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  client.on('connect', () => {
    console.log('[Redis] Connected');
    connected = true;
  });

  client.on('error', (err) => {
    console.warn('[Redis] Connection error (will use in-memory fallback):', err.message);
    connected = false;
  });

  client.on('end', () => {
    connected = false;
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn('[Redis] Could not connect, running without Redis cache');
    client = null;
  }

  return client;
}

// In-memory fallback when Redis is unavailable
const memCache = new Map();

async function setPrice(symbol, data) {
  const key = `price:${symbol}`;
  const value = JSON.stringify(data);
  try {
    const c = await getClient();
    if (c) {
      await c.set(key, value, { EX: 60 }); // 60s TTL
      return;
    }
  } catch {}
  memCache.set(key, { value, expires: Date.now() + 60000 });
}

async function getPrice(symbol) {
  const key = `price:${symbol}`;
  try {
    const c = await getClient();
    if (c) {
      const val = await c.get(key);
      return val ? JSON.parse(val) : null;
    }
  } catch {}
  const cached = memCache.get(key);
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.value);
  return null;
}

async function setAllPrices(prices) {
  const key = 'prices:all';
  const value = JSON.stringify(prices);
  try {
    const c = await getClient();
    if (c) {
      await c.set(key, value, { EX: 10 }); // 10s TTL for real-time data
      return;
    }
  } catch {}
  memCache.set(key, { value, expires: Date.now() + 10000 });
}

async function getAllPrices() {
  const key = 'prices:all';
  try {
    const c = await getClient();
    if (c) {
      const val = await c.get(key);
      return val ? JSON.parse(val) : null;
    }
  } catch {}
  const cached = memCache.get(key);
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.value);
  return null;
}

async function setTrending(data) {
  const key = 'trending:symbols';
  const value = JSON.stringify(data);
  try {
    const c = await getClient();
    if (c) {
      await c.set(key, value, { EX: 30 });
      return;
    }
  } catch {}
  memCache.set(key, { value, expires: Date.now() + 30000 });
}

async function getTrending() {
  const key = 'trending:symbols';
  try {
    const c = await getClient();
    if (c) {
      const val = await c.get(key);
      return val ? JSON.parse(val) : null;
    }
  } catch {}
  const cached = memCache.get(key);
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.value);
  return null;
}

async function setNews(data) {
  const key = 'news:latest';
  const value = JSON.stringify(data);
  try {
    const c = await getClient();
    if (c) {
      await c.set(key, value, { EX: 120 }); // 2 min TTL
      return;
    }
  } catch {}
  memCache.set(key, { value, expires: Date.now() + 120000 });
}

async function getNews() {
  const key = 'news:latest';
  try {
    const c = await getClient();
    if (c) {
      const val = await c.get(key);
      return val ? JSON.parse(val) : null;
    }
  } catch {}
  const cached = memCache.get(key);
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.value);
  return null;
}

async function incrementSymbolMention(symbol) {
  const key = `mentions:${symbol}`;
  try {
    const c = await getClient();
    if (c) {
      await c.incr(key);
      await c.expire(key, 3600); // reset hourly
    }
  } catch {}
}

module.exports = {
  setPrice,
  getPrice,
  setAllPrices,
  getAllPrices,
  setTrending,
  getTrending,
  setNews,
  getNews,
  incrementSymbolMention,
};
