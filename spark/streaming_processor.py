"""Windowed Kafka analytics with durable checkpoints and finalized, ordered windows."""
import json
import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, window, avg, count, max as spark_max, min as spark_min, sum as spark_sum, to_timestamp
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType

SCHEMA = StructType([StructField('symbol', StringType()), StructField('price', DoubleType()),
                     StructField('volume', LongType()), StructField('timestamp', StringType())])
# Atomically keep only the latest finalized window, including across replay/restarts.
STORE_LATEST = """
local old = redis.call('GET', KEYS[1])
if old and cjson.decode(old).window_end >= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
"""


def redis_client():
    import redis
    return redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=int(os.getenv('REDIS_PORT', '6379')),
                       password=os.getenv('REDIS_PASSWORD') or None, decode_responses=True,
                       socket_connect_timeout=5, socket_timeout=5)


def write_averages(batch, batch_id):
    with redis_client() as client:
        for row in batch.orderBy('window.end').collect():
            value = dict(symbol=row.symbol, avg_price=row.avg_price, max_price=row.max_price,
                         min_price=row.min_price, tick_count=row.tick_count,
                         window_start=row.window.start.isoformat(), window_end=row.window.end.isoformat())
            updated = client.eval(STORE_LATEST, 1, f'ma5:{row.symbol}', value['window_end'], json.dumps(value), 600)
            movement = (row.max_price - row.min_price) / row.min_price * 100 if row.min_price > 0 else 0
            if updated and movement > 2:
                alert = dict(symbol=row.symbol, alert=f'{row.symbol} moved {movement:.2f}% in a finalized 5-minute window', timestamp=value['window_end'])
                client.lpush('alerts:price_spike', json.dumps(alert))
                client.ltrim('alerts:price_spike', 0, 49)


def write_activity(batch, batch_id):
    rows = batch.collect()
    if not rows:
        return
    newest = max(row.window.end for row in rows)
    top = sorted((row for row in rows if row.window.end == newest), key=lambda row: row.total_volume, reverse=True)[:5]
    value = dict(window_end=newest.isoformat(), symbols=[dict(symbol=row.symbol, total_volume=row.total_volume) for row in top])
    with redis_client() as client:
        client.eval(STORE_LATEST, 1, 'active:symbols', value['window_end'], json.dumps(value), 180)


def main():
    spark = SparkSession.builder.appName('AVSAStockStreamProcessor').config('spark.sql.shuffle.partitions', '4').config('spark.sql.session.timeZone', 'UTC').getOrCreate()
    spark.sparkContext.setLogLevel('WARN')
    raw = spark.readStream.format('kafka').option('kafka.bootstrap.servers', os.getenv('KAFKA_BROKERS', 'localhost:9092')).option('subscribe', os.getenv('KAFKA_TOPIC_STOCKS', 'stock-prices')).option('startingOffsets', 'latest').load()
    ticks = raw.select(from_json(col('value').cast('string'), SCHEMA).alias('tick')).select('tick.*').withColumn('event_time', to_timestamp('timestamp')).withWatermark('event_time', '30 seconds')
    averages = ticks.groupBy(window('event_time', '5 minutes', '1 minute'), 'symbol').agg(avg('price').alias('avg_price'), spark_max('price').alias('max_price'), spark_min('price').alias('min_price'), count('*').alias('tick_count'))
    activity = ticks.groupBy(window('event_time', '1 minute'), 'symbol').agg(spark_sum('volume').alias('total_volume'))
    checkpoint = os.getenv('SPARK_CHECKPOINT_DIR', '/state/checkpoints')
    for name, frame, writer in [('averages', averages, write_averages), ('activity', activity, write_activity)]:
        frame.writeStream.outputMode('append').option('checkpointLocation', f'{checkpoint}/{name}').foreachBatch(writer).trigger(processingTime='10 seconds').start()
    spark.streams.awaitAnyTermination()


if __name__ == '__main__':
    main()
