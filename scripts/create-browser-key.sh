#!/usr/bin/env bash
# Creates the limited MinIO key that signs browser upload/download links and
# writes it into .env.public (created private if missing). The key can read any
# object in the studio bucket and write only under originals/ and locations/:
# no listing, no deleting, no admin, no overwriting previews/ or contracts/.
#
#   scripts/create-browser-key.sh            # uses R2_BUCKET_NAME from .env
#
# Needs the MinIO container running (docker start studio_os_minio).
# Additive only: it adds a MinIO user and policy, never removes or changes data.
# Re-running rotates the secret: restart the API afterwards so it picks it up.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

set -a; . ./.env; set +a
bucket="${R2_BUCKET_NAME:?R2_BUCKET_NAME is not set in .env}"
export BUSER="${bucket}-browser" BUCKET="$bucket"
BS="$(openssl rand -hex 24)"; export BS
export RS="$R2_SECRET_ACCESS_KEY" RU="$R2_ACCESS_KEY_ID"

[ "$(docker inspect -f '{{.State.Running}}' studio_os_minio 2>/dev/null)" = true ] \
  || { echo "studio_os_minio is not running (docker start studio_os_minio)"; exit 1; }

# Stage the new .env.public first so a failure never leaves a rotated secret
# with nowhere to live. Only replace the file once MinIO has accepted the key.
touch .env.public
staged="$(mktemp .env.public.XXXXXX)"
trap 'rm -f "$staged"' EXIT
{ grep -v -E '^R2_PRESIGN_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=' .env.public || [ $? -eq 1 ]; } > "$staged"
printf 'R2_PRESIGN_ACCESS_KEY_ID="%s"\nR2_PRESIGN_SECRET_ACCESS_KEY="%s"\n' "$BUSER" "$BS" >> "$staged"

docker exec -i -e RS -e RU -e BS -e BUCKET -e BUSER studio_os_minio sh -s <<'SH' >/dev/null
set -e
trap 'mc alias remove studio >/dev/null 2>&1; rm -f /tmp/browser-policy.json' EXIT
mc alias set studio http://localhost:9000 "$RU" "$RS"
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]},{"Effect":"Allow","Action":["s3:PutObject"],"Resource":["arn:aws:s3:::%s/originals/*","arn:aws:s3:::%s/locations/*"]}]}' "$BUCKET" "$BUCKET" "$BUCKET" > /tmp/browser-policy.json
mc admin policy create studio "$BUSER" /tmp/browser-policy.json
mc admin user add studio "$BUSER" "$BS"
out="$(mc admin policy attach studio "$BUSER" --user "$BUSER" 2>&1)" || case "$out" in
  *"already"*) ;;
  *) echo "$out" >&2; exit 1 ;;
esac
SH

mv "$staged" .env.public
chmod 600 .env.public
trap - EXIT
echo "Created MinIO key '$BUSER' for bucket '$bucket' and saved it to .env.public."
echo "Restart the API if it is already running so it signs with the new secret."
