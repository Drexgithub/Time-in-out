create table if not exists public.app_state (
  id integer primary key check (id = 1),
  state_json text not null
);

alter table public.app_state enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant all on table public.app_state to anon, authenticated, service_role;

drop policy if exists "Allow public access" on public.app_state;

create policy "Allow public access"
on public.app_state
for all
to anon, authenticated
using (true)
with check (true);
