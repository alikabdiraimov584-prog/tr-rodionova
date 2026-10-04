#!/usr/bin/env bash
# Дамп базы → gzip → S3 хостера. Хранится 30 ежедневных копий. Требует S3_* и DATABASE_URL в .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="/tmp/tr-rodionova-$STAMP.sql.gz"
if [[ "${COMPOSE_PROFILES:-}" == *localdb* ]]; then
  # база в контейнере db: дамп изнутри compose-сети
  docker compose exec -T db pg_dump -U tr tr_rodionova | gzip -9 > "$FILE"
else
  docker run --rm --network host postgres:16 pg_dump "$DATABASE_URL" | gzip -9 > "$FILE"
fi
# локальная копия на сервере на случай недоступности S3 (хранится 7 дней)
mkdir -p /home/deploy/backups && cp "$FILE" /home/deploy/backups/ && find /home/deploy/backups -name '*.sql.gz' -mtime +7 -delete
if [ -z "${S3_ACCESS_KEY:-}" ]; then rm -f "$FILE"; echo "backup local ok $STAMP (S3 не настроен)"; exit 0; fi
docker run --rm -v "$FILE:/b.sql.gz:ro" -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli \
  --endpoint-url "$S3_ENDPOINT" s3 cp /b.sql.gz "s3://$S3_BUCKET/db/tr-rodionova-$STAMP.sql.gz" --only-show-errors
# удалить копии старше 30 дней
docker run --rm -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli \
  --endpoint-url "$S3_ENDPOINT" s3 ls "s3://$S3_BUCKET/db/" | awk '{print $4}' | sort | head -n -30 | while read -r f; do
    [ -n "$f" ] && docker run --rm -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli --endpoint-url "$S3_ENDPOINT" s3 rm "s3://$S3_BUCKET/db/$f" --only-show-errors
  done
rm -f "$FILE"
echo "backup ok $STAMP"
