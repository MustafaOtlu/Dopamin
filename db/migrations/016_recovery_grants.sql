create table auth_recovery_grants (
  token_hash text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '20 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Only the authenticated server handles recovery grants; never the application role.
revoke all on auth_recovery_grants from public,pusula_app;
