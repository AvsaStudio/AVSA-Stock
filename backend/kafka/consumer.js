require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Kafka } = require('kafkajs');
const redis = require('../services/redisService');
const cassandra = require('../services/cassandraService');
if (!process.env.REDIS_HOST || !process.env.CASSANDRA_CONTACT_POINTS) throw new Error('Kafka consumer requires Redis and Cassandra configuration');
const kafka = new Kafka({ clientId: 'avsa-stock-consumer', brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',') });
const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'avsa-stock' });
const STOCK_TOPIC = process.env.KAFKA_TOPIC_STOCKS || 'stock-prices';
const NEWS_TOPIC = process.env.KAFKA_TOPIC_NEWS || 'financial-news';
const latestPrices = new Map();
let latestNews = [];
async function run() {
  await consumer.connect();
  latestNews = await redis.getNews({ required: true }) || [];
  for (const tick of await redis.getAllPrices({ required: true }) || []) latestPrices.set(tick.symbol, tick);
  await consumer.subscribe({ topics: [STOCK_TOPIC, NEWS_TOPIC], fromBeginning: false });
  await consumer.run({ eachMessage: async ({ topic, message }) => {
    const data = JSON.parse(message.value.toString());
    if (topic === STOCK_TOPIC) {
      // Persist before committing the Kafka offset. A retry is idempotent by symbol/timestamp.
      await cassandra.savePriceTick(data, { required: true });
      latestPrices.set(data.symbol, data);
      const cutoff = Date.now() - 15000;
      const prices = [...latestPrices.values()].filter((tick) => Date.parse(tick.timestamp) > cutoff);
      await redis.setAllPrices(prices, { required: true });
    } else if (topic === NEWS_TOPIC) {
      latestNews = [data, ...latestNews.filter((item) => item.id !== data.id)].slice(0, 30);
      await redis.setNews(latestNews, { required: true });
    }
  } });
}
run().catch((err) => { console.error('[Kafka consumer]', err); process.exitCode = 1; shutdown(); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await consumer.disconnect();
  await Promise.allSettled([redis.close(), cassandra.close()]);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
