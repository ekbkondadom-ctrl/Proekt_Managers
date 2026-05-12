#!/bin/bash
# Обновление приложения из GitHub (запускать на сервере)
set -e
APP_DIR="/var/www/conda"

echo "[→] Получение обновлений из GitHub..."
git -C "$APP_DIR" pull origin main

echo "[→] Обновление зависимостей..."
cd "$APP_DIR/backend" && npm install --production --silent

echo "[→] Перезапуск приложения..."
pm2 restart conda-backend

echo "[✓] Обновление завершено! Версия: $(git -C $APP_DIR log --oneline -1)"
