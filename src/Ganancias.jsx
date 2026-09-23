import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import FiltroProductos from './FiltroProductos'
import './Ganancias.css'

function fechaLocalAISO(fecha, diasAdicionales = 0) {
    const [anio, mes, dia] = fecha.split('-').map(Number)
    return new Date(anio, mes - 1, dia + diasAdicionales).toISOString()
}

function Ganancias() {

    const PRODUCTOS_POR_PAGINA = 1000
    const [desdeFecha, setDesdeFecha] = useState('')
    const [hastaFecha, setHastaFecha] = useState('')
    const [productos, setProductos] = useState([])
    const [productosSeleccionados, setProductosSeleccionados] = useState([])
    const [clientes, setClientes] = useState([])
    const [busquedaCliente, setBusquedaCliente] = useState('')
    const [clientesSeleccionados, setClientesSeleccionados] = useState([])
    const [resultado, setResultado] = useState(null)
    const [cargandoGanancias, setCargandoGanancias] = useState(false)

    useEffect(() => {
        async function cargarFiltros() {
            const productosCargados = []
            let pagina = 0
            let hayMasProductos = true

            while (hayMasProductos) {
                const { data, error } = await supabase
                    .from('Productos')
                    .select('idProducto, Nombre, TipoProducto')
                    .order('Nombre', { ascending: true })
                    .order('idProducto', { ascending: true })
                    .range(pagina * PRODUCTOS_POR_PAGINA, (pagina + 1) * PRODUCTOS_POR_PAGINA - 1)

                if (error) {
                    console.error(error)
                    break
                }

                productosCargados.push(...data)
                hayMasProductos = data.length === PRODUCTOS_POR_PAGINA
                pagina += 1
            }

            productosCargados.sort((productoA, productoB) =>
                String(productoA.Nombre ?? '').localeCompare(String(productoB.Nombre ?? ''), 'es')
            )
            setProductos(productosCargados)

            const clientesCargados = []
            pagina = 0
            hayMasProductos = true
            while (hayMasProductos) {
                const { data, error } = await supabase
                    .from('Clientes')
                    .select('idCliente, Nombre, Apellido')
                    .order('idCliente', { ascending: true })
                    .range(pagina * PRODUCTOS_POR_PAGINA, (pagina + 1) * PRODUCTOS_POR_PAGINA - 1)

                if (error) {
                    console.error(error)
                    break
                }

                clientesCargados.push(...data)
                hayMasProductos = data.length === PRODUCTOS_POR_PAGINA
                pagina += 1
            }

            clientesCargados.sort((clienteA, clienteB) =>
                `${clienteA.Nombre ?? ''} ${clienteA.Apellido ?? ''}`.localeCompare(
                    `${clienteB.Nombre ?? ''} ${clienteB.Apellido ?? ''}`,
                    'es'
                )
            )
            setClientes(clientesCargados)
        }

        cargarFiltros()
    }, [])

    const terminoCliente = busquedaCliente.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    const clientesFiltrados = clientes.filter(cliente =>
        `${cliente.Nombre ?? ''} ${cliente.Apellido ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes(terminoCliente)
    )

    function alternarCliente(idCliente) {
        setClientesSeleccionados(clientesActuales =>
            clientesActuales.includes(idCliente)
                ? clientesActuales.filter(id => id !== idCliente)
                : [...clientesActuales, idCliente]
        )
    }

    async function consultarGanancias() {
        if (!desdeFecha || !hastaFecha) {
            alert("Seleccioná las fechas del período")
            return
        }

        if (desdeFecha > hastaFecha) {
            alert("La fecha inicial no puede ser posterior a la fecha final")
            return
        }

        setCargandoGanancias(true)

        let consulta = supabase
            .from('DetalleVentas')
            .select(`
                CantidadUnidades,
                PrecioVentaUnitario,
                Productos(idProducto, Nombre, PrecioCompra),
                ConsumosLote(Cantidad, CostoUnitario),
                Ventas!inner(fecha, estado, idCliente)
            `)
            .gte('Ventas.fecha', fechaLocalAISO(desdeFecha))
            .lt('Ventas.fecha', fechaLocalAISO(hastaFecha, 1))
            .neq('Ventas.estado', 'cancelada')

        if (productosSeleccionados.length > 0) {
            consulta = consulta.in('idProducto', productosSeleccionados)
        }
        if (clientesSeleccionados.length > 0) {
            consulta = consulta.in('Ventas.idCliente', clientesSeleccionados)
        }

        const { data, error } = await consulta

        if (error || !data) {
            setCargandoGanancias(false)
            alert("Error al consultar")
            return
        }

        // Las ventas previas a FIFO no tienen un consumo guardado. Su costo se
        // reconstruye desde el primer lote, no desde el precio actual.
        const idsProductosSinConsumo = [...new Set(
            data
                .filter(detalle => !detalle.ConsumosLote?.length && detalle.Productos?.idProducto != null)
                .map(detalle => detalle.Productos.idProducto)
        )]
        const costoPrimerLote = new Map()
        if (idsProductosSinConsumo.length > 0) {
            const { data: lotes, error: errorLotes } = await supabase
                .from('LotesStock')
                .select('idProducto, PrecioCompra, fechaIngreso, idLote')
                .in('idProducto', idsProductosSinConsumo)
                .order('fechaIngreso', { ascending: true })
                .order('idLote', { ascending: true })

            if (errorLotes) {
                console.error('No se pudieron obtener los lotes para ganancias:', errorLotes)
            } else {
                lotes.forEach(lote => {
                    if (!costoPrimerLote.has(lote.idProducto)) {
                        costoPrimerLote.set(lote.idProducto, Number(lote.PrecioCompra ?? 0))
                    }
                })
            }
        }

        let ingresos = 0
        let costos = 0
        const gananciasPorProducto = new Map()

        data.forEach(detalle => {
            const cantidad = Number(detalle.CantidadUnidades)
            const ingreso = Number(detalle.PrecioVentaUnitario) * cantidad
            // Las ventas nuevas guardan qué lotes consumieron. Para ventas
            // anteriores a FIFO se conserva el costo histórico disponible.
            const costo = detalle.ConsumosLote?.length
                ? detalle.ConsumosLote.reduce((total, consumo) => total + Number(consumo.Cantidad) * Number(consumo.CostoUnitario), 0)
                : (costoPrimerLote.get(detalle.Productos?.idProducto) ?? Number(detalle.Productos?.PrecioCompra ?? 0)) * cantidad
            const idProducto = detalle.Productos?.idProducto ?? 'sin-producto'

            ingresos += ingreso
            costos += costo

            const productoActual = gananciasPorProducto.get(idProducto) ?? {
                idProducto,
                nombre: detalle.Productos?.Nombre ?? 'Producto sin nombre',
                cantidad: 0,
                ingresos: 0,
                costos: 0
            }
            productoActual.cantidad += cantidad
            productoActual.ingresos += ingreso
            productoActual.costos += costo
            gananciasPorProducto.set(idProducto, productoActual)
        })

        setResultado({
            ingresos,
            costos,
            ganancia: ingresos - costos,
            productos: Array.from(gananciasPorProducto.values())
                .map(producto => ({
                    ...producto,
                    ganancia: producto.ingresos - producto.costos
                }))
                .sort((productoA, productoB) =>
                    String(productoA.nombre ?? '').localeCompare(String(productoB.nombre ?? ''), 'es', { sensitivity: 'base' })
                )
        })
        setCargandoGanancias(false)
    }

    return (
        <div className="ganancias-page">
            <h2>Ganancias</h2>

            <div className="ganancias-filtros">
                <div className="ganancias-fechas">
                    <div className="ganancias-filtro-campo">
                        <label className="ganancias-filtro-label">Desde</label>
                        <input type="date" onChange={(e) => setDesdeFecha(e.target.value)} />
                    </div>
                    <div className="ganancias-filtro-campo">
                        <label className="ganancias-filtro-label">Hasta</label>
                        <input type="date" onChange={(e) => setHastaFecha(e.target.value)} />
                    </div>
                </div>
                <div className="ganancias-selectores">
                    <div className="ganancias-filtro-campo ganancias-filtro-producto">
                        <label className="ganancias-filtro-label">Cliente</label>
                        <input type="search" value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Buscar cliente..." />
                        <div className="ganancias-acciones-productos">
                            <button type="button" className={`ganancias-todos ${clientes.length > 0 && clientesSeleccionados.length === clientes.length ? 'activo' : ''}`} onClick={() => setClientesSeleccionados(clientes.map(cliente => cliente.idCliente))}>
                                Todos los clientes
                            </button>
                            <button type="button" className="ganancias-deseleccionar" onClick={() => setClientesSeleccionados([])} disabled={clientesSeleccionados.length === 0}>
                                Deseleccionar todos
                            </button>
                        </div>
                        <div className="ganancias-productos-lista">
                            {clientesFiltrados.map(cliente => (
                                <label key={cliente.idCliente} className="ganancias-producto-opcion">
                                    <input type="checkbox" checked={clientesSeleccionados.includes(cliente.idCliente)} onChange={() => alternarCliente(cliente.idCliente)} />
                                    <span>{cliente.Nombre} {cliente.Apellido}</span>
                                </label>
                            ))}
                        </div>
                        {clientesSeleccionados.length > 0 && <span className="ganancias-productos-seleccionados">{clientesSeleccionados.length} cliente(s) seleccionado(s)</span>}
                    </div>
                    <FiltroProductos
                        productos={productos}
                        seleccionados={productosSeleccionados}
                        onChange={setProductosSeleccionados}
                    />
                </div>
                <button className="btn btn-primary" onClick={consultarGanancias} disabled={cargandoGanancias}>
                    {cargandoGanancias && <span className="ganancias-spinner" aria-hidden="true" />}
                    {cargandoGanancias ? 'Calculando...' : 'Consultar'}
                </button>
            </div>

            {resultado && (
                <div className="ganancias-resultados">
                    <div className="ganancia-card">
                        <span className="ganancia-card-label">Ingresos</span>
                        <span className="ganancia-card-valor neutro">${resultado.ingresos}</span>
                    </div>
                    <div className="ganancia-card">
                        <span className="ganancia-card-label">Costos</span>
                        <span className="ganancia-card-valor neutro">${resultado.costos}</span>
                    </div>
                    <div className="ganancia-card">
                        <span className="ganancia-card-label">Ganancia neta</span>
                        <span className={`ganancia-card-valor ${resultado.ganancia >= 0 ? 'positivo' : 'negativo'}`}>
                            ${resultado.ganancia}
                        </span>
                    </div>
                    <div className="ganancias-por-producto">
                        <h3>Ganancia por producto</h3>
                        {resultado.productos.map(producto => (
                            <div className="ganancia-producto-fila" key={producto.idProducto}>
                                <div>
                                    <strong>{producto.nombre}</strong>
                                    <span>{producto.cantidad} unidad(es)</span>
                                </div>
                                <span className={`ganancia-producto-valor ${producto.ganancia >= 0 ? 'positivo' : 'negativo'}`}>
                                    ${producto.ganancia}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default Ganancias
