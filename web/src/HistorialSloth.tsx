import { useState } from 'react'
import { api } from './api'

/** Lo que contesta `POST /api/importar/sloth` (`server/importar-sloth.ts`). */
interface Resultado {
  origen: string
  hilos: { sloth: string; id: string; title: string; proyecto?: string; serie?: string; continuable: boolean; nota?: string }[]
  yaEstaban: number
  carpetas: { card: string; mp4: number; bytes: number }[]
  series: string[]
  adjuntos: number
  errores: string[]
}

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)

/**
 * Opciones → Historial de Sloth (v!d 1.1): trae los hilos y los videos del Sloth original. Copia, no mueve: Sloth se
 * queda igual, y pulsarlo otra vez solo trae lo que falte.
 */
export function HistorialSloth() {
  const [carpeta, setCarpeta] = useState('')
  const [trayendo, setTrayendo] = useState(false)
  const [r, setR] = useState<Resultado>()
  const [error, setError] = useState('')

  async function traer() {
    setTrayendo(true)
    setError('')
    try {
      setR(await api<Resultado>('/api/importar/sloth', carpeta.trim() ? { carpeta: carpeta.trim() } : {}))
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x))
    } finally {
      setTrayendo(false)
    }
  }

  return (
    <section className="grupo">
      <div className="grupo-titulo">
        <h2>Historial de Sloth</h2>
        <button className="boton" disabled={trayendo} onClick={traer}>
          {trayendo ? 'Trayendo…' : 'Traer historial de Sloth'}
        </button>
      </div>
      <div className="panel">
        <div className="item">
          <div className="fila">
            <div className="fila-nombre">
              <strong>Tus hilos y videos del Sloth original</strong>
              <span>Se copian a v!d con sus carpetas de trabajo, cada uno en su proyecto. Sloth no se toca.</span>
            </div>
          </div>
          <input className="fila-extra" placeholder="Carpeta de Sloth (vacío: la que encuentre v!d)" value={carpeta} onChange={(e) => setCarpeta(e.target.value)} disabled={trayendo} />
        </div>
        {r && (
          <div className="item">
            <div className="fila-nombre">
              <strong>
                {r.hilos.length ? `Se trajeron ${r.hilos.length} hilos` : 'No había hilos nuevos'}
                {r.yaEstaban ? ` (${r.yaEstaban} ya estaban)` : ''}
              </strong>
              <span>
                De {r.origen}.{' '}
                {r.carpetas.map((c) => `${c.card}: ${c.mp4} mp4, ${gb(c.bytes)}`).join(' · ')}
                {r.series.length ? ` Series nuevas: ${r.series.join(', ')}.` : ''}
              </span>
            </div>
            {r.hilos.map((h) => (
              <div key={h.id} className="small">
                {h.title} — {h.proyecto ?? 'sin proyecto'}
                {h.serie ? ` · ${h.serie}` : ''} — {h.continuable ? 'se puede continuar' : 'solo historial'}
                {h.nota ? ` (${h.nota})` : ''}
              </div>
            ))}
            {r.errores.map((e) => (
              <p key={e} className="bad small">
                {e}
              </p>
            ))}
          </div>
        )}
      </div>
      {error && <p className="bad small fila-extra">{error}</p>}
      <p className="grupo-nota">Pulsarlo otra vez no duplica nada: solo trae lo que falte.</p>
    </section>
  )
}
