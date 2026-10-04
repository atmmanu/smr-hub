-- Ejecutar SOLO tras revisión. Instala el job INACTIVO, sin enviar peticiones.
-- Habilitar pg_cron/pg_net desde Integrations si el proyecto lo requiere.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.dispatch_smr_jobs() returns integer
language plpgsql security definer set search_path='' as $$
declare worker_url text; secret text; job record; total integer:=0;
begin
 select decrypted_secret into worker_url from vault.decrypted_secrets where name='smrhub_job_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='smrhub_cron_secret';
 -- Fixed production destination prevents forwarding the bearer secret elsewhere.
 if worker_url is distinct from 'https://smrhub.vercel.app/api/cron/worker' or secret is null or length(secret)<32 then
  raise exception 'Configura los dos secretos de Fase D en Vault';
 end if;
 perform public.enqueue_background_jobs();
 for job in select id from public.background_jobs where scheduled_for>=now()-interval '2 hours' and attempts<3
  and (status='pending' or (status='running' and expires_at<now())) order by scheduled_for limit 100 loop
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:=jsonb_build_object('job_id',job.id),timeout_milliseconds:=120000);
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.dispatch_smr_jobs() from public,anon,authenticated;
grant execute on function public.dispatch_smr_jobs() to service_role;
do $$ declare job_id bigint; begin
 job_id:=cron.schedule('smrhub-phase-d','*/30 * * * *','select public.dispatch_smr_jobs();');
 perform cron.alter_job(job_id,active:=false);
end $$;
commit;

-- Tras desplegar, configurar Vault y probar, activar EXPLÍCITAMENTE:
-- select cron.alter_job(jobid, active := true) from cron.job where jobname='smrhub-phase-d';
-- Pausar: misma instrucción con active := false.
-- Cada 60 minutos: cron.alter_job(jobid, schedule := '0 * * * *').
