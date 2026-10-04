#!/usr/bin/env bash
# Дамп базы → gzip → S3 хостера. Хранится 30 ежедневных копий. Требует S3_* и DATABASE_URL в .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="/tmp/tr-rodionova-$STAMP.sql.gz"
docker run --rm --network host -e PGPASSWORD postgres:16 pg_dump "$DATABASE_URL" | gzip -9 > "$FILE"
docker run --rm -v "$FILE:/b.sql.gz:ro" -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli \
  --endpoint-url "$S3_ENDPOINT" s3 cp /b.sql.gz "s3://$S3_BUCKET/db/tr-rodionova-$STAMP.sql.gz" --only-show-errors
# удалить копии старше 30 дней
docker run --rm -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli \
  --endpoint-url "$S3_ENDPOINT" s3 ls "s3://$S3_BUCKET/db/" | awk '{print $4}' | sort | head -n -30 | while read -r f; do
    [ -n "$f" ] && docker run --rm -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" amazon/aws-cli --endpoint-url "$S3_ENDPOINT" s3 rm "s3://$S3_BUCKET/db/$f" --only-show-errors
  done
rm -f "$FILE"
echo "backup ok $STAMP"
