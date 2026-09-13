import { createClient } from '@supabase/supabase-js'


const supabaseUrl = 'https://qlybtqctrfboaiuedzrk.supabase.co' 

const supabaseKey = 'sb_publishable_9DiaRN2iRgMIkv6yN2emeg_VZS2NS4x'

let solicitudesActivas = 0

function avisarCarga() {
    window.dispatchEvent(new CustomEvent('shuk:carga', { detail: { cantidad: solicitudesActivas } }))
}

async function fetchConIndicador(...args) {
    solicitudesActivas += 1
    avisarCarga()
    try {
        return await fetch(...args)
    } finally {
        solicitudesActivas -= 1
        avisarCarga()
    }
}

// Todas las consultas y mutaciones de Supabase muestran el indicador global.
export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: fetchConIndicador } })
