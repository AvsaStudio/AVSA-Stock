const router = require('express').Router();
const market = require('../services/marketService');
const redis = require('../services/redisService');
const s3 = require('../services/s3Service');

router.get('/summary', async (_req, res, next) => {
  try { res.json({ success: true, data: (await market.snapshot()).summary }); } catch (err) { next(err); }
});
router.get('/sentiment', async (_req, res, next) => {
  try { res.json({ success: true, data: await market.sentiment() }); } catch (err) { next(err); }
});
router.get('/daily', async (_req, res, next) => {
  try {
    // Full-day reports are produced by Airflow; GET requests never write archives.
    const report = market.mode === 'kafka' ? await s3.getLatestDailyReport() : null;
    res.json({ success: true, data: report || await market.recentReport() });
  } catch (err) { next(err); }
});
router.get('/stream', async (_req, res, next) => {
  try {
    res.json({ success: true, data: market.mode === 'kafka' ? await redis.getStreamAnalytics() : { movingAverages: [], activeSymbols: [], alerts: [], available: false } });
  } catch (err) { next(err); }
});
module.exports = router;
