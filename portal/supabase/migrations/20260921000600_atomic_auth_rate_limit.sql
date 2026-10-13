drop function public.auth_attempt_allowed(text, inet);

create function public.reserve_auth_attempt(p_kind text, p_ip inet)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_kind not in ('login', 'code') or p_ip is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext(p_kind), hashtext(p_ip::text));
  if (select count(*) from public.auth_attempts
      where kind = p_kind and ip = p_ip and created_at > now() - interval '15 minutes') >= 5
    or (p_kind = 'code' and
      (select count(*) from public.auth_attempts
        where kind = 'code' and created_at > now() - interval '15 minutes') >= 500)
  then return null; end if;
  insert into public.auth_attempts(kind, ip) values (p_kind, p_ip) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.reserve_auth_attempt(text, inet) from public, anon, authenticated;
grant execute on function public.reserve_auth_attempt(text, inet) to service_role;
