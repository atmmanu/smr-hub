-- Fase B aditiva. Ejecutar después de Fase A; no elimina datos existentes.
begin;
create table public.common_events (
 id uuid primary key default gen_random_uuid(), source text not null default 'moodle' check(source='moodle'),
 moodle_site text not null check(length(moodle_site)<=512), external_course_id bigint not null check(external_course_id>0),
 external_id text not null check(length(external_id) between 1 and 100), cmid bigint not null check(cmid>0),
 subject text not null check(subject in ('Redes Locales','Montaje y Mantenimiento','Sistemas Operativos Monopuesto (SOM)','Aplicaciones Ofimáticas','Itinerario para la Empleabilidad (IPE)','Programación en Python')),
 title text not null check(length(title) between 1 and 320), description text not null default '' check(length(description)<=8000),
 event_type text not null check(event_type in ('assignment','resource','forum','calendar_event','exam','content','announcement','other')),
 module_type text not null check(module_type ~ '^[a-z][a-z0-9_]{0,63}$'),
 open_date timestamptz, due_date timestamptz, start_at timestamptz, end_at timestamptz,
 external_url text not null check(length(external_url)<=1024), external_modified_at timestamptz,
 active boolean not null default true, version bigint not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source,moodle_site,external_course_id,external_id)
);
create table public.user_event_state (
 user_id uuid not null references public.profiles(id) on delete cascade,
 common_event_id uuid not null references public.common_events(id) on delete cascade,
 read boolean not null default false, completed boolean not null default false, hidden boolean not null default false,
 favourite boolean not null default false, personal_notes text not null default '' check(length(personal_notes)<=4000),
 reminder_enabled boolean not null default true, reminder_days integer not null default 1 check(reminder_days between 0 and 30),
 email_enabled boolean not null default true, last_notified_at timestamptz,
 available boolean not null default true, effective_open_date timestamptz, effective_due_date timestamptz,
 seen_version bigint not null default 1, seen_moodle_user_id bigint not null, notification_revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,common_event_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 common_event_id uuid not null references public.common_events(id) on delete cascade,
 type text not null check(type in ('new_assignment','new_resource','assignment_updated','due_date_changed','new_content')),
 title text not null check(length(title)<=400), message text not null check(length(message)<=800),
 read boolean not null default false, revision text not null, created_at timestamptz not null default now(),
 unique(user_id,common_event_id,type,revision)
);
create table public.moodle_sync_status (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 moodle_site text not null, moodle_user_id bigint not null, last_synced_at timestamptz not null,
 summary jsonb not null
);
create index common_events_course_idx on public.common_events(moodle_site,external_course_id);
create index user_event_state_event_idx on public.user_event_state(common_event_id);
create index notifications_user_recent_idx on public.notifications(user_id,created_at desc);
alter table public.common_events enable row level security;
alter table public.user_event_state enable row level security;
alter table public.notifications enable row level security;
alter table public.moodle_sync_status enable row level security;
revoke all on public.common_events,public.user_event_state,public.notifications,public.moodle_sync_status from public,anon,authenticated;
grant select on public.common_events,public.user_event_state,public.notifications to authenticated;
grant update(read,completed,hidden,favourite,personal_notes,reminder_enabled,reminder_days,email_enabled) on public.user_event_state to authenticated;
grant update(read) on public.notifications to authenticated;
grant all on public.common_events,public.user_event_state,public.notifications,public.moodle_sync_status to service_role;

create function public.can_read_moodle_event(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.common_events e
 join public.user_event_state s on s.common_event_id=e.id and s.user_id=auth.uid() and s.available
 join public.moodle_connections c on c.user_id=s.user_id and c.moodle_url=e.moodle_site and c.connected_at is not null and c.moodle_user_id=s.seen_moodle_user_id
 join public.moodle_course_mappings m on m.user_id=c.user_id and m.course_id=e.external_course_id and m.subject is not null
 where e.id=p_event)
$$;
revoke all on function public.can_read_moodle_event(uuid) from public,anon;
grant execute on function public.can_read_moodle_event(uuid) to authenticated,service_role;
create policy common_events_read on public.common_events for select to authenticated using(public.can_read_moodle_event(id));
create policy own_event_state_read on public.user_event_state for select to authenticated using(user_id=auth.uid());
create policy own_event_state_update on public.user_event_state for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_notifications_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy own_notifications_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.moodle_personal_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
revoke all on function public.moodle_personal_updated_at() from public,anon,authenticated;
create trigger user_event_state_updated before update on public.user_event_state for each row execute function public.moodle_personal_updated_at();

