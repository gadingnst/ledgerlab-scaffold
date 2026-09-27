#!/usr/bin/env sh
# Run the whole stack in development mode (hot reload) via Docker.
#
#   ./run-dev.sh            start everything (foreground, Ctrl+C to stop)
#   ./run-dev.sh -d         start detached
#   ./run-dev.sh down       stop and remove containers
#   ./run-dev.sh reset      stop and wipe the dev database volume
#   ./run-dev.sh logs web   any other args go straight to `docker compose`
set -eu

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.dev.yml"

case "${1:-up}" in
  up | -d)
    [ "${1:-}" = "-d" ] && DETACH="-d" || DETACH=""
    echo "Dashboard:     http://localhost:5173"
    echo "Ledger API:    http://localhost:4001/health"
    echo "Reporting API: http://localhost:4002/health"
    # shellcheck disable=SC2086
    exec $COMPOSE up --build --renew-anon-volumes $DETACH
    ;;
  reset)
    exec $COMPOSE down -v --remove-orphans
    ;;
  *)
    exec $COMPOSE "$@"
    ;;
esac
