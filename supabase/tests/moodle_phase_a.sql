-- Ejecutar tras la migración; todo se revierte, sin modificar datos existentes.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
('30000000-0000-0000-0000-000000000001', 'phase-a-test@example.invalid', '{"full_name":"Test Moodle"}');
set local role service_role;
do $$
declare uid uuid := '30000000-0000-0000-0000-000000000001';
begin
  if not public.claim_moodle_attempt(uid, 'https://test.educa.madrid.org') then raise exception 'No permite el primer intento'; end if;
  if public.claim_moodle_attempt(uid, 'https://test.educa.madrid.org') then raise exception 'No limita intentos'; end if;
  perform public.save_moodle_connection(uid, 'https://test.educa.madrid.org', 42, 'v1.' || repeat('x', 80), '[{"course_id":1,"fullname":"IPE","shortname":"IPE","subject":"Itinerario para la Empleabilidad (IPE)"}]');
  update public.moodle_course_mappings set subject = 'Redes Locales', manual = true where user_id = uid and course_id = 1;
  perform public.save_moodle_connection(uid, 'https://test.educa.madrid.org', 42, 'v1.' || repeat('x', 80), '[{"course_id":1,"fullname":"IPE nuevo","shortname":"IPE","subject":"Itinerario para la Empleabilidad (IPE)"}]');
  if (select subject from public.moodle_course_mappings where user_id = uid and course_id = 1) <> 'Redes Locales' then raise exception 'Pierde el mapeo manual'; end if;
  if (select count(*) from public.moodle_course_mappings where user_id = uid) <> 1 then raise exception 'Cursos duplicados'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.moodle_connections;
    raise exception 'El cliente puede leer tokens';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.moodle_course_mappings;
    raise exception 'El cliente puede leer tablas de servidor';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_moodle_attempt(auth.uid(), 'https://evil.example');
    raise exception 'El cliente puede invocar funciones privilegiadas';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_moodle_connection(auth.uid(), 'https://evil.example', 1, 'v1.' || repeat('x', 80), '[]');
    raise exception 'El cliente puede guardar conexiones';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform * from public.moodle_connections;
    raise exception 'El visitante puede leer tokens';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
delete from public.moodle_connections where user_id = '30000000-0000-0000-0000-000000000001';
do $$
begin
  if exists(select 1 from public.moodle_course_mappings where user_id = '30000000-0000-0000-0000-000000000001') then raise exception 'No elimina los estados de conexión'; end if;
  raise notice 'Correcto: tablas privadas, rate limit, mapeos conservados y desconexión';
end $$;
reset role;
rollback;
