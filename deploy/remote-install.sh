#!/usr/bin/env bash
# Instala/atualiza a API na VPS. Executado como root pelo deploy.ps1 (ou à mão):
#   bash remote-install.sh <dir-com-os-arquivos> [--nginx]
# Idempotente. Faz backup antes de mudar e desfaz a mudança do Nginx se `nginx -t` falhar.
set -euo pipefail

STAGE="${1:?informe o diretório com os arquivos enviados}"
WITH_NGINX="${2:-}"
APP_DIR=/opt/projects/brasil-dev-kit
PORT=8795
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT=/var/backups/brasil-dev-kit
BACKUP="$BACKUP_ROOT/$TS"
SITE=/etc/nginx/sites-available/efer.online
HTTP_CONF=/etc/nginx/conf.d/brasil-dev-kit.conf
SNIPPET=/etc/nginx/snippets/brasil-dev-kit.conf
INCLUDE_LINE='    include /etc/nginx/snippets/brasil-dev-kit.conf;'

install -d -m 700 "$BACKUP_ROOT" "$BACKUP"

echo "==> Backup do app anterior"
if [ -d "$APP_DIR" ]; then
  tar -czf "$BACKUP/app.tgz" -C "$APP_DIR" .
fi

echo "==> Instalando arquivos em $APP_DIR"
install -d -m 755 "$APP_DIR" "$APP_DIR/dist-server"
install -m 644 "$STAGE/Dockerfile" "$STAGE/docker-compose.yml" "$APP_DIR/"
install -m 644 "$STAGE/server.js" "$APP_DIR/dist-server/server.js"

echo "==> Build e subida do container"
cd "$APP_DIR"
docker compose build --pull=false
docker compose up -d

echo "==> Aguardando health check"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  echo "ERRO: API não respondeu em 127.0.0.1:$PORT" >&2
  docker compose logs --tail 50 >&2 || true
  exit 1
fi
echo "API ok em 127.0.0.1:$PORT"

if [ "$WITH_NGINX" = "--nginx" ]; then
  echo "==> Nginx: backup"
  cp -a "$SITE" "$BACKUP/efer.online"
  [ -f "$HTTP_CONF" ] && cp -a "$HTTP_CONF" "$BACKUP/conf.d-brasil-dev-kit.conf"
  [ -f "$SNIPPET" ] && cp -a "$SNIPPET" "$BACKUP/snippet-brasil-dev-kit.conf"

  restore() {
    echo "ERRO: nginx -t falhou; restaurando configuração anterior" >&2
    cp -a "$BACKUP/efer.online" "$SITE"
    if [ -f "$BACKUP/conf.d-brasil-dev-kit.conf" ]; then cp -a "$BACKUP/conf.d-brasil-dev-kit.conf" "$HTTP_CONF"; else rm -f "$HTTP_CONF"; fi
    if [ -f "$BACKUP/snippet-brasil-dev-kit.conf" ]; then cp -a "$BACKUP/snippet-brasil-dev-kit.conf" "$SNIPPET"; else rm -f "$SNIPPET"; fi
    nginx -t
  }

  # Qualquer erro daqui em diante desfaz a mudança do Nginx.
  trap 'restore; exit 1' ERR

  echo "==> Nginx: instalando configuração"
  install -m 644 "$STAGE/brasil-dev-kit-http.conf" "$HTTP_CONF"
  install -m 644 "$STAGE/brasil-dev-kit-location.conf" "$SNIPPET"
  if ! grep -qF 'snippets/brasil-dev-kit.conf' "$SITE"; then
    # Inclui logo após o primeiro `server_name efer.online` (server block principal).
    # Reescreve com `cat >` para manter dono, permissões e o symlink de sites-enabled.
    tmp="$(mktemp)"
    awk -v line="$INCLUDE_LINE" '
      { print }
      !done && index($0, "server_name efer.online") { print line; done = 1 }
    ' "$SITE" > "$tmp"
    cat "$tmp" > "$SITE"
    rm -f "$tmp"
    grep -qF 'snippets/brasil-dev-kit.conf' "$SITE" || { echo "ERRO: não achei onde incluir o snippet" >&2; restore; exit 1; }
  fi

  trap - ERR
  if nginx -t; then
    systemctl reload nginx
    echo "Nginx recarregado"
  else
    restore
    exit 1
  fi
fi

echo "==> Concluído. Backup em $BACKUP"
