# Образ приложения T.Rodionova: сборка Next.js и запуск с миграциями (scripts/start.sh).
FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# prisma generate запускается из postinstall; dev-зависимости нужны для сборки
RUN npm ci --include=dev

FROM deps AS build
ARG GIT_SHA=unknown
ARG BUILD_AT=
# Постоянный ключ подписи серверных действий (из .env сервера): идентификаторы действий не меняются
# от сборки к сборке, и кнопки в открытых до обновления вкладках продолжают работать
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
ENV GIT_SHA=$GIT_SHA NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY . .
# при сборке базы нет: витрина рендерится на запрос, страницы с БД динамические
RUN npm run build

FROM base AS runner
RUN groupadd -r app && useradd -r -g app -d /app app
COPY --from=build --chown=app:app /app ./
RUN mkdir -p /app/public/uploads && chown -R app:app /app/public/uploads
ARG GIT_SHA=unknown
ARG BUILD_AT=
ENV GIT_SHA=$GIT_SHA BUILD_AT=$BUILD_AT
USER app
EXPOSE 3000
ENV PORT=3000
CMD ["sh", "scripts/start.sh"]
