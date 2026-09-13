-- Migración multiusuario para Supabase.
-- ANTES DE EJECUTAR: tu primo debe crear y confirmar su cuenta desde la app.
-- Reemplazá el valor por el correo exacto de esa cuenta.

do $migration$
declare
  propietario_actual uuid;
begin
  select id into propietario_actual
  from auth.users
  where lower(email) = lower('REEMPLAZAR-POR-EL-CORREO-DE-TU-PRIMO@example.com');

  if propietario_actual is null then
    raise exception 'No existe una cuenta confirmada con el correo indicado. Creala primero desde la app.';
  end if;

  alter table public."Clientes" add column if not exists owner_id uuid references auth.users(id);
  alter table public."Productos" add column if not exists owner_id uuid references auth.users(id);
  alter table public."Ventas" add column if not exists owner_id uuid references auth.users(id);
  alter table public."LotesStock" add column if not exists owner_id uuid references auth.users(id);
  alter table public."DetalleVentas" add column if not exists owner_id uuid references auth.users(id);
  alter table public."ConsumosLote" add column if not exists owner_id uuid references auth.users(id);

  -- Todos los registros existentes pasan a la cuenta del primo.
  update public."Clientes" set owner_id = propietario_actual where owner_id is null;
  update public."Productos" set owner_id = propietario_actual where owner_id is null;
  update public."Ventas" set owner_id = propietario_actual where owner_id is null;
  update public."LotesStock" set owner_id = propietario_actual where owner_id is null;
  update public."DetalleVentas" set owner_id = propietario_actual where owner_id is null;
  update public."ConsumosLote" set owner_id = propietario_actual where owner_id is null;
end
$migration$;

-- El dueño se asigna desde el JWT; el navegador nunca puede elegir otro usuario.
alter table public."Clientes" alter column owner_id set default auth.uid();
alter table public."Productos" alter column owner_id set default auth.uid();
alter table public."Ventas" alter column owner_id set default auth.uid();
alter table public."LotesStock" alter column owner_id set default auth.uid();
alter table public."DetalleVentas" alter column owner_id set default auth.uid();
alter table public."ConsumosLote" alter column owner_id set default auth.uid();

alter table public."Clientes" alter column owner_id set not null;
alter table public."Productos" alter column owner_id set not null;
alter table public."Ventas" alter column owner_id set not null;
alter table public."LotesStock" alter column owner_id set not null;
alter table public."DetalleVentas" alter column owner_id set not null;
alter table public."ConsumosLote" alter column owner_id set not null;

create index if not exists clientes_owner_idx on public."Clientes" (owner_id);
create index if not exists productos_owner_idx on public."Productos" (owner_id);
create index if not exists ventas_owner_idx on public."Ventas" (owner_id);
create index if not exists lotes_stock_owner_idx on public."LotesStock" (owner_id);
create index if not exists detalle_ventas_owner_idx on public."DetalleVentas" (owner_id);
create index if not exists consumos_lote_owner_idx on public."ConsumosLote" (owner_id);

alter table public."Clientes" enable row level security;
alter table public."Productos" enable row level security;
alter table public."Ventas" enable row level security;
alter table public."LotesStock" enable row level security;
alter table public."DetalleVentas" enable row level security;
alter table public."ConsumosLote" enable row level security;

-- FORCE hace que también las funciones SECURITY DEFINER respeten estas reglas.
alter table public."Clientes" force row level security;
alter table public."Productos" force row level security;
alter table public."Ventas" force row level security;
alter table public."LotesStock" force row level security;
alter table public."DetalleVentas" force row level security;
alter table public."ConsumosLote" force row level security;

-- Elimina políticas previas (por ejemplo, una política pública de desarrollo)
-- para que ninguna pueda anular el aislamiento por propietario.
do $policies$
declare
  politica record;
begin
  for politica in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('Clientes', 'Productos', 'Ventas', 'LotesStock', 'DetalleVentas', 'ConsumosLote')
  loop
    execute format('drop policy if exists %I on public.%I', politica.policyname, politica.tablename);
  end loop;
end
$policies$;

drop policy if exists clientes_por_dueno on public."Clientes";
create policy clientes_por_dueno on public."Clientes"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists productos_por_dueno on public."Productos";
create policy productos_por_dueno on public."Productos"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists ventas_por_dueno on public."Ventas";
create policy ventas_por_dueno on public."Ventas"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and ("idCliente" is null or exists (
      select 1 from public."Clientes" c
      where c."idCliente" = "Ventas"."idCliente" and c.owner_id = (select auth.uid())
    ))
  );

drop policy if exists lotes_por_dueno on public."LotesStock";
create policy lotes_por_dueno on public."LotesStock"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public."Productos" p
      where p."idProducto" = "LotesStock"."idProducto" and p.owner_id = (select auth.uid())
    )
  );

drop policy if exists detalles_por_dueno on public."DetalleVentas";
create policy detalles_por_dueno on public."DetalleVentas"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public."Ventas" v where v."idVenta" = "DetalleVentas"."idVenta" and v.owner_id = (select auth.uid()))
    and exists (select 1 from public."Productos" p where p."idProducto" = "DetalleVentas"."idProducto" and p.owner_id = (select auth.uid()))
  );

drop policy if exists consumos_por_dueno on public."ConsumosLote";
create policy consumos_por_dueno on public."ConsumosLote"
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public."DetalleVentas" d where d."idDetalle" = "ConsumosLote"."idDetalle" and d.owner_id = (select auth.uid()))
    and exists (select 1 from public."LotesStock" l where l."idLote" = "ConsumosLote"."idLote" and l.owner_id = (select auth.uid()))
  );

grant select, insert, update, delete on public."Clientes", public."Productos", public."Ventas", public."LotesStock", public."DetalleVentas", public."ConsumosLote" to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Las operaciones que modifican inventario y ventas requieren una sesión.
revoke execute on function public.agregar_lote_stock(bigint, integer, numeric, numeric) from public, anon;
revoke execute on function public.registrar_venta_fifo(bigint, jsonb) from public, anon;
revoke execute on function public.eliminar_venta_fifo(bigint) from public, anon;
revoke execute on function public.actualizar_venta_fifo(bigint, text, jsonb) from public, anon;
grant execute on function public.agregar_lote_stock(bigint, integer, numeric, numeric) to authenticated;
grant execute on function public.registrar_venta_fifo(bigint, jsonb) to authenticated;
grant execute on function public.eliminar_venta_fifo(bigint) to authenticated;
grant execute on function public.actualizar_venta_fifo(bigint, text, jsonb) to authenticated;

-- Comprobación: debe devolver 0 antes de dar por finalizada la migración.
select
  (select count(*) from public."Clientes" where owner_id is null) +
  (select count(*) from public."Productos" where owner_id is null) +
  (select count(*) from public."Ventas" where owner_id is null) +
  (select count(*) from public."LotesStock" where owner_id is null) +
  (select count(*) from public."DetalleVentas" where owner_id is null) +
  (select count(*) from public."ConsumosLote" where owner_id is null)
  as registros_sin_propietario;
