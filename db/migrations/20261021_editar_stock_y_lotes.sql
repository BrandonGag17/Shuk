-- Permite corregir el stock actual sin perder la trazabilidad FIFO.
-- Al aumentar el total se agrega un lote de ajuste; al reducirlo se descuenta
-- desde los lotes más nuevos. El campo Productos.Stock siempre se recalcula.
create or replace function public.actualizar_stock_actual(
  p_id_producto bigint,
  p_stock integer
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_producto public."Productos"%rowtype;
  v_lote public."LotesStock"%rowtype;
  v_actual integer;
  v_pendiente integer;
  v_tomar integer;
begin
  if p_stock < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;

  select * into v_producto
  from public."Productos"
  where "idProducto" = p_id_producto and owner_id = auth.uid()
  for update;
  if not found then raise exception 'Producto inexistente'; end if;

  select coalesce(sum("CantidadDisponible"), 0) into v_actual
  from public."LotesStock"
  where "idProducto" = p_id_producto;

  if p_stock > v_actual then
    insert into public."LotesStock" (
      "idProducto", "CantidadInicial", "CantidadDisponible", "PrecioCompra", "PrecioVenta", owner_id
    ) values (
      p_id_producto, p_stock - v_actual, p_stock - v_actual,
      coalesce(v_producto."PrecioCompra", 0), coalesce(v_producto."PrecioVenta", 0), v_producto.owner_id
    );
  elsif p_stock < v_actual then
    v_pendiente := v_actual - p_stock;
    for v_lote in
      select * from public."LotesStock"
      where "idProducto" = p_id_producto and "CantidadDisponible" > 0
      order by "fechaIngreso" desc, "idLote" desc
      for update
    loop
      exit when v_pendiente = 0;
      v_tomar := least(v_pendiente, v_lote."CantidadDisponible");
      update public."LotesStock"
      set "CantidadDisponible" = "CantidadDisponible" - v_tomar
      where "idLote" = v_lote."idLote";
      v_pendiente := v_pendiente - v_tomar;
    end loop;
  end if;

  update public."Productos"
  set "Stock" = (
    select coalesce(sum("CantidadDisponible"), 0)
    from public."LotesStock"
    where "idProducto" = p_id_producto
  )
  where "idProducto" = p_id_producto;
end;
$$;

-- Reemplaza la primera versión si ya se ejecutó durante esta misma corrección.
drop function if exists public.actualizar_lote_stock(bigint, integer);

-- Edita las unidades y los precios de un lote; conserva las unidades ya vendidas.
create or replace function public.actualizar_lote_stock(
  p_id_lote bigint,
  p_cantidad_disponible integer,
  p_precio_compra numeric,
  p_precio_venta numeric
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lote public."LotesStock"%rowtype;
begin
  if p_cantidad_disponible < 0 or p_precio_compra < 0 or p_precio_venta < 0 then
    raise exception 'La cantidad y los precios no pueden ser negativos';
  end if;

  select * into v_lote
  from public."LotesStock"
  where "idLote" = p_id_lote and owner_id = auth.uid()
  for update;
  if not found then raise exception 'Lote inexistente'; end if;

  update public."LotesStock"
  set "CantidadInicial" = "CantidadInicial" - "CantidadDisponible" + p_cantidad_disponible,
      "CantidadDisponible" = p_cantidad_disponible,
      "PrecioCompra" = p_precio_compra,
      "PrecioVenta" = p_precio_venta
  where "idLote" = p_id_lote;

  update public."Productos"
  set "Stock" = (
    select coalesce(sum("CantidadDisponible"), 0)
    from public."LotesStock"
    where "idProducto" = v_lote."idProducto"
  )
  where "idProducto" = v_lote."idProducto";
end;
$$;

revoke execute on function public.actualizar_stock_actual(bigint, integer) from public, anon;
revoke execute on function public.actualizar_lote_stock(bigint, integer, numeric, numeric) from public, anon;
grant execute on function public.actualizar_stock_actual(bigint, integer) to authenticated;
grant execute on function public.actualizar_lote_stock(bigint, integer, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
