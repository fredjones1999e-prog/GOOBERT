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