create function public.refresh_moodle_sync_courses(p_user_id uuid,p_site text,p_moodle_user_id bigint,p_token_ciphertext text,p_courses jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare conn public.moodle_connections%rowtype;
begin
 select * into conn from public.moodle_connections where user_id=p_user_id for update;
 if conn.user_id is null or conn.moodle_url<>p_site or conn.moodle_user_id<>p_moodle_user_id or conn.token_ciphertext is distinct from p_token_ciphertext then raise exception 'Connection changed'; end if;
 perform public.save_moodle_connection(p_user_id,p_site,p_moodle_user_id,p_token_ciphertext,p_courses);
end $$;
revoke all on function public.refresh_moodle_sync_courses(uuid,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.refresh_moodle_sync_courses(uuid,text,bigint,text,jsonb) to service_role;

create function public.enqueue_moodle_notice(p_user uuid,p_event uuid,p_type text,p_title text,p_message text,p_revision text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 insert into public.notifications(user_id,common_event_id,type,title,message,revision)
 values(p_user,p_event,p_type,p_title,p_message,p_revision)
 on conflict(user_id,common_event_id,type,revision) do nothing;
 if not found then return false; end if;
 update public.user_event_state set last_notified_at=now() where user_id=p_user and common_event_id=p_event;
 return true;
end $$;
revoke all on function public.enqueue_moodle_notice(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_moodle_notice(uuid,uuid,text,text,text,text) to service_role;

-- Entire snapshot commits together. Course/site locks serialize imports by different pupils.
create function public.apply_moodle_sync(p_user_id uuid,p_site text,p_moodle_user_id bigint,p_token_ciphertext text,p_courses jsonb,p_events jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare conn public.moodle_connections%rowtype; prior public.moodle_sync_status%rowtype;
 old public.common_events%rowtype; personal public.user_event_state%rowtype;
 row jsonb; course jsonb; recipient record; eid uuid; first_sync boolean; inserted boolean; changed boolean; fresh boolean;
 due_changed boolean; notification_type text; notice_revision text; current_version bigint;
 tasks integer:=0; resources integer:=0; updates integer:=0; notices integer:=0;
 ids uuid[]:='{}'; summary jsonb;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>2000 or jsonb_typeof(p_courses)<>'array' or jsonb_array_length(p_courses)>12 then raise exception 'Invalid snapshot'; end if;
 select * into conn from public.moodle_connections where user_id=p_user_id for update;
 if conn.user_id is null or conn.moodle_url<>p_site or conn.moodle_user_id<>p_moodle_user_id or conn.token_ciphertext is distinct from p_token_ciphertext then raise exception 'Connection changed'; end if;
 for course in select value from jsonb_array_elements(p_courses) order by (value->>'course_id')::bigint loop
  if not exists(select 1 from public.moodle_course_mappings m where m.user_id=p_user_id and m.course_id=(course->>'course_id')::bigint and m.subject=course->>'subject') then raise exception 'Mapping changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site||':'||(course->>'course_id'),0));
 end loop;
 select * into prior from public.moodle_sync_status where user_id=p_user_id;
 first_sync:=prior.user_id is null or prior.moodle_site<>p_site or prior.moodle_user_id<>p_moodle_user_id;
 for row in select value from jsonb_array_elements(p_events) loop
  if not exists(select 1 from jsonb_array_elements(p_courses) c where (c->>'course_id')::bigint=(row->>'external_course_id')::bigint and c->>'subject'=row->>'subject') then raise exception 'Unmapped event'; end if;
  if row->>'external_url' <> p_site||'/mod/'||(row->>'module_type')||'/view.php?id='||(row->>'cmid') then raise exception 'Invalid event URL'; end if;
  select * into old from public.common_events where source='moodle' and moodle_site=p_site and external_course_id=(row->>'external_course_id')::bigint and external_id=row->>'external_id' for update;
  inserted:=old.id is null; changed:=false;
  if inserted then
   insert into public.common_events(moodle_site,external_course_id,external_id,cmid,subject,title,description,event_type,module_type,external_url,external_modified_at)
   values(p_site,(row->>'external_course_id')::bigint,row->>'external_id',(row->>'cmid')::bigint,row->>'subject',row->>'title',row->>'description',row->>'event_type',row->>'module_type',row->>'external_url',(row->>'external_modified_at')::timestamptz)
   returning id,version into eid,current_version;
  else
   eid:=old.id; current_version:=old.version;
   -- Older snapshots cannot roll back a newer assignment.
   if old.external_modified_at is null or (row->>'external_modified_at')::timestamptz is null or (row->>'external_modified_at')::timestamptz>=old.external_modified_at then
    changed:=old.title is distinct from row->>'title' or old.description is distinct from row->>'description' or old.external_modified_at is distinct from (row->>'external_modified_at')::timestamptz or old.event_type is distinct from row->>'event_type';
    update public.common_events set title=row->>'title',description=row->>'description',event_type=row->>'event_type',external_modified_at=(row->>'external_modified_at')::timestamptz,active=true,version=version+case when changed then 1 else 0 end,updated_at=case when changed then now() else updated_at end where id=eid returning version into current_version;
   end if;
  end if;
  ids:=array_append(ids,eid);
  if changed then
   -- Notify previously associated pupils about shared metadata, never about another pupil's extension.
   for recipient in select s.user_id,m.subject from public.user_event_state s
    join public.moodle_connections c on c.user_id=s.user_id and c.moodle_url=p_site and c.moodle_user_id=s.seen_moodle_user_id and c.connected_at is not null
    join public.moodle_course_mappings m on m.user_id=s.user_id and m.course_id=(row->>'external_course_id')::bigint and m.subject is not null
    where s.common_event_id=eid and s.available and s.user_id<>p_user_id and exists(select 1 from public.moodle_sync_status b where b.user_id=s.user_id and b.moodle_site=p_site and b.moodle_user_id=c.moodle_user_id)
   loop
    perform public.enqueue_moodle_notice(recipient.user_id,eid,'assignment_updated','Actividad actualizada',left(recipient.subject||': '||(row->>'title'),800),'common:'||current_version::text);
   end loop;
  end if;
  select * into personal from public.user_event_state where user_id=p_user_id and common_event_id=eid;
  fresh:=personal.user_id is null or personal.seen_moodle_user_id<>p_moodle_user_id;
  due_changed:=not fresh and personal.effective_due_date is distinct from (row->>'due_date')::timestamptz;
  if fresh then
   if row->>'event_type'='assignment' then tasks:=tasks+1; else resources:=resources+1; end if;
  elsif personal.seen_version<current_version or due_changed or personal.effective_open_date is distinct from (row->>'open_date')::timestamptz then updates:=updates+1;
  end if;
  insert into public.user_event_state(user_id,common_event_id,effective_open_date,effective_due_date,seen_version,seen_moodle_user_id,notification_revision)
  values(p_user_id,eid,(row->>'open_date')::timestamptz,(row->>'due_date')::timestamptz,current_version,p_moodle_user_id,1)
  on conflict(user_id,common_event_id) do update set available=true,effective_open_date=excluded.effective_open_date,effective_due_date=excluded.effective_due_date,seen_version=excluded.seen_version,seen_moodle_user_id=excluded.seen_moodle_user_id,notification_revision=public.user_event_state.notification_revision+case when fresh or due_changed or personal.seen_version<current_version or personal.effective_open_date is distinct from excluded.effective_open_date then 1 else 0 end
  returning notification_revision::text into notice_revision;
  if not first_sync and (fresh or due_changed or personal.seen_version<current_version or personal.effective_open_date is distinct from (row->>'open_date')::timestamptz) then
   notification_type:=case when due_changed then 'due_date_changed' when not fresh then 'assignment_updated' when row->>'event_type'='assignment' then 'new_assignment' when row->>'event_type'='resource' then 'new_resource' else 'new_content' end;
   if not fresh and not due_changed and personal.seen_version<current_version then notice_revision:='common:'||current_version::text; end if;
   if public.enqueue_moodle_notice(p_user_id,eid,notification_type,case when due_changed then 'La fecha de entrega ha cambiado' when not fresh then 'Actividad actualizada' when row->>'event_type'='assignment' then 'Nueva tarea' else 'Nuevo contenido' end,left((row->>'subject')||': '||(row->>'title'),800),notice_revision) then notices:=notices+1; end if;
  end if;
 end loop;
 update public.user_event_state s set available=false where s.user_id=p_user_id and s.available and exists(select 1 from public.common_events e where e.id=s.common_event_id and e.moodle_site=p_site) and not(s.common_event_id=any(ids));
 summary:=jsonb_build_object('first_sync',first_sync,'tasks',tasks,'resources',resources,'updates',updates,'notifications',notices,'total',jsonb_array_length(p_events));
 insert into public.moodle_sync_status(user_id,moodle_site,moodle_user_id,last_synced_at,summary) values(p_user_id,p_site,p_moodle_user_id,now(),summary)
 on conflict(user_id) do update set moodle_site=excluded.moodle_site,moodle_user_id=excluded.moodle_user_id,last_synced_at=excluded.last_synced_at,summary=excluded.summary;
 return summary;
end $$;
revoke all on function public.apply_moodle_sync(uuid,text,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_moodle_sync(uuid,text,bigint,text,jsonb,jsonb) to service_role;
commit;
