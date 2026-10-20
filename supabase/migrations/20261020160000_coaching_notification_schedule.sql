-- Schedule coaching checks from Supabase every 30 minutes.
-- The job calls the existing Vercel route. It does not decide or send notifications.
-- Secrets are read from Vault at run time. Do not put secret values in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function public.invoke_coaching_notifications()
returns bigint
language plpgsql
security definer
set search_path = public, net
as $$
declare
  target_url text;
  cron_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into target_url
  from vault.decrypted_secrets
  where name = 'coaching_notifications_url'
  limit 1;

  select decrypted_secret
    into cron_secret
  from vault.decrypted_secrets
  where name = 'coaching_notifications_cron_secret'
  limit 1;

  if target_url is null or btrim(target_url) = ''
     or cron_secret is null or btrim(cron_secret) = '' then
    raise warning 'coaching notifications cron is not configured in Vault';
    return null;
  end if;

  target_url := regexp_replace(btrim(target_url), '/+$', '');

  if target_url !~ '^https://[^[:space:]/]+/api/cron/coaching-notifications$' then
    raise warning 'coaching notifications url is not the coaching endpoint';
    return null;
  end if;

  select net.http_get(
    url := target_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret
    ),
    timeout_milliseconds := 60000
  )
  into request_id;

  return request_id;
end;
$$;

create or replace function public.install_coaching_notifications_schedule()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'coaching-notifications'
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'coaching-notifications',
    '*/30 * * * *',
    $job$select public.invoke_coaching_notifications();$job$
  );
end;
$$;

create or replace function public.remove_coaching_notifications_schedule()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'coaching-notifications'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

revoke all on function public.invoke_coaching_notifications() from public;
revoke all on function public.invoke_coaching_notifications() from anon, authenticated, service_role;
revoke all on function public.install_coaching_notifications_schedule() from public;
revoke all on function public.install_coaching_notifications_schedule() from anon, authenticated, service_role;
revoke all on function public.remove_coaching_notifications_schedule() from public;
revoke all on function public.remove_coaching_notifications_schedule() from anon, authenticated, service_role;

grant execute on function public.invoke_coaching_notifications() to postgres;
grant execute on function public.install_coaching_notifications_schedule() to postgres;
grant execute on function public.remove_coaching_notifications_schedule() to postgres;

select public.install_coaching_notifications_schedule();
