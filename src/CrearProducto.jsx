import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './Form.css'

function CrearProducto() {

    const navigate = useNavigate()

    const [Nombre, setNombre] = useState('')
    const [PrecioCompra, setPrecioCompra] = useState('')
    const [PrecioVenta, setPrecioVenta] = useState('')
    const [NombreProveedor, setProveedor] = useState('')
    const [TipoProducto, setTipo] = useState('')
    const [ImagenUrl, setImagenUrl] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [stock, setStock] = useState(0)

    function normalizar(texto) {
        return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es')
    }

    async function agregarProducto(producto) {
        setGuardando(true)
        const { data: posiblesDuplicados, error: errorBusqueda } = await supabase
            .from('Productos')
            .select('idProducto, Nombre')
            .ilike('Nombre', producto.Nombre)

        if (errorBusqueda) {
            setGuardando(false)
            alert('No se pudo validar el producto')
            return
        }
        if (posiblesDuplicados?.some(item => normalizar(item.Nombre) === normalizar(producto.Nombre))) {
            setGuardando(false)
            alert('Ya existe un producto con ese nombre')
            return
        }

        const { error } = await supabase
            .from('Productos')
            .insert([producto])
            .select()

        if (error) {
            setGuardando(false)
            alert("Error al crear producto")
            return
        }

        alert("Producto creado ✅")
        navigate('/')
    }

    const convertirPrecio = (precio) => {
        // Reemplazar coma por punto para que Number() lo interprete correctamente
        return Number(precio.toString().replace(',', '.'))
    }

    const manejarSubmit = (e) => {
        e.preventDefault()
        const nombre = Nombre.trim()
        const precioCompra = convertirPrecio(PrecioCompra)
        const precioVenta = convertirPrecio(PrecioVenta)

        if (!nombre) return alert('El nombre es obligatorio')
        if (!Number.isFinite(precioCompra) || precioCompra < 0 || !Number.isFinite(precioVenta) || precioVenta < 0) {
            return alert('Ingresá precios válidos, iguales o mayores a cero')
        }

        const producto = {
            Nombre: nombre,
            PrecioCompra: precioCompra,
            PrecioVenta: precioVenta,
            NombreProveedor: NombreProveedor.trim(),
            TipoProducto: TipoProducto.trim(),
            ImagenUrl: ImagenUrl.trim(),
            Stock: stock
        }

        agregarProducto(producto)
    }

    return (
        <form className="form-page" onSubmit={manejarSubmit}>
            <h2>Nuevo producto</h2>

            <div className="form-campos">

                <div className="form-campo">
                    <label className="form-label">Nombre</label>
                    <input placeholder="Nombre" required onChange={(e) => setNombre(e.target.value)} />
                </div>

                <div className="form-campo">
                    <label className="form-label">Precio compra</label>
                    <input placeholder="0" type="text" required onChange={(e) => setPrecioCompra(e.target.value)} />
                </div>

                <div className="form-campo">
                    <label className="form-label">Precio venta</label>
                    <input placeholder="0" type="text" required onChange={(e) => setPrecioVenta(e.target.value)} />
                </div>

                <div className="form-campo">
                    <label className="form-label">Proveedor</label>
                    <input placeholder="Proveedor" onChange={(e) => setProveedor(e.target.value)} />
                </div>

                <div className="form-campo">
                    <label className="form-label">Tipo</label>
                    <input placeholder="Ej: Funko, Videojuego..." onChange={(e) => setTipo(e.target.value)} />
                </div>
                <div className="form-campo">
                    <label className="form-label">URL de imagen</label>
                    <input placeholder="https://..." onChange={(e) => setImagenUrl(e.target.value)} />
                </div>
                <div className="form-campo">
                    <label className="form-label">Stock</label>
                    <input placeholder="0" type="number" min="0" onChange={(e) => setStock(parseInt(e.target.value) || 0)} />
                </div>
            </div>

            <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar producto'}</button>

        </form>
    )
}

export default CrearProducto
