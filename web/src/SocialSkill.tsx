import { useState } from 'react'
import { ACCIONES_SKILL, type AccionSkill, type PlanSocial } from '../../shared/agencia'
import { api } from './api'
import { leerProyectoActivo } from './Proyectos'

/**
 * Las skills de redes (`skills/social-*`) desde la interfaz: cada botón manda la acción a `/api/agencia/skill`, que
 * corre la skill con la memoria del proyecto (`server/agencia/skills.ts`), y el resultado se queda aquí para editarlo.
 * Nada se publica desde una skill.
 *
 * También sincroniza el proyecto activo con el servidor: su llave de agencia es la que reciben los agentes
 * (`VID_AGENCIA_LLAVE`), y el activo vive en el navegador (`Proyectos.tsx`).
 */

function sincronizarActivo() {
  const a = leerProyectoActivo()
  api('/api/agencia/activo', { proyecto: a?.proyecto ?? null }).catch(() => {})
}
if (typeof window !== 'undefined') {
  addEventListener('vid-proyecto-activo', sincronizarActivo)
  setTimeout(sincronizarActivo, 1500)
}

export interface ResultadoSkill {
  accion: AccionSkill
  texto: string
  plan?: PlanSocial[]
}

export interface PedidoSkill {
  proyecto?: string
  serie?: string
  entrada: string
  redes?: string[]
  desde?: string
}

/** Un botón que corre una skill; `pedido` arma la entrada al pulsarlo. */
export function useSkill(onListo?: (r: ResultadoSkill) => void) {
  const [corriendo, setCorriendo] = useState<AccionSkill | null>(null)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<ResultadoSkill | null>(null)
  async function correr(accion: AccionSkill, pedido: PedidoSkill) {
    setCorriendo(accion)
    setError('')
    try {
      const r = await api<{ texto: string; plan?: PlanSocial[] }>('/api/agencia/skill', { accion, ...pedido })
      const res = { accion, ...r }
      setResultado(res)
      onListo?.(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCorriendo(null)
    }
  }
  return { corriendo, error, resultado, setResultado, correr }
}

export function BotonSkill({ accion, corriendo, onClick, disabled, titulo }: { accion: AccionSkill; corriendo: AccionSkill | null; onClick(): void; disabled?: boolean; titulo?: string }) {
  return (
    <button className="ghost small" disabled={disabled || !!corriendo} onClick={onClick} title={titulo ?? `Con la skill ${ACCIONES_SKILL[accion].skill}, con la memoria del proyecto`}>
      {corriendo === accion ? 'Pensando…' : ACCIONES_SKILL[accion].nombre}
    </button>
  )
}

/** El resultado de una skill, editable, con lo que se puede hacer con él. */
export function CajaResultado({ r, onCambio, onUsar, usar, onCerrar }: { r: ResultadoSkill; onCambio(texto: string): void; onUsar?(texto: string): void; usar?: string; onCerrar(): void }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="skill-resultado">
      <div className="skill-resultado-cabeza">
        <strong className="small">{ACCIONES_SKILL[r.accion].nombre}</strong>
        <span className="muted small">{ACCIONES_SKILL[r.accion].skill} · edítalo antes de usarlo</span>
      </div>
      <textarea value={r.texto} onChange={(e) => onCambio(e.target.value)} rows={Math.min(18, Math.max(6, r.texto.split('\n').length + 1))} />
      {!!r.plan?.length && <p className="muted small">{r.plan.length} borradores agregados al calendario.</p>}
      <div className="fila-acciones">
        {onUsar && (
          <button className="primary small" onClick={() => onUsar(r.texto)}>
            {usar ?? 'Usar como texto'}
          </button>
        )}
        <button
          className="ghost small"
          onClick={() =>
            navigator.clipboard?.writeText(r.texto).then(() => {
              setCopiado(true)
              setTimeout(() => setCopiado(false), 1500)
            })
          }
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button className="ghost small" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  )
}

/** En Ideas: «Extraer gancho» (Hook Extractor) y «Reaprovechar» (Repurposer) de una idea. */
export function AccionesIdeaSocial({ texto }: { texto: string }) {
  const s = useSkill()
  const activo = leerProyectoActivo()
  const pedido = (extra: string) => ({ proyecto: activo?.proyecto, serie: activo?.serie, entrada: `${extra}\n\n${texto}` })
  return (
    <div className="idea-social">
      <BotonSkill accion="gancho" corriendo={s.corriendo} onClick={() => s.correr('gancho', pedido('Saca el gancho de esta idea y de sus videos de evidencia: qué fórmula usa y cómo copiarla para el proyecto.'))} />
      <BotonSkill accion="reaprovechar" corriendo={s.corriendo} onClick={() => s.correr('reaprovechar', pedido('Reaprovecha esta idea en publicaciones nativas para Instagram, TikTok, LinkedIn y Facebook (caption o carrusel según convenga).'))} />
      {s.error && <p className="bad small">{s.error}</p>}
      {s.resultado && <CajaResultado r={s.resultado} onCambio={(t) => s.setResultado({ ...s.resultado!, texto: t })} onCerrar={() => s.setResultado(null)} />}
    </div>
  )
}
