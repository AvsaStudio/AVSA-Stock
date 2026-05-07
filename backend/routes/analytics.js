/**
 * Analytics Routes
 * GET /api/analytics/summary   - market summary
 * GET /api/analytics/daily     - today's daily report
 * GET /api/analytics/sentiment - overall market sentiment
 */

const express = require('express');
const router = express.Router();
const { generateMarketSummary, generateNews, SYMBOLS } = require('../dataGenerator');
const cassandraService = require('../services/cassandraService');
const s3Service = require('../services/s3Service');

// GET /api/analytics/summary
router.get('/summary', async (req, res) => {
  try {
    const summary = generateMarketSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate summary' });
  }
});

// GET /api/analytics/sentiment
router.get('/sentiment', async (req, res) => {
  try {
    const news = generateNews(30);
    const bySymbol = {};

    SYMBOLS.forEach((s) => {
      const symbolNews = news.filter((n) => n.symbol === s);
      const avgScore = symbolNews.length
        ? symbolNews.reduce((sum, n) => sum + n.score, 0) / symbolNews.length
        : 0;

      bySymbol[s] = {
        symbol: s,
        score: parseFloat(avgScore.toFixed(3)),
        label: avgScore > 0.1 ? 'Positive' : avgScore < -0.1 ? 'Negative' : 'Neutral',
        newsCount: symbolNews.length,
      };
    });

    const overall = Object.values(bySymbol).reduce((sum, s) => sum + s.score, 0) / SYMBOLS.length;

    res.json({
      success: true,
      data: {
        overall: parseFloat(overall.toFixed(3)),
        overallLabel: overall > 0.1 ? 'Bullish' : overall < -0.1 ? 'Bearish' : 'Neutral',
        bySymbol,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to compute sentiment' });
  }
});

// GET /api/analytics/daily
router.get('/daily', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const summary = generateMarketSummary();
    const news = generateNews(10);

    const dailyReport = {
      date: today,
      generatedAt: new Date().toISOString(),
      marketSummary: summary,
      topHeadlines: news.slice(0, 5).map((n) => n.headline),
      symbolAnalytics: SYMBOLS.map((s) => ({
        symbol: s,
        open: parseFloat((Math.random() * 50 + 150).toFixed(2)),
        close: parseFloat((Math.random() * 50 + 150).toFixed(2)),
        high: parseFloat((Math.random() * 60 + 160).toFixed(2)),
        low: parseFloat((Math.random() * 40 + 140).toFixed(2)),
        volume: Math.floor(Math.random() * 10000000) + 1000000,
      })),
    };

    // Archive to S3 in background
    s3Service.uploadDailyReport(dailyReport, today).catch(() => {});

    res.json({ success: true, data: dailyReport });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate daily report' });
  }
});

module.exports = router;
