/**
 * db/schema.sql
 * 
 * SQL схема для БД КОНДА с системой авторизации, ролей и изоляцией данных
 */

-- Таблица пользователей (users, managers, admins, super_admin)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('manager', 'admin', 'super_admin')),
  status TEXT NOT NULL CHECK(status IN ('active', 'blocked')) DEFAULT 'active',
  admin_id TEXT,
  permissions TEXT,
  plain_password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER,
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Таблица настроек (изолирована по админам)
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_admin_id, setting_key),
  FOREIGN KEY (owner_admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица проектов (изолирована по админам)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  client TEXT,
  date TEXT,
  images TEXT,
  plan_images TEXT,
  specs TEXT,
  config_data TEXT,
  selections TEXT,
  multi_sel TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (owner_admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Таблица логирования действий
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  description TEXT,
  target_type TEXT,
  target_id TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Таблица запросов сброса пароля
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  requested_login_or_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('new', 'processed', 'rejected')) DEFAULT 'new',
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  processed_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Таблица конфигурации системы
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
CREATE INDEX IF NOT EXISTS idx_settings_owner ON settings(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_status ON password_reset_requests(status);
