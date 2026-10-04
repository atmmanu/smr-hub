-- Fase D aditiva. No activa cron ni envía correos. A/B/C permanecen intactas.
begin;
create table public.notification_preferences (
 user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
 days integer[] not null default '{7,3,1}' check(days<@array[0,1,3,7] and cardinality(days)<=4),
 internal_enabled boolean not null default true,email_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select on public.notification_preferences to authenticated;
grant insert(days,internal_enabled,email_enabled),update(days,internal_enabled,email_enabled) on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create policy own_preferences on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create trigger preferences_updated before update on public.notification_preferences for each row execute function public.calendar_updated_at();
alter table public.personal_calendar_events add column reminder_enabled boolean not null default true;
grant insert(reminder_enabled),update(reminder_enabled) on public.personal_calendar_events to authenticated;
alter table public.notifications alter column common_event_id drop not null;
alter table public.notifications add column calendar_source text not null default 'moodle' check(calendar_source in ('moodle','general','personal'));
alter table public.notifications add column calendar_event_id uuid;
alter table public.notifications add constraint notifications_event_reference check((calendar_source='moodle' and common_event_id is not null and calendar_event_id is null) or (calendar_source<>'moodle' and common_event_id is null and calendar_event_id is not null));
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('new_assignment','new_resource','assignment_updated','due_date_changed','new_content','reminder'));
create table public.moodle_sync_locks(user_id uuid primary key references public.profiles(id) on delete cascade,lease uuid not null,expires_at timestamptz not null);
create table public.moodle_sync_runs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,mode text not null check(mode in ('manual','automatic')),started_at timestamptz not null default now(),finished_at timestamptz,result text not null default 'running' check(result in ('running','success','failed','skipped')),new_events integer not null default 0,updates integer not null default 0,error_code text check(length(error_code)<=80));
create index sync_runs_user_time on public.moodle_sync_runs(user_id,started_at desc);
create table public.background_jobs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,scheduled_for timestamptz not null,status text not null default 'pending' check(status in ('pending','running','success','partial','failed')),lease uuid,expires_at timestamptz,attempts integer not null default 0,started_at timestamptz,finished_at timestamptz,result jsonb,error_code text check(length(error_code)<=80),unique(user_id,scheduled_for));
create index jobs_pending on public.background_jobs(status,scheduled_for);
create table public.notification_log(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 source text not null check(source in ('moodle','general','personal')),event_id uuid not null,
 due_at timestamptz not null,days integer not null check(days in (0,1,3,7)),scheduled_for timestamptz not null,
 notification_id uuid references public.notifications(id) on delete set null,
 email_state text not null default 'disabled' check(email_state in ('disabled','pending','sending','sent','failed','unknown','suppressed')),
 email_attempted_at timestamptz,email_sent_at timestamptz,provider_id text check(length(provider_id)<=512),error_code text check(length(error_code)<=80),created_at timestamptz not null default now(),
 unique(user_id,source,event_id,due_at,days)
);
create index reminder_email_pending on public.notification_log(user_id,email_state,scheduled_for);
create index reminder_email_attempted on public.notification_log(email_attempted_at) where email_attempted_at is not null;
create table public.reminder_email_quota(day date primary key,attempts integer not null default 0 check(attempts between 0 and 200));
alter table public.moodle_sync_locks enable row level security;
alter table public.moodle_sync_runs enable row level security;
alter table public.background_jobs enable row level security;
alter table public.notification_log enable row level security;
alter table public.reminder_email_quota enable row level security;
revoke all on public.moodle_sync_locks,public.moodle_sync_runs,public.background_jobs,public.notification_log,public.reminder_email_quota from public,anon,authenticated;
grant all on public.moodle_sync_locks,public.moodle_sync_runs,public.background_jobs,public.notification_log,public.reminder_email_quota to service_role;
grant select on public.moodle_sync_runs to authenticated;
create policy own_sync_runs on public.moodle_sync_runs for select to authenticated using(user_id=auth.uid());

