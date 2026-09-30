#!/usr/bin/env bash
# Birinchi marta Let's Encrypt SSL sertifikatini oladi (dummy -> real -> reload).
# Ishlatish (docker/ papkasida):  bash init-letsencrypt.sh
set -euo pipefail

cd "$(dirname "$0")"
# .env dan DOMAIN va ACME_EMAIL ni o'qiymiz
set -a
# shellcheck disable=SC1091
. ../.env
set +a

: "${DOMAIN:?DOMAIN .env da yo'q}"
: "${ACME_EMAIL:?ACME_EMAIL .env da yo'q}"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

echo "==> 1/4  Vaqtinchalik (dummy) sertifikat yaratamiz (nginx ishga tushishi uchun)..."
$COMPOSE run --rm --entrypoint sh certbot -c "\
  mkdir -p '$CERT_DIR' && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$CERT_DIR/privkey.pem' -out '$CERT_DIR/fullchain.pem' -subj '/CN=localhost'"

echo "==> 2/4  Nginx'ni ishga tushiramiz..."
$COMPOSE up -d nginx

echo "==> 3/4  Dummy sertifikatni o'chirib, haqiqiy Let's Encrypt sertifikatini olamiz..."
$COMPOSE run --rm --entrypoint sh certbot -c "\
  rm -rf '/etc/letsencrypt/live/$DOMAIN' \
         '/etc/letsencrypt/archive/$DOMAIN' \
         '/etc/letsencrypt/renewal/$DOMAIN.conf'"
$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$ACME_EMAIL" --agree-tos --no-eff-email --force-renewal

echo "==> 4/4  Nginx'ni qayta yuklaymiz..."
$COMPOSE exec nginx nginx -s reload

echo "✅ SSL tayyor: https://$DOMAIN"
