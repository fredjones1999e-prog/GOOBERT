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
