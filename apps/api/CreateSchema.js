-- schema: public

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  subject text not null unique,                   -- sub from token
  email text not null,
  display_name text,
  status text not null default 'pending',         -- pending|approved|rejected
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_user_subject on app_user(subject);

create table if not exists app_user_audit (
  id bigserial primary key,
  subject text not null,
  action text not null,                           -- created|approved|rejected|updated
  actor text,                                     -- who did it (admin email/sub)
  details jsonb,
  created_at timestamptz not null default now()
);