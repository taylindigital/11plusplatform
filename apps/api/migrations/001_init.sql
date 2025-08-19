-- 001_init.sql
-- Creates user + audit tables. Requires pgcrypto (we enabled it).

BEGIN;

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_user_subject ON app_user(subject);

CREATE TABLE IF NOT EXISTS app_user_audit (
  id bigserial PRIMARY KEY,
  subject TEXT NOT NULL,
  action TEXT NOT NULL,                         -- created|approved|rejected|updated
  actor TEXT,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;