import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Fases A/B/C/D: migraciones reales, sincronización, recordatorios y permisos en PostgreSQL aislado", async () => {
 const db = new PGlite();
 try {
  // Minimal Supabase auth harness. All Moodle SQL is loaded unmodified from the repository.
  await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; grant usage on schema auth to authenticated,service_role;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
   alter default privileges in schema public grant all on tables to service_role;
  `);
  for (const path of ["supabase/schema.sql", "supabase/migrations/20261004_moodle_phase_a.sql", "supabase/migrations/20261004_moodle_phase_b.sql", "supabase/migrations/20261004_moodle_phase_c.sql", "supabase/migrations/20261005_moodle_phase_d.sql", "supabase/tests/moodle_phase_a.sql", "supabase/tests/moodle_phase_b.sql", "supabase/tests/moodle_phase_c.sql"]) {
   await db.exec(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  }
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('60000000-0000-0000-0000-000000000001','manuifuenla@gmail.com','{}');`);
  await db.exec(await readFile(new URL('../supabase/admin/set-owner-admin.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/tests/moodle_phase_d.sql',import.meta.url),'utf8'));
  // Exercise the real dispatcher SQL with local extension adapters: no HTTP or scheduler runs.
  await db.exec(`
   create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
   create schema net; create table net.test_requests(id bigserial primary key,body jsonb);
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ declare rid bigint; begin
    if url<>'https://smrhub.vercel.app/api/cron/worker' or headers->>'Authorization'<>'Bearer test-secret-at-least-thirty-two-characters' then raise exception 'Destino o secreto incorrecto';end if;
    insert into net.test_requests(body) values(body) returning id into rid;return rid;end $$;
   create schema cron; create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true);
   create function cron.schedule(name text,expression text,statement text) returns bigint language plpgsql as $$ declare jid bigint;begin
    insert into cron.job(jobname,schedule,command) values(name,expression,statement) returning jobid into jid;return jid;end $$;
   create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$ update cron.job set active=$2 where jobid=$1 $$;
  `);
  const scheduler=await readFile(new URL('../supabase/cron/install-phase-d.sql',import.meta.url),'utf8');
  await db.exec(scheduler.replace(/^create extension[^;]*;\s*$/gm,''));
  await db.exec(`do $$ begin
   if exists(select 1 from cron.job where active) or exists(select 1 from net.test_requests) then raise exception 'Instalador activa cron o envía';end if;
   begin perform public.dispatch_smr_jobs();raise exception 'Acepta Vault vacío';exception when raise_exception then if sqlerrm='Acepta Vault vacío' then raise;end if;end;
  end $$;
  insert into vault.decrypted_secrets values('smrhub_job_url','https://smrhub.vercel.app/api/cron/worker'),('smrhub_cron_secret','test-secret-at-least-thirty-two-characters');
  do $$ begin
   if public.dispatch_smr_jobs()<>1 then raise exception 'No despacha cuentas';end if;
   if (select count(*) from net.test_requests)<>1 then raise exception 'No prepara HTTP';end if;
  end $$;
  update vault.decrypted_secrets set decrypted_secret='https://evil.invalid' where name='smrhub_job_url';
  do $$ begin
   begin perform public.dispatch_smr_jobs();raise exception 'Filtra secreto a URL ajena';exception when raise_exception then if sqlerrm='Filtra secreto a URL ajena' then raise;end if;end;
  end $$;`);
 } finally { await db.close(); }
});
