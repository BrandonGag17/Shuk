import { useEffect, useState } from 'react'
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

    useEffect(() => {
        async function traerProducto() {
            const { data, error } = await supabase
                .from('Productos')
                .select('idProducto, Nombre, PrecioCompra, PrecioVenta, Stock, NombreProveedor, TipoProducto, ImagenUrl')
                .eq('idProducto', id)

            if (error) {
                console.log(error)
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
        }

        traerProducto()
    }, [id])

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
                    <p className="campo-valor">{producto.Stock} unidades</p>
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
                                    <span><strong>{lote.CantidadDisponible}</strong> de {lote.CantidadInicial} u.</span>
                                    <span>Compra <strong>${Number(lote.PrecioCompra).toLocaleString('es-AR')}</strong></span>
                                    <span>Venta <strong>${Number(lote.PrecioVenta).toLocaleString('es-AR')}</strong></span>
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

        </div>
    )
}

export default DetalleProducto
