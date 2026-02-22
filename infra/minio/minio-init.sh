#!/bin/sh
set -eu

until /usr/bin/mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"; do
  echo "Waiting for MinIO to become ready..."
  sleep 2
done

/usr/bin/mc mb --ignore-existing "local/$MINIO_BUCKET"

if ! /usr/bin/mc anonymous set download "local/$MINIO_BUCKET"; then
  echo "Warning: failed to set anonymous download policy, continuing"
fi

if ! /usr/bin/mc cors set "local/$MINIO_BUCKET" /opt/minio/cors.json; then
  echo "Warning: failed to set CORS policy, continuing"
fi
