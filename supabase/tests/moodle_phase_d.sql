-- Ejecutar después de D y set-owner-admin.sql. No conserva datos de prueba.
begin;
do $$ begin
 if (select count(*) from auth.users u join public.profiles p on p.id=u.id where lower(u.email)='manuifuenla@gmail.com' and p.role='admin')<>1 then
  raise exception 'Ejecuta primero el SQL seguro de asignación admin';
 end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('60000000-0000-0000-0000-000000000002','phase-d-user@example.invalid','{}'),
 ('60000000-0000-0000-0000-000000000003','phase-d-other@example.invalid','{}');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where lower(email)='manuifuenla@gmail.com'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare eid uuid; begin
 if not public.is_calendar_admin() then raise exception 'Propietario no admin';end if;
 insert into public.class_calendar_events(title,start_at,event_type) values('D general permisos',now()+interval '1 day','exam') returning id into eid;
 update public.class_calendar_events set title='D general editado' where id=eid;
 if not found then raise exception 'Admin no edita general';end if;
 delete from public.class_calendar_events where id=eid;
 if not found then raise exception 'Admin no elimina general';end if;
end $$;
reset role;
insert into public.class_calendar_events(id,title,start_at,event_type) values('61000000-0000-0000-0000-000000000001','D examen','2026-10-12T18:00:00Z','exam');
insert into public.notification_preferences(user_id,days,email_enabled) values('60000000-0000-0000-0000-000000000003',array[1],true);
select set_config('request.jwt.claims','{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if public.is_calendar_admin() then raise exception 'Normal admin';end if;
 begin insert into public.class_calendar_events(title,start_at) values('Ataque',now());raise exception 'Normal crea general';exception when insufficient_privilege then null;end;
 update public.class_calendar_events set title='Ataque' where id='61000000-0000-0000-0000-000000000001';if found then raise exception 'Normal edita general';end if;
 delete from public.class_calendar_events where id='61000000-0000-0000-0000-000000000001';if found then raise exception 'Normal elimina general';end if;
 if exists(select 1 from public.notification_preferences) then raise exception 'Lee preferencias ajenas';end if;
 insert into public.notification_preferences(days,email_enabled) values(array[7,3,1,0],true);
 update public.notification_preferences set email_enabled=false where user_id='60000000-0000-0000-0000-000000000003';if found then raise exception 'Edita preferencias ajenas';end if;
 begin update public.notification_preferences set user_id='60000000-0000-0000-0000-000000000003';raise exception 'Cambia dueño';exception when insufficient_privilege then null;end;
 begin update public.profiles set role='admin' where id=auth.uid();raise exception 'Escala rol';exception when insufficient_privilege then null;end;
 begin perform * from public.notification_log;raise exception 'Cliente lee logs';exception when insufficient_privilege then null;end;
 begin perform public.generate_user_reminders(auth.uid());raise exception 'Cliente ejecuta job';exception when insufficient_privilege then null;end;
 begin perform public.claim_moodle_sync_lock(auth.uid(),gen_random_uuid());raise exception 'Cliente reclama lock';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare uid uuid:='60000000-0000-0000-0000-000000000002'; lease_a uuid:=gen_random_uuid();lease_b uuid:=gen_random_uuid();lid uuid; count_before bigint; now_test timestamptz:='2026-10-05T07:00:00Z';begin
 if not public.claim_moodle_sync_lock(uid,lease_a) or public.claim_moodle_sync_lock(uid,lease_b) then raise exception 'Lock permite sync concurrente';end if;
 perform public.release_moodle_sync_lock(uid,lease_b);
 if public.claim_moodle_sync_lock(uid,lease_b) then raise exception 'Otra lease libera lock';end if;
 update public.moodle_sync_locks set expires_at=now()-interval '1 second' where user_id=uid;
 if not public.claim_moodle_sync_lock(uid,lease_b) then raise exception 'Lock no expira';end if;
 perform public.release_moodle_sync_lock(uid,lease_b);
 if public.generate_user_reminders(uid,false,now_test)<1 then raise exception 'No genera aviso siete días';end if;
 if public.generate_user_reminders(uid,false,now_test)<>0 then raise exception 'Duplica recordatorio';end if;
 select id into lid from public.notification_log where user_id=uid and event_id='61000000-0000-0000-0000-000000000001';
 if public.claim_reminder_email(lid,false,now_test) is null then raise exception 'No reclama email opt-in';end if;
 if public.claim_reminder_email(lid,false,now_test) is not null then raise exception 'Reintento duplica email';end if;
 if (select count(*) from public.notifications where user_id=uid and type='reminder' and calendar_event_id='61000000-0000-0000-0000-000000000001')<>1 then raise exception 'Duplica notificación interna';end if;
 -- Date changes retain history and create a different future reminder.
 update public.class_calendar_events set start_at='2026-10-15T18:00:00Z' where id='61000000-0000-0000-0000-000000000001';
 if public.generate_user_reminders(uid,false,'2026-10-08T07:00:00Z')<1 then raise exception 'Fecha nueva no recalcula';end if;
 if (select count(*) from public.notification_log where user_id=uid and event_id='61000000-0000-0000-0000-000000000001')<>2 then raise exception 'Pierde histórico';end if;
 select id into lid from public.notification_log where user_id=uid and event_id='61000000-0000-0000-0000-000000000001' and due_at='2026-10-15T18:00:00Z';
 update public.notification_preferences set email_enabled=false where user_id=uid;
 if public.claim_reminder_email(lid,false,'2026-10-08T07:00:00Z') is not null then raise exception 'Email opt-out ignorado';end if;
 if not exists(select 1 from public.notification_log where id=lid and email_state='suppressed') then raise exception 'No suprime email';end if;
 -- Personal completion and reminder opt-out remove candidates.
 insert into public.personal_calendar_events(user_id,title,start_at,completed,reminder_enabled) values(uid,'D completado','2026-10-12T18:00:00Z',true,true),(uid,'D sin avisos','2026-10-12T18:00:00Z',false,false);
 if exists(select 1 from public.user_reminder_events(uid,false) where source='personal') then raise exception 'Recuerda completado o desactivado';end if;
 count_before:=(select count(*) from public.background_jobs);
 perform public.enqueue_background_jobs();perform public.enqueue_background_jobs();
 if (select count(*) from public.background_jobs)<>count_before+(select count(*) from public.profiles) then raise exception 'Duplica job slot';end if;
 select id into lid from public.background_jobs where user_id=uid order by scheduled_for desc limit 1;
 if public.claim_background_job(lid,lease_a) is null or public.claim_background_job(lid,lease_b) is not null then raise exception 'Job simultáneo';end if;
end $$;
reset role;
set local role service_role;
do $$ declare
 u1 uuid:='60000000-0000-0000-0000-000000000002';u2 uuid:='60000000-0000-0000-0000-000000000003';
 site text:='https://phase-d-test.educa.madrid.org';cipher text:='v1.'||repeat('x',80);
 courses jsonb:='[{"course_id":987654321,"fullname":"Redes Locales","shortname":"RL","subject":"Redes Locales"}]';
 item jsonb:='{"external_id":"assign:42","external_course_id":987654321,"cmid":42,"subject":"Redes Locales","title":"D prórroga","description":"","event_type":"assignment","module_type":"assign","due_date":"2026-10-12T21:59:00Z","external_url":"https://phase-d-test.educa.madrid.org/mod/assign/view.php?id=42"}';
 eid uuid;lid uuid;begin
 perform public.claim_moodle_attempt(u1,site);perform public.claim_moodle_attempt(u2,site);
 perform public.save_moodle_connection(u1,site,101,cipher,courses);perform public.save_moodle_connection(u2,site,102,cipher,courses);
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(item));
 perform public.apply_moodle_sync(u2,site,102,cipher,courses,jsonb_build_array(item||jsonb_build_object('due_date','2026-10-15T21:59:00Z')));
 select id into eid from public.common_events where moodle_site=site;
 if not exists(select 1 from public.user_reminder_events(u1,true) where event_id=eid and due_at='2026-10-12T21:59:00Z') or not exists(select 1 from public.user_reminder_events(u2,true) where event_id=eid and due_at='2026-10-15T21:59:00Z') then raise exception 'Recordatorio comparte prórroga individual';end if;
 if exists(select 1 from public.user_reminder_events(u1,false) where source='moodle') then raise exception 'Recuerda Moodle sin sync validada';end if;
 update public.notification_preferences set days=array[7,3,1,0],email_enabled=true where user_id=u1;
 perform public.generate_user_reminders(u1,true,'2026-10-05T07:00:00Z');
 select id into lid from public.notification_log where user_id=u1 and event_id=eid;
 if lid is null then raise exception 'No recuerda tarea efectiva';end if;
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(item||jsonb_build_object('due_date','2026-10-16T21:59:00Z')));
 if public.claim_reminder_email(lid,true,'2026-10-05T07:00:00Z') is not null then raise exception 'Email usa fecha antigua';end if;
 if not exists(select 1 from public.notifications where user_id=u1 and common_event_id=eid and type='due_date_changed') then raise exception 'Pierde aviso de cambio';end if;
 update public.user_event_state set hidden=true where user_id=u1 and common_event_id=eid;
 if exists(select 1 from public.user_reminder_events(u1,true) where event_id=eid) then raise exception 'Recuerda oculto';end if;
 update public.user_event_state set hidden=false,completed=true where user_id=u1 and common_event_id=eid;
 if exists(select 1 from public.user_reminder_events(u1,true) where event_id=eid) then raise exception 'Recuerda completado';end if;
 update public.user_event_state set completed=false where user_id=u1 and common_event_id=eid;
 perform public.generate_user_reminders(u1,true,'2026-10-09T07:00:00Z');
 select id into lid from public.notification_log where user_id=u1 and event_id=eid and due_at='2026-10-16T21:59:00Z';
 insert into public.reminder_email_quota(day,attempts) values('2026-10-09',200) on conflict(day) do update set attempts=200;
 if public.claim_reminder_email(lid,true,'2026-10-09T07:00:00Z') is not null then raise exception 'Excede cuota Brevo';end if;
 -- A different local day cannot bypass the rolling provider-safe limit.
 update public.reminder_email_quota set attempts=0 where day='2026-10-09';
 insert into public.notification_log(user_id,source,event_id,due_at,days,scheduled_for,email_state,email_attempted_at)
 select u2,'personal',gen_random_uuid(),'2026-10-16T18:00:00Z',1,'2026-10-08T07:00:00Z','sending','2026-10-08T20:00:00Z' from generate_series(1,200);
 if public.claim_reminder_email(lid,true,'2026-10-09T07:00:00Z') is not null then raise exception 'El cambio de día elude cuota móvil';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.notification_preferences;raise exception 'Anónimo lee preferencias';exception when insufficient_privilege then null;end;
 begin perform public.enqueue_background_jobs();raise exception 'Anónimo ejecuta cron';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
