import { Link, NavLink } from 'react-router-dom'
import { supabase } from './supabaseClient'
import shukLogo from './assets/Shuk-logo.png'
import './Header.css'

function Header({ user }) {
  async function cerrarSesion() {
    const { error } = await supabase.auth.signOut()
    if (error) alert('No se pudo cerrar la sesión: ' + error.message)
  }

  return (
    <header className="header">
      <nav className="nav">
        <Link to="/" className="brand" aria-label="Shuk, ir al inicio">
          <img src={shukLogo} alt="Shuk" className="brand-logo" />
        </Link>
        <div className="nav-links" aria-label="Navegación principal">
              <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Inicio</NavLink>
          <NavLink to="/clientes" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Clientes</NavLink>
          <NavLink to="/ventas" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Ventas</NavLink>
          <NavLink to="/ganancias" className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>Ganancias</NavLink>
        </div>
        <div className="nav-account">
          <span className="nav-user" title={user.email}>{user.email}</span>
          <span className="nav-avatar" aria-label="Cuenta actual">{user.email?.charAt(0).toUpperCase()}</span>
          <button type="button" className="nav-logout" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </nav>
    </header>
  )
}

export default Header
