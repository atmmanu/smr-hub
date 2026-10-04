-- Ejecutar tras C. Todo se revierte; no deja usuarios ni eventos de prueba.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('50000000-0000-0000-0000-000000000001','phase-c-user@example.invalid','{"full_name":"Test C"}'),
 ('50000000-0000-0000-0000-000000000002','phase-c-admin@example.invalid','{"full_name":"Test Admin"}');
update public.profiles set role='admin' where id='50000000-0000-0000-0000-000000000002';
insert into public.personal_calendar_events(user_id,title,start_at,event_type) values('50000000-0000-0000-0000-000000000002','Privado admin','2026-10-10T08:00:00Z','activity');
set local role service_role;
do $$ declare eid uuid; begin
 insert into public.common_events(moodle_site,external_course_id,external_id,cmid,subject,title,description,event_type,module_type,external_url)
 values('https://phase-c-test.educa.madrid.org',1,'assign:1',1,'Redes Locales','Test Moodle','','assignment','assign','https://phase-c-test.educa.madrid.org/mod/assign/view.php?id=1') returning id into eid;
 perform public.enqueue_moodle_notice('50000000-0000-0000-0000-000000000001',eid,'new_assignment','Nueva tarea','Redes Locales: Test Moodle','1');
 perform public.enqueue_moodle_notice('50000000-0000-0000-0000-000000000001',eid,'assignment_updated','Actualizada','Redes Locales: Test Moodle','2');
 perform public.enqueue_moodle_notice('50000000-0000-0000-0000-000000000002',eid,'new_assignment','Nueva tarea','Redes Locales: Test Moodle','1');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ declare eid uuid; begin
 if public.is_calendar_admin() then raise exception 'Usuario normal reconocido admin'; end if;
 if exists(select 1 from public.personal_calendar_events) then raise exception 'Lee agenda ajena'; end if;
 insert into public.personal_calendar_events(title,description,subject,start_at,end_at,event_type)
 values('Estudiar Redes','Privado','Redes Locales','2026-10-10T09:00:00Z','2026-10-10T10:00:00Z','activity') returning id into eid;
 update public.personal_calendar_events set title='Estudiar IPv6',completed=true where id=eid;
 if not exists(select 1 from public.personal_calendar_events where id=eid and user_id=auth.uid() and completed and title='Estudiar IPv6') then raise exception 'CRUD propio incorrecto'; end if;
 update public.personal_calendar_events set title='Ataque' where user_id='50000000-0000-0000-0000-000000000002';
 if found then raise exception 'Edita agenda ajena'; end if;
 delete from public.personal_calendar_events where user_id='50000000-0000-0000-0000-000000000002';
 if found then raise exception 'Borra agenda ajena'; end if;
 begin update public.personal_calendar_events set user_id='50000000-0000-0000-0000-000000000002' where id=eid; raise exception 'Cambia dueño'; exception when insufficient_privilege then null; end;
 begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Escala rol'; exception when insufficient_privilege then null; end;
 begin insert into public.class_calendar_events(title,start_at) values('Ataque general','2026-10-10T09:00:00Z'); raise exception 'Crea general sin permisos'; exception when insufficient_privilege then null; end;
 begin update public.common_events set due_date=now(); raise exception 'Edita fecha Moodle'; exception when insufficient_privilege then null; end;
 if (select count(*) from public.notifications)<>2 then raise exception 'Notificaciones propias incorrectas'; end if;
 update public.notifications set read=true where id=(select id from public.notifications order by created_at limit 1) and user_id=auth.uid();
 if (select count(*) from public.notifications where not read)<>1 then raise exception 'No marca individual'; end if;
 update public.notifications set read=true where user_id=auth.uid() and not read;
 if exists(select 1 from public.notifications where not read) then raise exception 'Read-all falla'; end if;
 insert into public.personal_calendar_events(title,start_at,end_at,start_date,end_date,all_day)
 values('Cambio horario','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z','2026-10-25','2026-10-25',true);
 begin insert into public.personal_calendar_events(title,start_at,end_at,start_date,end_date,all_day)
 values('Desfase UTC','2026-10-25T00:00:00Z','2026-10-26T00:00:00Z','2026-10-25','2026-10-25',true);
 raise exception 'Acepta día completo con desfase'; exception when check_violation then null; end;
 begin insert into public.personal_calendar_events(title,start_at,subject) values('Asignatura inválida',now(),'Otra'); raise exception 'Acepta materia personalizada'; exception when check_violation then null; end;
 delete from public.personal_calendar_events where id=eid;
 if exists(select 1 from public.personal_calendar_events where id=eid) then raise exception 'No elimina evento propio'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
do $$ declare eid uuid; begin
 if not public.is_calendar_admin() then raise exception 'No reconoce admin'; end if;
 if (select count(*) from public.personal_calendar_events)<>1 then raise exception 'Admin lee eventos personales ajenos'; end if;
 if (select count(*) from public.notifications where not read)<>1 then raise exception 'Read-all afecta otro usuario'; end if;
 insert into public.class_calendar_events(title,start_at,event_type) values('Examen de clase','2026-10-15T08:00:00Z','exam') returning id into eid;
 if not exists(select 1 from public.class_calendar_events where id=eid and created_by=auth.uid()) then raise exception 'Creador general incorrecto'; end if;
 update public.class_calendar_events set title='Examen actualizado' where id=eid;
 if not exists(select 1 from public.class_calendar_events where id=eid and title='Examen actualizado') then raise exception 'Admin no edita general'; end if;
 begin update public.class_calendar_events set created_by='50000000-0000-0000-0000-000000000001' where id=eid; raise exception 'Cambia autor'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from public.class_calendar_events where title='Examen actualizado') then raise exception 'Usuario no lee general'; end if;
 update public.class_calendar_events set title='Ataque'; if found then raise exception 'Usuario edita general'; end if;
 delete from public.class_calendar_events; if found then raise exception 'Usuario borra general'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
delete from public.class_calendar_events where created_by=auth.uid();
do $$ begin if exists(select 1 from public.class_calendar_events where created_by=auth.uid()) then raise exception 'Admin no elimina general'; end if; end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.class_calendar_events; raise exception 'Anónimo lee generales'; exception when insufficient_privilege then null; end;
 begin perform * from public.personal_calendar_events; raise exception 'Anónimo lee personales'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
