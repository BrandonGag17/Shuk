-- Ejecutar este archivo completo en el SQL Editor de Supabase.
--
-- El stock mostrado de un producto pasa a ser siempre la suma de sus lotes.
-- Una venta sin unidades físicas se puede confirmar: deja la venta registrada
-- y conserva su costo histórico, pero nunca crea stock negativo.

alter table public."ConsumosLote"
  add column if not exists "AfectaStock" boolean not null default true;

create or replace function public.agregar_lote_stock(
  p_id_producto bigint,
  p_cantidad integer,
  p_precio_compra numeric,
  p_precio_venta numeric
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cantidad <= 0 or p_precio_compra < 0 or p_precio_venta < 0 then
    raise exception 'Los valores del lote no son válidos';
  end if;

  perform 1 from public."Productos" where "idProducto" = p_id_producto for update;
  if not found then raise exception 'Producto inexistente'; end if;

  insert into public."LotesStock" ("idProducto", "CantidadInicial", "CantidadDisponible", "PrecioCompra", "PrecioVenta")
  values (p_id_producto, p_cantidad, p_cantidad, p_precio_compra, p_precio_venta);

  update public."Productos"
  set "Stock" = (select coalesce(sum(l."CantidadDisponible"), 0) from public."LotesStock" l where l."idProducto" = p_id_producto),
      "PrecioCompra" = p_precio_compra,
      "PrecioVenta" = p_precio_venta
  where "idProducto" = p_id_producto;
end;
$$;

drop function if exists public.registrar_venta_fifo(bigint, jsonb);
drop function if exists public.registrar_venta_fifo(bigint, jsonb, boolean);

create function public.registrar_venta_fifo(
  p_id_cliente bigint,
  p_renglones jsonb,
  p_permitir_sin_stock boolean default false
)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_venta bigint;
  v_renglon jsonb;
  v_lote record;
  v_primer_lote record;
  v_detalle bigint;
  v_pendiente integer;
  v_tomar integer;
  v_stock_fisico integer;
  v_nombre text;
  v_total numeric := 0;
begin
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La venta debe incluir productos';
  end if;

  insert into public."Ventas" ("idCliente", fecha, estado, total)
  values (p_id_cliente, now(), 'activa', 0)
  returning "idVenta" into v_venta;

  for v_renglon in select * from jsonb_array_elements(p_renglones) loop
    v_pendiente := (v_renglon->>'cantidad')::integer;
    if v_pendiente <= 0 or (v_renglon->>'precioVenta')::numeric < 0 then
      raise exception 'Renglón de venta inválido';
    end if;

    select "Nombre" into v_nombre
    from public."Productos"
    where "idProducto" = (v_renglon->>'idProducto')::bigint
    for update;
    if not found then raise exception 'Producto inexistente'; end if;

    select coalesce(sum("CantidadDisponible"), 0) into v_stock_fisico
    from public."LotesStock"
    where "idProducto" = (v_renglon->>'idProducto')::bigint;

    if v_pendiente > v_stock_fisico and not p_permitir_sin_stock then
      raise exception 'No hay stock suficiente para %', v_nombre;
    end if;

    insert into public."DetalleVentas" ("idVenta", "idProducto", "CantidadUnidades", "PrecioVentaUnitario")
    values (v_venta, (v_renglon->>'idProducto')::bigint, v_pendiente, (v_renglon->>'precioVenta')::numeric)
    returning "idDetalle" into v_detalle;

    for v_lote in
      select * from public."LotesStock"
      where "idProducto" = (v_renglon->>'idProducto')::bigint and "CantidadDisponible" > 0
      order by "fechaIngreso", "idLote" for update
    loop
      exit when v_pendiente = 0;
      v_tomar := least(v_pendiente, v_lote."CantidadDisponible");
      update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" - v_tomar where "idLote" = v_lote."idLote";
      insert into public."ConsumosLote" ("idDetalle", "idLote", "Cantidad", "CostoUnitario", "AfectaStock")
      values (v_detalle, v_lote."idLote", v_tomar, v_lote."PrecioCompra", true);
      v_pendiente := v_pendiente - v_tomar;
    end loop;

    -- El faltante no descuenta inventario inexistente. Sólo queda asociado a
    -- un lote para poder calcular correctamente el costo de esa venta.
    if v_pendiente > 0 then
      select * into v_primer_lote from public."LotesStock"
      where "idProducto" = (v_renglon->>'idProducto')::bigint
      order by "fechaIngreso", "idLote" limit 1;
      if found then
        insert into public."ConsumosLote" ("idDetalle", "idLote", "Cantidad", "CostoUnitario", "AfectaStock")
        values (v_detalle, v_primer_lote."idLote", v_pendiente, v_primer_lote."PrecioCompra", false);
      end if;
    end if;

    update public."Productos"
    set "Stock" = (select coalesce(sum(l."CantidadDisponible"), 0) from public."LotesStock" l where l."idProducto" = (v_renglon->>'idProducto')::bigint)
    where "idProducto" = (v_renglon->>'idProducto')::bigint;
    v_total := v_total + (v_renglon->>'cantidad')::integer * (v_renglon->>'precioVenta')::numeric;
  end loop;

  update public."Ventas" set total = v_total where "idVenta" = v_venta;
  return v_venta;
end;
$$;

create or replace function public.eliminar_venta_fifo(p_id_venta bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_consumo record;
  v_producto bigint;
begin
  for v_consumo in
    select c."idLote", c."Cantidad", l."idProducto", coalesce(c."AfectaStock", true) as afecta_stock
    from public."ConsumosLote" c
    join public."LotesStock" l on l."idLote" = c."idLote"
    join public."DetalleVentas" d on d."idDetalle" = c."idDetalle"
    where d."idVenta" = p_id_venta
    for update of l
  loop
    if v_consumo.afecta_stock then
      update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" + v_consumo."Cantidad" where "idLote" = v_consumo."idLote";
    end if;
  end loop;

  for v_producto in select distinct "idProducto" from public."DetalleVentas" where "idVenta" = p_id_venta loop
    update public."Productos"
    set "Stock" = (select coalesce(sum(l."CantidadDisponible"), 0) from public."LotesStock" l where l."idProducto" = v_producto)
    where "idProducto" = v_producto;
  end loop;

  delete from public."Ventas" where "idVenta" = p_id_venta;
end;
$$;

-- Al editar también se vuelve a calcular el stock desde los lotes. Así una
-- venta modificada o cancelada no puede volver a dejar el total negativo.
create or replace function public.actualizar_venta_fifo(
  p_id_venta bigint,
  p_estado text,
  p_renglones jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_estado_anterior text;
  v_consumo record;
  v_renglon jsonb;
  v_lote record;
  v_primer_lote record;
  v_detalle bigint;
  v_pendiente integer;
  v_tomar integer;
  v_total numeric := 0;
  v_productos bigint[] := array[]::bigint[];
  v_producto bigint;
begin
  if p_estado not in ('activa', 'modificada', 'cancelada') then
    raise exception 'Estado de venta inválido';
  end if;
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La venta debe incluir productos';
  end if;

  select estado into v_estado_anterior from public."Ventas" where "idVenta" = p_id_venta for update;
  if not found then raise exception 'Venta inexistente'; end if;

  if v_estado_anterior <> 'cancelada' then
    for v_consumo in
      select c."idLote", c."Cantidad", l."idProducto", coalesce(c."AfectaStock", true) as afecta_stock
      from public."ConsumosLote" c
      join public."LotesStock" l on l."idLote" = c."idLote"
      join public."DetalleVentas" d on d."idDetalle" = c."idDetalle"
      where d."idVenta" = p_id_venta
      for update of l
    loop
      v_productos := array_append(v_productos, v_consumo."idProducto");
      if v_consumo.afecta_stock then
        update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" + v_consumo."Cantidad" where "idLote" = v_consumo."idLote";
      end if;
    end loop;
  end if;

  for v_producto in select distinct "idProducto" from public."DetalleVentas" where "idVenta" = p_id_venta loop
    v_productos := array_append(v_productos, v_producto);
  end loop;
  delete from public."DetalleVentas" where "idVenta" = p_id_venta;

  for v_renglon in select * from jsonb_array_elements(p_renglones) loop
    v_pendiente := (v_renglon->>'cantidad')::integer;
    if v_pendiente <= 0 or (v_renglon->>'precioVenta')::numeric < 0 then
      raise exception 'Renglón de venta inválido';
    end if;
    perform 1 from public."Productos" where "idProducto" = (v_renglon->>'idProducto')::bigint for update;
    if not found then raise exception 'Producto inexistente'; end if;

    insert into public."DetalleVentas" ("idVenta", "idProducto", "CantidadUnidades", "PrecioVentaUnitario")
    values (p_id_venta, (v_renglon->>'idProducto')::bigint, v_pendiente, (v_renglon->>'precioVenta')::numeric)
    returning "idDetalle" into v_detalle;
    v_productos := array_append(v_productos, (v_renglon->>'idProducto')::bigint);
    v_total := v_total + v_pendiente * (v_renglon->>'precioVenta')::numeric;

    if p_estado <> 'cancelada' then
      for v_lote in
        select * from public."LotesStock"
        where "idProducto" = (v_renglon->>'idProducto')::bigint and "CantidadDisponible" > 0
        order by "fechaIngreso", "idLote" for update
      loop
        exit when v_pendiente = 0;
        v_tomar := least(v_pendiente, v_lote."CantidadDisponible");
        update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" - v_tomar where "idLote" = v_lote."idLote";
        insert into public."ConsumosLote" ("idDetalle", "idLote", "Cantidad", "CostoUnitario", "AfectaStock")
        values (v_detalle, v_lote."idLote", v_tomar, v_lote."PrecioCompra", true);
        v_pendiente := v_pendiente - v_tomar;
      end loop;
      if v_pendiente > 0 then
        select * into v_primer_lote from public."LotesStock"
        where "idProducto" = (v_renglon->>'idProducto')::bigint
        order by "fechaIngreso", "idLote" limit 1;
        if found then
          insert into public."ConsumosLote" ("idDetalle", "idLote", "Cantidad", "CostoUnitario", "AfectaStock")
          values (v_detalle, v_primer_lote."idLote", v_pendiente, v_primer_lote."PrecioCompra", false);
        end if;
      end if;
    end if;
  end loop;

  for v_producto in select distinct unnest(v_productos) loop
    update public."Productos"
    set "Stock" = (select coalesce(sum(l."CantidadDisponible"), 0) from public."LotesStock" l where l."idProducto" = v_producto)
    where "idProducto" = v_producto;
  end loop;
  update public."Ventas" set estado = p_estado, total = v_total where "idVenta" = p_id_venta;
end;
$$;

-- Corrige los productos que ya habían quedado desincronizados.
update public."Productos" p
set "Stock" = coalesce((
  select sum(l."CantidadDisponible") from public."LotesStock" l where l."idProducto" = p."idProducto"
), 0);

revoke execute on function public.agregar_lote_stock(bigint, integer, numeric, numeric) from public, anon;
revoke execute on function public.registrar_venta_fifo(bigint, jsonb, boolean) from public, anon;
revoke execute on function public.eliminar_venta_fifo(bigint) from public, anon;
revoke execute on function public.actualizar_venta_fifo(bigint, text, jsonb) from public, anon;
grant execute on function public.agregar_lote_stock(bigint, integer, numeric, numeric) to authenticated;
grant execute on function public.registrar_venta_fifo(bigint, jsonb, boolean) to authenticated;
grant execute on function public.eliminar_venta_fifo(bigint) to authenticated;
grant execute on function public.actualizar_venta_fifo(bigint, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
