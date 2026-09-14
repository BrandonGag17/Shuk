-- Reparación de la RPC usada al editar una venta.
-- Ejecutar este archivo completo en el SQL Editor de Supabase de producción.
-- Reemplaza una versión anterior con firma distinta, si existiera.

drop function if exists public.actualizar_venta_fifo(bigint, text, jsonb);
drop function if exists public.actualizar_venta_fifo(text, bigint, jsonb);

create function public.actualizar_venta_fifo(
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
  v_detalle bigint;
  v_pendiente integer;
  v_tomar integer;
  v_stock_actual integer;
  v_total numeric := 0;
begin
  if p_estado not in ('activa', 'modificada', 'cancelada') then
    raise exception 'Estado de venta inválido';
  end if;
  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'La venta debe incluir productos';
  end if;

  select estado into v_estado_anterior
  from public."Ventas" where "idVenta" = p_id_venta for update;
  if not found then raise exception 'Venta inexistente'; end if;

  if v_estado_anterior <> 'cancelada' then
    for v_consumo in
      select c."idLote", c."Cantidad", l."idProducto"
      from public."ConsumosLote" c
      join public."LotesStock" l on l."idLote" = c."idLote"
      join public."DetalleVentas" d on d."idDetalle" = c."idDetalle"
      where d."idVenta" = p_id_venta
      for update of l
    loop
      update public."LotesStock"
      set "CantidadDisponible" = "CantidadDisponible" + v_consumo."Cantidad"
      where "idLote" = v_consumo."idLote";
      update public."Productos"
      set "Stock" = coalesce("Stock", 0) + v_consumo."Cantidad"
      where "idProducto" = v_consumo."idProducto";
    end loop;
  end if;

  delete from public."DetalleVentas" where "idVenta" = p_id_venta;

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

    insert into public."DetalleVentas" ("idVenta", "idProducto", "CantidadUnidades", "PrecioVentaUnitario")
    values (p_id_venta, (v_renglon->>'idProducto')::bigint, v_pendiente, (v_renglon->>'precioVenta')::numeric)
    returning "idDetalle" into v_detalle;
    v_total := v_total + v_pendiente * (v_renglon->>'precioVenta')::numeric;

    if p_estado <> 'cancelada' and v_stock_actual > 0 then
      for v_lote in
        select * from public."LotesStock"
        where "idProducto" = (v_renglon->>'idProducto')::bigint and "CantidadDisponible" > 0
        order by "fechaIngreso", "idLote" for update
      loop
        exit when v_pendiente = 0;
        v_tomar := least(v_pendiente, v_lote."CantidadDisponible");
        update public."LotesStock" set "CantidadDisponible" = "CantidadDisponible" - v_tomar where "idLote" = v_lote."idLote";
        insert into public."ConsumosLote" ("idDetalle", "idLote", "Cantidad", "CostoUnitario")
        values (v_detalle, v_lote."idLote", v_tomar, v_lote."PrecioCompra");
        v_pendiente := v_pendiente - v_tomar;
      end loop;
      if v_pendiente > 0 then raise exception 'No hay stock suficiente para el producto %', v_renglon->>'idProducto'; end if;
      update public."Productos"
      set "Stock" = coalesce("Stock", 0) - (v_renglon->>'cantidad')::integer
      where "idProducto" = (v_renglon->>'idProducto')::bigint;
    end if;
  end loop;

  update public."Ventas" set estado = p_estado, total = v_total where "idVenta" = p_id_venta;
end;
$$;

revoke execute on function public.actualizar_venta_fifo(bigint, text, jsonb) from public, anon;
grant execute on function public.actualizar_venta_fifo(bigint, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
