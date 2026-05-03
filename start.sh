#!/usr/bin/env bash
# =============================================================================
# Shipublic – local development startup script
# Usage: ./start.sh [--no-infra] [--install]
#   --no-infra   skip docker-compose (postgres/redis already running)
#   --install    force reinstall node_modules for both apps
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOGS_DIR="$ROOT_DIR/logs"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'

log()   { echo -e "${GREEN}[start]${NC} $*"; }
warn()  { echo -e "${YELLOW}[start]${NC} $*"; }
error() { echo -e "${RED}[start]${NC} $*" >&2; }

# ── flags ─────────────────────────────────────────────────────────────────────
SKIP_INFRA=false
FORCE_INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --no-infra)  SKIP_INFRA=true ;;
    --install)   FORCE_INSTALL=true ;;
    -h|--help)
      echo "Usage: ./start.sh [--no-infra] [--install]"
      exit 0 ;;
  esac
done

# ── Docker socket ─────────────────────────────────────────────────────────────
# Docker Desktop configures the wrong socket on some Linux installs.
# The system daemon at /var/run/docker.sock works when the user is in the
# 'docker' group (which is the case on this machine).
export DOCKER_HOST=unix:///var/run/docker.sock

# ── process tracking & cleanup ────────────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  log "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true

  if [ "$SKIP_INFRA" = false ]; then
    log "Stopping infrastructure containers..."
    docker compose -f "$COMPOSE_FILE" stop 2>/dev/null || true
  fi
  log "All done. Goodbye!"
}
trap cleanup EXIT INT TERM

mkdir -p "$LOGS_DIR"

# ── 1. Infrastructure (Postgres + Redis) ──────────────────────────────────────
if [ "$SKIP_INFRA" = false ]; then
  if ! docker info >/dev/null 2>&1; then
    error "Cannot connect to Docker daemon at $DOCKER_HOST"
    error "Make sure the Docker daemon is running and you are in the 'docker' group."
    exit 1
  fi

  log "Starting infrastructure (Postgres + Redis) via docker-compose..."
  docker compose -f "$COMPOSE_FILE" up -d

  log "Waiting for Postgres to be ready on port 5433..."
  for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_isready -U shipublic -q 2>/dev/null; then
      log "Postgres is ready."
      break
    fi
    if [ "$i" -eq 30 ]; then
      error "Postgres did not become ready within 30 seconds."
      exit 1
    fi
    sleep 1
  done
fi

# NOTE: The docker-compose maps Postgres → 5433 and Redis → 6380 to avoid
# conflicts with native Postgres (5432) and Redis (6379) on this machine.
# The backend/.env has DATABASE_URL pointing to 5433 and REDIS_PORT=6380.

# ── 2. Backend dependencies ───────────────────────────────────────────────────
if [ "$FORCE_INSTALL" = true ] || [ ! -d "$BACKEND_DIR/node_modules" ]; then
  log "Installing backend dependencies..."
  npm --prefix "$BACKEND_DIR" install
fi

# ── 3. Prisma – generate client & migrate ─────────────────────────────────────
log "Running Prisma generate..."
(cd "$BACKEND_DIR" && npx prisma generate)

log "Running Prisma migrations..."
# 'migrate dev' creates & applies migrations in development.
# If a migrations folder already exists, it applies any pending ones.
(cd "$BACKEND_DIR" && npx prisma migrate dev --name init 2>/dev/null \
  || npx prisma migrate deploy 2>/dev/null \
  || true)

# ── 4. Frontend dependencies ──────────────────────────────────────────────────
if [ "$FORCE_INSTALL" = true ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  log "Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

# ── 5. Launch backend ─────────────────────────────────────────────────────────
log "Starting backend (NestJS) on http://localhost:4000 ..."
(
  cd "$BACKEND_DIR"
  npm run start:dev 2>&1 | while IFS= read -r line; do
    echo -e "${CYAN}[backend]${NC} $line"
  done
) &
PIDS+=($!)

# ── 6. Launch frontend ────────────────────────────────────────────────────────
log "Starting frontend (Next.js) on http://localhost:3000 ..."
(
  cd "$FRONTEND_DIR"
  npm run dev 2>&1 | while IFS= read -r line; do
    echo -e "${MAGENTA}[frontend]${NC} $line"
  done
) &
PIDS+=($!)

# ── 7. Summary ────────────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  Frontend : http://localhost:3000"
log "  Backend  : http://localhost:4000"
log "  Logs dir : $LOGS_DIR/"
log "  Press Ctrl+C to stop all services"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 8. Wait (keep alive until Ctrl-C) ────────────────────────────────────────
wait "${PIDS[@]}"
