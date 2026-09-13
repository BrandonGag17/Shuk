import { useState } from 'react'
import { supabase } from './supabaseClient'
import './Auth.css'

function Auth() {
  const [modoRegistro, setModoRegistro] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  function cambiarModo() {
    setModoRegistro(valor => !valor); setMensaje(''); setError(''); setPassword(''); setConfirmacion('')
  }

  async function enviar(event) {
    event.preventDefault(); setMensaje(''); setError('')
    const correoNormalizado = email.trim().toLowerCase()
    if (!correoNormalizado || !password) return setError('Completá tu correo y contraseña.')
    if (modoRegistro && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (modoRegistro && password !== confirmacion) return setError('Las contraseñas no coinciden.')
    setCargando(true)
    try {
      if (modoRegistro) {
        const { data, error: errorRegistro } = await supabase.auth.signUp({ email: correoNormalizado, password, options: { emailRedirectTo: window.location.origin } })
        if (errorRegistro) throw errorRegistro
        setMensaje(data.session ? 'Cuenta creada. Ya podés usar la aplicación.' : 'Revisá tu correo para confirmar la cuenta antes de iniciar sesión.')
      } else {
        const { error: errorIngreso } = await supabase.auth.signInWithPassword({ email: correoNormalizado, password })
        if (errorIngreso) throw errorIngreso
      }
    } catch (errorAuth) { setError(errorAuth.message || 'No se pudo completar la operación.') } finally { setCargando(false) }
  }

  return <main className="auth-page"><section className="auth-card"><p className="auth-eyebrow">VentasApp</p><h1>{modoRegistro ? 'Crear cuenta' : 'Bienvenido'}</h1><p className="auth-subtitle">{modoRegistro ? 'Tu información estará separada y protegida por cuenta.' : 'Ingresá para gestionar tu negocio.'}</p><form className="auth-form" onSubmit={enviar}><label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="auth-password">Contraseña</label><input id="auth-password" type="password" autoComplete={modoRegistro ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required />{modoRegistro && <><label htmlFor="auth-confirmacion">Repetir contraseña</label><input id="auth-confirmacion" type="password" autoComplete="new-password" value={confirmacion} onChange={(event) => setConfirmacion(event.target.value)} required /></>}{error && <p className="auth-message auth-error" role="alert">{error}</p>}{mensaje && <p className="auth-message auth-success">{mensaje}</p>}<button className="btn btn-primary auth-submit" type="submit" disabled={cargando}>{cargando ? 'Procesando…' : modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}</button></form><button type="button" className="auth-toggle" onClick={cambiarModo}>{modoRegistro ? 'Ya tengo cuenta' : '¿No tenés cuenta? Registrate'}</button></section></main>
}

export default Auth
