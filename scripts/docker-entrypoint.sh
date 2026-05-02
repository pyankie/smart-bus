#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "RUN_SEED=true -> running seed script..."
  npx prisma db seed
else
  echo "RUN_SEED is not true -> skipping seed script."
fi

echo "Starting application..."
exec node dist/main
