# Infrastructure

This directory contains all Docker and deployment configuration for GigGuard.

## Contents

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Full-stack orchestration (Postgres, Redis, ML, Backend, Frontend) |
| `.env` | Environment variables for Docker Compose (not committed to git) |
| `nginx.conf` | Reverse proxy config (placeholder for production) |

## Quick Start

```bash
cd infra

# Copy and configure environment
cp .env.example ../.env.example  # if needed

# Build and run all services
docker compose up --build

# Or build sequentially to save RAM (Git Bash / Linux / macOS)
COMPOSE_PARALLEL_LIMIT=1 docker compose build
docker compose up

# Or build sequentially to save RAM (PowerShell / Windows)
# $env:COMPOSE_PARALLEL_LIMIT=1
# docker compose build
# docker compose up
```

## Services

| Service | Internal Port | External Port | Healthcheck |
|---------|--------------|---------------|-------------|
| `db` (PostgreSQL) | 5432 | 5432 | `pg_isready` |
| `redis` | 6379 | 6379 | `redis-cli ping` |
| `db-seed` | — | — | Runs once, then exits |
| `ml-service` | 5001 | 5001 | `GET /health` |
| `backend` | 4000 | 4000 | `GET /health` |
| `payment-service` | 5002 | 5002 | `GET /health` |
| `frontend` | 3000 | 3000 | HTTP status check |

## Memory Limits

All services have resource limits configured to prevent RAM spikes:

- **ML Service**: 1 GB limit, gunicorn `--max-requests 1000` for automatic worker recycling
- **Backend**: 512 MB limit, `--max-old-space-size=256` for V8 heap
- **Frontend**: 512 MB limit, `--max-old-space-size=256` for V8 heap
- **PostgreSQL**: 512 MB limit
- **Redis**: 256 MB limit, `maxmemory 256mb` with `noeviction` policy

## Environment Variables

All secrets are injected via `.env` file (gitignored). See `.env` for the full list with defaults.

Key variables:

| Variable | Required | Default |
|----------|----------|---------|
| `POSTGRES_PASSWORD` | No | `gigguard_dev` |
| `JWT_SECRET` | Yes (prod) | `gigguard_dev_jwt_secret` |
| `PAYMENT_DRIVER` | No | `dummy` |
| `PAYMENT_SERVICE_KEY` | Yes (internal) | `super_secret_internal_key_that_is_at_least_32_chars_long` |
| `RAZORPAY_KEY_ID` | Yes (if Razorpay) | — |
| `RAZORPAY_KEY_SECRET` | Yes (if Razorpay) | — |
| `CORS_ORIGIN` | No | `http://localhost:3000` |
| `INSURER_LOGIN_SECRET` | No | `change_me_insurer_secret` |

## Teardown

```bash
# Stop services
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v
```
