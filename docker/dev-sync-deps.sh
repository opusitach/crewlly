#!/bin/sh
set -eu

LOCK_HASH_FILE="node_modules/.crewlly-deps.hash"

if [ ! -f package-lock.json ]; then
  echo "[dev-sync-deps] package-lock.json not found, skipping dependency sync"
  exit 0
fi

mkdir -p node_modules

CURRENT_HASH="$(cat package.json package-lock.json | sha256sum | awk '{print $1}')"
SAVED_HASH=""

if [ -f "$LOCK_HASH_FILE" ]; then
  SAVED_HASH="$(cat "$LOCK_HASH_FILE")"
fi

if [ ! -d node_modules/nodemailer ] || [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
  echo "[dev-sync-deps] syncing npm dependencies"
  npm install
  printf "%s" "$CURRENT_HASH" > "$LOCK_HASH_FILE"
else
  echo "[dev-sync-deps] dependencies are up to date"
fi
