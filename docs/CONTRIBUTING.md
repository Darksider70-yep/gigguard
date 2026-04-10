# Contributing to GigGuard

Thank you for your interest in contributing to GigGuard! This guide covers the setup, conventions, and workflow for contributors.

---

## Getting Started

### Prerequisites

- **Node.js** v18+ (v22 recommended)
- **Python** 3.9+ (3.11 recommended)
- **Docker** & Docker Compose v2.20+
- **PostgreSQL** 15+ (or use Docker)
- **Redis** 7+ (or use Docker)

### Local Setup

```bash
# Clone the repo
git clone <repo-url> && cd gigguard

# Install root-level dev dependencies (test runner, husky)
npm install

# Backend
cd backend && npm install && cd ..

# Frontend
cd gigguard-frontend && npm install && cd ..

# ML Service
cd ml-service && pip install -r requirements.txt && cd ..

# Copy environment file
cp .env.example .env
# Edit .env with your API keys (or leave USE_MOCK_APIS=true)
```

### Running with Docker

```bash
cd infra
docker compose up --build
```

### Running Locally (without Docker)

```bash
# Terminal 1: Start databases
docker run -d --name gigguard-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=password -e POSTGRES_DB=gigguard postgres:15-alpine
docker run -d --name gigguard-redis -p 6379:6379 redis:7-alpine

# Terminal 2: ML Service
cd ml-service && python app.py

# Terminal 3: Backend
cd backend && npm run dev

# Terminal 4: Frontend
cd gigguard-frontend && npm run dev
```

---

## Project Structure

```
gigguard/
├── backend/           # Express.js API server (TypeScript)
│   ├── src/           # Application source code
│   ├── db/            # Database schema and migrations
│   ├── scripts/       # Utility scripts (backfill, migration)
│   └── Dockerfile
├── ml-service/        # Flask ML microservice (Python)
│   ├── app.py         # Application factory + API routes
│   ├── fraud/         # Isolation Forest fraud scorer
│   ├── gnn/           # GraphSAGE GNN fraud detection
│   ├── rl/            # SAC reinforcement learning pricing
│   ├── bandits/       # Thompson Sampling policy recommender
│   └── Dockerfile
├── gigguard-frontend/ # Next.js frontend (TypeScript + Tailwind)
│   ├── app/           # App Router pages
│   ├── components/    # Reusable UI components
│   └── Dockerfile
├── infra/             # Docker Compose and deployment config
├── docs/              # Architecture, API, and deployment docs
├── scripts/           # Root-level utility scripts
└── tests/             # Integration and E2E tests
```

---

## Coding Standards

### TypeScript (Backend + Frontend)

- Use strict `const`/`let`, no `var`
- Async/await over raw Promises
- All routes must have error handling (try/catch or asyncRoute wrapper)
- Use Zod schemas for request body validation
- SQL queries use parameterized `$1, $2` — never string interpolation

### Python (ML Service)

- Type hints on all function signatures
- Docstrings on public functions
- NumPy arrays must be explicitly typed (`.astype(np.float32)`)
- All ML models load lazily with graceful fallback

### Commits

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep commits atomic — one logical change per commit

---

## Testing

```bash
# Unit tests (fast, no DB required)
npm run test:unit

# Integration tests (requires running Postgres + Redis)
npm run test:integration

# ML service tests
cd ml-service && python -m pytest

# All tests
npm run test:all
```

---

## Pull Request Checklist

- [ ] Code follows the project's coding standards
- [ ] All existing tests pass
- [ ] New functionality includes tests
- [ ] No secrets or API keys in the diff
- [ ] Database changes include a numbered migration in `backend/db/migrations/`
- [ ] Docker builds successfully: `cd infra && docker compose build`
- [ ] Documentation updated if API or architecture changed

---

## Security

- **Never commit `.env` files** — they are in `.gitignore`
- **API keys** must go through env vars, never hardcoded
- **JWT tokens** are used for auth — worker IDs come from tokens, never request bodies
- **SQL injection** prevented by parameterized queries only
- The pre-commit hook (husky) scans for accidental secret exposure
