FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless procps \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY streaming_processor.py .
CMD ["spark-submit", "--master", "local[2]", "--packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0", "streaming_processor.py"]
