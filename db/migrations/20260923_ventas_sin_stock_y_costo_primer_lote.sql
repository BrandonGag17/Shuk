-- La aplicación solicita confirmación antes de usar esta opción.
-- Si se confirma una venta sin unidades suficientes, el stock queda negativo.
-- El faltante queda asociado al primer lote sólo para conservar su costo.

alter table public."ConsumosLote"
  add column if not exists "AfectaStock" boolean not null default true;

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
  v_stock_actual integer;
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

    select coalesce("Stock", 0) into v_stock_actual
    from public."Productos"
    where "idProducto" = (v_renglon->>'idProducto')::bigint
    for update;
    if not found then raise exception 'Producto inexistente'; end if;

    if v_pendiente > v_stock_actual and not p_permitir_sin_stock then
      raise exception 'No hay stock suficiente para el producto %', v_renglon->>'idProducto';
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
      update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" - v_tomar
      where "idLote" = v_lote."idLote";
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

    update public."Productos"
    set "Stock" = coalesce("Stock", 0) - (v_renglon->>'cantidad')::integer
    where "idProducto" = (v_renglon->>'idProducto')::bigint;
    v_total := v_total + (v_renglon->>'cantidad')::integer * (v_renglon->>'precioVenta')::numeric;
  end loop;

  update public."Ventas" set total = v_total where "idVenta" = v_venta;
  return v_venta;
end;
$$;

revoke execute on function public.registrar_venta_fifo(bigint, jsonb, boolean) from public, anon;
grant execute on function public.registrar_venta_fifo(bigint, jsonb, boolean) to authenticated;

-- Al anular una venta se restaura todo el stock del producto, pero sólo se
-- devuelve a un lote la cantidad que había salido físicamente de ese lote.
create or replace function public.eliminar_venta_fifo(p_id_venta bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_consumo record;
  v_detalle record;
begin
  for v_consumo in
    select c."idLote", c."Cantidad", coalesce(c."AfectaStock", true) as afecta_stock
    from public."ConsumosLote" c
    join public."DetalleVentas" d on d."idDetalle" = c."idDetalle"
    where d."idVenta" = p_id_venta
    for update of c
  loop
    if v_consumo.afecta_stock then
      update public."LotesStock"
      set "CantidadDisponible" = "CantidadDisponible" + v_consumo."Cantidad"
      where "idLote" = v_consumo."idLote";
    end if;
  end loop;

  for v_detalle in
    select "idProducto", "CantidadUnidades"
    from public."DetalleVentas" where "idVenta" = p_id_venta
  loop
    update public."Productos"
    set "Stock" = coalesce("Stock", 0) + v_detalle."CantidadUnidades"
    where "idProducto" = v_detalle."idProducto";
  end loop;

  delete from public."Ventas" where "idVenta" = p_id_venta;
end;
$$;

revoke execute on function public.eliminar_venta_fifo(bigint) from public, anon;
grant execute on function public.eliminar_venta_fifo(bigint) to authenticated;
notify pgrst, 'reload schema';
