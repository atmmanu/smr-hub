-- Ejecutar solo en SQL Editor después de revisar. Sin permisos basados en email en el frontend.
begin;
do $$ declare owner_id uuid; matches integer; begin
 select count(*) into matches from auth.users where lower(email)='manuifuenla@gmail.com';
 if matches<>1 then raise exception 'Debe existir exactamente una cuenta con el correo indicado';end if;
 select id into owner_id from auth.users where lower(email)='manuifuenla@gmail.com';
 update public.profiles set role='admin' where id=owner_id;
 if not found then raise exception 'La cuenta no tiene perfil';end if;
end $$;
commit;
