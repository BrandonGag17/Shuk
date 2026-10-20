import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import './ResumenStock.css'

const TAMANO_PAGINA = 1000

function normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

async function cargarTodasLasFilas(tabla, columnas, orden) {
    const filas = []
    let desde = 0

    while (true) {
        const { data, error } = await supabase
            .from(tabla)
            .select(columnas)
            .order(orden, { ascending: true })
            .range(desde, desde + TAMANO_PAGINA - 1)

        if (error) throw error
        filas.push(...data)
        if (data.length < TAMANO_PAGINA) return filas
        desde += TAMANO_PAGINA
    }
}

function ResumenStock({ abierto, onCerrar }) {
    const [productos, setProductos] = useState([])
    const [lotes, setLotes] = useState([])
    const [seleccionados, setSeleccionados] = useState([])
    const [busqueda, setBusqueda] = useState('')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!abierto) return

        let vigente = true
        async function cargarDatos() {
            setCargando(true)
            setError('')
            try {
                const [productosCargados, lotesCargados] = await Promise.all([
                    cargarTodasLasFilas('Productos', 'idProducto, Nombre', 'idProducto'),
                    cargarTodasLasFilas('LotesStock', 'idProducto, CantidadInicial, CantidadDisponible, PrecioCompra, fechaIngreso', 'idLote')
                ])
                if (!vigente) return

                productosCargados.sort((a, b) => String(a.Nombre ?? '').localeCompare(String(b.Nombre ?? ''), 'es'))
                setProductos(productosCargados)
                setLotes(lotesCargados)
                setSeleccionados(productosCargados.map(producto => producto.idProducto))
            } catch (errorCarga) {
                if (vigente) setError(errorCarga.message || 'No se pudo cargar el stock')
            } finally {
                if (vigente) setCargando(false)
            }
        }

        cargarDatos()
        return () => { vigente = false }
    }, [abierto])

    const productosFiltrados = useMemo(() => {
        const termino = normalizar(busqueda).trim()
        return productos.filter(producto => !termino || normalizar(producto.Nombre).includes(termino))
    }, [busqueda, productos])

    const resumen = useMemo(() => {
        const idsSeleccionados = new Set(seleccionados)
        return lotes.reduce((acumulado, lote) => {
            const fecha = String(lote.fechaIngreso ?? '').slice(0, 10)
            const estaEnPeriodo = (!fechaDesde || fecha >= fechaDesde) && (!fechaHasta || fecha <= fechaHasta)
            if (!idsSeleccionados.has(lote.idProducto) || !estaEnPeriodo) return acumulado

            const inicial = Number(lote.CantidadInicial ?? 0)
            const disponible = Number(lote.CantidadDisponible ?? 0)
            const costo = Number(lote.PrecioCompra ?? 0)
            return {
                lotes: acumulado.lotes + 1,
                ingresadas: acumulado.ingresadas + inicial,
                disponibles: acumulado.disponibles + disponible,
                valorIngresado: acumulado.valorIngresado + inicial * costo,
                valorDisponible: acumulado.valorDisponible + disponible * costo
            }
        }, { lotes: 0, ingresadas: 0, disponibles: 0, valorIngresado: 0, valorDisponible: 0 })
    }, [fechaDesde, fechaHasta, lotes, seleccionados])

    const moneda = valor => Number(valor).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })

    function alternarProducto(idProducto) {
        setSeleccionados(actuales => actuales.includes(idProducto)
            ? actuales.filter(id => id !== idProducto)
            : [...actuales, idProducto]
        )
    }

    if (!abierto) return null

    return createPortal(
        <div className="resumen-general-fondo" role="presentation" onMouseDown={onCerrar}>
            <section className="resumen-general-modal" role="dialog" aria-modal="true" aria-labelledby="resumen-general-titulo" onMouseDown={evento => evento.stopPropagation()}>
                <header className="resumen-general-encabezado">
                    <div>
                        <h2 id="resumen-general-titulo">Resumen de stock</h2>
                        <p>Elegí productos y un período de ingreso para consultar el inventario.</p>
                    </div>
                    <button type="button" className="resumen-general-cerrar" aria-label="Cerrar resumen" onClick={onCerrar}>×</button>
                </header>

                {cargando ? <p className="resumen-general-estado">Cargando todos los productos y lotes...</p> : error ? <p className="resumen-general-error">{error}</p> : <>
                    <div className="resumen-general-filtros-fecha">
                        <label>Desde<input type="date" value={fechaDesde} onChange={evento => setFechaDesde(evento.target.value)} /></label>
                        <label>Hasta<input type="date" value={fechaHasta} onChange={evento => setFechaHasta(evento.target.value)} /></label>
                    </div>

                    <section className="resumen-general-productos">
                        <div className="resumen-general-productos-titulo">
                            <strong>Productos seleccionados: {seleccionados.length} de {productos.length}</strong>
                            <div>
                                <button type="button" onClick={() => setSeleccionados(productos.map(producto => producto.idProducto))}>Seleccionar todos</button>
                                <button type="button" onClick={() => setSeleccionados([])}>Deseleccionar todos</button>
                            </div>
                        </div>
                        <input type="search" value={busqueda} onChange={evento => setBusqueda(evento.target.value)} placeholder="Buscar producto..." aria-label="Buscar producto" />
                        <div className="resumen-general-lista-productos">
                            {productosFiltrados.map(producto => <label key={producto.idProducto}>
                                <input type="checkbox" checked={seleccionados.includes(producto.idProducto)} onChange={() => alternarProducto(producto.idProducto)} />
                                <span>{producto.Nombre}</span>
                            </label>)}
                            {productosFiltrados.length === 0 && <p>No se encontraron productos.</p>}
                        </div>
                    </section>

                    <section className="resumen-general-datos" aria-label="Resultado del resumen">
                        <div><span>Lotes ingresados</span><strong>{resumen.lotes}</strong></div>
                        <div><span>Unidades ingresadas</span><strong>{resumen.ingresadas}</strong></div>
                        <div><span>Unidades disponibles</span><strong>{resumen.disponibles}</strong></div>
                        <div><span>Valor al ingresar</span><strong>{moneda(resumen.valorIngresado)}</strong></div>
                        <div className="resumen-general-total"><span>Valor del stock disponible</span><strong>{moneda(resumen.valorDisponible)}</strong></div>
                    </section>
                </>}
            </section>
        </div>
        , document.body
    )
}

export default ResumenStock
