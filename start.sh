#!/bin/bash
# Start the app; --infra adds services, --all adds the simulated Kafka/Spark pipeline.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
case "${1:-}" in
  ''|--infra|--all) ;;
  *) echo 'Usage: ./start.sh [--infra|--all]' >&2; exit 2 ;;
esac
for app in backend frontend; do
  if [ ! -d "$ROOT/$app/node_modules" ]; then (cd "$ROOT/$app" && npm ci); fi
done
if [ ! -f "$ROOT/backend/.env" ]; then cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"; fi
if [ -n "${1:-}" ]; then
  docker info >/dev/null
  docker compose -f "$ROOT/docker/docker-compose.yml" up -d --build
  export REDIS_HOST=localhost CASSANDRA_CONTACT_POINTS=localhost
  export KAFKA_BROKERS=localhost:9092 S3_ENDPOINT=http://localhost:9000
  export S3_ACCESS_KEY=minioadmin S3_SECRET_KEY=minioadmin
fi
if [ "${1:-}" = '--all' ]; then
  export DATA_MODE=kafka
  # Block on actual readiness, rather than assuming services start within a fixed delay.
  for service in kafka redis cassandra; do
    ready=false
    for attempt in {1..60}; do
      container=$(docker compose -f "$ROOT/docker/docker-compose.yml" ps -q "$service")
      if [ -n "$container" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy ]; then ready=true; break; fi
      sleep 5
    done
    if [ "$ready" != true ]; then echo "$service did not become healthy" >&2; exit 1; fi
  done
  docker compose -f "$ROOT/docker/docker-compose.yml" --profile streaming up -d --build spark
  (cd "$ROOT/backend" && exec node kafka/producer.js) &
  PIDS+=("$!")
  (cd "$ROOT/backend" && exec node kafka/consumer.js) &
  PIDS+=("$!")
fi
(cd "$ROOT/backend" && exec node server.js) &
PIDS+=("$!")
(cd "$ROOT/frontend" && BROWSER=none exec node node_modules/react-scripts/scripts/start.js) &
PIDS+=("$!")
echo 'AVSA Stock: http://localhost:3000 · API defaults to http://localhost:4000'
echo 'Ctrl+C stops app processes. Infrastructure remains running; use docker compose down to stop it.'
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then echo 'An app process exited; stopping remaining app processes.' >&2; exit 1; fi
  done
  sleep 2
done
