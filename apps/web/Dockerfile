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
# into the client bundle. WEB_ORIGIN is needed at build time because the
# standalone build freezes next.config (Server Actions allowedOrigins).
ARG WEB_ORIGIN=http://localhost:3000
ENV WEB_ORIGIN=$WEB_ORIGIN
RUN pnpm --filter web build


# Standalone output: a minimal server plus only the node_modules it traces,
# so the runtime image needs no package install.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Docker sets HOSTNAME to the container id; bind on all interfaces instead.
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
