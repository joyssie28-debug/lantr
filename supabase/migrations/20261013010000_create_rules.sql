create table public.rules (
  id bigint generated always as identity primary key,
  text text not null check (length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.rules enable row level security;
revoke all on table public.rules from public, anon, authenticated;
revoke all on sequence public.rules_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.rules to service_role;
grant usage, select on sequence public.rules_id_seq to service_role;
