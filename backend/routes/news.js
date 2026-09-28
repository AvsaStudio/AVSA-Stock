const router = require('express').Router();
const market = require('../services/marketService');
const { SYMBOLS } = require('../dataGenerator');

router.get('/:symbol?', async (req, res, next) => {
  const symbol = req.params.symbol?.toUpperCase();
  if (symbol && !SYMBOLS.includes(symbol)) return res.status(404).json({ success: false, error: `Symbol ${symbol} not found` });
  try {
    const { news } = await market.snapshot();
    res.json({ success: true, symbol, data: symbol ? news.filter((n) => n.symbol === symbol) : news });
  } catch (err) { next(err); }
});
module.exports = router;
