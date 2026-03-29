#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required."
  exit 1
fi

# Render Postgres provides a postgres:// or postgresql:// connection string.
# Nakama accepts a database address without query params, so normalize it here.
DB_ADDRESS="${DATABASE_URL#*://}"
DB_ADDRESS="${DB_ADDRESS%%\?*}"

/nakama/nakama migrate up \
  --config /nakama/data/local.yml \
  --database.address "$DB_ADDRESS"

exec /nakama/nakama \
  --config /nakama/data/local.yml \
  --database.address "$DB_ADDRESS" \
  --socket.port "${PORT:-7350}" \
  --socket.server_key "${NAKAMA_SERVER_KEY:-defaultkey}" \
  --runtime.http_key "${RUNTIME_HTTP_KEY:-defaulthttpkey}" \
  --session.encryption_key "${SESSION_ENCRYPTION_KEY:-defaultencryptionkey}" \
  --session.refresh_encryption_key "${SESSION_REFRESH_ENCRYPTION_KEY:-defaultrefreshencryptionkey}" \
  --console.username "${CONSOLE_USERNAME:-admin@nakama.local}" \
  --console.password "${CONSOLE_PASSWORD:-password123}"
