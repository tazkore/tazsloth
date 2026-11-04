import { useEffect, useState } from 'react'
import type { AgentesAlDia } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'

/**
 * Viene de Sloth (web/src/Actualizar.tsx de upstream). v!d no se actualiza sola (Fase 1): de ese archivo solo se trajo
 * el aviso de los agentes, que baja la versión nueva de Claude Code, Codex u OpenCode, no de la app.
 */

/** «Claude Code», «Claude Code y Codex», «Claude Code, Codex y OpenCode». */
const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0])

/**
 * Arriba a la derecha del hilo nuevo: si Claude Code, Codex u OpenCode sacaron una versión más nueva que la que tienes
 * (`server/agentes.ts`), el botón que la baja, con sus modelos nuevos. Los hilos abiertos siguen con la de antes; los
 * nuevos van con la nueva. Mientras baja, en cuál va.
 */
export function AvisoAgentes() {
  const [a, setA] = useState<AgentesAlDia>()
  const [preguntar, setPreguntar] = useState(false)
  const leer = () => api<AgentesAlDia>('/api/agentes/al-dia').then(setA, () => {})
  useEffect(() => void leer(), [])
  const actualizando = !!a?.actualizando
  useEffect(() => {
    if (!actualizando) return
    const id = setInterval(leer, 2000)
    return () => clearInterval(id)
  }, [actualizando])

  if (a?.actualizando) return <span className="aviso-version quieto">{a.actualizando}</span>
  if (!a?.nuevos.length) return a?.error ? <span className="bad small">{a.error}</span> : null
  const nombres = a.nuevos.map((n) => n.nombre)
  const titulo = nombres.length === 1 ? `Actualizar ${nombres[0]}` : 'Actualizar los agentes'
  return (
    <>
      <button className="aviso-version" title={a.nuevos.map((n) => `${n.nombre}: ${n.de} → ${n.a}`).join('\n')} onClick={() => setPreguntar(true)}>
        ↑ {titulo}
      </button>
      {preguntar && (
        <Confirm title={`¿${titulo}?`} action="Actualizar" onConfirm={() => api<AgentesAlDia>('/api/agentes/actualizar', {}).then(setA)} onClose={() => setPreguntar(false)}>
          Se baja la versión nueva de {juntar(a.nuevos.map((n) => `${n.nombre} (${n.de} → ${n.a}, unos ${n.pesa})`))}, con sus modelos nuevos. Puedes seguir
          trabajando: los chats abiertos siguen con la de antes, y los nuevos ya van con la nueva.
          {a.error && <span className="bad small fila-extra">La última vez falló: {a.error}</span>}
        </Confirm>
      )}
    </>
  )
}
