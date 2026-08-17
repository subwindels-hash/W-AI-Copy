# syntax=docker/dockerfile:1.7
# WINDELS AI OS — API + migration images.
#
# Targets:
#   production  lean, non-root API runtime
#   migrator    Prisma CLI + seed runner used as a one-shot Compose job

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS build
# Native dependencies are compiled only in the build image. libstdc++ is also
# installed in the runtime image for packages such as zeromq.
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-api,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
# pnpm-workspace.yaml intentionally disables dependency install scripts, so
# generate the real Prisma client explicitly before compiling or deploying.
RUN pnpm --filter @windels/api exec prisma generate
RUN pnpm --filter @windels/shared build
RUN pnpm --filter @windels/api build
# Produce a portable production dependency tree, including the built shared
# workspace package, instead of copying pnpm's symlinked workspace piecemeal.
RUN pnpm --filter @windels/api deploy --prod --legacy /opt/windels-api
# `pnpm deploy` creates a fresh virtual store after Prisma generation and does
# not carry the generated sibling `.prisma/client` directory with it. Copy that
# generated client beside the deployed @prisma/client package explicitly.
RUN set -eu; \
    prisma_source="$(find /app/node_modules/.pnpm -path '*/node_modules/.prisma' -type d -print -quit)"; \
    prisma_package="$(find /opt/windels-api/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d -print -quit)"; \
    test -n "$prisma_source"; \
    test -n "$prisma_package"; \
    prisma_modules="$(dirname "$(dirname "$prisma_package")")"; \
    cp -a "$prisma_source" "$prisma_modules/.prisma"; \
    test -f "$prisma_modules/.prisma/client/index.js"

FROM build AS migrator
ENV NODE_ENV=production
WORKDIR /app/apps/api
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec tsx prisma/seed.ts"]

FROM node:20-alpine AS production
ENV NODE_ENV=production \
    API_PORT=4000 \
    API_HOST=0.0.0.0
RUN apk add --no-cache curl libstdc++ tini \
    && addgroup -g 1001 -S nodejs \
    && adduser -S windels -u 1001 -G nodejs \
    && mkdir -p /app/apps/api /data \
    && chown -R windels:nodejs /app /data
WORKDIR /app/apps/api
COPY --from=build --chown=windels:nodejs /opt/windels-api/ ./
USER windels
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
