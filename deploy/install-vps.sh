#!/usr/bin/env bash
# Instala somente o namespace invictus-beauty. Requer runtime, app e backup previamente transferidos.
set -euo pipefail
APP=/opt/invictus-beauty
STATE=/var/lib/invictus-beauty
PUBLIC_IP=76.13.113.108
test "$(id -u)" = 0
test -x "$APP/runtime/node"
test -f "$APP/app/server.mjs"
test -f "$APP/deploy/migration.sqlite"
: "${TLS_SOURCE_CERT:?Informe o caminho do certificado existente do IP, somente leitura}"
: "${TLS_SOURCE_KEY:?Informe o caminho da chave existente, somente leitura}"
test -r "$TLS_SOURCE_CERT" && test -r "$TLS_SOURCE_KEY"
openssl x509 -in "$TLS_SOURCE_CERT" -checkip "$PUBLIC_IP" -noout
openssl x509 -in "$TLS_SOURCE_CERT" -checkend 3600 -noout
if ss -H -ltn '( sport = :8445 or sport = :18475 )' | grep -q .; then
  echo 'Portas reservadas ocupadas. Instalação interrompida.' >&2; exit 1
fi
systemctl list-units --type=service --state=running --plain --full --no-legend --no-pager |
 awk '{print $1}' | grep -E '^(invictus|lastrova|nginx|mysql)' | grep -v '^invictus-beauty' |
 while read -r unit; do systemctl show "$unit" -p Id -p MainPID -p ActiveState --value | paste -sd '\t' -; done |
 sort > "$APP/deploy/services-before.tsv"
id invictus-beauty >/dev/null 2>&1 || useradd --system --home-dir "$STATE" --shell /usr/sbin/nologin invictus-beauty
install -d -m 0700 -o invictus-beauty -g invictus-beauty "$STATE" /var/backups/invictus-beauty
install -d -m 0700 "$APP/tls" /etc/invictus-beauty
install -d -m 0750 -o invictus-beauty -g invictus-beauty /var/log/invictus-beauty /var/cache/invictus-beauty
if test -e "$STATE/invictus.sqlite"; then
  echo 'Banco já existente: não será substituído.' >&2; exit 1
