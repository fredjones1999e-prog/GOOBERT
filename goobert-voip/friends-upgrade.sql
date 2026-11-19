-- Persistent Goobert friends list
create table if not exists public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_no_self check (user_id <> friend_id)
);
create index if not exists friends_friend_id_idx on public.friends(friend_id);
alter table public.friends enable row level security;
drop policy if exists "Users can view their own friends" on public.friends;
create policy "Users can view their own friends"
  on public.friends for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can add their own friends" on public.friends;
create policy "Users can add their own friends"
  on public.friends for insert to authenticated
  with check (auth.uid() = user_id and user_id <> friend_id);
drop policy if exists "Users can remove their own friends" on public.friends;
create policy "Users can remove their own friends"
  on public.friends for delete to authenticated
  using (auth.uid() = user_id);
