-- FASE A de v0.3. Ejecutar una vez sobre la base de datos existente.
-- No altera ni borra ninguna tabla anterior.
begin;

create table public.moodle_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  moodle_url text not null check (char_length(moodle_url) <= 512),
  moodle_user_id bigint check (moodle_user_id > 0),
  token_ciphertext text check (char_length(token_ciphertext) between 40 and 1024),
  connected_at timestamptz,
  checked_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  check ((token_ciphertext is null and moodle_user_id is null and connected_at is null)
      or (token_ciphertext is not null and moodle_user_id is not null and connected_at is not null))
);
create table public.moodle_course_mappings (
  user_id uuid not null references public.moodle_connections(user_id) on delete cascade,
  course_id bigint not null check (course_id > 0),
  fullname text not null check (char_length(fullname) between 1 and 320),
  shortname text not null check (char_length(shortname) <= 320),
  subject text check (subject in (
    'Redes Locales', 'Montaje y Mantenimiento', 'Sistemas Operativos Monopuesto (SOM)',
    'Aplicaciones Ofimáticas', 'Itinerario para la Empleabilidad (IPE)', 'Programación en Python'
  )),
  manual boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index moodle_mappings_course on public.moodle_course_mappings(course_id);

-- Sin políticas para anon/authenticated: RLS deniega toda lectura y escritura.
-- Solo el backend, después de validar la sesión, utiliza service_role.
alter table public.moodle_connections enable row level security;
alter table public.moodle_course_mappings enable row level security;
revoke all on public.moodle_connections, public.moodle_course_mappings from public, anon, authenticated;
grant select, insert, update, delete on public.moodle_connections, public.moodle_course_mappings to service_role;

-- Reserva atómica: evita intentos simultáneos y limita a uno por minuto por usuario.
create function public.claim_moodle_attempt(p_user_id uuid, p_moodle_url text)
returns boolean language plpgsql set search_path = '' as $$
declare changed integer;
begin
  insert into public.moodle_connections(user_id, moodle_url, last_attempt_at)
  values (p_user_id, p_moodle_url, now())
  on conflict (user_id) do update set last_attempt_at = now()
    where public.moodle_connections.last_attempt_at < now() - interval '60 seconds';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

-- Guarda conexión y cursos en una transacción; mantiene los mapeos manuales.
create function public.save_moodle_connection(
  p_user_id uuid, p_moodle_url text, p_moodle_user_id bigint,
  p_token_ciphertext text, p_courses jsonb
)
returns void language plpgsql set search_path = '' as $$
declare previous public.moodle_connections%rowtype;
begin
  if p_courses is null or jsonb_typeof(p_courses) <> 'array' then
    raise exception 'Invalid course list';
  end if;
  if jsonb_array_length(p_courses) > 200 then
    raise exception 'Invalid course list';
  end if;
  select * into previous from public.moodle_connections where user_id = p_user_id for update;
  if not found then raise exception 'Connection attempt required'; end if;
  if previous.moodle_url <> p_moodle_url or previous.moodle_user_id is distinct from p_moodle_user_id then
    delete from public.moodle_course_mappings where user_id = p_user_id;
  end if;
  update public.moodle_connections set moodle_url = p_moodle_url,
    moodle_user_id = p_moodle_user_id, token_ciphertext = p_token_ciphertext,
    connected_at = case when previous.moodle_user_id = p_moodle_user_id and previous.moodle_url = p_moodle_url
      then coalesce(previous.connected_at, now()) else now() end,
    checked_at = now() where user_id = p_user_id;
  delete from public.moodle_course_mappings where user_id = p_user_id
    and course_id not in (select (c->>'course_id')::bigint from jsonb_array_elements(p_courses) c);
  insert into public.moodle_course_mappings(user_id, course_id, fullname, shortname, subject)
  select p_user_id, c.course_id, c.fullname, c.shortname, c.subject
    from jsonb_to_recordset(p_courses) as c(course_id bigint, fullname text, shortname text, subject text)
  on conflict (user_id, course_id) do update set
    fullname = excluded.fullname, shortname = excluded.shortname,
    subject = case when public.moodle_course_mappings.manual then public.moodle_course_mappings.subject else excluded.subject end,
    updated_at = now();
end;
$$;
revoke all on function public.claim_moodle_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.save_moodle_connection(uuid, text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_moodle_attempt(uuid, text) to service_role;
grant execute on function public.save_moodle_connection(uuid, text, bigint, text, jsonb) to service_role;
commit;
