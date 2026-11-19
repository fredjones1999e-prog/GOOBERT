-- Run this entire script in Supabase Dashboard > SQL Editor > New query.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing','accepted','rejected','ended')),
  offer jsonb,
  answer jsonb,
  created_at timestamptz not null default now(),
  check (caller_id <> callee_id)
);
create table if not exists public.ice_candidates (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  candidate jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists calls_callee_status_idx on public.calls(callee_id,status,created_at desc);
create index if not exists ice_candidates_call_idx on public.ice_candidates(call_id,id);

alter table public.profiles enable row level security;
alter table public.calls enable row level security;
alter table public.ice_candidates enable row level security;

drop policy if exists "Profiles are searchable by signed-in users" on public.profiles;
create policy "Profiles are searchable by signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can edit their own profile" on public.profiles;
create policy "Users can edit their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Call participants can read calls" on public.calls;
create policy "Call participants can read calls" on public.calls for select to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id);
drop policy if exists "Users can place calls" on public.calls;
create policy "Users can place calls" on public.calls for insert to authenticated with check (auth.uid() = caller_id);
drop policy if exists "Call participants can update calls" on public.calls;
create policy "Call participants can update calls" on public.calls for update to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id) with check (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists "Call participants can read ICE" on public.ice_candidates;
create policy "Call participants can read ICE" on public.ice_candidates for select to authenticated using (exists (select 1 from public.calls c where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())));
drop policy if exists "Call participants can add ICE" on public.ice_candidates;
create policy "Call participants can add ICE" on public.ice_candidates for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.calls c where c.id = call_id and (c.caller_id = auth.uid() or c.callee_id = auth.uid())));

-- Automatically create a profile using the username entered during sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text,1,8))));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Enable database change notifications used by the app.
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.ice_candidates;
exception when duplicate_object then null;
end $$;


-- Optional community feature schema; also supplied as communities.sql.
-- Goobert VoIP Communities, text channels, messages, and invite joining.
create extension if not exists pgcrypto;

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(server_id,user_id)
);
create table if not exists public.server_channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 32),
  type text not null check (type in ('text','voice')),
  created_at timestamptz not null default now()
);
create table if not exists public.server_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.server_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index if not exists server_members_user_idx on public.server_members(user_id);
create index if not exists server_channels_server_idx on public.server_channels(server_id);
create index if not exists server_messages_channel_created_idx on public.server_messages(channel_id,created_at);

alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.server_channels enable row level security;
alter table public.server_messages enable row level security;

drop policy if exists "Members can view their servers" on public.servers;
create policy "Members can view their servers" on public.servers for select to authenticated
using (exists(select 1 from public.server_members m where m.server_id=servers.id and m.user_id=auth.uid()));
drop policy if exists "Authenticated users can create servers" on public.servers;
create policy "Authenticated users can create servers" on public.servers for insert to authenticated
with check (owner_id=auth.uid());
drop policy if exists "Owners can update servers" on public.servers;
create policy "Owners can update servers" on public.servers for update to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "Owners can delete servers" on public.servers;
create policy "Owners can delete servers" on public.servers for delete to authenticated
using (owner_id=auth.uid());

drop policy if exists "Members can view memberships" on public.server_members;
create policy "Members can view memberships" on public.server_members for select to authenticated
using (exists(select 1 from public.server_members mine where mine.server_id=server_members.server_id and mine.user_id=auth.uid()));
drop policy if exists "Users can join as themselves" on public.server_members;
create policy "Owners can add their own membership" on public.server_members for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.servers s where s.id=server_members.server_id and s.owner_id=auth.uid()));
drop policy if exists "Users can leave themselves" on public.server_members;
create policy "Users can leave themselves" on public.server_members for delete to authenticated
using (user_id=auth.uid());

drop policy if exists "Members can view channels" on public.server_channels;
create policy "Members can view channels" on public.server_channels for select to authenticated
using (exists(select 1 from public.server_members m where m.server_id=server_channels.server_id and m.user_id=auth.uid()));
drop policy if exists "Members can create channels" on public.server_channels;
create policy "Members can create channels" on public.server_channels for insert to authenticated
with check (exists(select 1 from public.server_members m where m.server_id=server_channels.server_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

drop policy if exists "Members can read messages" on public.server_messages;
create policy "Members can read messages" on public.server_messages for select to authenticated
using (exists(select 1 from public.server_channels c join public.server_members m on m.server_id=c.server_id where c.id=server_messages.channel_id and m.user_id=auth.uid()));
drop policy if exists "Members can send messages" on public.server_messages;
create policy "Members can send messages" on public.server_messages for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.server_channels c join public.server_members m on m.server_id=c.server_id where c.id=server_messages.channel_id and m.user_id=auth.uid()));


create or replace function public.create_goobert_server(server_name_input text, invite_code_input text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_server_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  if char_length(trim(server_name_input)) < 2 or char_length(trim(server_name_input)) > 40 then
    raise exception 'Community name must be 2–40 characters.';
  end if;
  insert into public.servers(name,owner_id,invite_code)
  values(trim(server_name_input),auth.uid(),upper(trim(invite_code_input)))
  returning id into new_server_id;
  insert into public.server_members(server_id,user_id,role)
  values(new_server_id,auth.uid(),'owner');
  insert into public.server_channels(server_id,name,type)
  values(new_server_id,'general','text'),(new_server_id,'lounge','voice');
  return new_server_id;
end;
$$;
revoke all on function public.create_goobert_server(text,text) from public;
grant execute on function public.create_goobert_server(text,text) to authenticated;

create or replace function public.join_goobert_server(invite_code_input text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare target_server uuid;
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  select id into target_server from public.servers where invite_code=upper(trim(invite_code_input));
  if target_server is null then raise exception 'Invite code not found.'; end if;
  insert into public.server_members(server_id,user_id,role)
  values(target_server,auth.uid(),'member')
  on conflict(server_id,user_id) do nothing;
  return target_server;
end;
$$;
revoke all on function public.join_goobert_server(text) from public;
grant execute on function public.join_goobert_server(text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.server_messages;
exception when duplicate_object then null;
end $$;


-- Delete only the currently authenticated user's Goobert account.
create or replace function public.delete_own_goobert_account()
returns void language plpgsql security definer set search_path=''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'You must be signed in.'; end if;
  delete from public.ice_candidates where sender_id=uid or call_id in
    (select id from public.calls where caller_id=uid or callee_id=uid);
  delete from public.calls where caller_id=uid or callee_id=uid;
  delete from public.profiles where id=uid;
  delete from auth.users where id=uid;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;
revoke all on function public.delete_own_goobert_account() from public;
grant execute on function public.delete_own_goobert_account() to authenticated;
