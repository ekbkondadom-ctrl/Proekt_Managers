#!/bin/bash
# ============================================================
#   КОНДА — автоматический деплой на Ubuntu 22.04 VPS
#   Запускать от root: bash setup.sh
# ============================================================
set -e

# ============================================================
# >>> ЕДИНСТВЕННОЕ МЕСТО, ГДЕ НУЖНО ЧТО-ТО МЕНЯТЬ <<<
DOMAIN="ВАШ_ДОМЕН.ru"        # например: konda.ru или konda.example.com
# ============================================================

REPO_URL="https://github.com/ekbkondadom-ctrl/Proekt_Managers.git"
APP_DIR="/var/www/conda"
PORT=5000
NODE_VERSION=20

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
section() { echo -e "\n${GREEN}━━━ $1 ━━━${NC}"; }

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Запустите скрипт от root: sudo bash setup.sh${NC}"
  exit 1
fi

if [ "$DOMAIN" = "ВАШ_ДОМЕН.ru" ]; then
  echo -e "${RED}Укажите домен в переменной DOMAIN в начале скрипта!${NC}"
  exit 1
fi

# ── 1. Системные обновления ──────────────────────────────────
section "Обновление системы"
apt-get update -q && apt-get upgrade -y -q
apt-get install -y -q curl git openssl nginx certbot python3-certbot-nginx
info "Системные пакеты установлены"

# ── 2. Node.js ───────────────────────────────────────────────
section "Установка Node.js $NODE_VERSION"
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - >/dev/null
  apt-get install -y -q nodejs
fi
info "Node.js $(node -v) установлен"

# ── 3. PM2 ───────────────────────────────────────────────────
section "Установка PM2"
npm install -g pm2 --silent
info "PM2 $(pm2 -v) установлен"

# ── 4. Клонирование репозитория ──────────────────────────────
section "Загрузка приложения"
if [ -d "$APP_DIR/.git" ]; then
  warn "Директория уже существует — обновляем"
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi
info "Репозиторий: $APP_DIR"

# ── 5. Зависимости npm ───────────────────────────────────────
section "Установка зависимостей"
cd "$APP_DIR/backend"
npm install --production --silent
info "npm зависимости установлены"

# ── 6. .env файл ─────────────────────────────────────────────
section "Создание конфигурации (.env)"
JWT_SECRET=$(openssl rand -hex 32)

cat > "$APP_DIR/backend/.env" <<EOF
PORT=$PORT
NODE_ENV=production

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

DATABASE_PATH=$APP_DIR/backend/conda.db

CORS_ORIGIN=https://$DOMAIN
EOF

chmod 600 "$APP_DIR/backend/.env"
info ".env создан (JWT_SECRET сгенерирован автоматически)"

# ── 7. PM2 запуск ────────────────────────────────────────────
section "Запуск приложения через PM2"
pm2 delete conda-backend 2>/dev/null || true
pm2 start "$APP_DIR/backend/server.js" \
  --name conda-backend \
  --cwd "$APP_DIR" \
  --env production \
  --time
pm2 save

# Автозапуск PM2 при перезагрузке сервера
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root >/dev/null
pm2 save
info "Приложение запущено и добавлено в автозапуск"

# ── 8. Nginx ─────────────────────────────────────────────────
section "Настройка Nginx"

cat > /etc/nginx/sites-available/conda <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 50m;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/conda /etc/nginx/sites-enabled/conda
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "Nginx настроен и перезапущен"

# ── 9. SSL (Let's Encrypt) ────────────────────────────────────
section "Установка SSL-сертификата"
warn "Убедитесь, что DNS домена $DOMAIN уже указывает на IP этого сервера!"
read -p "Настраивать SSL прямо сейчас? (y/n): " SSL_NOW

if [ "$SSL_NOW" = "y" ] || [ "$SSL_NOW" = "Y" ]; then
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" --redirect
  info "SSL сертификат установлен, перенаправление HTTP→HTTPS включено"
  # Обновляем CORS в .env
  sed -i "s|CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" "$APP_DIR/backend/.env"
  pm2 restart conda-backend
else
  warn "SSL пропущен. Запустите позже: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# ── Итог ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ДЕПЛОЙ ЗАВЕРШЁН УСПЕШНО!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  Сайт:        ${YELLOW}http://$DOMAIN${NC}"
echo -e "  Директория:  $APP_DIR"
echo -e "  PM2:         pm2 status | pm2 logs conda-backend"
echo -e "  Обновление:  bash $APP_DIR/deploy/update.sh"
echo ""
echo -e "${YELLOW}  JWT_SECRET (сохраните в безопасном месте):${NC}"
echo -e "  $JWT_SECRET"
echo ""
