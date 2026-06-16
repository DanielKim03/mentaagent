FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --config.package-import-method=copy

COPY apps/web ./apps/web

# No NEXT_PUBLIC_* build args: the browser talks to the API only through the
# same-origin /api/proxy/* route, so nothing provider-specific is inlined
# into the client bundle. (Add ARG/ENV pairs here if that changes.)
RUN pnpm --filter web build


FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g corepack@latest \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --filter web --prod --frozen-lockfile --config.package-import-method=copy

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "start"]
