import { Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import './Header.css'

function Header({ user }) {
  async function cerrarSesion() {
    const { error } = await supabase.auth.signOut()
    if (error) alert('No se pudo cerrar la sesión: ' + error.message)
  }
  return (
    <header className="header">
      <nav className="nav">
        <Link to="/" className="nav-link">Inicio</Link>
        <Link to="/clientes" className="nav-link">Clientes</Link>
        <Link to="/ventas" className="nav-link">Ventas</Link>
        <Link to="/ganancias" className="nav-link">Ganancias</Link>
        <span className="nav-user" title={user.email}>{user.email}</span>
        <button type="button" className="nav-logout" onClick={cerrarSesion}>Cerrar sesión</button>
      </nav>
    </header>
  )
}

export default Header
