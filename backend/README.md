# КОНДА Backend

REST API сервер для КОНДА - менеджера проектов с системой авторизации, ролей и управлением пользователями.

## Установка и запуск

### 1. Установка зависимостей

```bash
cd backend
npm install
```

### 2. Конфигурация

Скопируйте `.env.example` в `.env` и отредактируйте переменные окружения:

```bash
cp .env.example .env
```

Важные переменные:
- `PORT` - порт сервера (по умолчанию 5000)
- `JWT_SECRET` - секретный ключ для JWT токенов (ИЗМЕНИТЕ в production!)
- `DATABASE_PATH` - путь к файлу SQLite БД
- `CORS_ORIGIN` - адрес frontend (для CORS)

### 3. Запуск сервера

**Режим разработки (с автоперезагрузкой):**
```bash
npm run dev
```

**Режим production:**
```bash
npm start
```

Сервер будет запущен на `http://localhost:5000`

## Структура проекта

```
backend/
├── server.js              # Главный файл Express приложения
├── package.json          # Зависимости
├── .env                  # Переменные окружения
├── db/                   # База данных
│   ├── init.js          # Инициализация БД
│   └── schema.sql       # SQL схема таблиц
├── middleware/          # Express middleware
│   ├── auth.js          # JWT проверка
│   ├── rbac.js          # Проверка ролей
│   └── errorHandler.js  # Обработка ошибок
├── routes/              # API endpoints
│   ├── auth.js          # Авторизация
│   ├── system.js        # Первичная настройка
│   ├── users.js         # Управление пользователями
│   ├── projects.js      # Управление проектами
│   └── settings.js      # Управление настройками
├── models/              # Модели данных (планируется)
└── utils/               # Утилиты
    ├── passwordHash.js  # Хеширование паролей
    ├── tokenManager.js  # Работа с JWT
    └── logger.js        # Логирование
```

## API Endpoints

### Авторизация

- `POST /api/auth/login` - Вход в систему
- `POST /api/auth/logout` - Выход из системы
- `GET /api/auth/check` - Проверка статуса сессии

### Система

- `GET /api/system/status` - Проверить статус (нужна ли первичная настройка)
- `POST /api/system/setup` - Создать первого супер-админа

### Пользователи (только супер-админ)

- `GET /api/users` - Список пользователей
- `POST /api/users` - Создать пользователя
- `GET /api/users/:id` - Получить пользователя
- `PUT /api/users/:id` - Обновить пользователя
- `DELETE /api/users/:id` - Удалить пользователя
- `POST /api/users/:id/password` - Установить новый пароль

### Проекты (админ, менеджер, супер-админ)

- `GET /api/projects` - Список проектов
- `POST /api/projects` - Создать проект
- `GET /api/projects/:id` - Получить проект
- `PUT /api/projects/:id` - Обновить проект
- `DELETE /api/projects/:id` - Удалить проект

### Настройки (админ, менеджер, супер-админ)

- `GET /api/settings` - Получить все настройки
- `GET /api/settings/:key` - Получить одну настройку
- `PUT /api/settings` - Обновить настройки
- `DELETE /api/settings/:key` - Удалить настройку

## Роли и доступ

### Manager (Менеджер)
- Видит только интерфейс проектов
- Нет доступа к Настройкам
- Работает только с данными своего админа
- Не может создавать пользователей

### Admin (Администратор)
- Имеет доступ к Настройкам
- Видит только свои проекты и настройки
- Может управлять менеджерами (работать над этим)
- Не видит других админов

### Super Admin (Супер-администратор)
- Полный доступ ко всей системе
- Может управлять всеми пользователями
- Видит все проекты и настройки
- Может создавать/редактировать/удалять аккаунты

## Безопасность

- ✅ Пароли хешируются с использованием bcryptjs (10 раундов)
- ✅ JWT токены для авторизации (24 часа жизни)
- ✅ Проверка прав на уровне middleware (RBAC)
- ✅ Логирование всех действий
- ✅ Изоляция данных по админам
- ⚠️ CORS включен только для CORS_ORIGIN
- ⚠️ JWT_SECRET должен быть изменен в production!

## Первичная настройка

1. При первом запуске БД создается автоматически
2. `GET /api/system/status` вернет `hasSuperAdmin: false`
3. Первый пользователь создает супер-админа через `POST /api/system/setup`
4. После этого `initial_setup_completed` становится `true`
5. Все остальные пользователи должны авторизоваться через вход

## Тестирование

### Создание супер-админа

```bash
curl -X POST http://localhost:5000/api/system/setup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Администратор",
    "login": "admin",
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }'
```

### Вход

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "admin",
    "password": "SecurePassword123"
  }'
```

Ответ:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "name": "Администратор",
    "role": "super_admin",
    "login": "admin",
    "email": "admin@example.com"
  }
}
```

### Запрос с авторизацией

```bash
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer <TOKEN>"
```

## Переменные окружения

```env
# Backend Server
PORT=5000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=dev-secret-key-not-for-production-change-it-now
JWT_EXPIRES_IN=24h

# Database
DATABASE_PATH=./conda.db

# Frontend
FRONTEND_URL=http://localhost:3000

# CORS
CORS_ORIGIN=http://localhost:3000

# Security
MAX_LOGIN_ATTEMPTS=5
LOCK_TIME_MINUTES=15
```

## Разработка

### Структура ошибок API

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2025-05-11T10:30:00Z"
}
```

### Структура успешного ответа

```json
{
  "success": true,
  "data": {},
  "message": "Success message"
}
```

## Логирование

Все действия логируются в таблицу `activity_logs`:
- Вход/выход пользователя
- Создание/редактирование/удаление пользователя
- Изменение настроек
- Создание/изменение/удаление проектов
- Ошибки авторизации

## Планы развития

- [ ] Восстановление пароля через email
- [ ] 2FA (двухфакторная авторизация)
- [ ] API документация (Swagger/OpenAPI)
- [ ] Тесты
- [ ] Кэширование
- [ ] Более сложные фильтры и поиск
- [ ] Экспорт логов
