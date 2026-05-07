/**
 * Stock Routes
 * GET /api/stocks/latest    - all current prices (Redis or generator)
 * GET /api/stocks/trending  - top 5 trending symbols
 * GET /api/stocks/:symbol   - single symbol price
 * GET /api/stocks/:symbol/history - price history
 */

const express = require('express');
const router = express.Router();
const redisService = require('../services/redisService');
const cassandraService = require('../services/cassandraService');
const { generateAllPrices, generateSinglePrice, getTrendingSymbols, getPriceHistory } = require('../dataGenerator');

// GET /api/stocks/latest
router.get('/latest', async (req, res) => {
  try {
    // Try Redis first
    let prices = await redisService.getAllPrices();

    if (!prices) {
      // Fall back to generator
      prices = generateAllPrices();
      await redisService.setAllPrices(prices);
    }

    res.json({ success: true, data: prices, source: prices ? 'cache' : 'generator' });
  } catch (err) {
    console.error('[Route /latest]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch prices' });
  }
});

// GET /api/stocks/trending
router.get('/trending', async (req, res) => {
  try {
    let trending = await redisService.getTrending();

    if (!trending) {
      trending = getTrendingSymbols();
      await redisService.setTrending(trending);
    }

    res.json({ success: true, data: trending });
  } catch (err) {
    console.error('[Route /trending]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch trending' });
  }
});

// GET /api/stocks/:symbol
router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    let price = await redisService.getPrice(symbol);

    if (!price) {
      price = generateSinglePrice(symbol);
      if (!price) {
        return res.status(404).json({ success: false, error: `Symbol ${symbol} not found` });
      }
      await redisService.setPrice(symbol, price);
    }

    res.json({ success: true, data: price });
  } catch (err) {
    console.error(`[Route /${symbol}]`, err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch price' });
  }
});

// GET /api/stocks/:symbol/history
router.get('/:symbol/history', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);

  try {
    // Try Cassandra first, fall back to in-memory generator history
    let history = await cassandraService.getPriceHistory(symbol, limit);

    if (!history || history.length === 0) {
      history = getPriceHistory(symbol, limit);
    }

    res.json({ success: true, symbol, data: history });
  } catch (err) {
    console.error(`[Route /${symbol}/history]`, err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

module.exports = router;
