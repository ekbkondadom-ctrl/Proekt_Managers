# Proekt_Manager

Проект «КОНДА — Менеджер проектов».

## Структура

- `index.html` — основной фронтенд
- `backend/` — Node.js backend и API
- `data/` — локальные данные (игнорируются в git)

## Как сохранить на GitHub

Репозиторий уже подключён к remote:

```bash
git remote -v
```

Если нужно отправить изменения на GitHub:

```bash
git add .
git commit -m "Save project files to GitHub"
git pull --rebase origin main
git push origin main
```

## Запуск локально

Перейти в папку backend и установить зависимости:

```bash
cd backend
npm install
```

Запустить сервер:

```bash
npm start
```

Открыть в браузере:

```text
http://localhost:5000/
```

