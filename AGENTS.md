<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Правила работы с заказчиком (закон)

- После каждого изменения кода присылать заказчику готовую команду для консоли сервера (одна строка, копировать целиком), чтобы обновление появилось на боевом сайте. Стандартная команда: `cd /opt/tr-rodionova && sudo -u deploy bash deploy/update.sh`. Если включено автообновление (cron `deploy/autoupdate.sh`), всё равно указывать, что изменения появятся в течение 10 минут, и давать команду для немедленного обновления.
- Сохранять проект (commit + push в `main`) после каждого шага.
- Не запрашивать у заказчика пароли, ключи API и другие секреты: они вводятся заказчиком в `.env` на сервере или в CRM → Интеграции.
