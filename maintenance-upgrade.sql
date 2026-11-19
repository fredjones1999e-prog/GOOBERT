-- Goobert VoIP maintenance mode setting
create table if not exists public.site_settings (
  id integer primary key check (id = 1),
  is_offline boolean not null default false,
  message text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id, is_offline, message)
values (1, false, '')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;
drop policy if exists "Anyone can read site maintenance status" on public.site_settings;
create policy "Anyone can read site maintenance status"
on public.site_settings for select
to anon, authenticated
using (true);
-- No browser role can update this table. Only the Admin server's service-role key can.
