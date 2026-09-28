require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const provider = require('../services/alpacaService');
provider.snapshot().then((snapshot) => {
  console.log(`Alpaca IEX connected: ${snapshot.prices.length} symbols. Credentials remain on the backend.`);
  if (snapshot.newsError) console.log(`Quotes work; news status: ${snapshot.newsError}`);
}).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