create function public.claim_moodle_sync_lock(p_user uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.moodle_sync_locks(user_id,lease,expires_at) values(p_user,p_lease,now()+interval '180 seconds')
 on conflict(user_id) do update set lease=excluded.lease,expires_at=excluded.expires_at where public.moodle_sync_locks.expires_at<=now();
 return found;
end $$;
create function public.release_moodle_sync_lock(p_user uuid,p_lease uuid) returns void language sql security invoker set search_path='' as $$ delete from public.moodle_sync_locks where user_id=p_user and lease=p_lease $$;
create function public.enqueue_background_jobs(p_now timestamptz default now()) returns integer language plpgsql security invoker set search_path='' as $$
declare total integer; slot timestamptz:=to_timestamp(floor(extract(epoch from p_now)/1800)*1800);
begin
 insert into public.background_jobs(user_id,scheduled_for) select id,slot from public.profiles on conflict(user_id,scheduled_for) do nothing;
 get diagnostics total=row_count;return total;
end $$;
create function public.claim_background_job(p_job uuid,p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.background_jobs%rowtype;
begin
 update public.background_jobs set status='running',lease=p_lease,expires_at=now()+interval '180 seconds',attempts=attempts+1,started_at=now()
 where id=p_job and scheduled_for>=now()-interval '2 hours' and attempts<3 and (status='pending' or (status='running' and expires_at<now())) returning * into job;
 if job.id is null then return null;end if;return jsonb_build_object('id',job.id,'user_id',job.user_id);
end $$;

-- Read-only candidates derive private effective dates. No user can invoke this directly.
create function public.user_reminder_events(p_user uuid,p_allow_moodle boolean default false)
returns table(event_id uuid,source text,title text,subject text,due_at timestamptz,external_url text,email_enabled boolean)
language sql stable security definer set search_path='' as $$
 select e.id,'moodle',e.title,m.subject,s.effective_due_date,e.external_url,s.email_enabled
 from public.user_event_state s join public.common_events e on e.id=s.common_event_id
 join public.moodle_connections c on c.user_id=s.user_id and c.connected_at is not null and c.moodle_user_id=s.seen_moodle_user_id and c.moodle_url=e.moodle_site
 join public.moodle_course_mappings m on m.user_id=c.user_id and m.course_id=e.external_course_id and m.subject is not null
 where p_allow_moodle and s.user_id=p_user and s.available and s.reminder_enabled and not s.hidden and not s.completed and s.effective_due_date is not null
 union all
 select e.id,'general',e.title,e.subject,case when e.all_day then ((e.start_date+1)::timestamp at time zone 'Europe/Madrid')-interval '1 second' else e.start_at end,null::text,true from public.class_calendar_events e
 union all
 select e.id,'personal',e.title,e.subject,case when e.all_day then ((e.start_date+1)::timestamp at time zone 'Europe/Madrid')-interval '1 second' else e.start_at end,null::text,true from public.personal_calendar_events e where e.user_id=p_user and e.reminder_enabled and not e.completed
$$;
create function public.generate_user_reminders(p_user uuid,p_allow_moodle boolean default false,p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path='' as $$
declare preferences public.notification_preferences%rowtype; event record; offset_days integer; scheduled timestamptz; log_id uuid; notice_id uuid; total integer:=0; label text;
begin
 select * into preferences from public.notification_preferences where user_id=p_user;
 if preferences.user_id is null then preferences.days:=array[7,3,1];preferences.internal_enabled:=true;preferences.email_enabled:=false;end if;
 if not preferences.internal_enabled and not preferences.email_enabled then return 0;end if;
 for event in select * from public.user_reminder_events(p_user,p_allow_moodle) where due_at>p_now and due_at<p_now+interval '9 days' loop
  foreach offset_days in array preferences.days loop
   scheduled:=(((event.due_at at time zone 'Europe/Madrid')::date-offset_days)::timestamp+interval '9 hours') at time zone 'Europe/Madrid';
   if offset_days=0 and scheduled>=event.due_at then scheduled:=((event.due_at at time zone 'Europe/Madrid')::date)::timestamp at time zone 'Europe/Madrid';end if;
   if p_now<scheduled or p_now>=scheduled+interval '90 minutes' then continue;end if;
   insert into public.notification_log(user_id,source,event_id,due_at,days,scheduled_for,email_state)
   values(p_user,event.source,event.event_id,event.due_at,offset_days,scheduled,case when preferences.email_enabled and event.email_enabled then 'pending' else 'disabled' end)
   on conflict(user_id,source,event_id,due_at,days) do nothing returning id into log_id;
   if log_id is null then continue;end if;total:=total+1;
   label:=case when event.source='moodle' then 'Entrega' when event.source='general' then 'Evento de clase' else 'Evento personal' end||case when offset_days=0 then ' hoy' when offset_days=1 then ' mañana' else ' en '||offset_days::text||' días' end;
   if preferences.internal_enabled then
    insert into public.notifications(user_id,common_event_id,calendar_source,calendar_event_id,type,title,message,revision)
    values(p_user,case when event.source='moodle' then event.event_id else null end,event.source,case when event.source<>'moodle' then event.event_id else null end,'reminder',label,left(coalesce(event.subject||': ','')||event.title,800),log_id::text) returning id into notice_id;
    update public.notification_log set notification_id=notice_id where id=log_id;
   end if;
  end loop;
 end loop;return total;
end $$;

create function public.claim_reminder_email(p_log uuid,p_allow_moodle boolean default false,p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare log public.notification_log%rowtype; event record; prefs public.notification_preferences%rowtype; quota_day date:=(p_now at time zone 'Europe/Madrid')::date;
begin
 select * into log from public.notification_log where id=p_log and email_state='pending' for update;
 if log.id is null then return null;end if;
 select * into prefs from public.notification_preferences where user_id=log.user_id;
 select * into event from public.user_reminder_events(log.user_id,p_allow_moodle) where source=log.source and event_id=log.event_id and due_at=log.due_at;
 if prefs.user_id is null or not prefs.email_enabled or not(log.days=any(prefs.days)) or event.event_id is null or not event.email_enabled or log.due_at<=p_now or p_now<log.scheduled_for or p_now>=log.scheduled_for+interval '90 minutes' then
  update public.notification_log set email_state='suppressed' where id=log.id;return null;
 end if;
 -- Also cap any rolling 24h period: provider reset zones may differ from Madrid.
 perform pg_advisory_xact_lock(734828,4);
 if (select count(*) from public.notification_log where email_attempted_at>=p_now-interval '24 hours' and email_attempted_at<=p_now)>=200 then return null;end if;
 insert into public.reminder_email_quota(day,attempts) values(quota_day,1) on conflict(day) do update set attempts=public.reminder_email_quota.attempts+1 where public.reminder_email_quota.attempts<200;
 if not found then return null;end if;
 update public.notification_log set email_state='sending',email_attempted_at=p_now where id=log.id;
 return jsonb_build_object('id',log.id,'user_id',log.user_id,'source',log.source,'event_id',log.event_id,'title',event.title,'subject',event.subject,'due_at',log.due_at,'days',log.days,'external_url',event.external_url);
end $$;

-- Owner's admin assignment is explicit and separate from schema installation.
-- Run supabase/admin/set-owner-admin.sql after reviewing D.
revoke all on function public.claim_moodle_sync_lock(uuid,uuid),public.release_moodle_sync_lock(uuid,uuid),public.enqueue_background_jobs(timestamptz),public.claim_background_job(uuid,uuid),public.user_reminder_events(uuid,boolean),public.generate_user_reminders(uuid,boolean,timestamptz),public.claim_reminder_email(uuid,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_moodle_sync_lock(uuid,uuid),public.release_moodle_sync_lock(uuid,uuid),public.enqueue_background_jobs(timestamptz),public.claim_background_job(uuid,uuid),public.user_reminder_events(uuid,boolean),public.generate_user_reminders(uuid,boolean,timestamptz),public.claim_reminder_email(uuid,boolean,timestamptz) to service_role;
commit;
