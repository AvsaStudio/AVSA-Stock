/**
 * Cassandra Service
 * Time-series storage for stock price history
 */

const cassandra = require('cassandra-driver');

let client = null;
let initialized = false;

// In-memory fallback
const memStore = new Map();

async function getClient() {
  if (client && initialized) return client;

  try {
    client = new cassandra.Client({
      contactPoints: [(process.env.CASSANDRA_CONTACT_POINTS || 'localhost')],
      localDataCenter: 'datacenter1',
      credentials: {
        username: process.env.CASSANDRA_USERNAME || 'cassandra',
        password: process.env.CASSANDRA_PASSWORD || 'cassandra',
      },
    });

    await client.connect();

    // Create keyspace if not exists
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS ${process.env.CASSANDRA_KEYSPACE || 'financial_data'}
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);

    await client.execute(`USE ${process.env.CASSANDRA_KEYSPACE || 'financial_data'}`);

    // Create stock_prices table optimized for time-series queries
    await client.execute(`
      CREATE TABLE IF NOT EXISTS stock_prices (
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

    // Daily analytics table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS daily_analytics (
        date        TEXT,
        symbol      TEXT,
        open_price  DOUBLE,
        close_price DOUBLE,
        high_price  DOUBLE,
        low_price   DOUBLE,
        total_volume BIGINT,
        avg_sentiment DOUBLE,
        PRIMARY KEY (date, symbol)
      )
    `);

    initialized = true;
    console.log('[Cassandra] Connected and schema ready');
    return client;
  } catch (err) {
    console.warn('[Cassandra] Could not connect, using in-memory fallback:', err.message);
    client = null;
    return null;
  }
}

function getDayBucket(ts = new Date()) {
  return ts.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function savePriceTick(tick) {
  const bucket = getDayBucket();
  const key = `${tick.symbol}:${bucket}`;

  // In-memory store (always works as fallback)
  if (!memStore.has(key)) memStore.set(key, []);
  const arr = memStore.get(key);
  arr.push(tick);
  if (arr.length > 500) arr.shift();

  try {
    const c = await getClient();
    if (!c) return;

    await c.execute(
      `INSERT INTO financial_data.stock_prices
       (symbol, bucket, ts, price, change, change_pct, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tick.symbol, bucket, new Date(tick.timestamp), tick.price,
        tick.change, tick.changePct, tick.volume],
      { prepare: true },
    );
  } catch (err) {
    console.warn('[Cassandra] Write error:', err.message);
  }
}

async function getPriceHistory(symbol, limit = 50) {
  const bucket = getDayBucket();
  const key = `${symbol}:${bucket}`;

  try {
    const c = await getClient();
    if (c) {
      const result = await c.execute(
        `SELECT ts, price, change, change_pct, volume
         FROM financial_data.stock_prices
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
        volume: r.volume,
      }));
    }
  } catch (err) {
    console.warn('[Cassandra] Read error:', err.message);
  }

  // Fallback to memory
  const mem = memStore.get(key) || [];
  return mem.slice(-limit);
}

async function saveDailyAnalytics(analytics) {
  const date = getDayBucket();

  try {
    const c = await getClient();
    if (!c) return;

    for (const row of analytics) {
      await c.execute(
        `INSERT INTO financial_data.daily_analytics
         (date, symbol, open_price, close_price, high_price, low_price, total_volume, avg_sentiment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [date, row.symbol, row.open, row.close, row.high, row.low, row.volume, row.sentiment],
        { prepare: true },
      );
    }
  } catch (err) {
    console.warn('[Cassandra] Analytics write error:', err.message);
  }
}

module.exports = {
  savePriceTick,
  getPriceHistory,
  saveDailyAnalytics,
};
