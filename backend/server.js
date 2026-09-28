require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const market = require('./services/marketService');
const redis = require('./services/redisService');
const cassandra = require('./services/cassandraService');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/news', require('./routes/news'));
app.use('/api/analytics', require('./routes/analytics'));
app.get('/api/snapshot', async (_req, res, next) => {
  try { res.json({ success: true, data: await market.snapshot() }); } catch (err) { next(err); }
});
app.get('/health', (_req, res) => res.json({
  status: 'ok', source: market.mode, simulated: market.mode !== 'alpaca',
  services: { api: 'running', redis: redis.status(), cassandra: cassandra.status() },
}));
if (process.env.SERVE_FRONTEND === 'true') app.use(express.static(require('path').join(__dirname, '../frontend/build')));
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('[API]', err.message);
  res.status(err.status || 500).json({ success: false, error: err.status ? err.message : 'Internal server error' });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1024 * 1024) ws.send(JSON.stringify(message));
}
async function getMessage() {
  try { return { type: 'snapshot', ...await market.snapshot() }; }
  catch (err) { return { type: 'feed_error', error: err.status ? err.message : 'Market feed unavailable' }; }
}
wss.on('connection', async (ws) => {
  ws.on('error', (err) => console.warn('[WebSocket]', err.message));
  send(ws, await getMessage());
});
let broadcasting = false;
const timer = setInterval(async () => {
  if (!wss.clients.size || broadcasting) return;
  broadcasting = true;
  try {
    const message = await getMessage();
    for (const ws of wss.clients) send(ws, message);
  } finally { broadcasting = false; }
}, 1000);
server.listen(process.env.PORT || 4000, () => {
  const port = server.address().port;
  console.log(`AVSA Stock (${market.mode})\nREST: http://localhost:${port}\nWebSocket: ws://localhost:${port}/ws`);
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  for (const ws of wss.clients) ws.terminate();
  wss.close();
  server.close();
  await Promise.allSettled([redis.close(), cassandra.close()]);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
