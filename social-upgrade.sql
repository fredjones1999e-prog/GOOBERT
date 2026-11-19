-- Goobert social upgrade: editable profiles, ringtone preference, and private direct messages.
alter table public.profiles
  add column if not exists display_name text not null default '',
  add column if not exists avatar_emoji text not null default '🐸',
  add column if not exists bio text not null default '',
  add column if not exists ringtone text not null default 'classic';

alter table public.profiles
  drop constraint if exists profiles_display_name_length,
  add constraint profiles_display_name_length check (char_length(display_name) <= 32),
  drop constraint if exists profiles_bio_length,
  add constraint profiles_bio_length check (char_length(bio) <= 120),
  drop constraint if exists profiles_ringtone_allowed,
  add constraint profiles_ringtone_allowed check (ringtone in ('classic','bubbles','synth','soft'));

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1500),
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> receiver_id)
);
create index if not exists direct_messages_pair_created_idx on public.direct_messages (sender_id, receiver_id, created_at);
alter table public.direct_messages enable row level security;
drop policy if exists "Users can read their own direct messages" on public.direct_messages;
create policy "Users can read their own direct messages" on public.direct_messages for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "Users can send direct messages" on public.direct_messages;
create policy "Users can send direct messages" on public.direct_messages for insert to authenticated with check (auth.uid() = sender_id and sender_id <> receiver_id);
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; when undefined_object then null; end $$;
