const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMarketService } = require('../services/marketService');
const { createAlpacaService } = require('../services/alpacaService');
const generator = require('../dataGenerator');

test('demo shares ticks across REST, summary, trending and snapshots within each second', async () => {
  let now = 1000;
  const service = createMarketService({ mode: 'demo', generator, now: () => now });
  const first = await service.snapshot();
  assert.deepEqual((await service.snapshot()).prices, first.prices);
  assert.equal((await service.trending())[0].volume, Math.max(...first.prices.map((p) => p.volume)));
  now += 1001;
  assert.notDeepEqual((await service.snapshot()).prices, first.prices);
});

test('pipeline reads consumer data and never calls the generator or writes Redis', async () => {
  const ticks = [{ symbol: 'AAPL', price: 123, change: 1, changePct: 1, volume: 12, timestamp: new Date().toISOString() }];
  const service = createMarketService({ mode: 'kafka', generator: { SYMBOLS: ['AAPL'], generateAllPrices() { throw Error('must not generate'); } }, redis: { getAllPrices: async () => ticks, getNews: async () => [] }, cassandra: { getPriceHistory: async () => ticks } });
  assert.deepEqual((await service.snapshot()).prices, ticks);
  assert.equal((await service.recentReport()).symbolAnalytics[0].close, 123);
});

test('pipeline outages and stale data fail instead of falling back to simulation', async () => {
  for (const prices of [null, [{ timestamp: '2000-01-01T00:00:00Z' }]]) {
    const service = createMarketService({ mode: 'kafka', generator, redis: { getAllPrices: async () => prices, getNews: async () => [] } });
    await assert.rejects(service.snapshot(), { status: 503 });
  }
});

test('Alpaca batches symbols, caches concurrent requests and uses server-side IEX credentials', async () => {
  let calls = 0;
  const provider = createAlpacaService({ env: { ALPACA_API_KEY: 'test-key', ALPACA_SECRET_KEY: 'test-secret' }, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['APCA-API-KEY-ID'], 'test-key');
    assert.equal(url.origin, 'https://data.alpaca.markets');
    if (url.pathname.includes('/news')) return { ok: true, json: async () => ({ news: [] }) };
    assert.equal(url.searchParams.get('feed'), 'iex');
    return { ok: true, json: async () => ({ AAPL: { latestTrade: { p: 110, t: '2026-09-25T19:00:00Z' }, prevDailyBar: { c: 100 }, dailyBar: { o: 102, c: 110, h: 112, l: 101, v: 10, t: '2026-09-25T04:00:00Z' } } }) };
  } });
  const [a, b] = await Promise.all([provider.snapshot(), provider.snapshot()]);
  assert.equal(calls, 2);
  assert.equal(a.prices[0].changePct, 10);
  assert.deepEqual(a.prices, b.prices);
  assert.equal(a.simulated, false);
  assert.equal((await provider.dailyReport()).symbolAnalytics[0].high, 112);
  assert.equal(calls, 2);
});

test('Alpaca missing keys, denied access and rate limiting never fabricate prices or expose keys', async () => {
  await assert.rejects(createAlpacaService({ env: {} }).snapshot(), { status: 503 });
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const provider = createAlpacaService({ env: { ALPACA_API_KEY: 'secret-test-key', ALPACA_SECRET_KEY: 'secret-test-value' }, fetchImpl: async () => { calls++; return { ok: false, status }; } });
    await assert.rejects(provider.snapshot(), (error) => error.status === 503 && !error.message.includes('secret-test'));
    await assert.rejects(provider.snapshot(), { status: 503 });
    assert.equal(calls, 1);
  }
});
