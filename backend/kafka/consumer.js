/**
 * Kafka Consumer
 * Reads stock price updates and news, writes to Redis + Cassandra
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Kafka } = require('kafkajs');
const redisService = require('../services/redisService');
const cassandraService = require('../services/cassandraService');

const kafka = new Kafka({
  clientId: 'bloomberg-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'bloomberg-dashboard',
});

const STOCK_TOPIC = process.env.KAFKA_TOPIC_STOCKS || 'stock-prices';
const NEWS_TOPIC = process.env.KAFKA_TOPIC_NEWS || 'financial-news';

// Batch accumulator for Redis all-prices update
const latestPrices = new Map();
const latestNews = [];

async function run() {
  await consumer.connect();
  console.log('[Kafka Consumer] Connected');

  await consumer.subscribe({ topics: [STOCK_TOPIC, NEWS_TOPIC], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());

      if (topic === STOCK_TOPIC) {
        // Update Redis per-symbol cache
        await redisService.setPrice(data.symbol, data);
        latestPrices.set(data.symbol, data);

        // Persist to Cassandra
        await cassandraService.savePriceTick(data);

        // Update trending based on volume
        await redisService.incrementSymbolMention(data.symbol);

        console.log(`[Kafka Consumer] Price: ${data.symbol} $${data.price}`);
      }

      if (topic === NEWS_TOPIC) {
        latestNews.unshift(data);
        if (latestNews.length > 50) latestNews.pop();
        await redisService.setNews(latestNews.slice(0, 20));
        console.log(`[Kafka Consumer] News: ${data.symbol} - ${data.headline.slice(0, 40)}...`);
      }
    },
  });

  // Flush all prices to Redis every 2 seconds
  setInterval(async () => {
    if (latestPrices.size > 0) {
      const pricesArray = Array.from(latestPrices.values());
      await redisService.setAllPrices(pricesArray);

      // Compute trending (top 5 by recent volume)
      const trending = pricesArray
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5)
        .map((p) => ({ symbol: p.symbol, name: p.name, price: p.price, volume: p.volume }));
      await redisService.setTrending(trending);
    }
  }, 2000);
}

run().catch((err) => {
  console.error('[Kafka Consumer] Fatal error:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  process.exit(0);
});
