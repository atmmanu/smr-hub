-- Tras Fase A y B. Prueba transaccional: ROLLBACK preserva todos los datos reales.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('40000000-0000-0000-0000-000000000001','phase-b-one@example.invalid','{"full_name":"Test B1"}'),
 ('40000000-0000-0000-0000-000000000002','phase-b-two@example.invalid','{"full_name":"Test B2"}'),
 ('40000000-0000-0000-0000-000000000003','phase-b-three@example.invalid','{"full_name":"Test B3"}'),
 ('40000000-0000-0000-0000-000000000004','phase-b-four@example.invalid','{"full_name":"Test B4"}');
set local role service_role;
do $$
declare
 u1 uuid:='40000000-0000-0000-0000-000000000001'; u2 uuid:='40000000-0000-0000-0000-000000000002';
 site text:='https://phase-b-test.educa.madrid.org'; cipher text:='v1.'||repeat('x',80);
 courses jsonb:='[{"course_id":987654321,"fullname":"Redes Locales","shortname":"RL","subject":"Redes Locales"}]';
 event jsonb:='{"external_id":"assign:42","external_course_id":987654321,"cmid":42,"subject":"Redes Locales","title":"Práctica IPv6","description":"Descripción segura","event_type":"assignment","module_type":"assign","open_date":"2026-01-01T00:00:00Z","due_date":"2026-02-01T00:00:00Z","external_modified_at":"2026-01-01T00:00:00Z","external_url":"https://phase-b-test.educa.madrid.org/mod/assign/view.php?id=42"}';
 resource jsonb:='{"external_id":"module:43","external_course_id":987654321,"cmid":43,"subject":"Redes Locales","title":"PDF de clase","description":"Resumen","event_type":"resource","module_type":"resource","open_date":null,"due_date":null,"external_modified_at":null,"external_url":"https://phase-b-test.educa.madrid.org/mod/resource/view.php?id=43"}';
 result jsonb; eid uuid; bulk_events jsonb;
begin
 perform public.claim_moodle_attempt(u1,site); perform public.claim_moodle_attempt(u2,site);
 perform public.save_moodle_connection(u1,site,101,cipher,courses); perform public.save_moodle_connection(u2,site,102,cipher,courses);
 result:=public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event));
 if not(result->>'first_sync')::boolean or (result->>'tasks')::int<>1 or (result->>'notifications')::int<>0 then raise exception 'Primera sync incorrecta'; end if;
 result:=public.apply_moodle_sync(u2,site,102,cipher,courses,jsonb_build_array(event));
 if (result->>'notifications')::int<>0 then raise exception 'El segundo alumno recibe avisos históricos'; end if;
 select id into eid from public.common_events where moodle_site=site and external_id='assign:42';
 if (select count(*) from public.common_events where moodle_site=site)<>1 or (select count(*) from public.user_event_state where common_event_id=eid)<>2 then raise exception 'Deduplicación entre alumnos incorrecta'; end if;
 update public.user_event_state set completed=true,read=true,favourite=true,hidden=true,personal_notes='Conservar' where user_id=u1 and common_event_id=eid;
 result:=public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event));
 if (result->>'tasks')::int<>0 or (result->>'updates')::int<>0 or (result->>'notifications')::int<>0 then raise exception 'Sync repetida genera cambios'; end if;
 if not exists(select 1 from public.user_event_state where user_id=u1 and common_event_id=eid and completed and read and favourite and hidden and personal_notes='Conservar') then raise exception 'Pierde estado personal'; end if;
 event:=jsonb_set(event,'{due_date}','"2026-03-01T00:00:00Z"');
 result:=public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event));
 if (result->>'updates')::int<>1 or not exists(select 1 from public.notifications where user_id=u1 and type='due_date_changed') then raise exception 'No detecta cambio de entrega'; end if;
 -- Moodle can return a different personal extension: must never change the other pupil's date.
 if not exists(select 1 from public.user_event_state where user_id=u2 and common_event_id=eid and effective_due_date='2026-02-01T00:00:00Z') then raise exception 'Filtra prórroga a otro alumno'; end if;
 event:=jsonb_set(event,'{title}','"Práctica IPv6 actualizada"');
 result:=public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event,resource));
 if (result->>'resources')::int<>1 or (result->>'updates')::int<>1 or (result->>'notifications')::int<>2 then raise exception 'No detecta título/recurso'; end if;
 if not exists(select 1 from public.notifications where user_id=u2 and type='assignment_updated') then raise exception 'No notifica cambio común a alumnos asociados'; end if;
 result:=public.apply_moodle_sync(u2,site,102,cipher,courses,jsonb_build_array(event,resource));
 if (result->>'updates')::int<>1 or (result->>'resources')::int<>1 then raise exception 'Segundo alumno no recibe cambios comunes'; end if;
 event:=jsonb_set(event,'{due_date}','"2026-02-01T00:00:00Z"');
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event,resource));
 event:=jsonb_set(event,'{due_date}','"2026-03-01T00:00:00Z"');
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event,resource));
 if (select count(*) from public.notifications where user_id=u1 and type='due_date_changed')<>3 then raise exception 'Pierde avisos al volver a una fecha anterior'; end if;
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,'[]');
 if (select count(*) from public.common_events where moodle_site=site)<>2 then raise exception 'Borra historial'; end if;
 if exists(select 1 from public.user_event_state where user_id=u1 and available) then raise exception 'Recurso desaparecido sigue accesible'; end if;
 if not exists(select 1 from public.user_event_state where user_id=u2 and available) then raise exception 'Un alumno oculta recursos de todos'; end if;
 perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event,resource));
 if (select count(*) from public.user_event_state where user_id=u1)<>2 then raise exception 'Duplica estado al reactivar'; end if;
 begin
  perform public.apply_moodle_sync(u1,site,101,'cipher-distinto',courses,jsonb_build_array(event));
  raise exception 'Acepta conexión reemplazada';
 exception when raise_exception then if sqlerrm='Acepta conexión reemplazada' then raise; end if; end;
 begin
  perform public.apply_moodle_sync(u1,site,101,cipher,'[{"course_id":1,"subject":"Redes Locales"}]',jsonb_build_array(event));
  raise exception 'Acepta curso ajeno';
 exception when raise_exception then if sqlerrm='Acepta curso ajeno' then raise; end if; end;
 -- New assignment AFTER baseline: only a single new-assignment notification.
 event:=jsonb_set(jsonb_set(jsonb_set(event,'{external_id}','"assign:44"'),'{cmid}','44'),'{external_url}','"https://phase-b-test.educa.madrid.org/mod/assign/view.php?id=44"');
 result:=public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event,resource));
 if (result->>'tasks')::int<>1 or not exists(select 1 from public.notifications where user_id=u1 and type='new_assignment') then raise exception 'No avisa tarea nueva'; end if;
 -- Fifty historical tasks must create states, but zero notifications.
 perform public.claim_moodle_attempt('40000000-0000-0000-0000-000000000004','https://phase-b-bulk.educa.madrid.org');
 perform public.save_moodle_connection('40000000-0000-0000-0000-000000000004','https://phase-b-bulk.educa.madrid.org',104,cipher,courses);
 select jsonb_agg(event||jsonb_build_object('external_id','assign:'||n::text,'cmid',n,'external_url','https://phase-b-bulk.educa.madrid.org/mod/assign/view.php?id='||n::text)) into bulk_events from generate_series(100,149) n;
 result:=public.apply_moodle_sync('40000000-0000-0000-0000-000000000004','https://phase-b-bulk.educa.madrid.org',104,cipher,courses,bulk_events);
 if (result->>'tasks')::int<>50 or (result->>'notifications')::int<>0 then raise exception 'Genera avisos masivos de histórico'; end if;
 -- Error in a later element rolls back even earlier valid inserts in the snapshot.
 begin
  perform public.apply_moodle_sync(u1,site,101,cipher,courses,jsonb_build_array(event||jsonb_build_object('external_id','assign:999','cmid',999,'external_url',site||'/mod/assign/view.php?id=999'),resource||jsonb_build_object('external_url','https://evil.invalid')));
  raise exception 'Acepta URL arbitraria';
 exception when raise_exception then if sqlerrm='Acepta URL arbitraria' then raise; end if; end;
 if exists(select 1 from public.common_events where moodle_site=site and external_id='assign:999') then raise exception 'Guarda snapshot parcial'; end if;
 raise notice 'Correcto: baseline, deduplicación, estado, cambios, avisos, historial y prórrogas privadas';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
