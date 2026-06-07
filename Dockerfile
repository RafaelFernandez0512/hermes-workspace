# syntax=docker/dockerfile:1.6
# Hermes Workspace — Docker image
#
# Build:
#   docker build -t hermes-workspace .
# Run:
#   docker run -p 3000:3000 --env-file .env hermes-workspace
#

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-bookworm-slim AS runtime-base
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl docker.io gosu python3 tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r workspace \
  && useradd -r -g workspace -u 10010 -m -d /home/workspace workspace
WORKDIR /app

FROM runtime-base AS runtime
COPY --from=prod-deps --chown=workspace:workspace /app/node_modules ./node_modules
COPY --from=build --chown=workspace:workspace /app/dist ./dist
COPY --from=build --chown=workspace:workspace /app/package.json ./package.json
COPY --from=build --chown=workspace:workspace /app/server-entry.js ./server-entry.js
COPY --from=build --chown=workspace:workspace /app/skills ./skills
COPY --chown=workspace:workspace docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HERMES_HOME=/home/workspace/.hermes \
    HERMES_WORKSPACE_DIR=/workspace \
    HERMES_API_URL=http://hermes-agent:8642 \
    HERMES_DASHBOARD_URL=http://hermes-agent:9119
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/auth-check >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=2048", "server-entry.js"]

FROM runtime-base AS dev
COPY --from=deps --chown=workspace:workspace /app/node_modules ./node_modules
COPY --from=build --chown=workspace:workspace /app/package.json ./package.json
COPY --from=build --chown=workspace:workspace /app/server-entry.js ./server-entry.js
COPY --from=build --chown=workspace:workspace /app/skills ./skills
COPY --chown=workspace:workspace docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=development \
    PORT=3000 \
    HOST=0.0.0.0 \
    HERMES_HOME=/home/workspace/.hermes \
    HERMES_WORKSPACE_DIR=/workspace \
    HERMES_API_URL=http://hermes-agent:8642 \
    HERMES_DASHBOARD_URL=http://hermes-agent:9119
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/auth-check >/dev/null || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-lc", "pnpm build && (pnpm exec vite build --watch >/tmp/hermes-workspace-build.log 2>&1 &) && exec node server-entry.js"]
