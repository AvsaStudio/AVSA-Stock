const { summarize, sentiment } = require('../lib/analytics');

function unavailable(message) {
  return Object.assign(new Error(message), { status: 503 });
}

function createMarketService({ mode = 'demo', redis, cassandra, generator, provider = require('./alpacaService'), now = Date.now }) {
  if (!['demo', 'kafka', 'alpaca'].includes(mode)) throw new Error('DATA_MODE must be demo, kafka or alpaca');
  let demoSnapshot;
  let nextTick = 0;
  let nextNews = 0;

  async function snapshot() {
    if (mode === 'alpaca') return provider.snapshot();
    let prices, news;
    if (mode === 'demo') {
      if (!demoSnapshot || now() >= nextTick) {
        prices = generator.generateAllPrices();
        nextTick = now() + 1000;
      } else prices = demoSnapshot.prices;
      if (!demoSnapshot || now() >= nextNews) {
        news = [...generator.generateNews(3), ...(demoSnapshot?.news || [])].slice(0, 30);
        nextNews = now() + 30000;
      } else news = demoSnapshot.news;
      demoSnapshot = { prices, news };
    } else {
      // The consumer owns these keys. The API never writes or fabricates pipeline data.
      [prices, news] = await Promise.all([redis.getAllPrices({ required: true }), redis.getNews({ required: true })]);
      if (!prices?.length) throw unavailable('Waiting for the market pipeline. No recent prices are available.');
      const newest = Math.max(...prices.map((p) => Date.parse(p.timestamp)));
      if (!Number.isFinite(newest) || now() - newest > 15000) throw unavailable('Market pipeline prices are stale.');
      news = news || [];
    }
    return { prices, news, summary: summarize(prices), source: mode, simulated: true, timestamp: new Date(now()).toISOString() };
  }

  async function history(symbol, limit) {
    if (mode === 'alpaca') return provider.history(symbol, limit);
    if (mode === 'demo') {
      await snapshot();
      return generator.getPriceHistory(symbol, limit);
    }
    return cassandra.getPriceHistory(symbol, limit, { required: true });
  }

  async function recentReport() {
    if (mode === 'alpaca') return provider.dailyReport();
    const current = await snapshot();
    const rows = await Promise.all(current.prices.map(async (tick) => {
      const ticks = await history(tick.symbol, 200);
      const values = ticks.length ? ticks : [tick];
      const prices = values.map((p) => p.price);
      return { symbol: tick.symbol, open: prices[0], close: prices.at(-1), high: Math.max(...prices), low: Math.min(...prices), volume: values.reduce((sum, p) => sum + p.volume, 0), tickCount: values.length };
    }));
    return { date: current.timestamp.slice(0, 10), generatedAt: current.timestamp, scope: 'recent', source: mode, simulated: true, marketSummary: current.summary, topHeadlines: current.news.slice(0, 5).map((n) => n.headline), symbolAnalytics: rows };
  }

  return {
    mode, snapshot, history, recentReport,
    async trending() { return [...(await snapshot()).prices].sort((a, b) => b.volume - a.volume).slice(0, 5); },
    async sentiment() { if (mode === 'alpaca') return { available: false, overallLabel: 'Not rated', bySymbol: {} }; const current = await snapshot(); return sentiment(current.news, generator.SYMBOLS); },
  };
}

const market = createMarketService({
  mode: process.env.DATA_MODE || 'demo',
  redis: require('./redisService'),
  cassandra: require('./cassandraService'),
  generator: require('../dataGenerator'),
});
module.exports = market;
module.exports.createMarketService = createMarketService;
