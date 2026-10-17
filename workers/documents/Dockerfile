FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv poppler-utils tesseract-ocr tesseract-ocr-por antiword ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY workers/documents/requirements.txt workers/documents/requirements.txt
RUN python3 -m venv /opt/documents-python && /opt/documents-python/bin/pip install --no-cache-dir -r workers/documents/requirements.txt
COPY scripts/register.mjs scripts/loader.mjs scripts/documents.ts ./scripts/
COPY src/lib ./src/lib
COPY workers/documents/extract.py ./workers/documents/extract.py
RUN mkdir -p /data/documents && chown -R node:node /data/documents /app
USER node
ENV ERP_DOCUMENTS_PYTHON=/opt/documents-python/bin/python
ENV ERP_DOCUMENTS_ROOT=/data/documents
CMD ["node", "--experimental-strip-types", "--import", "./scripts/register.mjs", "scripts/documents.ts", "run", "ludus", "20"]
