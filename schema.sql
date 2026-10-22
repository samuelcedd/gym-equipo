-- Pegar en Supabase → SQL Editor → New query → Run (se puede correr varias veces sin error)

create table if not exists public.kv (
  path        text primary key,          -- ej: w/samuel, c/anderson, s/2026-10-20~lorena, cfg/gym
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.kv enable row level security;

-- Permisos de la API para la llave anon (sin delete: los datos no se pueden borrar desde la app)
grant usage on schema public to anon;
grant select, insert, update on public.kv to anon;

-- Cualquiera con el link de la app puede leer y escribir (datos de gym, sin login).
-- Estas políticas cubren todos los docs, incluido cfg/gym (configuración "Mi gym" compartida).
drop policy if exists "equipo lee"       on public.kv;
drop policy if exists "equipo crea"      on public.kv;
drop policy if exists "equipo actualiza" on public.kv;
create policy "equipo lee"       on public.kv for select to anon using (true);
create policy "equipo crea"      on public.kv for insert to anon with check (true);
create policy "equipo actualiza" on public.kv for update to anon using (true) with check (true);

-- Configuración compartida "Mi gym" (unidades, barras, discos, mancuernas y máquinas).
-- Vacía = valores por defecto de la app; la primera vez que alguien guarde Mi gym se llena.
insert into public.kv (path, data) values ('cfg/gym', '{}'::jsonb)
on conflict (path) do nothing;

-- Sincronización en vivo entre los celulares
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kv'
  ) then
    alter publication supabase_realtime add table public.kv;
  end if;
end $$;

-- Verificación: debe devolver una fila con kv
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'kv';
