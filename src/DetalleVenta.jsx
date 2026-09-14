import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './DetalleVenta.css'

const PRODUCTOS_POR_PAGINA = 1000
const normalizarTexto = (texto) => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function DetalleVenta() {
    const { id } = useParams()
    const [venta, setVenta] = useState(null)
    const [editando, setEditando] = useState(false)
    const [form, setForm] = useState(null)
    const [todosLosProductos, setTodosLosProductos] = useState([])
    const [busqueda, setBusqueda] = useState('')

    const cargarProductos = useCallback(async () => {
        const productosCargados = []
        let pagina = 0
        let hayMasProductos = true
        while (hayMasProductos) {
            const { data, error } = await supabase.from('Productos').select('idProducto, Nombre, PrecioVenta').order('Nombre', { ascending: true }).order('idProducto', { ascending: true }).range(pagina * PRODUCTOS_POR_PAGINA, (pagina + 1) * PRODUCTOS_POR_PAGINA - 1)
            if (error) { console.error(error); break }
            productosCargados.push(...data)
            hayMasProductos = data.length === PRODUCTOS_POR_PAGINA
            pagina += 1
        }
        setTodosLosProductos(productosCargados)
    }, [])

    const traerVenta = useCallback(async () => {
        const { data, error } = await supabase.from('Ventas').select(`
            idVenta, fecha, estado, total,
            Clientes(Nombre, Apellido),
            DetalleVentas(idDetalle, CantidadUnidades, PrecioVentaUnitario, idProducto, Productos(Nombre))
        `).eq('idVenta', id).single()
        if (error) { console.error(error); return }
        setVenta(data)
        setForm(JSON.parse(JSON.stringify(data)))
    }, [id])

    useEffect(() => { traerVenta(); cargarProductos() }, [traerVenta, cargarProductos])

    const terminoBusqueda = normalizarTexto(busqueda).trim()
    const sugerencias = todosLosProductos.filter(producto => terminoBusqueda && normalizarTexto(producto.Nombre).includes(terminoBusqueda))

    function agregarProductoNuevo(producto) {
        const nuevoDetalle = { idVenta: id, idProducto: producto.idProducto, CantidadUnidades: 1, PrecioVentaUnitario: producto.PrecioVenta, Productos: { Nombre: producto.Nombre }, esNuevo: true }
        setForm(actual => ({ ...actual, DetalleVentas: [...actual.DetalleVentas, nuevoDetalle] }))
        setBusqueda('')
    }

    function eliminarProducto(index) {
        setForm(actual => ({ ...actual, DetalleVentas: actual.DetalleVentas.filter((_, detalleIndex) => detalleIndex !== index) }))
    }

    async function guardarCambios() {
        if (form.DetalleVentas.length === 0) return alert('La venta debe tener al menos un producto')
        if (form.DetalleVentas.some(detalle => Number(detalle.CantidadUnidades) <= 0 || Number(detalle.PrecioVentaUnitario) < 0)) {
            return alert('Revisá las cantidades y precios de los productos')
        }
        const { error } = await supabase.rpc('actualizar_venta_fifo', {
            p_id_venta: Number(id),
            p_estado: form.estado,
            p_renglones: form.DetalleVentas.map(detalle => ({
                idProducto: detalle.idProducto,
                cantidad: Number(detalle.CantidadUnidades),
                precioVenta: Number(detalle.PrecioVentaUnitario)
            }))
        })
        if (error) {
            console.error('Error al actualizar la venta:', error)
            if (error.code === 'PGRST202' && error.message?.includes('actualizar_venta_fifo')) {
                return alert('La edición de ventas todavía no está habilitada en la base de datos. Aplicá la migración 20260914_reparar_rpc_actualizar_venta.sql en Supabase y volvé a intentar.')
            }
            return alert(error.message || 'No se pudo actualizar la venta')
        }
        alert('Venta actualizada')
        setEditando(false)
        traerVenta()
    }

    if (!venta || !form) return <p>Cargando...</p>
    const totalVenta = form.DetalleVentas.reduce((acumulado, detalle) => acumulado + Number(detalle.CantidadUnidades) * Number(detalle.PrecioVentaUnitario), 0)

    async function generarPDF() {
        const { default: jsPDF } = await import('jspdf')
        const doc = new jsPDF()
        const margen = 10
        const anchoPagina = doc.internal.pageSize.getWidth()
        const altoPagina = doc.internal.pageSize.getHeight()
        const columnas = [margen, 32, 118, 158, anchoPagina - margen]
        const moneda = (valor) => `$${Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        doc.setFontSize(18); doc.text(`Venta #${venta.idVenta}`, margen, 15)
        doc.setFontSize(12); doc.text(`Cliente: ${venta.Clientes?.Nombre || ''} ${venta.Clientes?.Apellido || ''}`, margen, 25)
        doc.text(`Fecha: ${new Date(venta.fecha).toLocaleString('es-AR')}`, margen, 35); doc.text(`Estado: ${venta.estado}`, margen, 45)
        let y = 58
        const encabezado = () => {
            doc.setFillColor(235, 235, 235); doc.rect(margen, y, anchoPagina - margen * 2, 8, 'F')
            doc.setFontSize(9); doc.setFont('helvetica', 'bold')
            doc.text('CANT.', columnas[0] + 2, y + 5.3); doc.text('PRODUCTO', columnas[1] + 2, y + 5.3)
            doc.text('PRECIO UNIT.', columnas[3] - 2, y + 5.3, { align: 'right' }); doc.text('TOTAL', columnas[4] - 2, y + 5.3, { align: 'right' })
            doc.setFont('helvetica', 'normal'); y += 8
        }
        encabezado()
        venta.DetalleVentas.forEach(detalle => {
            const cantidad = Number(detalle.CantidadUnidades); const precio = Number(detalle.PrecioVentaUnitario)
            const lineas = doc.splitTextToSize(detalle.Productos?.Nombre ?? 'Producto sin nombre', columnas[2] - columnas[1] - 4)
            const altoFila = Math.max(8, lineas.length * 4.5 + 3)
            if (y + altoFila > altoPagina - 22) { doc.addPage(); y = 15; encabezado() }
            doc.setDrawColor(190, 190, 190); doc.rect(margen, y, anchoPagina - margen * 2, altoFila)
            columnas.slice(1, -1).forEach(x => doc.line(x, y, x, y + altoFila))
            doc.setFontSize(9); doc.text(String(cantidad), columnas[0] + 2, y + 5.3); doc.text(lineas, columnas[1] + 2, y + 5.3)
            doc.text(moneda(precio), columnas[3] - 2, y + 5.3, { align: 'right' }); doc.text(moneda(cantidad * precio), columnas[4] - 2, y + 5.3, { align: 'right' }); y += altoFila
        })
        if (y + 20 > altoPagina - 10) { doc.addPage(); y = 20 }
        doc.setFontSize(14); doc.text(`Total: ${moneda(totalVenta)}`, margen, y + 10)
        doc.save(`venta-${venta.idVenta}.pdf`)
    }

    return <div className="detalle-venta-page">
        <div className="detalle-venta-header"><p className="detalle-venta-id">Venta #{venta.idVenta}</p><h2 className="detalle-venta-cliente">{venta.Clientes?.Nombre} {venta.Clientes?.Apellido}</h2><div className="detalle-venta-meta"><div className="detalle-venta-meta-item"><span className="detalle-venta-meta-label">Fecha: </span><span className="detalle-venta-meta-valor">{new Date(venta.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div><div className="detalle-venta-meta-item"><span className="detalle-venta-meta-label">Estado: </span><select disabled={!editando} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}><option value="activa">Activa</option><option value="modificada">Modificada</option><option value="cancelada">Cancelada</option></select></div></div></div>
        <h3>Productos</h3><div className="detalle-venta-productos">{form.DetalleVentas.map((detalle, index) => <div className="detalle-venta-producto-fila" key={detalle.idDetalle ?? `nuevo-${index}`}><span className="detalle-venta-producto-nombre">{detalle.Productos?.Nombre}</span>{editando ? <div className="detalle-venta-inputs"><label>Cant:</label><input type="number" min="1" value={detalle.CantidadUnidades} onChange={(e) => { const detalles = [...form.DetalleVentas]; detalles[index].CantidadUnidades = e.target.value; setForm({ ...form, DetalleVentas: detalles }) }} /><label>Precio ($):</label><input type="number" min="0" value={detalle.PrecioVentaUnitario} onChange={(e) => { const detalles = [...form.DetalleVentas]; detalles[index].PrecioVentaUnitario = e.target.value; setForm({ ...form, DetalleVentas: detalles }) }} /></div> : <span className="detalle-venta-producto-precio">${Number(detalle.PrecioVentaUnitario).toLocaleString()} x {detalle.CantidadUnidades}</span>}{editando && <button type="button" className="btn-eliminar-producto" onClick={() => eliminarProducto(index)}>Eliminar</button>}</div>)}</div>
        {editando && <div className="buscador-edicion"><h4>Agregar más productos:</h4><input type="text" placeholder="Escribí para buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />{busqueda && sugerencias.length > 0 && <ul className="sugerencias-lista">{sugerencias.map(producto => <li key={producto.idProducto} onClick={() => agregarProductoNuevo(producto)}>{producto.Nombre} (${producto.PrecioVenta}) +</li>)}</ul>}</div>}
        <div className="detalle-venta-total"><span className="detalle-venta-total-label">Total ganado:</span><span className="detalle-venta-total-valor">${totalVenta.toLocaleString('es-AR')}</span></div><div className="detalle-venta-acciones">{editando ? <><button className="btn btn-primary" onClick={guardarCambios}>Guardar Cambios</button><button className="btn btn-secondary" onClick={() => { setEditando(false); traerVenta() }}>Cancelar</button></> : <><button className="btn btn-secondary" onClick={() => setEditando(true)}>Editar Venta</button><button className="btn btn-secondary" onClick={generarPDF}>Descargar PDF</button></>}</div>
    </div>
}

export default DetalleVenta