begin
 if (select count(*) from public.common_events where moodle_site='https://phase-b-test.educa.madrid.org')<>2 then raise exception 'Lectura cursos propios incorrecta'; end if;
 if exists(select 1 from public.user_event_state where user_id<>'40000000-0000-0000-0000-000000000001') then raise exception 'Lee estados ajenos'; end if;
 if exists(select 1 from public.notifications where user_id<>'40000000-0000-0000-0000-000000000001') then raise exception 'Lee avisos ajenos'; end if;
 update public.user_event_state set personal_notes='Nota privada' where user_id=auth.uid();
 update public.notifications set read=true where user_id=auth.uid();
 begin update public.common_events set title='Ataque'; raise exception 'Modifica evento común'; exception when insufficient_privilege then null; end;
 begin update public.user_event_state set available=true; raise exception 'Modifica disponibilidad'; exception when insufficient_privilege then null; end;
 begin insert into public.user_event_state(user_id,common_event_id,seen_moodle_user_id) values(auth.uid(),gen_random_uuid(),101); raise exception 'Inserta estado'; exception when insufficient_privilege then null; end;
 begin perform * from public.moodle_sync_status; raise exception 'Lee tabla privada'; exception when insufficient_privilege then null; end;
 begin perform public.apply_moodle_sync(auth.uid(),'https://evil.invalid',1,'x','[]','[]'); raise exception 'Invoca importación privilegiada'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.notifications where not read and user_id=auth.uid()) then raise exception 'No permite marcar avisos leídos'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.common_events) or exists(select 1 from public.user_event_state) or exists(select 1 from public.notifications) then raise exception 'Usuario sin conexión ve datos ajenos'; end if;
 update public.user_event_state set completed=false where user_id='40000000-0000-0000-0000-000000000001';
 if found then raise exception 'Modifica estado ajeno'; end if;
end $$;
reset role;
set local role service_role;
delete from public.moodle_connections where user_id='40000000-0000-0000-0000-000000000001';
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.common_events) then raise exception 'Lee eventos tras desconectar'; end if;
 if (select count(*) from public.user_event_state)<>3 then raise exception 'Desconectar borra estado personal'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.common_events; raise exception 'Anónimo lee eventos'; exception when insufficient_privilege then null; end;
 begin perform * from public.notifications; raise exception 'Anónimo lee avisos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
