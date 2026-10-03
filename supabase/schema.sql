-- Ejecutar una vez en SQL Editor sobre un proyecto nuevo.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 80),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  subject text not null check (char_length(trim(subject)) between 1 and 120),
  due_date date not null check (due_date between date '1900-01-01' and date '9999-12-31'),
  description text not null default '' check (char_length(description) <= 4000),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  subject text not null check (char_length(trim(subject)) between 1 and 120),
  exam_date date not null check (exam_date between date '1900-01-01' and date '9999-12-31'),
  topic text not null check (char_length(trim(topic)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  created_at timestamptz not null default now()
);
create table public.quick_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now()
);
create index tasks_user_date on public.tasks(user_id, due_date);
create index exams_user_date on public.exams(user_id, exam_date);
create index quick_links_user on public.quick_links(user_id);
create function public.create_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 80), ''), 'Estudiante'));
  return new;
end;
$$;
revoke all on function public.create_user_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.create_user_profile();
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.exams enable row level security;
alter table public.quick_links enable row level security;
-- Permisos de columna: no se puede cambiar role ni id desde la API.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy profile_update on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- USING protege las filas existentes; WITH CHECK exige el dueño al escribir.
revoke all on public.tasks, public.exams, public.quick_links from anon, authenticated;
grant select, insert, update, delete on public.tasks, public.exams, public.quick_links to authenticated;
create policy own_tasks on public.tasks for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_exams on public.exams for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_links on public.quick_links for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
