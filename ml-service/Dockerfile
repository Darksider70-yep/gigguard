FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --upgrade setuptools wheel \
    && grep -Ev '^(torch-geometric|pytest|pytest-flask|h3)==.*$' /app/requirements.txt > /tmp/requirements.runtime.txt \
    && pip install --no-cache-dir --prefer-binary -r /tmp/requirements.runtime.txt

COPY . /app

EXPOSE 5001

CMD ["sh", "-c", "gunicorn --workers 2 --bind 0.0.0.0:${ML_SERVICE_PORT:-5001} \"app:create_app()\""]
