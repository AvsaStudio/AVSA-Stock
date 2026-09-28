function summarize(prices) {
  const gainers = prices.filter((p) => p.change > 0).length;
  const losers = prices.filter((p) => p.change < 0).length;
  const ranked = [...prices].sort((a, b) => b.changePct - a.changePct);
  return {
    timestamp: new Date().toISOString(),
    totalSymbolsTracked: prices.length,
    gainers, losers, unchanged: prices.length - gainers - losers,
    averagePrice: prices.length ? Number((prices.reduce((sum, p) => sum + p.price, 0) / prices.length).toFixed(2)) : 0,
    marketSentiment: gainers > losers ? 'bullish' : gainers < losers ? 'bearish' : 'neutral',
    topGainer: ranked[0]?.symbol || null,
    topLoser: ranked.at(-1)?.symbol || null,
    totalVolume: prices.reduce((sum, p) => sum + p.volume, 0),
  };
}

function sentiment(news, symbols) {
  const bySymbol = Object.fromEntries(symbols.map((symbol) => {
    const articles = news.filter((n) => n.symbol === symbol);
    const score = articles.length ? articles.reduce((sum, n) => sum + n.score, 0) / articles.length : 0;
    return [symbol, { symbol, score: Number(score.toFixed(3)), label: score > 0.1 ? 'Positive' : score < -0.1 ? 'Negative' : 'Neutral', newsCount: articles.length }];
  }));
  const overall = news.length ? news.reduce((sum, n) => sum + n.score, 0) / news.length : 0;
  return { overall: Number(overall.toFixed(3)), overallLabel: overall > 0.1 ? 'Bullish' : overall < -0.1 ? 'Bearish' : 'Neutral', bySymbol };
}

module.exports = { summarize, sentiment };
