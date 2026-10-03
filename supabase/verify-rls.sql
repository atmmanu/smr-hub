-- Ejecutar después del esquema. La transacción revierte los datos de prueba.
begin;
insert into auth.users (id, email, raw_user_meta_data)
values ('10000000-0000-0000-0000-000000000001', 'rls-a@example.invalid', '{"full_name":"Prueba A"}'),
       ('10000000-0000-0000-0000-000000000002', 'rls-b@example.invalid', '{"full_name":"Prueba B"}');
insert into public.tasks(user_id, title, subject, due_date)
values ('10000000-0000-0000-0000-000000000002', 'Privada B', 'Redes', '2026-10-10');
insert into public.exams(user_id, subject, topic, exam_date)
values ('10000000-0000-0000-0000-000000000002', 'Redes', 'Privado B', '2026-10-10');
insert into public.quick_links(user_id, title, url)
values ('10000000-0000-0000-0000-000000000002', 'Privado B', 'https://example.org');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare n integer;
begin
  if exists(select 1 from public.profiles where id = '10000000-0000-0000-0000-000000000002')
     or exists(select 1 from public.tasks where user_id = '10000000-0000-0000-0000-000000000002')
     or exists(select 1 from public.exams where user_id = '10000000-0000-0000-0000-000000000002')
     or exists(select 1 from public.quick_links where user_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'FALLO: lectura de otro usuario';
  end if;
  update public.tasks set title = 'Intrusión' where user_id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: modificación de otro usuario'; end if;
  delete from public.exams where user_id = '10000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: borrado de otro usuario'; end if;
  begin
    insert into public.quick_links(user_id,title,url) values ('10000000-0000-0000-0000-000000000002','Intrusión','https://example.org');
    raise exception 'FALLO: escritura con dueño ajeno';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FALLO: escalada de rol';
  exception when insufficient_privilege then null; end;
  insert into public.tasks(title,subject,due_date) values ('Propia','Redes','2026-10-11');
  if not exists(select 1 from public.tasks where title = 'Propia' and user_id = auth.uid()) then
    raise exception 'FALLO: escritura propia';
  end if;
  raise notice 'Correcto: aislamiento entre usuarios y rol protegido';
end $$;
reset role;
rollback;
