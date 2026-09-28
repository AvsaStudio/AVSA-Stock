const { SYMBOLS, COMPANY_NAMES } = require('../dataGenerator');
const { summarize } = require('../lib/analytics');
const failure = (message) => Object.assign(new Error(message), { status: 503 });

function createAlpacaService({ fetchImpl = fetch, now = Date.now, env = process.env } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  let retryAfter = 0;
  const failures = new Map();
  async function request(path, params, ttl = 15000) {
    if (!env.ALPACA_API_KEY || !env.ALPACA_SECRET_KEY) throw failure('Add Alpaca API credentials to the backend configuration.');
    const url = new URL(path, 'https://data.alpaca.markets');
    url.search = new URLSearchParams(params);
    const key = url.toString();
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.data;
    const failed = failures.get(key);
    if (failed && failed.expires > now()) throw failure(failed.message);
    if (inFlight.has(key)) return inFlight.get(key);
    if (now() < retryAfter) throw failure('Alpaca is temporarily unavailable. Retrying shortly.');
    const promise = (async () => {
      try {
        const response = await fetchImpl(url, {
          headers: { 'APCA-API-KEY-ID': env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          if (response.status === 429) retryAfter = now() + 60000;
          throw failure(response.status === 401 || response.status === 403 ? 'Alpaca credentials or data permissions were rejected.' : response.status === 429 ? 'Alpaca rate limit reached. Retrying in one minute.' : 'Alpaca market data is temporarily unavailable.');
        }
        const data = await response.json();
        cache.set(key, { data, expires: now() + ttl });
        return data;
      } catch (err) {
        const error = err.status ? err : failure('Cannot reach Alpaca market data.');
        failures.set(key, { message: error.message, expires: now() + 60000 });
        throw error;
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }
  async function snapshot() {
    const data = await request('/v2/stocks/snapshots', { symbols: SYMBOLS.join(','), feed: 'iex' });
    const prices = SYMBOLS.flatMap((symbol) => {
      const item = data[symbol];
      const price = item?.latestTrade?.p ?? item?.minuteBar?.c ?? item?.dailyBar?.c;
      if (!Number.isFinite(price)) return [];
      const previous = item.prevDailyBar?.c;
      const change = previous > 0 ? price - previous : 0;
      return [{ symbol, name: COMPANY_NAMES[symbol], price, change: Number(change.toFixed(2)), changePct: previous > 0 ? Number((change / previous * 100).toFixed(2)) : 0, volume: item.dailyBar?.v ?? 0, timestamp: item.latestTrade?.t || item.minuteBar?.t || item.dailyBar?.t, simulated: false, source: 'alpaca-iex' }];
    });
    if (!prices.length) throw failure('Alpaca returned no prices for the selected symbols.');
    let news = [], newsError = null;
    try {
      const articles = await request('/v1beta1/news', { symbols: SYMBOLS.join(','), limit: '20', sort: 'desc', include_content: 'false' }, 60000);
      news = (articles.news || []).map((item) => ({ id: String(item.id), symbol: item.symbols?.find((s) => SYMBOLS.includes(s)) || '', headline: item.headline, timestamp: item.created_at, source: item.source, url: item.url, sentiment: 'unrated', score: null }));
    } catch (err) { newsError = err.message; }
    return { prices, news, newsError, summary: summarize(prices), source: 'alpaca-iex', simulated: false, timestamp: new Date(now()).toISOString() };
  }
  async function history(symbol, limit) {
    const result = await request(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, { timeframe: '1Min', limit: String(limit), sort: 'desc', feed: 'iex', adjustment: 'raw', start: new Date(now() - 7 * 86400000).toISOString().slice(0, 10) }, 60000);
    return (result.bars || []).map((bar) => ({ symbol, price: bar.c, timestamp: bar.t, volume: bar.v })).reverse();
  }
  async function dailyReport() {
    const data = await request('/v2/stocks/snapshots', { symbols: SYMBOLS.join(','), feed: 'iex' });
    const current = await snapshot();
    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Object.values(data).find((item) => item.dailyBar?.t)?.dailyBar.t || now())),
      generatedAt: current.timestamp, source: 'alpaca-iex', simulated: false, scope: 'latest-session',
      marketSummary: current.summary, topHeadlines: current.news.slice(0, 5).map((n) => n.headline),
      symbolAnalytics: SYMBOLS.flatMap((symbol) => data[symbol]?.dailyBar ? [{ symbol, open: data[symbol].dailyBar.o, close: data[symbol].dailyBar.c, high: data[symbol].dailyBar.h, low: data[symbol].dailyBar.l, volume: data[symbol].dailyBar.v, timestamp: data[symbol].dailyBar.t }] : []),
    };
  }
  return { snapshot, history, dailyReport };
}
module.exports = createAlpacaService();
module.exports.createAlpacaService = createAlpacaService;
