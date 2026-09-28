# AVSA Stock

A stock dashboard with a working simulated demo, an optional Alpaca IEX adapter, and a separate Kafka/Redis/Cassandra/Spark/Airflow learning pipeline.

## Run locally

Use Node 22 and npm.

```bash
./start.sh
```

Open `http://localhost:3000`. The backend defaults to port 4000. The script installs missing dependencies and creates an ignored `backend/.env` if needed. Demo mode requires no external services.

## Real market data

Follow [the Alpaca setup guide](docs/MARKET_DATA_SETUP.md). Create an account, add backend-only credentials to `backend/.env`, set `DATA_MODE=alpaca`, and run `npm --prefix backend run check:provider`. IEX covers one exchange; the UI labels the source and refresh interval. The app does not place trades.

## Simulated engineering pipeline

With Docker running:

```bash
./start.sh --all
```

This starts infrastructure, the Kafka generator/consumer, the app in Kafka mode, and Spark. Airflow has separate initialization, scheduler and webserver services. First-time image builds can take several minutes. `--infra` starts infrastructure and the app without switching the selected data mode. Ctrl+C stops the app processes; Docker services remain running.

```bash
docker compose -f docker/docker-compose.yml --profile streaming down
```

This stops containers without deleting stored volumes.

| Service | Local URL | Development login |
| --- | --- | --- |
| Kafka UI | http://localhost:8080 | — |
| Redis UI | http://localhost:8081 | — |
| Airflow | http://localhost:8082 | admin / admin |
| MinIO | http://localhost:9001 | minioadmin / minioadmin |

These are local development configurations. Live Alpaca mode connects directly from the backend and does not send provider data through the simulated pipeline.

## API

| Endpoint | Purpose |
| --- | --- |
| `/health` | API liveness and configured service state |
| `/api/snapshot` | Consistent prices, headlines, summary and source |
| `/api/stocks/latest` | Latest prices |
| `/api/stocks/trending` | Top five by reported volume |
| `/api/stocks/:symbol` | Current symbol price |
| `/api/stocks/:symbol/history?limit=50` | Chronological history, capped at 200 |
| `/api/news` and `/api/news/:symbol` | Headlines |
| `/api/analytics/summary` | Market summary |
| `/api/analytics/sentiment` | Demo sentiment; unavailable for unrated live news |
| `/api/analytics/daily` | Stored-day, latest-session, or recent-window report (scope included) |
| `/api/analytics/stream` | Finalized Spark averages, activity and alerts |
| `/ws` | Snapshot updates and feed errors over WebSocket |

## Project layout

- `backend/`: API, provider adapter, market service, Kafka workers and regression tests.
- `frontend/`: React dashboard, shared connection/request hooks, responsive styles and tests.
- `docker/`: local infrastructure configuration.
- `airflow/`: custom image and weekday 5 PM New York reporting DAG.
- `spark/`: custom image and streaming processor with persistent checkpoints.
- `docs/`: [verification status](docs/REVIEW.md) and [provider setup](docs/MARKET_DATA_SETUP.md).

## Checks

```bash
npm --prefix backend test
CI=true npm --prefix frontend test -- --watchAll=false --runInBand
CI=true npm --prefix frontend run build
docker compose -f docker/docker-compose.yml --profile streaming config --quiet
```

For a local production-build preview, build the frontend and run `SERVE_FRONTEND=true npm --prefix backend start`, then visit `http://localhost:4000`.
