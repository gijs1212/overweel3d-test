#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Maak eerst .env aan vanuit .env.example en vul de drie wachtwoorden/tokens in." >&2
  exit 1
fi

docker compose --env-file .env up -d --build --remove-orphans
# Persisted Meta credentials are loaded on process startup, so an unchanged
# image still needs a restart after the dashboard saves new credentials.
docker compose --env-file .env restart social-publisher
docker compose ps
