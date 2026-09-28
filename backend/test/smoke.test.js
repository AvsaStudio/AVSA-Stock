const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');
const generator = require('../dataGenerator');

test('summary, trending and history agree with generated ticks', () => {
  const ticks = generator.generateAllPrices();
  const summary = generator.generateMarketSummary();
  assert.equal(summary.totalVolume, ticks.reduce((sum, tick) => sum + tick.volume, 0));
  assert.equal(summary.gainers, ticks.filter((tick) => tick.change > 0).length);
  assert.equal(summary.gainers + summary.losers + summary.unchanged, ticks.length);
  assert.deepEqual(generator.getTrendingSymbols().map((tick) => tick.symbol),
    [...ticks].sort((a, b) => b.volume - a.volume).slice(0, 5).map((tick) => tick.symbol));
  assert.equal(generator.getPriceHistory('AAPL').at(-1).price, ticks[0].price);
  const news = [...generator.generateNews(20, 'AAPL'), ...generator.generateNews(20, 'AAPL')];
  assert.equal(new Set(news.map((item) => item.id)).size, news.length);
  assert.ok(news.every((item) => item.symbol === 'AAPL' && !item.headline.includes('Tesla')));
});

test('REST and WebSocket work on one server without infrastructure', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '0', DATA_MODE: 'demo', REDIS_HOST: '', CASSANDRA_CONTACT_POINTS: '', S3_ENDPOINT: '', S3_ACCESS_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${logs}`)));
    child.stdout.on('data', (chunk) => {
      logs += chunk;
      const match = logs.match(/REST:\s+http:\/\/localhost:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const get = async (route, status = 200) => {
    const response = await fetch(base + route);
    assert.equal(response.status, status, route);
    return response.json();
  };
  assert.equal((await get('/health')).status, 'ok');
  assert.equal((await get('/api/stocks/latest')).source, 'demo');
  assert.equal((await get('/api/stocks/latest')).source, 'demo');
  for (const route of ['/api/stocks/trending', '/api/stocks/AAPL', '/api/stocks/AAPL/history', '/api/news', '/api/news/AAPL', '/api/analytics/summary', '/api/analytics/sentiment', '/api/analytics/daily', '/api/analytics/stream', '/api/snapshot']) {
    assert.equal((await get(route)).success, true, route);
  }
  for (const limit of ['-1', '0', 'abc', '1.5']) await get(`/api/stocks/AAPL/history?limit=${limit}`, 400);
  for (const route of ['/missing', '/api/stocks/UNKNOWN', '/api/stocks/UNKNOWN/history', '/api/news/UNKNOWN']) await get(route, 404);
  const report = (await get('/api/analytics/daily')).data;
  assert.ok(report.symbolAnalytics.every((row) => row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close)));
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => socket.terminate());
  await new Promise((resolve, reject) => {
    let snapshots = 0;
    socket.on('error', reject);
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw);
        if (message.type === 'snapshot') {
          snapshots++;
          assert.equal(message.prices.length, 10);
          assert.equal(message.summary.totalVolume, message.prices.reduce((sum, tick) => sum + tick.volume, 0));
          if (snapshots >= 2) resolve();
        }
      } catch (err) { reject(err); }
    });
  });
});
