# Build dependencies are isolated from the serving container. The init target is short-lived
# and runs migrations/seeds; the runner contains only production npm dependencies.
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# Prisma client is generated here; development tooling is needed only for build/init.
RUN npm ci --include=dev --include=optional \
 && npm install --no-save --include=dev --ignore-scripts "@next/swc-linux-x64-gnu@$(node -p 'require("./node_modules/next/package.json").version')"

FROM deps AS build
ARG GIT_SHA=unknown
ARG BUILD_AT=
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
ENV GIT_SHA=$GIT_SHA NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY . .
RUN npm run build

# One-shot database migration and idempotent seed runner. Never expose this container publicly.
FROM build AS init
# The migration runner needs Prisma CLI and TSX, not the full lint/test toolchain.
RUN node -e 'const fs = require("node:fs"); const pkg = require("/app/package.json"); const keep = new Set(["prisma", "tsx", "typescript"]); for (const name of Object.keys(pkg.devDependencies || {})) if (!keep.has(name)) fs.rmSync("/app/node_modules/" + name, { recursive: true, force: true }); fs.rmSync("/app/node_modules/braces", { recursive: true, force: true });'
CMD ["sh", "scripts/init.sh"]

FROM base AS runner
RUN groupadd -r app && useradd -r -g app -d /app app
COPY --from=build --chown=app:app /app ./
# Preserve generated/native production artifacts, but remove ESLint, Prisma CLI, TypeScript,
# and all other dev dependencies from the web-serving image. Suppress lifecycle scripts because
# the generated Prisma client already exists and Prisma CLI is intentionally absent here.
RUN npm_config_ignore_scripts=true npm prune --omit=dev \
 && node -e 'const fs = require("node:fs"); const pkg = require("/app/package.json"); const remove = new Set([...Object.keys(pkg.devDependencies || {}), "tsx", "@prisma/config", "@prisma/dev", "@prisma/engines", "@prisma/studio-core", "deepmerge-ts", "mysql2", "postgres", "braces"]); for (const name of remove) fs.rmSync("/app/node_modules/" + name, { recursive: true, force: true });' \
 && mkdir -p /app/public/uploads /app/.next/cache/images \
 && chown -R app:app /app/public/uploads /app/.next/cache
ARG GIT_SHA=unknown
ARG BUILD_AT=
ENV GIT_SHA=$GIT_SHA BUILD_AT=$BUILD_AT
USER app
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "scripts/start-web.sh"]
