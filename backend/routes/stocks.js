const router = require('express').Router();
const market = require('../services/marketService');
const { SYMBOLS } = require('../dataGenerator');

router.get('/latest', async (_req, res, next) => {
  try {
    const snapshot = await market.snapshot();
    res.json({ success: true, data: snapshot.prices, source: snapshot.source, simulated: snapshot.simulated });
  } catch (err) { next(err); }
});
router.get('/trending', async (_req, res, next) => {
  try { res.json({ success: true, data: await market.trending() }); } catch (err) { next(err); }
});
router.param('symbol', (req, res, next, symbol) => {
  req.symbol = symbol.toUpperCase();
  if (!SYMBOLS.includes(req.symbol)) return res.status(404).json({ success: false, error: `Symbol ${req.symbol} not found` });
  next();
});
router.get('/:symbol', async (req, res, next) => {
  try {
    const price = (await market.snapshot()).prices.find((p) => p.symbol === req.symbol);
    if (!price) return res.status(503).json({ success: false, error: 'Waiting for this symbol in the market pipeline' });
    res.json({ success: true, data: price });
  } catch (err) { next(err); }
});
router.get('/:symbol/history', async (req, res, next) => {
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(limit) || limit < 1) return res.status(400).json({ success: false, error: 'limit must be a positive integer' });
  try { res.json({ success: true, symbol: req.symbol, data: await market.history(req.symbol, Math.min(limit, 200)) }); } catch (err) { next(err); }
});
module.exports = router;
