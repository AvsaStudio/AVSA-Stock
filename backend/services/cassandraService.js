/**
 * Cassandra Service
 * Time-series storage for stock price history
 */

const cassandra = require('cassandra-driver');

let client = null;
let initialized = false;
let connectionPromise = null;
let retryAfter = 0;
const keyspace = process.env.CASSANDRA_KEYSPACE || 'financial_data';
if (!/^[a-z][a-z0-9_]*$/.test(keyspace)) throw new Error('Invalid CASSANDRA_KEYSPACE');
const unavailable = () => Object.assign(new Error('Cassandra is unavailable'), { status: 503 });

async function getClient() {
  if (!process.env.CASSANDRA_CONTACT_POINTS) return null;
  if (client && initialized) return client;

  if (connectionPromise) return connectionPromise;
  if (Date.now() < retryAfter) return null;
  connectionPromise = connect().finally(() => { connectionPromise = null; });
  return connectionPromise;
}

async function connect() {
  try {
    client = new cassandra.Client({
      contactPoints: process.env.CASSANDRA_CONTACT_POINTS.split(',').map((host) => host.trim()),
      localDataCenter: process.env.CASSANDRA_DATACENTER || 'datacenter1',
      socketOptions: { connectTimeout: 1500, readTimeout: 3000 },
      credentials: {
        username: process.env.CASSANDRA_USERNAME || 'cassandra',
        password: process.env.CASSANDRA_PASSWORD || 'cassandra',
      },
    });

    await client.connect();

    // Create keyspace if not exists
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${keyspace}
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);

    // Create stock_prices table optimized for time-series queries
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ${keyspace}.stock_prices (
        symbol     TEXT,
        bucket     TEXT,
        ts         TIMESTAMP,
        price      DOUBLE,
        change     DOUBLE,
        change_pct DOUBLE,
        volume     BIGINT,
        PRIMARY KEY ((symbol, bucket), ts)
      ) WITH CLUSTERING ORDER BY (ts DESC)
        AND default_time_to_live = 2592000
    `);

    initialized = true;
    console.log('[Cassandra] Connected and schema ready');
    return client;
  } catch (err) {
    console.warn('[Cassandra] Could not connect, service unavailable:', err.message);
    retryAfter = Date.now() + 10000;
    await client?.shutdown().catch(() => {});
    client = null;
    initialized = false;
    return null;
  }
}

function getDayBucket(ts = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
}

async function savePriceTick(tick, { required = false } = {}) {
  const bucket = getDayBucket(new Date(tick.timestamp));

  try {
    const c = await getClient();
    if (!c) { if (required) throw unavailable(); return; }

    await c.execute(
      `INSERT INTO ${keyspace}.stock_prices
       (symbol, bucket, ts, price, change, change_pct, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tick.symbol, bucket, new Date(tick.timestamp), tick.price,
        tick.change, tick.changePct, tick.volume],
      { prepare: true },
    );
  } catch (err) {
    console.warn('[Cassandra] Write error:', err.message);
    if (required) throw unavailable();
  }
}

async function getPriceHistory(symbol, limit = 50, { required = false } = {}) {
  const bucket = getDayBucket();

  try {
    const c = await getClient();
    if (!c && required) throw unavailable();
    if (c) {
      const result = await c.execute(
        `SELECT ts, price, change, change_pct, volume
         FROM ${keyspace}.stock_prices
         WHERE symbol = ? AND bucket = ?
         LIMIT ?`,
        [symbol, bucket, limit],
        { prepare: true },
      );
      return result.rows.map((r) => ({
        symbol,
        timestamp: r.ts,
        price: r.price,
        change: r.change,
        changePct: r.change_pct,
        volume: Number(r.volume),
      })).reverse();
    }
  } catch (err) {
    console.warn('[Cassandra] Read error:', err.message);
    if (required) throw unavailable();
  }

  return [];
}

async function close() {
  if (connectionPromise) await connectionPromise;
  await client?.shutdown();
  client = null;
  initialized = false;
}
function status() { return !process.env.CASSANDRA_CONTACT_POINTS ? 'disabled' : initialized ? 'connected' : 'disconnected'; }
module.exports = { savePriceTick, getPriceHistory, close, status };
