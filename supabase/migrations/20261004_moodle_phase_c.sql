-- Fase C: aditiva, no modifica migraciones A/B ni tablas académicas anteriores.
begin;
create function public.is_calendar_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;
revoke all on function public.is_calendar_admin() from public,anon;
grant execute on function public.is_calendar_admin() to authenticated,service_role;
create table public.class_calendar_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 160), description text not null default '' check(length(description)<=4000),
 subject text check(subject in ('Redes Locales','Montaje y Mantenimiento','Sistemas Operativos Monopuesto (SOM)','Aplicaciones Ofimáticas','Itinerario para la Empleabilidad (IPE)','Programación en Python')),
 start_at timestamptz not null check(start_at>='1900-01-01' and start_at<'10000-01-01'), end_at timestamptz,
 all_day boolean not null default false, start_date date, end_date date,
 event_type text not null default 'activity' check(event_type in ('activity','exam','deadline','holiday','other')),
 created_by uuid default auth.uid() references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_at is null or (end_at>start_at and end_at<'10000-01-01')),
 check((not all_day and start_date is null and end_date is null) or (all_day and end_at is not null and start_date is not null and end_date is not null and end_date>=start_date and start_at=(start_date::timestamp at time zone 'Europe/Madrid') and end_at=((end_date+1)::timestamp at time zone 'Europe/Madrid')))
);
create table public.personal_calendar_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160), description text not null default '' check(length(description)<=4000),
 subject text check(subject in ('Redes Locales','Montaje y Mantenimiento','Sistemas Operativos Monopuesto (SOM)','Aplicaciones Ofimáticas','Itinerario para la Empleabilidad (IPE)','Programación en Python')),
 start_at timestamptz not null check(start_at>='1900-01-01' and start_at<'10000-01-01'), end_at timestamptz,
 all_day boolean not null default false, start_date date, end_date date,
 event_type text not null default 'activity' check(event_type in ('activity','exam','deadline','holiday','other')),
 completed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(end_at is null or (end_at>start_at and end_at<'10000-01-01')),
 check((not all_day and start_date is null and end_date is null) or (all_day and end_at is not null and start_date is not null and end_date is not null and end_date>=start_date and start_at=(start_date::timestamp at time zone 'Europe/Madrid') and end_at=((end_date+1)::timestamp at time zone 'Europe/Madrid')))
);
create index class_calendar_events_date on public.class_calendar_events(start_at);
create index personal_calendar_events_user_date on public.personal_calendar_events(user_id,start_at);
create index notifications_unread on public.notifications(user_id,created_at desc) where not read;
create index moodle_effective_due_date on public.user_event_state(user_id,effective_due_date) where available and not hidden;
alter table public.class_calendar_events enable row level security;
alter table public.personal_calendar_events enable row level security;
revoke all on public.class_calendar_events,public.personal_calendar_events from public,anon,authenticated;
grant select,delete on public.class_calendar_events,public.personal_calendar_events to authenticated;
grant insert(title,description,subject,start_at,end_at,all_day,start_date,end_date,event_type) on public.class_calendar_events,public.personal_calendar_events to authenticated;
grant update(title,description,subject,start_at,end_at,all_day,start_date,end_date,event_type) on public.class_calendar_events,public.personal_calendar_events to authenticated;
grant update(completed) on public.personal_calendar_events to authenticated;
grant all on public.class_calendar_events,public.personal_calendar_events to service_role;
create policy class_calendar_read on public.class_calendar_events for select to authenticated using(true);
create policy class_calendar_insert on public.class_calendar_events for insert to authenticated with check(public.is_calendar_admin() and created_by=auth.uid());
create policy class_calendar_update on public.class_calendar_events for update to authenticated using(public.is_calendar_admin()) with check(public.is_calendar_admin());
create policy class_calendar_delete on public.class_calendar_events for delete to authenticated using(public.is_calendar_admin());
create policy personal_calendar_read on public.personal_calendar_events for select to authenticated using(user_id=auth.uid());
create policy personal_calendar_insert on public.personal_calendar_events for insert to authenticated with check(user_id=auth.uid());
create policy personal_calendar_update on public.personal_calendar_events for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy personal_calendar_delete on public.personal_calendar_events for delete to authenticated using(user_id=auth.uid());
create function public.calendar_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
revoke all on function public.calendar_updated_at() from public,anon,authenticated;
create trigger class_calendar_updated before update on public.class_calendar_events for each row execute function public.calendar_updated_at();
create trigger personal_calendar_updated before update on public.personal_calendar_events for each row execute function public.calendar_updated_at();
commit;
