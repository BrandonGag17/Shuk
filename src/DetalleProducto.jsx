import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './DetalleProducto.css'

function DetalleProducto() {

    const navigate = useNavigate()
    const { id } = useParams()
    const [producto, setProducto] = useState(null)
    const [editando, setEditando] = useState(false)
    const [form, setForm] = useState(null)
    const [nuevoLote, setNuevoLote] = useState({ cantidad: '', precioCompra: '', precioVenta: '' })
    const [agregandoStock, setAgregandoStock] = useState(false)
    const [lotes, setLotes] = useState([])
    const [cargandoLotes, setCargandoLotes] = useState(true)
    const [resumenAbierto, setResumenAbierto] = useState(false)
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [editandoStock, setEditandoStock] = useState(false)
    const [stockEditado, setStockEditado] = useState('')
    const [guardandoStock, setGuardandoStock] = useState(false)
    const [loteEnEdicion, setLoteEnEdicion] = useState(null)

    const resumenStock = useMemo(() => {
        const lotesDelPeriodo = lotes.filter(lote => {
            const fecha = String(lote.fechaIngreso ?? '').slice(0, 10)
            return (!fechaDesde || fecha >= fechaDesde) && (!fechaHasta || fecha <= fechaHasta)
        })

        return lotesDelPeriodo.reduce((resumen, lote) => {
            const cantidadInicial = Number(lote.CantidadInicial ?? 0)
            const cantidadDisponible = Number(lote.CantidadDisponible ?? 0)
            const precioCompra = Number(lote.PrecioCompra ?? 0)
            return {
                lotes: resumen.lotes + 1,
                unidadesIngresadas: resumen.unidadesIngresadas + cantidadInicial,
                unidadesDisponibles: resumen.unidadesDisponibles + cantidadDisponible,
                valorIngresado: resumen.valorIngresado + cantidadInicial * precioCompra,
                valorDisponible: resumen.valorDisponible + cantidadDisponible * precioCompra
            }
        }, { lotes: 0, unidadesIngresadas: 0, unidadesDisponibles: 0, valorIngresado: 0, valorDisponible: 0 })
    }, [fechaDesde, fechaHasta, lotes])

    const moneda = valor => Number(valor).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

    const recargarInventario = useCallback(async () => {
        setCargandoLotes(true)
        const { data, error } = await supabase
            .from('Productos')
            .select('idProducto, Nombre, PrecioCompra, PrecioVenta, Stock, NombreProveedor, TipoProducto, ImagenUrl')
            .eq('idProducto', id)

        if (error) {
            console.log(error)
            setCargandoLotes(false)
            return
        }

        setProducto(data[0])
        setForm(data[0])

        const { data: lotesCargados, error: errorLotes } = await supabase
            .from('LotesStock')
            .select('idLote, CantidadInicial, CantidadDisponible, PrecioCompra, PrecioVenta, fechaIngreso')
            .eq('idProducto', id)
            .order('fechaIngreso', { ascending: true })
            .order('idLote', { ascending: true })

        if (!errorLotes) setLotes(lotesCargados)
        setCargandoLotes(false)
    }, [id])

    useEffect(() => {
        recargarInventario()
    }, [recargarInventario])

    const convertirPrecio = (precio) => {
        // Reemplazar coma por punto para que Number() lo interprete correctamente
        return Number(precio.toString().replace(',', '.'))
    }

    async function guardarCambios() {
        const proveedor = String(form.NombreProveedor ?? '').trim()
        const tipo = String(form.TipoProducto ?? '').trim()
        const { error } = await supabase
            .from('Productos')
            .update({
                Nombre: form.Nombre,
                PrecioCompra: convertirPrecio(form.PrecioCompra),
                PrecioVenta: convertirPrecio(form.PrecioVenta),
                ImagenUrl: form.ImagenUrl,
                NombreProveedor: proveedor,
                TipoProducto: tipo
            })
            .eq('idProducto', id)

        if (error) {
            alert("Error al guardar")
            return
        }

        alert("Guardado ✅")
        setProducto(actual => ({ ...actual, ...form, NombreProveedor: proveedor, TipoProducto: tipo }))
        setForm(actual => ({ ...actual, NombreProveedor: proveedor, TipoProducto: tipo }))
        setEditando(false)
    }

    async function eliminarProducto() {
        const confirmar = window.confirm(`¿Seguro que querés eliminar ${producto.Nombre}?`)
        if (!confirmar) return

        const { error } = await supabase
            .from('Productos')
            .delete()
            .eq('idProducto', id)

        if (error) {
            alert("Error al eliminar")
            return
        }

        alert("Producto eliminado ✅")
        navigate('/')
    }

    async function agregarStock() {
        const cantidad = Number(nuevoLote.cantidad)
        const precioCompra = Number(nuevoLote.precioCompra)
        const precioVenta = Number(nuevoLote.precioVenta)
        if (!Number.isInteger(cantidad) || cantidad <= 0 || precioCompra < 0 || precioVenta < 0) {
            return alert('Completá una cantidad entera y precios válidos')
        }

        setAgregandoStock(true)
        const { error } = await supabase.rpc('agregar_lote_stock', {
            p_id_producto: producto.idProducto,
            p_cantidad: cantidad,
            p_precio_compra: precioCompra,
            p_precio_venta: precioVenta
        })
        setAgregandoStock(false)
        if (error) return alert(error.message || 'No se pudo agregar el lote de stock')

        setProducto(actual => ({ ...actual, Stock: Number(actual.Stock ?? 0) + cantidad, PrecioCompra: precioCompra, PrecioVenta: precioVenta }))
        setForm(actual => ({ ...actual, Stock: Number(actual.Stock ?? 0) + cantidad, PrecioCompra: precioCompra, PrecioVenta: precioVenta }))
        setLotes(actuales => [...actuales, {
            idLote: `nuevo-${Date.now()}`,
            CantidadInicial: cantidad,
            CantidadDisponible: cantidad,
            PrecioCompra: precioCompra,
            PrecioVenta: precioVenta,
            fechaIngreso: new Date().toISOString()
        }])
        setNuevoLote({ cantidad: '', precioCompra: '', precioVenta: '' })
        alert('Stock agregado')
    }

    async function guardarStockActual() {
        const cantidad = Number(stockEditado)
        if (!Number.isInteger(cantidad) || cantidad < 0) {
            return alert('Ingresá una cantidad entera igual o mayor a cero')
        }

        setGuardandoStock(true)
        const { error } = await supabase.rpc('actualizar_stock_actual', {
            p_id_producto: producto.idProducto,
            p_stock: cantidad
        })
        setGuardandoStock(false)
        if (error) return alert(error.message || 'No se pudo actualizar el stock')

        await recargarInventario()
        setEditandoStock(false)
        alert('Stock actualizado')
    }

    async function guardarLote() {
        const cantidad = Number(loteEnEdicion?.cantidad)
        const precioCompra = convertirPrecio(loteEnEdicion?.precioCompra ?? '')
        const precioVenta = convertirPrecio(loteEnEdicion?.precioVenta ?? '')
        if (!Number.isInteger(cantidad) || cantidad < 0 || !Number.isFinite(precioCompra) || precioCompra < 0 || !Number.isFinite(precioVenta) || precioVenta < 0) {
            return alert('Ingresá una cantidad entera y precios válidos, iguales o mayores a cero')
        }

        setGuardandoStock(true)
        const { error } = await supabase.rpc('actualizar_lote_stock', {
            p_id_lote: loteEnEdicion.idLote,
            p_cantidad_disponible: cantidad,
            p_precio_compra: precioCompra,
            p_precio_venta: precioVenta
        })
        setGuardandoStock(false)
        if (error) return alert(error.message || 'No se pudo actualizar el lote')

        await recargarInventario()
        setLoteEnEdicion(null)
        alert('Lote actualizado')
    }

    async function eliminarLote(lote) {
        if (!window.confirm(`¿Eliminar el lote #${lotes.findIndex(actual => actual.idLote === lote.idLote) + 1}?`)) return

        setGuardandoStock(true)
        const { error } = await supabase.rpc('eliminar_lote_stock', { p_id_lote: lote.idLote })
        setGuardandoStock(false)
        if (error) return alert(error.message || 'No se pudo eliminar el lote')

        await recargarInventario()
        setLoteEnEdicion(null)
        alert('Lote eliminado')
    }

    if (!producto) return <p>Cargando...</p>

    return (
        <div className="detalle-producto-page">

            <p className="detalle-producto-id">ID #{producto.idProducto}</p>

            <div className="detalle-producto-campos">

                <div className="campo-fila">
                    <span className="campo-label">Nombre</span>
                    {editando ? (
                        <input value={form.Nombre} onChange={(e) => setForm({ ...form, Nombre: e.target.value })} />
                    ) : (
                        <p className="campo-valor">{producto.Nombre}</p>
                    )}
                </div>

                <div className="campo-fila">
                    <span className="campo-label">Precio compra</span>
                    {editando ? (
                        <input value={form.PrecioCompra} onChange={(e) => setForm({ ...form, PrecioCompra: e.target.value })} />
                    ) : (
                        <p className="campo-valor">${producto.PrecioCompra}</p>
                    )}
                </div>

                <div className="campo-fila">
                    <span className="campo-label">Precio venta</span>
                    {editando ? (
                        <input value={form.PrecioVenta} onChange={(e) => setForm({ ...form, PrecioVenta: e.target.value })} />
                    ) : (
                        <p className="campo-valor">${producto.PrecioVenta}</p>
                    )}
                </div>

                <div className="campo-fila">
                    <span className="campo-label">Stock</span>
                    <div className="stock-actual-acciones">
                        {editandoStock ? (
                            <div className="stock-edicion">
                                <input aria-label="Stock actual" type="number" min="0" step="1" value={stockEditado} onChange={evento => setStockEditado(evento.target.value)} />
                                <button className="btn btn-primary" type="button" onClick={guardarStockActual} disabled={guardandoStock}>{guardandoStock ? 'Guardando...' : 'Guardar'}</button>
                                <button className="btn btn-secondary" type="button" onClick={() => setEditandoStock(false)} disabled={guardandoStock}>Cancelar</button>
                            </div>
                        ) : <p className="campo-valor">{producto.Stock} unidades</p>}
                        {!editandoStock && <button className="btn btn-secondary" type="button" onClick={() => { setStockEditado(String(producto.Stock ?? 0)); setEditandoStock(true) }}>Editar stock</button>}
                        <button className="btn btn-secondary btn-resumen-stock" type="button" onClick={() => setResumenAbierto(true)}>
                            Resumen de stock
                        </button>
                    </div>
                </div>

                <section className="lotes-stock">
                    <div className="lotes-stock-titulo">
                        <span className="campo-label">Lotes de stock (orden FIFO)</span>
                        <span>{lotes.length} lote(s)</span>
                    </div>
                    {cargandoLotes ? <p className="lotes-stock-vacio">Cargando lotes...</p> : lotes.length === 0 ? (
                        <p className="lotes-stock-vacio">Todavía no hay lotes registrados.</p>
                    ) : (
                        <div className="lotes-stock-lista">
                            {lotes.map((lote, indice) => (
                                <div className="lote-stock" key={lote.idLote}>
                                    <span className="lote-orden">#{indice + 1}</span>
                                    <div className="lote-stock-detalle">
                                        {loteEnEdicion?.idLote === lote.idLote ? (
                                            <div className="lote-edicion">
                                                <label>Disponibles<input aria-label={`Unidades disponibles del lote ${indice + 1}`} type="number" min="0" step="1" value={loteEnEdicion.cantidad} onChange={evento => setLoteEnEdicion(actual => ({ ...actual, cantidad: evento.target.value }))} /></label>
                                                <label>Compra<input aria-label={`Precio de compra del lote ${indice + 1}`} type="number" min="0" step="0.01" value={loteEnEdicion.precioCompra} onChange={evento => setLoteEnEdicion(actual => ({ ...actual, precioCompra: evento.target.value }))} /></label>
                                                <label>Venta<input aria-label={`Precio de venta del lote ${indice + 1}`} type="number" min="0" step="0.01" value={loteEnEdicion.precioVenta} onChange={evento => setLoteEnEdicion(actual => ({ ...actual, precioVenta: evento.target.value }))} /></label>
                                            </div>
                                        ) : <>
                                            <span><strong>{lote.CantidadDisponible}</strong> de {lote.CantidadInicial} u.</span>
                                            <span>Compra <strong>${Number(lote.PrecioCompra).toLocaleString('es-AR')}</strong></span>
                                            <span>Venta <strong>${Number(lote.PrecioVenta).toLocaleString('es-AR')}</strong></span>
                                        </>}
                                    </div>
                                    <div className="lote-acciones">
                                        {loteEnEdicion?.idLote === lote.idLote ? <>
                                            <button className="btn btn-primary" type="button" onClick={guardarLote} disabled={guardandoStock}>{guardandoStock ? 'Guardando...' : 'Guardar'}</button>
                                            <button className="btn btn-secondary" type="button" onClick={() => setLoteEnEdicion(null)} disabled={guardandoStock}>Cancelar</button>
                                        </> : <>
                                            <button className="btn btn-secondary btn-editar-lote" type="button" onClick={() => setLoteEnEdicion({ idLote: lote.idLote, cantidad: String(lote.CantidadDisponible), precioCompra: String(lote.PrecioCompra), precioVenta: String(lote.PrecioVenta) })}>Editar lote</button>
                                            <button className="btn btn-danger btn-eliminar-lote" type="button" onClick={() => eliminarLote(lote)} disabled={guardandoStock}>Eliminar</button>
                                        </>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="campo-fila">
                    <span className="campo-label">Proveedor</span>
                    {editando ? (
                        <input value={form.NombreProveedor || ''} placeholder="Proveedor" onChange={(e) => setForm({ ...form, NombreProveedor: e.target.value })} />
                    ) : (
                        <p className="campo-valor">{producto.NombreProveedor || 'Sin proveedor'}</p>
                    )}
                </div>

                <div className="campo-fila">
                    <span className="campo-label">Tipo / categoría</span>
                    {editando ? (
                        <input value={form.TipoProducto || ''} placeholder="Ej.: PS5, Lego o nueva categoría" onChange={(e) => setForm({ ...form, TipoProducto: e.target.value })} />
                    ) : (
                        <p className="campo-valor">{producto.TipoProducto || 'Sin categoría'}</p>
                    )}
                </div>
                <div className="campo-fila">
                    <span className="campo-label">Imagen</span>
                    {editando ? (
                        <input value={form.ImagenUrl || ''} placeholder="https://..." onChange={(e) => setForm({ ...form, ImagenUrl: e.target.value })} />
                    ) : (
                        producto.ImagenUrl
                            ? <img src={producto.ImagenUrl} alt={producto.Nombre} style={{ width: 120, borderRadius: 8, marginTop: 4 }} />
                            : <p className="campo-valor">Sin imagen</p>
                    )}
                </div>

            </div>

            <section className="agregar-stock">
                <h3>Agregar stock (FIFO)</h3>
                <p>Este lote se venderá después del stock que ya estaba cargado.</p>
                <div className="agregar-stock-campos">
                    <input type="number" min="1" placeholder="Cantidad" value={nuevoLote.cantidad} onChange={e => setNuevoLote({ ...nuevoLote, cantidad: e.target.value })} />
                    <input type="number" min="0" step="0.01" placeholder="Precio de compra" value={nuevoLote.precioCompra} onChange={e => setNuevoLote({ ...nuevoLote, precioCompra: e.target.value })} />
                    <input type="number" min="0" step="0.01" placeholder="Precio de venta" value={nuevoLote.precioVenta} onChange={e => setNuevoLote({ ...nuevoLote, precioVenta: e.target.value })} />
                    <button className="btn btn-primary" type="button" onClick={agregarStock} disabled={agregandoStock}>{agregandoStock ? 'Agregando...' : 'Agregar lote'}</button>
                </div>
            </section>

            <div className="detalle-producto-acciones">
                {editando ? (
                    <button className="btn btn-primary" onClick={guardarCambios}>Guardar</button>
                ) : (
                    <>
                        <button className="btn btn-secondary" onClick={() => setEditando(true)}>Editar</button>
                        <button className="btn btn-danger" onClick={eliminarProducto}>Eliminar</button>
                    </>
                )}
            </div>

            {resumenAbierto && (
                <div className="resumen-stock-fondo" role="presentation" onMouseDown={() => setResumenAbierto(false)}>
                    <section className="resumen-stock-modal" role="dialog" aria-modal="true" aria-labelledby="resumen-stock-titulo" onMouseDown={evento => evento.stopPropagation()}>
                        <div className="resumen-stock-encabezado">
                            <div>
                                <h3 id="resumen-stock-titulo">Resumen de stock</h3>
                                <p>{producto.Nombre}</p>
                            </div>
                            <button className="resumen-stock-cerrar" type="button" aria-label="Cerrar resumen" onClick={() => setResumenAbierto(false)}>×</button>
                        </div>

                        <div className="resumen-stock-filtros">
                            <label>Desde<input type="date" value={fechaDesde} onChange={evento => setFechaDesde(evento.target.value)} /></label>
                            <label>Hasta<input type="date" value={fechaHasta} onChange={evento => setFechaHasta(evento.target.value)} /></label>
                        </div>

                        <div className="resumen-stock-datos">
                            <div><span>Lotes ingresados</span><strong>{resumenStock.lotes}</strong></div>
                            <div><span>Unidades ingresadas</span><strong>{resumenStock.unidadesIngresadas}</strong></div>
                            <div><span>Unidades disponibles</span><strong>{resumenStock.unidadesDisponibles}</strong></div>
                            <div><span>Valor al ingresar</span><strong>{moneda(resumenStock.valorIngresado)}</strong></div>
                            <div className="resumen-stock-total"><span>Valor del stock disponible</span><strong>{moneda(resumenStock.valorDisponible)}</strong></div>
                        </div>

                        <p className="resumen-stock-ayuda">Se incluyen los lotes cuya fecha de ingreso está dentro del período elegido. El valor disponible usa el costo de compra de las unidades que todavía quedan.</p>
                    </section>
                </div>
            )}

        </div>
    )
}

export default DetalleProducto
