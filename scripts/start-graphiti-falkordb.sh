#!/usr/bin/env bash
set -euo pipefail

container_name="${GRAPHITI_FALKORDB_CONTAINER:-brainsty-falkordb}"
host_port="${FALKORDB_PORT:-6380}"
ui_port="${FALKORDB_UI_PORT:-3001}"

if ! docker info >/dev/null 2>&1; then
  if command -v colima >/dev/null 2>&1; then
    colima start --cpu 2 --memory 4
  else
    echo "Docker is not running and Colima is not installed." >&2
    exit 1
  fi
fi

if docker ps --format '{{.Names}}' | grep -qx "$container_name"; then
  echo "$container_name is already running on FALKORDB_PORT=$host_port"
  exit 0
fi

docker rm -f "$container_name" >/dev/null 2>&1 || true
docker run -d \
  --name "$container_name" \
  -p "${host_port}:6379" \
  -p "${ui_port}:3000" \
  falkordb/falkordb:latest

echo "$container_name started on FALKORDB_PORT=$host_port"
