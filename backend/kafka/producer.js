/**
 * Kafka Producer
 * Streams fake stock price updates to the stock-prices topic
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Kafka, Partitioners } = require('kafkajs');
const { generateAllPrices, generateNews } = require('../dataGenerator');

const kafka = new Kafka({
  clientId: 'avsa-stock-producer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
});

const STOCK_TOPIC = process.env.KAFKA_TOPIC_STOCKS || 'stock-prices';
const NEWS_TOPIC = process.env.KAFKA_TOPIC_NEWS || 'financial-news';
const TICK_INTERVAL_MS = 1000; // 1 second
const NEWS_INTERVAL_MS = 30000; // 30 seconds

const timers = [];

async function run() {
  await producer.connect();
  console.log('[Kafka Producer] Connected');

  // Stream stock ticks every second
  timers.push(setInterval(async () => {
    const prices = generateAllPrices();
    const messages = prices.map((tick) => ({
      key: tick.symbol,
      value: JSON.stringify(tick),
    }));

    try {
      await producer.send({
        topic: STOCK_TOPIC,
        messages,
      });
      console.log(`[Kafka Producer] Sent ${messages.length} price ticks`);
    } catch (err) {
      console.error('[Kafka Producer] Send error:', err.message);
    }
  }, TICK_INTERVAL_MS));

  // Stream news every 30 seconds
  timers.push(setInterval(async () => {
    const news = generateNews(3);
    const messages = news.map((item) => ({
      key: item.symbol,
      value: JSON.stringify(item),
    }));

    try {
      await producer.send({
        topic: NEWS_TOPIC,
        messages,
      });
      console.log(`[Kafka Producer] Sent ${messages.length} news items`);
    } catch (err) {
      console.error('[Kafka Producer] News send error:', err.message);
    }
  }, NEWS_INTERVAL_MS));
}

run().catch((err) => {
  console.error('[Kafka Producer] Fatal error:', err);
  process.exit(1);
});

async function shutdown() {
  timers.forEach(clearInterval);
  await producer.disconnect();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
