-- Repara productos históricos cuyo campo Stock tiene unidades pero que no
-- recibieron su lote FIFO inicial. Sin ese lote, el resumen y las ventas no
-- pueden reconocer el inventario físico.
--
-- Es segura para ejecutar una vez: sólo inserta productos que todavía no
-- tienen ningún lote y conserva el propietario, el costo y el precio vigentes.
insert into public."LotesStock" (
  "idProducto",
  "CantidadInicial",
  "CantidadDisponible",
  "PrecioCompra",
  "PrecioVenta",
  owner_id
)
select
  p."idProducto",
  p."Stock",
  p."Stock",
  coalesce(p."PrecioCompra", 0),
  coalesce(p."PrecioVenta", 0),
  p.owner_id
from public."Productos" p
where coalesce(p."Stock", 0) > 0
  and not exists (
    select 1
    from public."LotesStock" l
    where l."idProducto" = p."idProducto"
  );

-- Debe devolver cero al terminar: no puede quedar stock físico sin lote.
select count(*) as productos_con_stock_sin_lote
from public."Productos" p
where coalesce(p."Stock", 0) > 0
  and not exists (
    select 1
    from public."LotesStock" l
    where l."idProducto" = p."idProducto"
  );
