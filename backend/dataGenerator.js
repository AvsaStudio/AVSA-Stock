/**
 * Fake Stock Data Generator
 * Simulates realistic market data for MVP phase
 */

const SYMBOLS = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'JPM', 'GS', 'BAC'];

const BASE_PRICES = {
  AAPL: 187.22,
  TSLA: 248.50,
  MSFT: 415.80,
  GOOGL: 178.32,
  AMZN: 192.45,
  META: 552.14,
  NVDA: 875.39,
  JPM: 198.72,
  GS: 462.18,
  BAC: 37.84,
};

const COMPANY_NAMES = {
  AAPL: 'Apple Inc.',
  TSLA: 'Tesla Inc.',
  MSFT: 'Microsoft Corp.',
  GOOGL: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.',
  META: 'Meta Platforms Inc.',
  NVDA: 'NVIDIA Corp.',
  JPM: 'JPMorgan Chase & Co.',
  GS: 'Goldman Sachs Group Inc.',
  BAC: 'Bank of America Corp.',
};

const NEWS_TEMPLATES = [
  (symbol, name) => `${name} reports strong Q2 earnings, beating analyst expectations`,
  (symbol, name) => `${name} announces new product launch, shares react`,
  (symbol, name) => `Analysts upgrade ${symbol} to Buy, raise price target`,
  (symbol, name) => `${name} CEO speaks at investor conference`,
  (symbol, name) => `${symbol} options activity surges ahead of earnings`,
  (symbol, name) => `${name} expands into new markets, stock rises`,
  (symbol, name) => `Federal Reserve comments impact ${symbol} trading`,
  (symbol, name) => `${name} partnership announcement drives pre-market gains`,
];

const SENTIMENTS = ['positive', 'negative', 'neutral'];

// In-memory price state (persists between calls in the same process)
const currentPrices = { ...BASE_PRICES };
const priceHistory = {};

SYMBOLS.forEach((s) => {
  priceHistory[s] = [];
});

function generatePriceMove(symbol) {
  const base = currentPrices[symbol];
  const volatility = base * 0.005; // 0.5% max move per tick
  const move = (Math.random() - 0.49) * volatility * 2; // slight upward bias
  const newPrice = Math.max(base + move, 1);
  const rounded = parseFloat(newPrice.toFixed(2));
  const change = rounded - base;
  const changePct = (change / base) * 100;

  currentPrices[symbol] = rounded;

  const tick = {
    symbol,
    name: COMPANY_NAMES[symbol],
    price: rounded,
    change: parseFloat(change.toFixed(2)),
    changePct: parseFloat(changePct.toFixed(2)),
    volume: Math.floor(Math.random() * 5000000) + 500000,
    timestamp: new Date().toISOString(),
  };

  // Keep last 100 ticks per symbol
  priceHistory[symbol].push(tick);
  if (priceHistory[symbol].length > 100) {
    priceHistory[symbol].shift();
  }

  return tick;
}

function generateAllPrices() {
  return SYMBOLS.map(generatePriceMove);
}

function generateSinglePrice(symbol) {
  if (!SYMBOLS.includes(symbol)) return null;
  return generatePriceMove(symbol);
}

function getPriceHistory(symbol, limit = 30) {
  const hist = priceHistory[symbol] || [];
  return hist.slice(-limit);
}

function getAllLatestPrices() {
  return SYMBOLS.map((s) => ({
    symbol: s,
    name: COMPANY_NAMES[s],
    price: currentPrices[s],
    change: 0,
    changePct: 0,
    volume: Math.floor(Math.random() * 5000000) + 500000,
    timestamp: new Date().toISOString(),
  }));
}

function getTrendingSymbols() {
  return SYMBOLS.map((s) => ({
    symbol: s,
    name: COMPANY_NAMES[s],
    price: currentPrices[s],
    volume: Math.floor(Math.random() * 5000000) + 500000,
    mentions: Math.floor(Math.random() * 1000) + 50,
  }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 5);
}

function generateNews(count = 10) {
  const news = [];
  for (let i = 0; i < count; i++) {
    const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const template = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
    const sentiment = SENTIMENTS[Math.floor(Math.random() * SENTIMENTS.length)];
    const score = sentiment === 'positive' ? Math.random() * 0.5 + 0.5
      : sentiment === 'negative' ? -(Math.random() * 0.5 + 0.5)
        : (Math.random() - 0.5) * 0.4;

    news.push({
      id: `news-${Date.now()}-${i}`,
      symbol,
      headline: template(symbol, COMPANY_NAMES[symbol]),
      sentiment,
      score: parseFloat(score.toFixed(3)),
      source: ['Bloomberg', 'Reuters', 'WSJ', 'CNBC', 'FT'][Math.floor(Math.random() * 5)],
      timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    });
  }
  return news.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function generateMarketSummary() {
  const prices = SYMBOLS.map((s) => currentPrices[s]);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const gainers = SYMBOLS.filter(() => Math.random() > 0.4).length;
  const losers = SYMBOLS.length - gainers;

  return {
    timestamp: new Date().toISOString(),
    totalSymbolsTracked: SYMBOLS.length,
    gainers,
    losers,
    unchanged: 0,
    averagePrice: parseFloat(avg.toFixed(2)),
    marketSentiment: gainers > losers ? 'bullish' : 'bearish',
    topGainer: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    topLoser: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    totalVolume: SYMBOLS.reduce(() => Math.floor(Math.random() * 5000000) + 500000, 0),
  };
}

module.exports = {
  SYMBOLS,
  COMPANY_NAMES,
  generateAllPrices,
  generateSinglePrice,
  getPriceHistory,
  getAllLatestPrices,
  getTrendingSymbols,
  generateNews,
  generateMarketSummary,
};
