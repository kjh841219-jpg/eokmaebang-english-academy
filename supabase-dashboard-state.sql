create table if not exists public.academy_dashboard_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.academy_dashboard_state enable row level security;

drop policy if exists "service role can manage dashboard state" on public.academy_dashboard_state;
create policy "service role can manage dashboard state"
on public.academy_dashboard_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
