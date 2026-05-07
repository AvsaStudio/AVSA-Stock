# Bloomberg Financial Data Pipeline Dashboard

Real-time financial analytics dashboard demonstrating a full data engineering stack: React frontend, Node.js API, Kafka streaming, Redis caching, Cassandra time-series storage, Spark stream processing, Airflow scheduling, and S3 archival.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Dashboard                           │
│  Stock Table │ Price Chart │ News Feed │ Trending │ Analytics   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                    Node.js / Express API                         │
│          /api/stocks  /api/news  /api/analytics                 │
└───┬──────────────┬───────────────┬───────────────┬─────────────┘
    │              │               │               │
    ▼              ▼               ▼               ▼
┌───────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│ Redis │    │Cassandra│    │  Kafka   │    │  S3/MinIO│
│ Cache │    │Time-ser.│    │ Streams  │    │ Archival │
└───────┘    └─────────┘    └────┬─────┘    └──────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
               ┌────▼────┐              ┌─────▼────┐
               │Producer │              │ Consumer │
               │(ticks)  │              │→Redis    │
               └─────────┘              │→Cassandra│
                                        └──────────┘
                                             │
                                        ┌────▼─────┐
                                        │  Spark   │
                                        │Streaming │
                                        │(moving   │
                                        │averages, │
                                        │ spikes)  │
                                        └──────────┘

┌────────────────────────────────────┐
│  Airflow (runs daily @ 5PM ET)     │
│  1. Generate daily report          │
│  2. Archive raw data → S3          │
│  3. Clean up Redis keys            │
│  4. Upload report → S3             │
└────────────────────────────────────┘
```

---

## Quick Start

### Phase 1: MVP (no Docker needed)
```bash
cd bloomberg-dashboard
./start.sh
```
Opens:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

### Phase 2+: Full Stack with Docker
```bash
# Start infrastructure (Kafka, Redis, Cassandra, MinIO, Airflow)
./start.sh --infra

# Start everything including Kafka streaming + Spark
./start.sh --all
```

---

## Project Structure

```
bloomberg-dashboard/
├── backend/
│   ├── server.js              # Express + WebSocket server
│   ├── dataGenerator.js       # Fake stock/news data
│   ├── routes/
│   │   ├── stocks.js          # /api/stocks
│   │   ├── news.js            # /api/news
│   │   └── analytics.js       # /api/analytics
│   ├── kafka/
│   │   ├── producer.js        # Publishes price ticks to Kafka
│   │   └── consumer.js        # Reads from Kafka → Redis + Cassandra
│   └── services/
│       ├── redisService.js    # Fast cache layer
│       ├── cassandraService.js# Time-series persistence
│       └── s3Service.js       # Raw data + report archival
│
├── frontend/
│   └── src/
│       ├── App.js             # Root layout + tab routing
│       ├── hooks/
│       │   └── useWebSocket.js# Real-time WS hook w/ REST fallback
│       └── components/
│           ├── Header.js      # Status bar + market pills
│           ├── StockTicker.js # Auto-scrolling price ticker
│           ├── StockGrid.js   # Sortable equities table
│           ├── PriceChart.js  # Recharts intraday area chart
│           ├── NewsFeed.js    # Live news + sentiment scores
│           ├── TrendingPanel.js # Trending symbols + sentiment bars
│           └── AnalyticsPanel.js # Daily report + bar chart
│
├── spark/
│   └── streaming_processor.py # PySpark: moving averages + spike alerts
│
├── airflow/
│   └── dags/
│       └── daily_pipeline.py  # Airflow DAG (5 tasks, runs at market close)
│
├── docker/
│   └── docker-compose.yml    # Full infra: Kafka, Redis, Cassandra, MinIO, Airflow
│
└── start.sh                   # One-command startup script
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stocks/latest` | All current prices |
| GET | `/api/stocks/trending` | Top 5 by volume |
| GET | `/api/stocks/:symbol` | Single symbol |
| GET | `/api/stocks/:symbol/history` | Price history |
| GET | `/api/news` | Latest financial news |
| GET | `/api/news/:symbol` | News by symbol |
| GET | `/api/analytics/summary` | Market summary |
| GET | `/api/analytics/sentiment` | Sentiment by symbol |
| GET | `/api/analytics/daily` | Daily report |
| WS  | `ws://localhost:4000/ws` | Real-time updates |

---

## Infrastructure Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Kafka UI | http://localhost:8080 | — |
| Redis Commander | http://localhost:8081 | — |
| Airflow | http://localhost:8082 | admin / admin |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Recharts, WebSocket |
| Backend | Node.js, Express, WebSocket (ws) |
| Streaming | Apache Kafka (KafkaJS) |
| Cache | Redis 7 |
| Database | Apache Cassandra 4 |
| Processing | Apache Spark (PySpark Structured Streaming) |
| Scheduling | Apache Airflow 2 |
| Storage | AWS S3 / MinIO |
| Infra | Docker Compose |

---

## Resume Bullet

> Built a real-time financial data pipeline and analytics dashboard using React, Node.js, Kafka, Redis, Cassandra, Spark, Airflow, and AWS S3-compatible storage to stream, process, cache, store, and visualize high-volume market data.
