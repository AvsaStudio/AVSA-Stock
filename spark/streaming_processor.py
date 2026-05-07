"""
Spark Structured Streaming Processor
Reads stock events from Kafka, computes moving averages,
detects price spikes, and writes results to Redis/Cassandra.

Requirements:
  pip install pyspark redis cassandra-driver
  Kafka brokers must be running

Run:
  spark-submit \
    --packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0 \
    spark/streaming_processor.py
"""

import os
import json
from datetime import datetime

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, from_json, window, avg, count, max as spark_max, min as spark_min,
    abs as spark_abs, lit, current_timestamp, expr
)
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, LongType, TimestampType
)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC_STOCKS", "stock-prices")
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
CASSANDRA_HOST = os.getenv("CASSANDRA_CONTACT_POINTS", "localhost")

# Schema for Kafka stock tick messages
STOCK_SCHEMA = StructType([
    StructField("symbol", StringType()),
    StructField("name", StringType()),
    StructField("price", DoubleType()),
    StructField("change", DoubleType()),
    StructField("changePct", DoubleType()),
    StructField("volume", LongType()),
    StructField("timestamp", StringType()),
])


def create_spark_session():
    return (
        SparkSession.builder
        .appName("BloombergStreamProcessor")
        .config("spark.sql.shuffle.partitions", "4")
        .config("spark.cassandra.connection.host", CASSANDRA_HOST)
        .getOrCreate()
    )


def write_moving_averages_to_redis(batch_df, batch_id):
    """Write 5-minute moving averages to Redis for each symbol."""
    try:
        import redis
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

        rows = batch_df.collect()
        for row in rows:
            key = f"ma5:{row['symbol']}"
            value = json.dumps({
                "symbol": row["symbol"],
                "avg_price": row["avg_price"],
                "max_price": row["max_price"],
                "min_price": row["min_price"],
                "tick_count": row["tick_count"],
                "window_start": str(row["window_start"]),
                "window_end": str(row["window_end"]),
            })
            r.set(key, value, ex=600)  # 10 min TTL

            # Alert if price moved more than 2%
            price_range = row["max_price"] - row["min_price"]
            price_move_pct = (price_range / row["min_price"]) * 100 if row["min_price"] > 0 else 0
            if price_move_pct > 2.0:
                alert = json.dumps({
                    "symbol": row["symbol"],
                    "alert": f"{row['symbol']} moved {price_move_pct:.2f}% in the last 5 minutes",
                    "high": row["max_price"],
                    "low": row["min_price"],
                    "timestamp": datetime.utcnow().isoformat(),
                })
                r.lpush("alerts:price_spike", alert)
                r.ltrim("alerts:price_spike", 0, 49)  # keep last 50

        print(f"[Spark Batch {batch_id}] Wrote {len(rows)} moving averages to Redis")
    except Exception as e:
        print(f"[Spark] Redis write error: {e}")


def write_activity_to_redis(batch_df, batch_id):
    """Write most active symbols by volume to Redis."""
    try:
        import redis
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

        rows = batch_df.orderBy(col("total_volume").desc()).limit(5).collect()
        active = [{"symbol": r_["symbol"], "total_volume": r_["total_volume"]} for r_ in rows]
        r.set("active:symbols", json.dumps(active), ex=60)
        print(f"[Spark Batch {batch_id}] Updated most active symbols")
    except Exception as e:
        print(f"[Spark] Active symbols write error: {e}")


def main():
    spark = create_spark_session()
    spark.sparkContext.setLogLevel("WARN")

    # Read from Kafka
    raw_stream = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BROKERS)
        .option("subscribe", KAFKA_TOPIC)
        .option("startingOffsets", "latest")
        .option("maxOffsetsPerTrigger", 1000)
        .load()
    )

    # Parse JSON messages
    parsed = (
        raw_stream
        .select(from_json(col("value").cast("string"), STOCK_SCHEMA).alias("data"))
        .select("data.*")
        .withColumn("event_time", expr("to_timestamp(timestamp)"))
    )

    # --- Query 1: 5-minute windowed moving averages ---
    moving_avg = (
        parsed
        .withWatermark("event_time", "1 minute")
        .groupBy(
            window(col("event_time"), "5 minutes", "1 minute"),
            col("symbol"),
        )
        .agg(
            avg("price").alias("avg_price"),
            spark_max("price").alias("max_price"),
            spark_min("price").alias("min_price"),
            count("*").alias("tick_count"),
        )
        .select(
            col("symbol"),
            col("avg_price"),
            col("max_price"),
            col("min_price"),
            col("tick_count"),
            col("window.start").alias("window_start"),
            col("window.end").alias("window_end"),
        )
    )

    ma_query = (
        moving_avg.writeStream
        .outputMode("update")
        .foreachBatch(write_moving_averages_to_redis)
        .trigger(processingTime="10 seconds")
        .start()
    )

    # --- Query 2: Most active symbols by volume (1-minute window) ---
    active_symbols = (
        parsed
        .withWatermark("event_time", "30 seconds")
        .groupBy(
            window(col("event_time"), "1 minute"),
            col("symbol"),
        )
        .agg(col("volume").cast(LongType()).alias("total_volume"))
        .select("symbol", "total_volume")
    )

    active_query = (
        active_symbols.writeStream
        .outputMode("update")
        .foreachBatch(write_activity_to_redis)
        .trigger(processingTime="30 seconds")
        .start()
    )

    print("[Spark] Streaming queries started. Waiting for data...")
    spark.streams.awaitAnyTermination()


if __name__ == "__main__":
    main()
