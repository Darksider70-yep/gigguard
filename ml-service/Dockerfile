FROM python:3.11-slim AS builder

ARG INCLUDE_RL_DEPS=false

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libpq-dev \
       gcc \
       g++ \
       make \
    && rm -rf /var/lib/apt/lists/*

# Copy and prepare requirements
COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel && \
    grep -Ev '^(torch-geometric|pytest|pytest-flask|h3)==.*$' requirements.txt > /tmp/requirements.runtime.txt && \
    if [ "${INCLUDE_RL_DEPS}" != "true" ]; then \
      grep -Ev '^(torch|stable-baselines3|gymnasium|networkx|pandas|rich|tqdm)==.*$' /tmp/requirements.runtime.txt > /tmp/requirements.runtime.slim.txt && \
      mv /tmp/requirements.runtime.slim.txt /tmp/requirements.runtime.txt; \
    fi

# Install Python dependencies
RUN pip install --user --no-cache-dir --prefer-binary --no-warn-script-location -r /tmp/requirements.runtime.txt

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ML_SERVICE_PORT=5001 \
    PYTHONPATH=/app

# Security: create non-root user
RUN groupadd -r mluser && useradd -r -g mluser mluser

# Install runtime dependencies only
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/mluser/.local

# Copy application code
COPY --chown=mluser:mluser . /app

# Set PATH to use local pip installations
ENV PATH=/home/mluser/.local/bin:$PATH

# Switch to non-root user
USER mluser

EXPOSE 5001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD python -c "import json,sys,urllib.request; d=json.loads(urllib.request.urlopen('http://localhost:5001/health', timeout=3).read().decode()); sys.exit(0 if d.get('status')=='ok' else 1)" || exit 1

CMD ["sh", "-c", "gunicorn --workers 2 --worker-class sync --bind 0.0.0.0:${ML_SERVICE_PORT:-5001} --timeout 120 --access-logfile - --error-logfile - \"app:create_app()\""]
