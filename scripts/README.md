# GigGuard ML Setup

Run from repo root unless specified.

> Demo helper scripts were removed. Use Docker Compose directly (`docker compose up --build`).

```bash
# 1. Start infra services
docker compose up -d db redis

# 2. Run DB migrations
cd backend && npm run migrate && cd ..

# 3. Seed database
DATABASE_URL=postgresql://... python scripts/seed_db.py

# 4. Train all ML models
python scripts/train_all_models.py

# 5. Start ML service
cd ml-service && gunicorn "app:create_app()" --bind 0.0.0.0:5001

# 6. Start backend
cd backend && npm run dev

# 7. Verify setup
DATABASE_URL=... ML_SERVICE_URL=http://localhost:5001 \
  python scripts/verify_setup.py
```
