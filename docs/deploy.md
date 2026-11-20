# Deploy da API (efer.online)

A API roda em um container Docker na VPS que hospeda `efer.online`, publicado
só no loopback (`127.0.0.1:8795`). O acesso público passa pelo Nginx em
`/api/brasil-dev-kit/`, atrás do Cloudflare.

## Arquivos

| Arquivo                                     | Destino na VPS                              |
| ------------------------------------------- | ------------------------------------------- |
| `dist-server/server.js` (gerado no build)   | `/opt/projects/brasil-dev-kit/dist-server/` |
| `deploy/Dockerfile`                         | `/opt/projects/brasil-dev-kit/`             |
| `deploy/docker-compose.yml`                 | `/opt/projects/brasil-dev-kit/`             |
| `deploy/nginx/brasil-dev-kit-http.conf`     | `/etc/nginx/conf.d/brasil-dev-kit.conf`     |
| `deploy/nginx/brasil-dev-kit-location.conf` | `/etc/nginx/snippets/brasil-dev-kit.conf`   |
| `deploy/remote-install.sh`                  | executado em `/tmp` e apagado depois        |

O snippet é incluído no server block de `efer.online`, logo após o
`server_name`. A imagem base é `node:24-alpine` fixada por digest.

## Publicar

```powershell
.\deploy\deploy.ps1          # roda pnpm run check, envia e atualiza o container
.\deploy\deploy.ps1 -Nginx   # também instala/atualiza a rota no Nginx
```

O script remoto:

1. faz backup em `/var/backups/brasil-dev-kit/<data>/` (app e, com `-Nginx`,
   a configuração do site);
2. instala os arquivos, reconstrói e sobe o container;
3. espera `GET /v1/health` responder no loopback (até 30 s);
4. com `-Nginx`: instala as configurações, roda `nginx -t` e só então recarrega;
   em qualquer erro, restaura os arquivos anteriores.

## Reverter

```bash
# Rota no Nginx: restaurar o arquivo do site e remover os dois arquivos da API
cp -a /var/backups/brasil-dev-kit/<data>/efer.online /etc/nginx/sites-available/efer.online
rm -f /etc/nginx/conf.d/brasil-dev-kit.conf /etc/nginx/snippets/brasil-dev-kit.conf
nginx -t && systemctl reload nginx

# Container
cd /opt/projects/brasil-dev-kit && docker compose down
```

## Operação

```bash
docker ps --filter name=brasil-dev-kit-api
docker logs --tail 50 brasil-dev-kit-api      # inclui contadores a cada 5 min
docker stats --no-stream brasil-dev-kit-api
curl -s http://127.0.0.1:8795/v1/health
```

Não há banco de dados nem segredos: o estado é só o cache em memória, que se
perde (sem problema) a cada reinício.
