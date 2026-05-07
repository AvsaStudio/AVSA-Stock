/**
 * News Routes
 * GET /api/news         - latest financial news
 * GET /api/news/:symbol - news for specific symbol
 */

const express = require('express');
const router = express.Router();
const redisService = require('../services/redisService');
const { generateNews } = require('../dataGenerator');

// GET /api/news
router.get('/', async (req, res) => {
  try {
    let news = await redisService.getNews();

    if (!news) {
      news = generateNews(15);
      await redisService.setNews(news);
    }

    res.json({ success: true, data: news });
  } catch (err) {
    console.error('[Route /news]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch news' });
  }
});

// GET /api/news/:symbol
router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    let allNews = await redisService.getNews();
    if (!allNews) {
      allNews = generateNews(20);
    }

    const filtered = allNews.filter((n) => n.symbol === symbol);
    const result = filtered.length > 0 ? filtered : generateNews(5).map((n) => ({ ...n, symbol }));

    res.json({ success: true, symbol, data: result });
  } catch (err) {
    console.error(`[Route /news/${symbol}]`, err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch news' });
  }
});

module.exports = router;
