const { createClient } = require('redis');
let client;
let connectionPromise;
let retryAfter = 0;
const memCache = new Map();
const unavailable = () => Object.assign(new Error('Redis is unavailable'), { status: 503 });

async function getClient() {
  if (!process.env.REDIS_HOST) return null;
  if (client?.isReady) return client;
  if (connectionPromise) return connectionPromise;
  if (Date.now() < retryAfter) return null;
  connectionPromise = (async () => {
    const candidate = createClient({
      socket: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), connectTimeout: 1500, reconnectStrategy: false },
      password: process.env.REDIS_PASSWORD || undefined,
      disableOfflineQueue: true,
    });
    candidate.on('error', (err) => console.warn('[Redis]', err.message));
    try {
      await candidate.connect();
      client = candidate;
      return client;
    } catch (err) {
      retryAfter = Date.now() + 10000;
      if (candidate.isOpen) await candidate.disconnect().catch(() => {});
      return null;
    }
  })().finally(() => { connectionPromise = null; });
  return connectionPromise;
}
async function withClient(operation, required) {
  const c = await getClient();
  if (!c) { if (required) throw unavailable(); return null; }
  let timer;
  try {
    return await Promise.race([operation(c), new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), 2000); })]);
  } catch (err) {
    retryAfter = Date.now() + 10000;
    if (c.isOpen) await c.disconnect().catch(() => {});
    if (client === c) client = null;
    if (required) throw unavailable();
    return null;
  } finally { clearTimeout(timer); }
}
async function setCached(key, data, ttl, { required = false } = {}) {
  const value = JSON.stringify(data);
  await withClient((c) => c.set(key, value, { EX: ttl }), required);
  memCache.set(key, { value, expires: Date.now() + ttl * 1000 });
}
async function getCached(key, { required = false } = {}) {
  const value = await withClient((c) => c.get(key), required);
  if (value !== null) return JSON.parse(value);
  if (required) return null;
  const cached = memCache.get(key);
  if (cached && cached.expires > Date.now()) return JSON.parse(cached.value);
  memCache.delete(key);
  return null;
}
const setPrice = (symbol, data, options) => setCached(`price:${symbol}`, data, 15, options);
const getPrice = (symbol, options) => getCached(`price:${symbol}`, options);
const setAllPrices = (data, options) => setCached('prices:all', data, 15, options);
const getAllPrices = (options) => getCached('prices:all', options);
const setNews = (data, options) => setCached('news:latest', data, 120, options);
const getNews = (options) => getCached('news:latest', options);
async function getStreamAnalytics() {
  const { SYMBOLS } = require('../dataGenerator');
  const [movingAverages, activeSymbols, alerts] = await Promise.all([
    Promise.all(SYMBOLS.map((symbol) => getCached(`ma5:${symbol}`, { required: true }))),
    getCached('active:symbols', { required: true }),
    withClient((c) => c.lRange('alerts:price_spike', 0, 19), true),
  ]);
  return { movingAverages: movingAverages.filter(Boolean), activeSymbols: activeSymbols?.symbols || [], alerts: (alerts || []).map(JSON.parse), available: movingAverages.some(Boolean) };
}
async function close() {
  if (connectionPromise) await connectionPromise;
  if (client?.isOpen) await client.disconnect();
  client = null;
}
function status() { return !process.env.REDIS_HOST ? 'disabled' : client?.isReady ? 'connected' : 'disconnected'; }
module.exports = { setPrice, getPrice, setAllPrices, getAllPrices, setNews, getNews, getStreamAnalytics, close, status };
