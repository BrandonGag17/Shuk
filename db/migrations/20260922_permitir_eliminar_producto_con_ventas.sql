-- Permite borrar un producto aunque ya tenga ventas asociadas.
-- Las ventas históricas quedan conservadas, pero su referencia a producto pasa a NULL.

do $$
declare
  r record;
begin
  -- Drop de cualquier FK que apunte a Productos desde DetalleVentas.
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public."DetalleVentas"'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%REFERENCES public."Productos"%'
  loop
    execute format('alter table public."DetalleVentas" drop constraint %I', r.conname);
  end loop;

  -- Si la FK ya existía con el nombre específico, también la borramos.
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public."DetalleVentas"'::regclass
      and conname = 'DetalleVentas_idProducto_fkey'
  ) then
    alter table public."DetalleVentas" drop constraint "DetalleVentas_idProducto_fkey";
  end if;
end $$;

alter table public."DetalleVentas"
  alter column "idProducto" drop not null;

-- Si la FK no existe, la crea; si ya existe en otro nombre, quedó borrada arriba.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public."DetalleVentas"'::regclass
      and conname = 'DetalleVentas_idProducto_fkey'
  ) then
    alter table public."DetalleVentas"
      add constraint "DetalleVentas_idProducto_fkey"
      foreign key ("idProducto") references public."Productos"("idProducto") on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
