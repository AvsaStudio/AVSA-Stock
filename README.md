# AVSA Stock

AVSA Stock is a stock dashboard and data-engineering project. It combines a React interface, a Node.js/Express API, WebSocket updates, an optional Alpaca market-data adapter, and a separate Python-based streaming and reporting pipeline.

The dashboard displays stock prices, recent price history, headlines, trending symbols, and analytics. The project demonstrates how an application can serve current data quickly while using separate services for historical storage, stream processing, and scheduled reports. It does not place trades.

**Current status:** the local demo, automated application tests, and frontend build have passed verification. The Alpaca adapter needs account credentials for a live connection test. The complete Docker pipeline has configuration and syntax checks, but has not been run end to end in this workspace. See [verification details](docs/REVIEW.md).

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Run locally](#run-locally)
- [Three operating modes](#three-operating-modes)
- [Application architecture](#application-architecture)
- [Streaming pipeline architecture](#streaming-pipeline-architecture)
- [Scheduled reporting architecture](#scheduled-reporting-architecture)
- [Repository working tree](#repository-working-tree)
- [Code responsibilities](#code-responsibilities)
- [Data structures and storage](#data-structures-and-storage)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Running the infrastructure](#running-the-infrastructure)
- [Testing and verification](#testing-and-verification)
- [Deployment structure](#deployment-structure)
- [Troubleshooting](#troubleshooting)
- [Current boundaries](#current-boundaries)

## Features

- **Stock table and ticker:** ten configured US stock symbols, price changes, volume, and selectable rows.
- **Price history:** selecting a symbol loads a chart; subsequent snapshots add new price points.
- **News feed:** generated headlines in simulated modes, or provider headlines in Alpaca mode.
- **Trending symbols:** the five symbols with the highest reported volume in the current snapshot.
- **Market summary:** gainers, losers, unchanged symbols, average price, and total reported volume.
- **Analytics reports:** recent ticks, the provider's latest session, or a stored-day pipeline report. Each response identifies its scope.
- **Connection recovery:** WebSocket updates with REST polling when the socket disconnects.
- **Responsive interface:** columns stack on smaller screens; the equities table scrolls inside its container.
- **Pipeline analytics:** in Kafka mode, an additional panel displays finalized Spark moving averages and price alerts.

The configured symbols are `AAPL`, `TSLA`, `MSFT`, `GOOGL`, `AMZN`, `META`, `NVDA`, `JPM`, `GS`, and `BAC`.

## Technology stack

| Layer | Technology | Role in this project |
| --- | --- | --- |
| Interface | React 18, Recharts, CSS | Components, charts, and responsive layout |
| Application server | Node.js 22, Express | REST endpoints, validation, and orchestration |
| Live browser connection | `ws`, browser WebSocket API | Push snapshots over the same HTTP server |
| External market data | Alpaca REST API | IEX snapshots, historical bars, and headlines |
| Event transport | Kafka, KafkaJS, ZooKeeper | Carry simulated tick and news events between processes |
| Current pipeline state | Redis | Latest prices, news, and Spark outputs |
| Historical pipeline storage | Cassandra | Store ticks by symbol and New York calendar day |
| Stream processing | Python, PySpark | Windowed price statistics, activity, and alerts |
| Scheduled workflows | Python, Airflow | Aggregate stored ticks and publish reports |
| Workflow metadata | PostgreSQL | Airflow's internal database; not the stock-history store |
| Object storage | MinIO, S3 APIs | Archive snapshots and daily report JSON |
| Local infrastructure | Docker Compose | Define service containers, networks, and volumes |
| Tests | Node test runner, Jest via React Scripts | Backend and frontend regression checks |
| Hosting configuration | Render blueprint | Separate API and static frontend services |

The web backend is Express. Python is used in Spark and Airflow; this repository does not currently implement a FastAPI backend.

## Run locally

Use **Node.js 22** and npm. Run commands from the repository root: the folder containing `README.md`, `start.sh`, `backend/`, and `frontend/`.

For the existing local checkout:

```bash
cd ~/Documents/GitHub/AVSA-Stock/avsa-stock
git status
./start.sh
```

Open **http://localhost:3000**. The API defaults to **http://localhost:4000**.

The launch script installs dependencies if an application's `node_modules/` directory is missing, creates `backend/.env` from the example if necessary, and starts the backend and frontend. On a fresh setup, the default mode is `demo`, which needs no Docker or provider account. If `.env` already exists, its selected mode is preserved.

For a manual start, use separate terminals:

```bash
# Terminal 1, from the repository root
npm --prefix backend ci
cd backend
# Create .env from .env.example only if it does not already exist.
npm start
```

```bash
# Terminal 2, from the repository root
npm --prefix frontend ci
npm --prefix frontend start
```

The two applications have separate package manifests and lockfiles because they have different dependencies and build steps.

## Three operating modes

`DATA_MODE` selects the backend's data source at startup. Restart the backend after changing it.

| Mode | Price source | History source | Required services | Report behavior |
| --- | --- | --- | --- | --- |
| `demo` | In-process generator | In-process tick history | Backend and frontend only | Recent retained ticks |
| `alpaca` | Alpaca IEX adapter | Provider one-minute bars | Backend credentials and internet access | Provider's latest daily bars |
| `kafka` | Consumer-written Redis cache | Cassandra | Running Kafka producer/consumer, Redis, Cassandra | Latest archived report when available; otherwise recent stored ticks |

MinIO and Airflow add archived reports to Kafka mode. Spark adds streaming analytics. These services are included in the full-stack launch, but are not necessary for the simple demo.

**The Alpaca adapter currently connects directly to the API. Its live data does not flow through Kafka, Spark, Cassandra, or Airflow.** The Kafka producer is a separate simulated data source.

To configure real data, follow [Market data setup](docs/MARKET_DATA_SETUP.md). Credentials belong only in `backend/.env` or backend hosting secrets. The adapter explicitly requests IEX, and the interface identifies its single-exchange coverage.

## Application architecture

```text
Browser: React dashboard                         localhost:3000
  |
  | HTTP GET /api/...           WebSocket /ws
  | request/response           pushed snapshots
  v                            ^
Node.js HTTP server + Express + WebSocket         localhost:4000
  |
  +-- Routes: stocks, news, analytics, snapshot
  |      |
  |      v
  |   marketService: chooses one mode
  |      |
  |      +-- demo   --> dataGenerator --> in-process state
  |      |
  |      +-- alpaca --> alpacaService --> Alpaca data API
  |      |
  |      +-- kafka  --> redisService --> current pipeline prices/news
  |                --> cassandraService --> stored tick history
  |
  +-- Analytics route --> s3Service --> archived report (Kafka mode)
  |
  +-- Analytics route --> redisService --> Spark results (Kafka mode)
```

### What happens when the dashboard opens

1. `App.js` mounts the dashboard and calls `useWebSocket()`.
2. The hook immediately requests `/api/snapshot` and opens `/ws`.
3. The backend calls `marketService.snapshot()`, which reads the selected source and returns prices, news, a summary, and source metadata.
4. The server sends a snapshot when a socket connects and attempts broadcasts every second while clients are connected. It avoids overlapping broadcast operations.
5. React updates the stock table, ticker, header, and news feed from the snapshot. Separate resource requests populate trending and report panels.
6. After a valid WebSocket snapshot arrives, the hook stops REST polling. On disconnect it resumes polling every three seconds and attempts reconnection after five seconds.

A one-second browser broadcast does **not** mean the provider is queried every second. Demo prices refresh at most once per second when requested; Alpaca snapshots are cached for 15 seconds, and provider news is cached for 60 seconds.

### Why use a shared market service?

[marketService.js](backend/services/marketService.js) centralizes source selection so routes and WebSocket clients do not each invent their own data stream. In demo mode, requests within the same update interval reuse the same prices. In Kafka mode, the API reads consumer-owned data instead of generating replacement ticks.

The routes remain small: they validate the request, call the relevant service, and return a response. Service modules handle provider communication, caching, and database access. [analytics.js](backend/lib/analytics.js) contains reusable summary and sentiment calculations.

### Failure behavior

- A missing or stale Kafka price cache produces an unavailable response, rather than fabricated prices.
- Expected service failures use HTTP `503`; unexpected server errors use `500`.
- The WebSocket sends a `feed_error` message when it cannot obtain data. The browser can retain the last prices while displaying the error.
- A valid socket connection indicates transport connectivity, not proof that every upstream service is healthy.
- The `/health` endpoint is an API liveness check with service connection state. It does not actively test the complete pipeline.

## Streaming pipeline architecture

The following path is implemented for **simulated Kafka mode**. Full runtime integration still needs verification with Docker running.

```text
Node.js producer: backend/kafka/producer.js
  | generated prices every second; generated news every 30 seconds
  v
Kafka topics: stock-prices, financial-news
  |
  +-------------------------------+
  |                               |
  v                               v
Node.js consumer                 Python / Spark Structured Streaming
  |                               | reads stock-prices
  +--> Cassandra                  +--> five-minute price windows
  |    historical ticks           +--> one-minute activity windows
  |                               +--> price-movement alerts
  +--> Redis                      |
       prices:all                 +--> Redis analytics keys
       news:latest                +--> persistent checkpoint volume
          |                             |
          +--------------+--------------+
                         |
                         v
                    Express API
                         |
                         v
                    React dashboard
```

### Responsibilities and order of work

**Producer:** generates JSON events and sends them to Kafka, using the stock symbol as the message key. This is a separate Node process from the API server.

**Kafka:** separates event production from downstream processing. Both the Node consumer and Spark read the stream for different purposes. ZooKeeper is part of the current Kafka container configuration.

**Node consumer:** for a price event, first awaits the Cassandra write, then updates its latest-price map and writes the current set to Redis. For a news event, it deduplicates articles by ID and updates the news cache. Required write failures are allowed to propagate instead of being treated as success.

**Cassandra:** retains historical ticks. A repeated insert with the same symbol, day bucket, and timestamp targets the same row. This helps with retried events; the project does not claim an exactly-once guarantee across Cassandra and Redis together.

**Redis:** provides quick access to the latest consumer state so dashboard requests do not scan historical rows. The consumer filters old ticks, cache entries expire, and the market service checks freshness.

**Spark:** independently computes statistics using event timestamps. It uses five-minute windows sliding every minute for price averages and one-minute windows for activity. A 30-second watermark provides a lateness allowance; append-mode output emits finalized windows after event time advances far enough.

Spark stores checkpoint state in a Docker volume. Redis updates compare window end times so an older result cannot replace a newer finalized result. The API exposes averages, activity, and alerts; the current pipeline panel renders averages and alerts.

## Scheduled reporting architecture

Airflow handles work that should happen on a schedule instead of on every browser request.

```text
Airflow scheduler: weekdays at 5 PM America/New_York
  |
  v
Generate report from Cassandra's stored ticks
  |
  +--> Archive Redis price snapshot to MinIO
  |
  +--> Trim Redis alert list
  |
  | both downstream tasks must succeed
  v
Upload report to MinIO / S3
  +-- daily-reports/<date>/report.json
  +-- daily-reports/latest.json
            |
            v
API: GET /api/analytics/daily (Kafka mode)
            |
            v
React: AnalyticsPanel
```

The task dependency is `report -> [archive, cleanup] -> publish`. The archive and cleanup tasks may run in parallel after report generation. Airflow passes the generated report between tasks through its XCom mechanism.

The report task iterates Cassandra result pages and calculates open, close, high, low, volume, and tick count for each symbol. Its day bucket uses New York time. A stored-day report summarizes the ticks collected by this project; it is not a guarantee of complete market-day coverage.

The DAG has two retries with a five-minute delay, disables automatic historical catch-up, and permits one active run at a time. Missing stored ticks or failed uploads cause task failure instead of generating a random replacement report.

Airflow runs as separate initialization, scheduler, and webserver services. PostgreSQL stores Airflow's metadata, while MinIO stores the report objects. MinIO offers an S3-compatible local storage endpoint.

## Repository working tree

This is the source layout. Generated directories such as `node_modules/`, `frontend/build/`, and private `.env` files are omitted. `.git/` belongs at this repository root, inside `avsa-stock/`, not necessarily in the outer `AVSA-Stock/` folder.

```text
avsa-stock/
├── .gitignore
├── README.md
├── start.sh                          # Local launcher and process cleanup
├── render.yaml                       # API + static frontend hosting blueprint
│
├── backend/
│   ├── .env.example                  # Backend settings; no real credentials
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js                     # One HTTP server, routes, WebSocket lifecycle
│   ├── dataGenerator.js              # Simulated ticks, headlines, retained history
│   ├── lib/
│   │   └── analytics.js              # Summary and sentiment calculations
│   ├── routes/
│   │   ├── stocks.js                 # Stock reads and history validation
│   │   ├── news.js                   # News reads and symbol filtering
│   │   └── analytics.js              # Summary, sentiment, reports, Spark results
│   ├── services/
│   │   ├── marketService.js          # Shared data-source selection
│   │   ├── alpacaService.js          # Provider requests, cache, response mapping
│   │   ├── redisService.js           # Current state and stream analytics access
│   │   ├── cassandraService.js       # Schema initialization and history storage
│   │   └── s3Service.js              # Read the latest archived daily report
│   ├── kafka/
│   │   ├── producer.js               # Publish simulated tick/news events
│   │   └── consumer.js               # Persist events and update current state
│   ├── scripts/
│   │   └── check-provider.js         # Verify Alpaca without printing credentials
│   └── test/
│       ├── smoke.test.js             # HTTP, WebSocket, validation checks
│       └── market.test.js            # Data-mode and provider fixture tests
│
├── frontend/
│   ├── .env.example                  # Public API URL; never provider secrets
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   │   └── index.html                # Browser document and page title
│   └── src/
│       ├── index.js                  # React entry point
│       ├── App.js                    # Tabs, selected symbol, dashboard composition
│       ├── config.js                 # API and WebSocket URLs
│       ├── api.js                    # Shared JSON request/error handling
│       ├── styles.css                # Responsive layout and common styles
│       ├── setupTests.js             # React test environment setup
│       ├── hooks/
│       │   ├── useWebSocket.js       # Snapshot state, polling, reconnection
│       │   ├── useWebSocket.test.js  # Connection lifecycle regression tests
│       │   └── useResource.js        # Panel requests, retry, periodic refresh
│       └── components/
│           ├── Header.js             # Source label, connection state, market summary
│           ├── StockTicker.js        # Scrolling prices
│           ├── StockGrid.js          # Selectable equities table
│           ├── PriceChart.js         # Historical points and incoming ticks
│           ├── NewsFeed.js           # Headlines and available sentiment scores
│           ├── TrendingPanel.js      # Volume ranking and demo sentiment
│           ├── AnalyticsPanel.js     # Scoped report and change chart
│           └── StreamPanel.js        # Kafka-mode averages and alerts
│
├── docker/
│   └── docker-compose.yml            # Infrastructure, dependencies, ports, volumes
├── airflow/
│   ├── Dockerfile                    # Custom Airflow dependency image
│   ├── requirements.txt
│   └── dags/
│       └── daily_pipeline.py         # Scheduled reporting workflow
├── spark/
│   ├── Dockerfile                    # Java/Python/Spark runtime image
│   ├── requirements.txt
│   └── streaming_processor.py        # Windowed calculations and checkpoint setup
└── docs/
    ├── MARKET_DATA_SETUP.md          # Provider account and activation steps
    └── REVIEW.md                     # Completed checks and remaining verification
```

## Code responsibilities

A useful reading order is:

1. **[App.js](frontend/src/App.js):** see which panels the user interacts with and where selected-symbol state lives.
2. **[useWebSocket.js](frontend/src/hooks/useWebSocket.js):** follow how data arrives and how the interface recovers from a disconnection.
3. **[server.js](backend/server.js):** see where HTTP and WebSocket traffic enter the backend.
4. **[marketService.js](backend/services/marketService.js):** understand the three source modes and the shared snapshot contract.
5. **[stocks.js](backend/routes/stocks.js):** follow one request from validation to the service response.
6. **[alpacaService.js](backend/services/alpacaService.js):** inspect authenticated provider requests, caching, and failure handling.
7. **[consumer.js](backend/kafka/consumer.js):** follow a pipeline event into storage.
8. **[streaming_processor.py](spark/streaming_processor.py) and [daily_pipeline.py](airflow/dags/daily_pipeline.py):** compare continuous window processing with scheduled reporting.
9. **[Backend tests](backend/test/) and [frontend tests](frontend/src/hooks/useWebSocket.test.js):** inspect executable examples of expected behavior.

For example, selecting AAPL follows this path:

```text
StockGrid button
  -> App selectedSymbol state
  -> PriceChart requests /api/stocks/AAPL/history?limit=50
  -> stocks route validates symbol and limit
  -> marketService.history chooses generator, provider, or Cassandra
  -> chronological points return to PriceChart
  -> subsequent snapshots add new ticks
```

The chart cancels old requests when the selected symbol changes, reducing the chance that a slower response for the previous symbol replaces the current chart.

## Data structures and storage

### Snapshot contract

`GET /api/snapshot` returns `{ "success": true, "data": <snapshot> }`. The WebSocket sends the snapshot fields directly with `type: "snapshot"`.

Illustrative snapshot with one symbol, shortened for readability:

```json
{
  "prices": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "price": 187.45,
      "change": 0.23,
      "changePct": 0.12,
      "volume": 900000,
      "timestamp": "2026-09-25T15:00:00.000Z"
    }
  ],
  "news": [],
  "summary": {
    "totalSymbolsTracked": 1,
    "gainers": 1,
    "losers": 0,
    "unchanged": 0
  },
  "source": "demo",
  "simulated": true,
  "timestamp": "2026-09-25T15:00:00.000Z"
}
```

`source` identifies `demo`, `kafka`, or `alpaca-iex`. A snapshot timestamp records when the response was assembled; each price has its own data timestamp. In Alpaca mode, a recent response can contain the last trade from an earlier session.

### Storage ownership

| Store or key | Writer | Reader | Retention / purpose |
| --- | --- | --- | --- |
| Demo process memory | Generator and market service | Demo API | Last 100 ticks per symbol; lost when the process restarts |
| Alpaca request cache | Provider adapter | Provider adapter | Snapshots 15 seconds; news/history 60 seconds; per API process |
| Kafka topics | Producer | Consumer and Spark | Event transport; Compose config requests 24-hour log retention |
| Redis `prices:all` | Kafka consumer | Kafka-mode API, Airflow | Current prices, 15-second expiry |
| Redis `news:latest` | Kafka consumer | Kafka-mode API | Latest headlines, 120-second expiry |
| Redis `ma5:<symbol>` | Spark | Stream analytics API | Latest finalized average, 600-second expiry |
| Redis `active:symbols` | Spark | Stream analytics API | Latest finalized activity window, 180-second expiry |
| Redis `alerts:price_spike` | Spark; trimmed by Airflow | Stream analytics API | Bounded alert list; API reads up to 20 entries |
| Cassandra `stock_prices` | Kafka consumer | History API, Airflow | Tick history with a 30-day default row TTL |
| MinIO report objects | Airflow | Daily report API | Dated report and latest-report pointer |
| PostgreSQL | Airflow services | Airflow services | Scheduling and task metadata |
| Spark checkpoint volume | Spark | Spark after restart | Stream progress and state |

Cassandra's primary key is `((symbol, bucket), ts)`. The pair `(symbol, bucket)` groups one symbol's ticks for a New York calendar day; `ts` orders rows newest first. The history service reverses query results before returning them to the chart. The current history endpoint reads today's bucket only.

### Interpreting analytics

- Demo and Kafka price changes describe movement between generated ticks. Alpaca price changes compare the latest price with the provider's previous daily close.
- Simulated volume is generated per tick; Alpaca volume comes from its daily bar. These are different measures and should not be treated as interchangeable market-wide figures.
- Header market direction is based on gainers versus losers. News sentiment is a separate calculation from article scores.
- Demo article scores are generated. Alpaca headlines are marked unrated, and the live sentiment panel is not populated with invented scores.
- `scope: recent` means a bounded retained-history window; `latest-session` means provider daily bars; `stored-day` means the ticks stored by the pipeline for that day.

## API reference

All listed HTTP endpoints use `GET`. Most successful responses wrap their result in `{ "success": true, "data": ... }`; `/health` returns its own status object.

| Endpoint | Purpose |
| --- | --- |
| `/health` | API liveness, selected mode, and service connection state |
| `/api/snapshot` | Prices, headlines, summary, and source metadata together |
| `/api/stocks/latest` | Latest prices with source metadata |
| `/api/stocks/trending` | Top five by reported volume |
| `/api/stocks/:symbol` | Current symbol price |
| `/api/stocks/:symbol/history?limit=50` | Chronological history; positive integer limit capped at 200 |
| `/api/news` | Current headlines |
| `/api/news/:symbol` | Current headlines filtered to a supported symbol |
| `/api/analytics/summary` | Current market summary |
| `/api/analytics/sentiment` | Simulated article sentiment, or unavailable for Alpaca mode |
| `/api/analytics/daily` | Report with explicit scope and date |
| `/api/analytics/stream` | Finalized averages, activity, alerts, and availability |
| `/ws` | WebSocket endpoint: `snapshot` and `feed_error` messages |

Examples, with the backend running:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/snapshot
curl 'http://localhost:4000/api/stocks/AAPL/history?limit=50'
```

Invalid history limits return `400`; unsupported symbols and unknown routes return `404`. A supported symbol with no available pipeline price returns `503`.

## Configuration

Use [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example) as templates. Actual `.env` files are ignored by Git.

| Setting | Location | Purpose |
| --- | --- | --- |
| `DATA_MODE` | Backend | `demo`, `alpaca`, or `kafka`; defaults to `demo` |
| `PORT` | Backend | API port; defaults to `4000` |
| `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` | Backend only | Provider authentication |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Backend / pipeline | Current-state cache connection |
| `CASSANDRA_CONTACT_POINTS`, `CASSANDRA_KEYSPACE` | Backend / pipeline | Historical storage connection and namespace |
| `KAFKA_BROKERS` | Producer / consumer / Spark | Kafka broker addresses |
| `KAFKA_TOPIC_STOCKS`, `KAFKA_TOPIC_NEWS` | Kafka workers | Topic names; stock topic is also used by Spark |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Backend / Airflow | Report storage access |
| `SPARK_CHECKPOINT_DIR` | Spark | Persistent stream-state directory |
| `REACT_APP_API_URL` | Frontend | Public backend origin; defaults to `http://localhost:4000` |
| `REACT_APP_WS_URL` | Frontend | Optional socket URL; otherwise derived from the API origin |
| `SERVE_FRONTEND` | Backend | Set to `true` to serve the built frontend from Express |

Frontend environment variables are included in the compiled browser bundle. Provider credentials must never use a `REACT_APP_` prefix. Changing a frontend URL in a hosted build requires rebuilding the frontend.

## Running the infrastructure

With Docker running, from the repository root:

```bash
# Start infrastructure and the app without overriding the selected data mode
./start.sh --infra

# Or start the complete simulated pipeline and force DATA_MODE=kafka
./start.sh --all
```

`--all` waits for Kafka, Redis, and Cassandra health checks, starts Spark using the `streaming` Compose profile, and launches the producer, consumer, API, and frontend. First-time builds need network access and can take several minutes.

The frontend, backend, producer, and consumer run as local Node processes. Infrastructure and Python processing run in containers. Host-side Kafka clients use `localhost:9092`; container clients use `kafka:29092`. Separate advertised addresses let each client reach Kafka from its own network.

| Service | Local URL | Development login |
| --- | --- | --- |
| Kafka UI | http://localhost:8080 | — |
| Redis UI | http://localhost:8081 | — |
| Airflow | http://localhost:8082 | admin / admin |
| MinIO | http://localhost:9001 | minioadmin / minioadmin |

These are local development configurations. Inspect service state and logs with:

```bash
docker compose -f docker/docker-compose.yml --profile streaming ps
docker compose -f docker/docker-compose.yml logs --tail=100 kafka redis cassandra
docker compose -f docker/docker-compose.yml logs --tail=100 airflow-scheduler spark
```

Ctrl+C stops the Node app processes started by `start.sh`. Docker services remain running. Stop them with:

```bash
docker compose -f docker/docker-compose.yml --profile streaming down
```

This command leaves named data volumes intact. Compose defines volumes for Kafka, ZooKeeper, Redis, Cassandra, MinIO, PostgreSQL, Airflow logs, and Spark checkpoints.

## Testing and verification

```bash
# Backend regression tests, including a temporary local HTTP/WebSocket server
npm --prefix backend test

# Frontend connection lifecycle tests
CI=true npm --prefix frontend test -- --watchAll=false --runInBand

# Production frontend build
CI=true npm --prefix frontend run build

# Shell syntax and Compose configuration
bash -n start.sh
docker compose -f docker/docker-compose.yml --profile streaming config --quiet

# Live provider check, after entering backend credentials
npm --prefix backend run check:provider
```

| Test file | Main coverage |
| --- | --- |
| [smoke.test.js](backend/test/smoke.test.js) | REST routes, bad limits, unknown symbols, WebSocket snapshots, report consistency |
| [market.test.js](backend/test/market.test.js) | Shared demo ticks, pipeline data ownership, unavailable/stale feeds, Alpaca caching and failures |
| [useWebSocket.test.js](frontend/src/hooks/useWebSocket.test.js) | Snapshot replacement, feed errors, polling, reconnection, cleanup on unmount |

The last verification recorded seven backend tests and two frontend tests passing, a successful production build, and browser checks for navigation and mobile overflow. Provider tests use fixtures, and pipeline service behavior is tested with substitutes; these checks do not establish a working live Alpaca account or a running Docker stack. See [REVIEW.md](docs/REVIEW.md) for the verification boundaries.

## Deployment structure

[render.yaml](render.yaml) describes two services:

```text
Render static frontend                 Render Node API
  frontend/build/  -- HTTPS + WSS -->     backend/server.js
  built from frontend/                   started from backend/
```

Set `REACT_APP_API_URL` to the deployed HTTPS API origin and rebuild the frontend. The socket URL derives from the same origin unless explicitly overridden. Set data-mode credentials in the backend service's environment.

The Render blueprint does not provision Kafka, Redis, Cassandra, Spark, Airflow, or MinIO. Using pipeline mode in a hosted environment requires separately provisioned services and network configuration. No deployment has been performed as part of the recorded verification.

For a local production-build preview:

```bash
npm --prefix frontend run build
SERVE_FRONTEND=true npm --prefix backend start
```

Visit **http://localhost:4000**. This serves the compiled frontend from the API server instead of using the frontend development server.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `fatal: not a git repository` | Enter `avsa-stock/`, then run `git rev-parse --show-toplevel`. The outer `AVSA-Stock/` directory may only contain the checkout. Do not initialize another repository to hide a path issue. |
| App cannot reach the API | Confirm the backend port and frontend API URL. In a hosted frontend, `localhost` refers to the visitor's computer. |
| Socket falls back to polling | Verify `/ws` is reachable and the URL uses `wss://` when the site is HTTPS. |
| Kafka mode reports unavailable prices | Check producer/consumer logs, Redis connectivity, and whether recent events are arriving. |
| History fails in Kafka mode | Check Cassandra connectivity and today's New York day bucket. |
| Spark panel is empty | Confirm the streaming profile is running and event time has advanced enough to finalize windows. |
| Alpaca rejects credentials | Check backend-only key and secret settings; run `check:provider`. Quotes and news can have different access outcomes. |
| Prices look old in Alpaca mode | Inspect the latest trade timestamp; closed markets or sparse IEX trades can leave older observations. |
| Airflow report task fails | Confirm there are stored ticks for the report date and that its storage services are reachable. No-data failures are intentional. |
| Docker commands cannot connect | Start a working Docker daemon before using infrastructure modes. |

## Current boundaries

The demo is suitable for exploring the interface and code. The project is not currently a multi-tenant trading platform: it has no user authentication, tenant isolation, order execution, or portfolio accounting.

Live Alpaca activation, full container integration, restart recovery, and external dependency-security review remain separate verification steps. Public market-data display or redistribution also needs provider permissions appropriate to that use. The documentation describes implemented code and recorded tests without treating unexecuted infrastructure as proven production behavior.
