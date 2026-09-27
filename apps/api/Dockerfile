# API image. Also runs the worker (docker-compose.yml overrides the command
# with `node apps/api/dist/worker.js`).
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --config.package-import-method=copy

COPY apps/api ./apps/api

RUN pnpm --filter api build


FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

RUN pnpm install --filter api --prod --frozen-lockfile --config.package-import-method=copy

COPY --from=builder /app/apps/api/dist ./apps/api/dist
# tsc doesn't copy .sql — migrations must ship alongside the compiled migrate.js.
COPY --from=builder /app/apps/api/src/db/migrations ./apps/api/dist/db/migrations
# The global skill library is seeded from these files at worker boot.
COPY skills ./skills

ENV NODE_ENV=production
ENV PORT=3001
ENV STORAGE_PATH=/data

EXPOSE 3001

# Run pending migrations, then start the API. The Worker service overrides
# this with `node apps/api/dist/worker.js` (no migrations — the API owns them).
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/server.js"]
