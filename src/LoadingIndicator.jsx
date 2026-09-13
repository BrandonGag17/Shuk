import { useEffect, useState } from 'react'
import './LoadingIndicator.css'

function LoadingIndicator() {
    const [cantidad, setCantidad] = useState(0)

    useEffect(() => {
        const alCambiarCarga = (evento) => setCantidad(evento.detail?.cantidad ?? 0)
        window.addEventListener('shuk:carga', alCambiarCarga)
        return () => window.removeEventListener('shuk:carga', alCambiarCarga)
    }, [])

    if (cantidad === 0) return null

    return (
        <div className="carga-global" role="status" aria-live="polite" aria-label="Cargando">
            <span className="carga-ruedita" />
            <span>Cargando...</span>
        </div>
    )
}

export default LoadingIndicator
