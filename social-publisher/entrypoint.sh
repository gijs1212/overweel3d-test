#!/bin/sh
set -eu

mkdir -p /data/failures /data/tmp

exec uvicorn app.main:app --host 0.0.0.0 --port 8787
