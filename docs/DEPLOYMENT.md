# GigGuard Deployment Guide

> How to build, deploy, and run GigGuard using Docker Compose.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Docker Compose (Recommended)](#docker-compose-recommended)
- [RAM-Safe Build Strategy](#ram-safe-build-strategy)
- [Service Health Verification](#service-health-verification)
- [Manual Development Setup](#manual-development-setup)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Minimum Version |
|-------------|----------------|
| Docker | 24+ |
| Docker Compose | v2.20+ |
| RAM | 4 GB free (6 GB recommended) |
| Disk | 5 GB free |
| Node.js | v18+ (for local dev only) |
| Python | v3.9+ (for local dev only) |

---

## Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in required API keys:
   ```env
   # Required for live trigger monitoring (set USE_MOCK_APIS=true to skip)
   OPENWEATHERMAP_API_KEY=your_key
   AQICN_API_KEY=your_key

   # Required for payments (set USE_MOCK_PAYOUT=true to skip)
   RAZORPAY_KEY_ID=rzp_test_xxx
   RAZORPAY_KEY_SECRET=xxx
   RAZORPAY_WEBHOOK_SECRET=xxx

   # Security
   JWT_SECRET=your_random_secret
   INSURER_LOGIN_SECRET=your_insurer_password
   ```

3. For development/demo, the defaults work with mock APIs enabled.

---

## Docker Compose (Recommended)

All Docker configuration lives in the `infra/` directory.

### Quick Start

```bash
# From the project root directory
cd infra
docker compose up --build
```

Or from root without changing directory:

```bash
docker compose -f infra/docker-compose.yml up --build
```

### Access URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| ML Service | http://localhost:5001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Startup Order

Docker Compose handles dependency ordering automatically:

```
1. PostgreSQL → healthcheck (pg_isready)
2. Redis → healthcheck (redis-cli ping)
3. DB Seed → runs migrations after PostgreSQL is healthy
4. ML Service → depends on PostgreSQL
5. Backend → depends on PostgreSQL, DB Seed, Redis, ML Service
6. Frontend → depends on Backend
```

---

## RAM-Safe Build Strategy

The ML service container includes heavy Python dependencies (PyTorch, torch-geometric, stable-baselines3). Building all containers simultaneously can spike RAM usage to 8GB+.

### Option 1: Sequential Build (Recommended)

```powershell
cd infra

# Build one service at a time
docker compose build db
docker compose build redis
docker compose build backend
docker compose build ml-service
docker compose build frontend

# Then start everything
docker compose up
```

### Option 2: Parallel Limit

```bash
cd infra
# Limit parallel builds (Docker Compose v2.23+)
docker compose build --parallel 1
docker compose up
```

### Option 3: Pre-pull Base Images

```bash
# Pull base images first (reduces build-time RAM)
docker pull postgres:15-alpine
docker pull redis:7-alpine
docker pull node:22-alpine
docker pull python:3.11-slim

# Then build
cd infra
docker compose build
docker compose up
```

### Memory Limits (Built into docker-compose.yml)

The compose file includes memory limits for each service:

| Service | Memory Limit | Reservation |
|---------|-------------|-------------|
| PostgreSQL | 512 MB | 256 MB |
| Redis | 256 MB | 128 MB |
| ML Service | 1 GB | 512 MB |
| Backend | 512 MB | 256 MB |
| Frontend | 512 MB | 256 MB |

### Gunicorn RAM Optimization (ML Service)

The ML service uses gunicorn with `--max-requests 1000` to auto-recycle workers
before memory leaks accumulate, and `--worker-tmp-dir /dev/shm` to avoid disk I/O
spikes from worker heartbeats.

---

## Service Health Verification

After startup, verify all services are healthy:

```bash
# Check container health status
docker compose ps

# Backend health
curl http://localhost:4000/health

# ML Service health
curl http://localhost:5001/health

# Test a premium calculation
curl -X POST http://localhost:5001/predict-premium \
  -H "Content-Type: application/json" \
  -d '{"zone_multiplier": 1.1, "weather_multiplier": 1.0, "history_multiplier": 1.0}'
```

Expected output from `/health`:
```json
{
  "status": "ok",
  "db": "connected",
  "ml_service": "connected",
  "redis": "connected"
}
```

---

## Manual Development Setup

For development without Docker:

### Terminal 1: PostgreSQL + Redis
```bash
# Using Docker for just the databases
docker run -d --name gigguard-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=password -e POSTGRES_DB=gigguard \
  postgres:15-alpine

docker run -d --name gigguard-redis -p 6379:6379 redis:7-alpine
```

### Terminal 2: ML Service
```bash
cd ml-service
pip install -r requirements.txt
python app.py
```

### Terminal 3: Backend
```bash
cd backend
npm install
npm run dev
```

### Terminal 4: Frontend
```bash
cd gigguard-frontend
npm install
npm run dev
```

---

## Production Cloud Deployment (Render)

GigGuard is optimized for deployment on **Render** (Free Tier). Due to networking limitations on the Free plan, specific configurations are required to ensure service-to-service communication.

### 1. Networking Strategy (Free Tier)
Render's **Private Networking** is disabled on the Free tier. Services cannot communicate via `http://ml-service:5001`.
- **Solution**: Use the **Public Service URL** (e.g., `https://gigguard-ml.onrender.com`) as the `ML_SERVICE_URL` in your Backend environment variables.

### 2. Service Configuration Matrix

| Service | Override `PORT` | Required URL Variables |
|---------|-----------------|------------------------|
| **Backend** | (Default) | `ML_SERVICE_URL`, `PAYMENT_SERVICE_URL`, `FRONTEND_URL` |
| **ML Service** | `5001` | `DATABASE_URL` |
| **Payment Service** | `5002` | `DATABASE_URL`, `BACKEND_URL` |

### 3. Cold Start & Uptime Management
Render Free Tier services spin down after 15 minutes of inactivity.
- **Uptime Monitoring**: Use [cron-job.org](https://cron-job.org) to ping the `/health` endpoint of all services (Backend, ML, Payment, Frontend) every 10–14 minutes.
- **Timeouts**: The Backend is configured with a **30-second timeout** for internal service calls to allow enough time for "cold starts."

### 4. Database Setup
1. Provision a **Render PostgreSQL** instance.
2. Ensure you use the **External Connection String** for local development and the **Internal Connection String** (if on paid plans) or **External URL** (if on free plans) for the backend.
3. Apply migrations using the provided scripts or via a migrations container.

---

## Troubleshooting (Cloud)

### Symptom: Backend reports "Internal Service Error"
- **Check**: Is the internal service (ML/Payment) awake? 
- **Cause**: Render Free tier might be waking them up. 
- **Fix**: Check logs. If you see `ECONNREFUSED` or `502`, the target service is cold starting. Wait 30s and retry.

### Symptom: API requests return 404
- **Check**: Ensure `ALLOWED_ORIGINS` in the Backend `.env` includes your production Frontend URL.

---
