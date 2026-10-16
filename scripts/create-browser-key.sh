#!/usr/bin/env bash
# Creates the limited MinIO key that signs browser upload/download links and
# writes it into .env.public (created private if missing). The key can only read and write
# objects in the studio bucket: no listing, no deleting, no admin.
#
#   scripts/create-browser-key.sh            # uses R2_BUCKET_NAME from .env
#
# Additive only: it adds a MinIO user and policy, never removes or changes data.
# Re-running it rotates the secret (the old one stops working).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
bucket="${R2_BUCKET_NAME:?R2_BUCKET_NAME is not set in .env}"
user="${bucket}-browser"
secret="$(openssl rand -hex 24)"

docker exec -i -e RS="$R2_SECRET_ACCESS_KEY" -e RU="$R2_ACCESS_KEY_ID" -e BS="$secret" \
  -e BUCKET="$bucket" -e BUSER="$user" studio_os_minio sh -s >/dev/null <<'SH'
set -e
mc alias set studio http://localhost:9000 "$RU" "$RS"
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":["arn:aws:s3:::%s/*"]}]}' "$BUCKET" > /tmp/browser-policy.json
mc admin policy create studio "$BUSER" /tmp/browser-policy.json
rm -f /tmp/browser-policy.json
mc admin user add studio "$BUSER" "$BS"
mc admin policy attach studio "$BUSER" --user "$BUSER" 2>/dev/null || true
mc alias remove studio
SH

touch .env.public && chmod 600 .env.public
grep -v -E '^R2_PRESIGN_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=' .env.public > .env.public.tmp || true
printf 'R2_PRESIGN_ACCESS_KEY_ID="%s"\nR2_PRESIGN_SECRET_ACCESS_KEY="%s"\n' "$user" "$secret" >> .env.public.tmp
mv .env.public.tmp .env.public && chmod 600 .env.public
echo "Created MinIO key '$user' for bucket '$bucket' and saved it to .env.public."
