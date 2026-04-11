FROM python:3.11-slim AS builder

ARG INCLUDE_RL_DEPS=false

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies with retries to handle transient mirror hash mismatch.
RUN set -eux; \
    rm -rf /var/lib/apt/lists/*; \
    for attempt in 1 2 3; do \
      apt-get -o Acquire::Retries=5 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true update && \
      apt-get -o Acquire::Retries=5 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true install -y --no-install-recommends \
        libpq-dev \
        gcc \
        g++ \
        make && \
      break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "apt install failed after ${attempt} attempts" >&2; \
        exit 1; \
      fi; \
      echo "Retrying apt install after transient apt mirror mismatch (attempt ${attempt})" >&2; \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb; \
      sleep $((attempt * 2)); \
    done; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

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

# Install runtime dependencies with retries to handle transient mirror hash mismatch.
RUN set -eux; \
    rm -rf /var/lib/apt/lists/*; \
    for attempt in 1 2 3; do \
      apt-get -o Acquire::Retries=5 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true update && \
      apt-get -o Acquire::Retries=5 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true install -y --no-install-recommends libpq5 && \
      break; \
      if [ "$attempt" -eq 3 ]; then \
        echo "apt install failed after ${attempt} attempts" >&2; \
        exit 1; \
      fi; \
      echo "Retrying apt install after transient apt mirror mismatch (attempt ${attempt})" >&2; \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb; \
      sleep $((attempt * 2)); \
    done; \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*.deb

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/mluser/.local

# Copy application code
COPY --chown=mluser:mluser . /app

# Set PATH to use local pip installations
ENV PATH=/home/mluser/.local/bin:$PATH

# Switch to non-root user
USER mluser

EXPOSE 5001

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=30s \
    CMD python -c "import json,sys,urllib.request; d=json.loads(urllib.request.urlopen('http://localhost:5001/health', timeout=3).read().decode()); sys.exit(0 if d.get('status')=='ok' else 1)" || exit 1

CMD ["sh", "-c", "mkdir -p /app/models && gunicorn --workers 1 --threads 2 --preload --bind 0.0.0.0:${ML_SERVICE_PORT:-5001} --timeout 120 --max-requests 1000 --max-requests-jitter 50 --worker-tmp-dir /dev/shm --access-logfile - --error-logfile - \"app:create_app()\""]
