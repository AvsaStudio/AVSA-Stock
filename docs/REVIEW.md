# AVSA Stock verification and remaining setup

Updated September 27, 2026.

## Implemented

- One backend listener, shared snapshots for REST and WebSocket clients, and explicit demo/Kafka/Alpaca modes.
- Kafka consumers own the pipeline price/news cache. The API refuses missing/stale pipeline data instead of generating replacements.
- Alpaca IEX adapter with server-only credentials, batched/cached snapshots, history, headlines, rate-limit handling, setup instructions and a connection-check command.
- Shared Redis helpers with connection timeouts, cooldowns and required-service errors; Cassandra connection initialization is shared and keyspace names are validated.
- Consistent cached news and summaries, deduplicated news IDs, bounded chart history, request cancellation, reconnect cleanup and error/retry UI.
- Responsive dashboard columns, horizontally scrollable stock tables and keyboard-accessible symbol selection.
- Separate Airflow initialization, scheduler and webserver; constrained Python dependency image; PostgreSQL readiness; no silent random-report or failed-upload success paths.
- Daily pipeline reports aggregate all stored pages, use New York dates and share the frontend report shape. Reports explicitly describe stored data; they do not claim complete exchange coverage.
- Spark container profile, persistent checkpoints, finalized windows and monotonic Redis updates. The analytics API and pipeline panel expose the output. Spark requires several minutes of continuous input before finalized results appear.
- Clean process shutdown and service readiness checks in the launch script. `--all` starts the simulated pipeline and Spark; containers remain until explicitly stopped.
- Removed unused imports/dependencies and redundant cache/publisher labels. Node 22 is consistent across package metadata and Render configuration.

## Checks completed

- Backend automated tests: seven passing tests covering all documented REST routes, WebSocket snapshots, invalid requests, source consistency, pipeline outages and the Alpaca adapter.
- Frontend automated tests: two passing tests covering snapshot/news replacement, error recovery, REST fallback, reconnect and unmount cleanup.
- Frontend production build passes.
- Browser: stock selection, analytics navigation and mobile dashboard checked; no page-wide horizontal overflow at a 390-pixel viewport. The equities table scrolls within its own container.
- Docker Compose (including streaming profile), shell and Python syntax checks pass.

## Not yet verified / needs your setup

- **Live Alpaca connection:** create the account and enter keys locally; follow [Market data setup](MARKET_DATA_SETUP.md). No keys were printed or committed.
- **Full container integration:** Docker CLI exists but its daemon is unavailable here. Airflow/Spark images, scheduled runs, real Redis/Cassandra reconnect behavior and container restart recovery have not been executed. Syntax/configuration checks do not prove these runtime integrations.
- **Dependency audit:** external npm audit was not run because network approval was declined. No vulnerability-free claim is made. Existing container/dependency versions still need a security/update review before public production use.
- **Deployment:** no deployment was performed. Real-data mode is separate from the simulated Kafka pipeline. Public redistribution requires provider permissions appropriate to the intended use.

## Reproduce checks

```bash
npm --prefix backend test
CI=true npm --prefix frontend test -- --watchAll=false --runInBand
CI=true npm --prefix frontend run build
bash -n start.sh
docker compose -f docker/docker-compose.yml --profile streaming config --quiet
```

With a working Docker installation: run `./start.sh --all`, then inspect `docker compose -f docker/docker-compose.yml --profile streaming ps` and logs. Verify prices/history, wait for Spark window outputs, and trigger the Airflow DAG for a date with stored data. A day without stored ticks deliberately fails instead of creating a fake report.
