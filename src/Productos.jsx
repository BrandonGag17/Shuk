import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { obtenerCategoria, obtenerCategorias } from './categorias'
import './Productos.css'

function Productos() {
    const PRODUCTOS_POR_PAGINA = 40
    const [productos, setProductos] = useState([])
    const navigate = useNavigate()
    const [busqueda, setBusqueda] = useState('')
    const [pagina, setPagina] = useState(0)
    const [hayMasProductos, setHayMasProductos] = useState(true)
    const [cargando, setCargando] = useState(false)
    const [categoriaActiva, setCategoriaActiva] = useState('Todas')
    const [categorias, setCategorias] = useState([])
    // Conserva el resultado completo ya ordenado. Así cada página es sólo una
    // porción de la misma lista, en vez de ordenar páginas independientes.
    const productosFiltrados = useRef([])
    const solicitudActual = useRef(0)

    function normalizarNombreParaOrden(nombre) {
        return String(nombre ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim()
            .toLocaleLowerCase('es')
    }

    function ordenarPorNombre(productos) {
        return [...productos].sort((productoA, productoB) =>
            normalizarNombreParaOrden(productoA.Nombre).localeCompare(normalizarNombreParaOrden(productoB.Nombre), 'es', {
                sensitivity: 'base'
            })
        )
    }

    useEffect(() => {
        const temporizador = setTimeout(() => {
            cargarProductos(0, false, busqueda, categoriaActiva)
        }, 300)

        return () => clearTimeout(temporizador)
        // cargarProductos se declara en el componente porque usa el estado actual.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [busqueda, categoriaActiva])

    useEffect(() => {
        async function cargarCategorias() {
            const todos = []
            const TAMANO_LOTE = 1000
            let paginaConsulta = 0
            let quedanProductos = true
            while (quedanProductos) {
                const { data, error } = await supabase
                    .from('Productos')
                    .select('Nombre, TipoProducto')
                    .range(paginaConsulta * TAMANO_LOTE, (paginaConsulta + 1) * TAMANO_LOTE - 1)
                if (error) return
                todos.push(...data)
                quedanProductos = data.length === TAMANO_LOTE
                paginaConsulta += 1
            }
            setCategorias(obtenerCategorias(todos))
        }
        cargarCategorias()
    }, [])

    async function cargarProductos(numeroPagina, agregar, termino, categoria = categoriaActiva) {
        if (agregar) {
            const inicio = numeroPagina * PRODUCTOS_POR_PAGINA
            const siguientePagina = productosFiltrados.current.slice(inicio, inicio + PRODUCTOS_POR_PAGINA)
            setProductos(productosActuales => [...productosActuales, ...siguientePagina])
            setPagina(numeroPagina)
            setHayMasProductos(productosFiltrados.current.length > inicio + PRODUCTOS_POR_PAGINA)
            return
        }

        setCargando(true)
        const idSolicitud = ++solicitudActual.current

        const todosLosProductos = []
        const TAMANO_LOTE = 1000
        let paginaConsulta = 0
        let quedanProductos = true

        while (quedanProductos) {
            const { data, error } = await supabase
                .from('Productos')
                .select('idProducto, Nombre, PrecioVenta, PrecioCompra, Stock, ImagenUrl, TipoProducto')
                .order('Nombre', { ascending: true })
                .order('idProducto', { ascending: true })
                .range(paginaConsulta * TAMANO_LOTE, (paginaConsulta + 1) * TAMANO_LOTE - 1)

            if (error || idSolicitud !== solicitudActual.current) {
                if (idSolicitud === solicitudActual.current) setCargando(false)
                return
            }

            todosLosProductos.push(...data)
            quedanProductos = data.length === TAMANO_LOTE
            paginaConsulta += 1
        }

        const terminoNormalizado = normalizarNombreParaOrden(termino)
        const productosDeCategoria = todosLosProductos.filter(producto =>
            (!terminoNormalizado || normalizarNombreParaOrden(producto.Nombre).includes(terminoNormalizado)) &&
            (categoria === 'Todas' || obtenerCategoria(producto.Nombre, producto.TipoProducto) === categoria)
        )
        const productosOrdenados = ordenarPorNombre(productosDeCategoria)

        productosFiltrados.current = productosOrdenados
        setProductos(productosOrdenados.slice(0, PRODUCTOS_POR_PAGINA))
        setPagina(0)
        setHayMasProductos(productosOrdenados.length > PRODUCTOS_POR_PAGINA)
        setCargando(false)
    }

    function cargarMasProductos() {
        cargarProductos(pagina + 1, true, busqueda, categoriaActiva)
    }

    return (
        <div className="productos-page">
            <div className="productos-header">
                <h2>Lista de productos</h2>
                <button className="btn btn-primary" onClick={() => navigate('/crear-producto')}>Crear producto</button>
            </div>

            <div className="productos-toolbar">
                <input placeholder="Buscar producto..." onChange={(e) => setBusqueda(e.target.value)} />
                <button className="btn btn-secondary" onClick={() => navigate('/importar-productos')}>Importar Excel</button>
                <button className="btn btn-secondary" onClick={() => navigate('/exportar-productos')}>Exportar Excel</button>
            </div>

            <div className="categorias" aria-label="Filtrar productos por categoría">
                <button className={`categoria-filtro ${categoriaActiva === 'Todas' ? 'categoria-filtro-activa' : ''}`} onClick={() => setCategoriaActiva('Todas')}>Todas</button>
                {categorias.map(categoria => (
                    <button
                        className={`categoria-filtro ${categoriaActiva === categoria ? 'categoria-filtro-activa' : ''}`}
                        key={categoria}
                        onClick={() => setCategoriaActiva(categoria)}
                    >
                        {categoria}
                    </button>
                ))}
            </div>

            <div className="productos-lista">
                {productos.map(prod => (
                    <button className="producto-item" key={prod.idProducto} onClick={() => navigate(`/producto/${prod.idProducto}`)}>
                        {prod.ImagenUrl && <img src={prod.ImagenUrl} alt={prod.Nombre} />}
                        <span>{prod.Nombre}</span>
                        <span className="producto-categoria">{obtenerCategoria(prod.Nombre, prod.TipoProducto)}</span>
                    </button>
                ))}
            </div>

            {!cargando && productos.length === 0 && <p className="productos-vacios">No hay productos en esta categoría.</p>}

            {hayMasProductos && (
                <button className="btn btn-secondary" onClick={cargarMasProductos} disabled={cargando}>
                    {cargando ? 'Cargando...' : 'Cargar más'}
                </button>
            )}
        </div>
    )
}

export default Productos
