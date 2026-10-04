# Продакшен: домен, сервер, защита

## Что купить
1. **Домен** на reg.ru на ИП/ООО бренда, на 3+ года, с transfer lock и 2FA аккаунта. DNS reg.ru: `A @ → IP`, `A www → IP`, `CAA 0 issue "letsencrypt.org"`.
2. **Сервер** Timeweb Cloud / Selectel в России: Ubuntu 24.04+, 2 vCPU, 4 ГБ, 50 ГБ NVMe, бэкапы, публичный IP, вход по SSH-ключу.
3. **База данных.** На старте — PostgreSQL в контейнере на том же сервере (профиль `localdb`, включён по умолчанию в `.env`). При росте — управляемый PostgreSQL 16 у того же хостера (приватная сеть, бэкапы): убрать `COMPOSE_PROFILES` и вписать его `DATABASE_URL`.
4. **S3-хранилище** (бакеты `tr-rodionova-media` для фото и `tr-rodionova-backups` для дампов).
5. **Почта на домене** (Яндекс 360): care@…, SPF/DKIM/DMARC.

## Установка (один раз)
Из веб-консоли сервера под root:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/alikabdiraimov584-prog/tr-rodionova/main/deploy/install.sh)
```
Скрипт ставит обновления, файрвол (только 22/80/443), fail2ban, Docker, пользователя `deploy`, клонирует репозиторий в `/opt/tr-rodionova`, создаёт `.env` со случайными секретами и ежедневный бэкап.

Затем заполните `/opt/tr-rodionova/.env` (DOMAIN, APP_URL, NEXT_PUBLIC_SITE_URL, ADMIN_EMAIL, ADMIN_PASSWORD; S3 — для бэкапов) и запустите:
```bash
cd /opt/tr-rodionova && sudo -u deploy docker compose up -d --build
```
Caddy получит TLS-сертификат сам, как только A-запись домена укажет на сервер. Приложение применит миграции, создаст администратора и загрузит вещи бренда.

## Обновления
`cd /opt/tr-rodionova && sudo -u deploy bash deploy/update.sh` — или автодеплой: в GitHub добавьте секреты `DEPLOY_HOST`, `DEPLOY_USER=deploy`, `DEPLOY_SSH_KEY` и переменную `DEPLOY_ENABLED=true`.

## После запуска
- CRM → Интеграции: ЮKassa, доставка, Метрика, Вебмастер; CRM → Настройки: реквизиты продавца; каждому сотруднику включить 2FA.
- Уведомление Роскомнадзора об обработке ПДн (Госуслуги), политика и оферта проверены юристом.
- Раз в месяц: восстановить бэкап на тестовой базе и убедиться, что он открывается.

## Защита: что уже встроено
Шифрование ключей интеграций, 2FA сотрудников, лимиты входа, версии сессий, CSP/HSTS, httpOnly/secure cookie, роли и аудит, обезличивание клиенток, выгрузка своих данных, проверка файлов. На сервере: ключи вместо паролей, файрвол, fail2ban, автообновления, база в приватной сети, ежедневные бэкапы.
