#!/usr/bin/env bash
# Первичная настройка сервера Ubuntu 24.04/26.04 одной командой (запускать от root через веб-консоль или SSH):
#   bash <(curl -fsSL https://raw.githubusercontent.com/alikabdiraimov584-prog/tr-rodionova/main/deploy/install.sh)
# Делает: обновления, файрвол, fail2ban, Docker, пользователя deploy, клон репозитория, .env-шаблон.
set -euo pipefail

REPO="https://github.com/alikabdiraimov584-prog/tr-rodionova.git"
APP_DIR="/opt/tr-rodionova"

echo "== Обновление системы и базовые пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q && apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw fail2ban unattended-upgrades

echo "== Автоматические обновления безопасности"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Файрвол: только SSH, 80, 443"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "== fail2ban для SSH"
cat >/etc/fail2ban/jail.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 10m
JAIL
systemctl enable --now fail2ban

echo "== SSH: вход по паролю отключается только если на сервере уже есть SSH-ключ (иначе можно потерять доступ)"
if [ -s /root/.ssh/authorized_keys ]; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload ssh || systemctl reload sshd || true
else
  echo "   SSH-ключ не найден: вход по паролю оставлен. Добавьте ключ и выполните: sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl reload ssh"
fi

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "== Пользователь deploy"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
[ -f /root/.ssh/authorized_keys ] && cp /root/.ssh/authorized_keys /home/deploy/.ssh/ && chown -R deploy:deploy /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys || true

echo "== Код приложения"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R deploy:deploy "$APP_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/deploy/env.production.example" "$APP_DIR/.env"
  sed -i "s/^AUTH_SECRET=.*/AUTH_SECRET=$(openssl rand -hex 32)/" "$APP_DIR/.env"
  sed -i "s/^CRON_SECRET=.*/CRON_SECRET=$(openssl rand -hex 24)/" "$APP_DIR/.env"
  chown deploy:deploy "$APP_DIR/.env" && chmod 600 "$APP_DIR/.env"
fi

echo "== Ежедневный бэкап базы в 02:30 МСК (23:30 UTC)"
( crontab -u deploy -l 2>/dev/null | grep -v backup.sh; echo "30 23 * * * cd $APP_DIR && bash deploy/backup.sh >> /home/deploy/backup.log 2>&1" ) | crontab -u deploy -

cat <<MSG

Готово. Дальше:
  1. Заполните $APP_DIR/.env: DOMAIN, APP_URL, DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ключи S3.
  2. Направьте A-запись домена на IP этого сервера.
  3. Запустите:  cd $APP_DIR && sudo -u deploy docker compose up -d --build
  4. Проверьте:  https://<домен>  и  https://<домен>/crm
Обновление после изменений в репозитории:  cd $APP_DIR && sudo -u deploy bash deploy/update.sh
MSG
