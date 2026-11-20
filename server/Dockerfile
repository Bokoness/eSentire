# API image: builds the Express server and, on start, migrates + seeds the database, then serves the API.
# Build context is the repository root (npm workspaces share one package-lock.json).
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# Dev dependencies are kept: the Prisma CLI is needed at runtime for `migrate deploy`.
RUN npm ci -w server

COPY server/ server/
COPY data/ data/
WORKDIR /app/server
RUN npx prisma generate && npm run build

ENV API_PORT=3001
EXPOSE 3001
# Ingestion is idempotent, so seeding on every start is safe and keeps the DB in sync with data/intel.json.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/ingestion/cli.js ../data/intel.json && node dist/index.js"]
