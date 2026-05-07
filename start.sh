#!/bin/bash
# Bloomberg Financial Dashboard - Quick Start Script
# Usage: ./start.sh [--infra] [--all]
#   --infra  : start Docker infrastructure (Kafka, Redis, Cassandra, MinIO, Airflow)
#   --all    : start everything including Kafka producer/consumer + Spark
#   (no flag): start backend + frontend only (MVP mode with in-memory fallback)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

log() { echo -e "\033[1;33m[Bloomberg]\033[0m $1"; }
ok()  { echo -e "\033[1;32m[✓]\033[0m $1"; }
err() { echo -e "\033[1;31m[✗]\033[0m $1"; }

# ── Phase 1: MVP (backend + frontend) ────────────────────────────────────────
start_mvp() {
  log "Installing backend dependencies..."
  cd "$BACKEND"
  npm install --silent

  log "Starting backend on port 4000..."
  cp -n .env.example .env 2>/dev/null || true
  npm run dev &
  BACKEND_PID=$!
  ok "Backend started (PID: $BACKEND_PID)"

  log "Installing frontend dependencies..."
  cd "$FRONTEND"
  npm install --silent

  log "Starting frontend on port 3000..."
  BROWSER=none npm start &
  FRONTEND_PID=$!
  ok "Frontend started (PID: $FRONTEND_PID)"

  log "Dashboard ready at http://localhost:3000"
  log "API ready at     http://localhost:4000"
  log "Press Ctrl+C to stop all services"

  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; log 'Stopped.'" SIGINT SIGTERM
  wait
}

# ── Phase 2+: Full Infrastructure ────────────────────────────────────────────
start_infra() {
  log "Starting Docker infrastructure..."
  cd "$ROOT/docker"
  docker compose up -d
  ok "Infrastructure started"
  log "Kafka UI:        http://localhost:8080"
  log "Redis Commander: http://localhost:8081"
  log "Airflow:         http://localhost:8082  (admin/admin)"
  log "MinIO Console:   http://localhost:9001  (minioadmin/minioadmin)"
  log "Waiting 30s for services to initialize..."
  sleep 30
}

start_kafka_streams() {
  log "Starting Kafka producer..."
  cd "$BACKEND"
  node kafka/producer.js &
  ok "Kafka producer started"

  log "Starting Kafka consumer..."
  node kafka/consumer.js &
  ok "Kafka consumer started"
}

# ── Parse flags ──────────────────────────────────────────────────────────────
case "${1:-}" in
  --infra)
    start_infra
    start_mvp
    ;;
  --all)
    start_infra
    cd "$BACKEND" && npm install --silent
    start_kafka_streams
    start_mvp
    ;;
  *)
    log "Starting MVP mode (no Docker required)..."
    start_mvp
    ;;
esac