fi
install -m 0600 -o invictus-beauty -g invictus-beauty "$APP/deploy/migration.sqlite" "$STATE/invictus.sqlite"
chmod 0600 "$APP/deploy/migration.sqlite"
chmod 0755 "$APP/deploy"
cat > /etc/invictus-beauty/env <<EOF
NODE_ENV=production
PORT=18475
DB_PATH=$STATE/invictus.sqlite
PUBLIC_ORIGIN=https://$PUBLIC_IP:8445
COOKIE_SECURE=1
EOF
chmod 0600 /etc/invictus-beauty/env
printf 'TLS_SOURCE_CERT=%s\nTLS_SOURCE_KEY=%s\n' "$TLS_SOURCE_CERT" "$TLS_SOURCE_KEY" > /etc/invictus-beauty/tls-source.env
chmod 0600 /etc/invictus-beauty/tls-source.env
cat > "$APP/deploy/sync-tls.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
source /etc/invictus-beauty/tls-source.env
TARGET=/opt/invictus-beauty/tls
openssl x509 -in "$TLS_SOURCE_CERT" -noout -checkip 76.13.113.108 >/dev/null
openssl x509 -in "$TLS_SOURCE_CERT" -noout -checkend 3600 >/dev/null
CERT_HASH=$(openssl x509 -in "$TLS_SOURCE_CERT" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d ' ' -f1)
KEY_HASH=$(openssl pkey -in "$TLS_SOURCE_KEY" -pubout -outform DER | sha256sum | cut -d ' ' -f1)
test "$CERT_HASH" = "$KEY_HASH"
if cmp -s "$TLS_SOURCE_CERT" "$TARGET/fullchain.pem" && cmp -s "$TLS_SOURCE_KEY" "$TARGET/privkey.pem"; then exit 0; fi
install -m 0600 "$TLS_SOURCE_CERT" "$TARGET/fullchain.pem.new"
install -m 0600 "$TLS_SOURCE_KEY" "$TARGET/privkey.pem.new"
mv "$TARGET/fullchain.pem.new" "$TARGET/fullchain.pem"
mv "$TARGET/privkey.pem.new" "$TARGET/privkey.pem"
if systemctl is-active --quiet invictus-beauty-web.service; then systemctl reload invictus-beauty-web.service; fi
SCRIPT
chmod 0700 "$APP/deploy/sync-tls.sh"
"$APP/deploy/sync-tls.sh"
cat > "$APP/nginx.conf" <<'NGINX'
user invictus-beauty;
worker_processes 1;
pid /run/invictus-beauty-web/nginx.pid;
error_log /var/log/invictus-beauty/nginx-error.log warn;
events { worker_connections 256; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  server_tokens off;
  log_format beauty '$remote_addr $request_method $uri $status $body_bytes_sent $request_time';
  access_log /var/log/invictus-beauty/nginx-access.log beauty;
  client_max_body_size 1m;
  client_body_temp_path /var/cache/invictus-beauty/client;
  proxy_temp_path /var/cache/invictus-beauty/proxy;
  fastcgi_temp_path /var/cache/invictus-beauty/fastcgi;
  uwsgi_temp_path /var/cache/invictus-beauty/uwsgi;
  scgi_temp_path /var/cache/invictus-beauty/scgi;
  server {
    listen 8445 ssl;
    server_name 76.13.113.108;
    ssl_certificate /opt/invictus-beauty/tls/fullchain.pem;
    ssl_certificate_key /opt/invictus-beauty/tls/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_tickets off;
    ssl_session_cache shared:BEAUTY:5m;
    location / {
      proxy_pass http://127.0.0.1:18475;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header Connection "";
      proxy_read_timeout 30s;
    }
  }
}
NGINX
cat > /etc/systemd/system/invictus-beauty.service <<'UNIT'
[Unit]
Description=Invictus Beauty - API and persistent SQLite
After=network.target
[Service]
Type=simple
User=invictus-beauty
Group=invictus-beauty
WorkingDirectory=/opt/invictus-beauty/app
EnvironmentFile=/etc/invictus-beauty/env
ExecStart=/opt/invictus-beauty/runtime/node --max-old-space-size=128 server.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/invictus-beauty
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
MemoryMax=384M
CPUQuota=80%
TasksMax=64
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/invictus-beauty-web.service <<'UNIT'
[Unit]
Description=Invictus Beauty - exclusive HTTPS port 8445
After=network.target invictus-beauty.service
Requires=invictus-beauty.service
[Service]
Type=simple
RuntimeDirectory=invictus-beauty-web
RuntimeDirectoryMode=0750
ExecStartPre=/usr/sbin/nginx -t -c /opt/invictus-beauty/nginx.conf -p /run/invictus-beauty-web/
ExecStart=/usr/sbin/nginx -c /opt/invictus-beauty/nginx.conf -p /run/invictus-beauty-web/ -g "daemon off;"
ExecReload=/bin/kill -s HUP $MAINPID
KillSignal=SIGQUIT
TimeoutStopSec=15
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/run/invictus-beauty-web /var/log/invictus-beauty /var/cache/invictus-beauty
MemoryMax=96M
TasksMax=32
[Install]
WantedBy=multi-user.target
UNIT
cat > "$APP/deploy/backup.mjs" <<'JS'
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
const directory='/var/backups/invictus-beauty';
mkdirSync(directory,{recursive:true,mode:0o700});
const db=new DatabaseSync('/var/lib/invictus-beauty/invictus.sqlite',{readOnly:true});
try { await backup(db,directory+'/invictus-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite'); console.log('Backup Invictus Beauty concluído.'); } finally { db.close(); }
JS
cat > /etc/systemd/system/invictus-beauty-backup.service <<'UNIT'
[Unit]
Description=Invictus Beauty - consistent SQLite backup
[Service]
Type=oneshot
User=invictus-beauty
Group=invictus-beauty
UMask=0077
ExecStart=/opt/invictus-beauty/runtime/node /opt/invictus-beauty/deploy/backup.mjs
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/invictus-beauty /var/backups/invictus-beauty
UNIT
cat > /etc/systemd/system/invictus-beauty-backup.timer <<'UNIT'
[Unit]
Description=Invictus Beauty - daily backup
[Timer]
OnCalendar=daily
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/invictus-beauty-tls.service <<'UNIT'
[Unit]
Description=Invictus Beauty - refresh isolated copy of server IP certificate
[Service]
Type=oneshot
ExecStart=/opt/invictus-beauty/deploy/sync-tls.sh
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/invictus-beauty/tls
UNIT
cat > /etc/systemd/system/invictus-beauty-tls.timer <<'UNIT'
[Unit]
Description=Invictus Beauty - certificate synchronization
[Timer]
OnBootSec=2m
OnUnitActiveSec=1h
[Install]
WantedBy=timers.target
UNIT
systemd-analyze verify /etc/systemd/system/invictus-beauty{,-web,-backup,-tls}.service
systemctl daemon-reload
systemctl enable --now invictus-beauty.service invictus-beauty-web.service invictus-beauty-backup.timer invictus-beauty-tls.timer
systemctl start invictus-beauty-backup.service
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 10 --resolve 76.13.113.108:8445:127.0.0.1 https://76.13.113.108:8445/api/auth/status
ufw allow 8445/tcp comment 'Invictus Beauty isolated HTTPS'
echo 'Invictus Beauty instalado em https://76.13.113.108:8445'
