# syntax=docker/dockerfile:1
#
# LedgerLab — single multi-stage Dockerfile for every app in the monorepo.
# Always build from the repo root and pick a target:
#
#   dev            source-mounted dev image (hot reload; used by docker-compose.dev.yml)
#   tools          full workspace + dev deps (runs migrations / seed)
#   ledger-api     production Ledger API
#   reporting-api  production Reporting API
#   web            production dashboard (static SPA on nginx)
#
#   docker build --target ledger-api -t ledgerlab/ledger-api .

ARG NODE_VERSION=22-alpine
ARG PNPM_VERSION=10.33.2

# ---------------------------------------------------------------------------
# base: node + pinned pnpm
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN npm install -g pnpm@${PNPM_VERSION} && pnpm --version
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install the whole workspace from manifests only (cache-friendly)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ledger-api/package.json    apps/ledger-api/
COPY apps/reporting-api/package.json apps/reporting-api/
COPY apps/web/package.json           apps/web/
COPY packages/db/package.json        packages/db/
COPY packages/shared/package.json    packages/shared/
COPY packages/ui/package.json        packages/ui/
COPY packages/rate-limit/package.json packages/rate-limit/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# dev: source is bind-mounted at runtime; node_modules come from the image
# ---------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
# Command is set per service in docker-compose.dev.yml.
CMD ["pnpm", "dev"]

# ---------------------------------------------------------------------------
# build: compile everything once
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
# Vite inlines VITE_* at build time, so the browser-facing URLs are build args.
ARG VITE_LEDGER_API_URL=http://localhost:4001
ARG VITE_REPORTING_API_URL=http://localhost:4002
ENV VITE_LEDGER_API_URL=$VITE_LEDGER_API_URL \
    VITE_REPORTING_API_URL=$VITE_REPORTING_API_URL
RUN pnpm --filter @ledgerlab/ledger-api --filter @ledgerlab/reporting-api --filter @ledgerlab/web build
# Standalone, prod-only node_modules per API (workspace packages are bundled by tsup).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @ledgerlab/ledger-api    deploy --legacy --prod /out/ledger-api && \
    pnpm --filter @ledgerlab/reporting-api deploy --legacy --prod /out/reporting-api && \
    cp -r apps/ledger-api/dist    /out/ledger-api/dist && \
    cp -r apps/reporting-api/dist /out/reporting-api/dist

# ---------------------------------------------------------------------------
# tools: one-shot jobs (migrate / seed) — full workspace with dev deps
# ---------------------------------------------------------------------------
FROM build AS tools
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ledgerlab/db", "migrate:sql"]

# ---------------------------------------------------------------------------
# runtime base for the APIs
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS api-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# ---------------------------------------------------------------------------
# ledger-api
# ---------------------------------------------------------------------------
FROM api-runtime AS ledger-api
COPY --from=build --chown=node:node /out/ledger-api ./
USER node
ENV LEDGER_API_PORT=4001 LEDGER_API_HOST=0.0.0.0
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.LEDGER_API_PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------------------
# reporting-api
# ---------------------------------------------------------------------------
FROM api-runtime AS reporting-api
COPY --from=build --chown=node:node /out/reporting-api ./
USER node
ENV REPORTING_API_PORT=4002 REPORTING_API_HOST=0.0.0.0
EXPOSE 4002
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.REPORTING_API_PORT||4002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# ---------------------------------------------------------------------------
# web (static SPA)
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
