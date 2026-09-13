import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Header from './Header'
import Productos from './Productos'
import DetalleProducto from './DetalleProducto'
import CrearProducto from './CrearProducto'
import CrearCliente from './CrearCliente'
import CrearVenta from './CrearVenta'
import Clientes from './Clientes'
import Ventas from './Ventas'
import Ganancias from './Ganancias'
import DetalleVenta from './DetalleVenta'
import ImportarProductos from './ImportarProductos'
import DetalleCliente from './DetalleCliente'
import ExportarProductos from './ExportarProductos'
import LoadingIndicator from './LoadingIndicator'
import { supabase } from './supabaseClient'
import Auth from './Auth'


function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: sesionActual } }) => {
      setSession(sesionActual)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, sesionActual) => {
      setSession(sesionActual)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return <LoadingIndicator />
  if (!session) return <Auth />

  return (
    <BrowserRouter>
      <Header user={session.user} />
      <LoadingIndicator />
      <Routes>
        <Route path="/" element={<Productos />} />
        <Route path="/producto/:id" element={<DetalleProducto />} />
        <Route path="/crear-producto" element={<CrearProducto />} />
        <Route path="/crear-venta" element={<CrearVenta />} />
        <Route path="/crear-cliente" element={<CrearCliente />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/cliente/:id" element={<DetalleCliente />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/ganancias" element={<Ganancias />} />
        <Route path="/venta/:id" element={<DetalleVenta />} />
        <Route path="/importar-productos" element={<ImportarProductos />} />
        <Route path="/exportar-productos" element={<ExportarProductos />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
