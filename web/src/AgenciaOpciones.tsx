import { useEffect, useState } from 'react'
import {
  nombrePlataforma,
  PLATAFORMAS,
  validarContenido,
  type ConfigAgencia,
  type ContenidoAgencia,
  type CuentaSocial,
  type EstadoAgencia,
  type TurnoPiloto,
  type VistaPiloto
} from '../../shared/agencia'
import { cssDeColor, type Proyecto } from '../../shared/proyectos'
import { api } from './api'
import { Icono } from './Iconos'
import { Logo } from './Logos'
import { Interruptor } from './Opciones'
import { useProyectos, vivos } from './Proyectos'
import './SocialMedia.css'

/**
 * Opciones → Agencia (v!d Fase 4): la «Llave de agencia v!d» de cada proyecto y una por defecto para los que no
 * tienen la suya, con la URL de vid-api. Se guardan cifradas en el servidor (`server/agencia/llaves.ts`): aquí solo se
 * ve su máscara. «Probar conexión» llama a `estado` y enseña la agencia, la subcuenta y las redes conectadas.
 *
 * Debajo, «Contenido automático» (`server/agencia/piloto.ts`): por cada proyecto con su propia llave, el interruptor local
 * «Piloto automático» (apagado por defecto), la configuración de contenido de la agencia en el servidor (`perfil`, y se
 * guarda con `guardar_contenido`), el brief de su nicho, los próximos horarios y los últimos videos. El piloto solo
 * trabaja con los dos encendidos: este y «Activo» del servidor.
 */
export function AgenciaOpciones() {
  const proyectos = vivos(useProyectos())
  const [config, setConfig] = useState<ConfigAgencia | null>(null)
  const [error, setError] = useState('')
  const leer = () => api<ConfigAgencia>('/api/agencia/config').then(setConfig, (e) => setError(e.message))
  useEffect(() => void leer(), [])
  return (
    <section className="grupo agencia-grupo">
      <div className="grupo-titulo">
        <h2>Agencia</h2>
      </div>
      <div className="panel">
        {error && <p className="bad small">{error}</p>}
        {config && (
          <>
            <FilaLlave titulo="Llave por defecto" detalle="Para los proyectos que no tienen la suya" config={config} onCambio={setConfig} />
            {proyectos.map((p) => (
              <FilaLlave key={p.id} proyecto={p} titulo={p.nombre} detalle={config.activo === p.id ? 'Proyecto activo: su llave es la que usan los agentes' : undefined} config={config} onCambio={setConfig} />
            ))}
          </>
        )}
      </div>
      <p className="grupo-nota">
        Cada agencia (y Kold Gold) emite su llave en kold.gold → ficha de la agencia → «v!d — Llave API» y la pega aquí. Se guarda cifrada en esta
        computadora; ni la ventana ni los registros la ven. Los agentes la reciben como VID_AGENCIA_LLAVE (la del proyecto activo) para publicar en
        borrador.
      </p>
      {config && <ContenidoAutomatico proyectos={proyectos.filter((p) => config.proyectos[p.id]?.tieneLlave)} />}
    </section>
  )
}

/* ---------- Contenido automático ---------- */

const IDIOMAS = [
  ['es', 'Español'],
  ['en', 'Inglés'],
  ['pt', 'Portugués']
] as const
const ESTADOS: Record<string, string> = { libre: 'Libre', pasado: 'Ya pasó', hilo: 'Haciéndose', subiendo: 'Subiendo', programado: 'Programado', borrador: 'En borrador', error: 'Falló' }
const lista = (t: string) => t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function ContenidoAutomatico({ proyectos }: { proyectos: Proyecto[] }) {
  return (
    <>
      <div className="grupo-titulo">
        <h2>Contenido automático</h2>
      </div>
      <div className="panel">
        {proyectos.length ? (
          proyectos.map((p) => <PilotoProyecto key={p.id} proyecto={p} />)
        ) : (
          <p className="muted small fila">Pega la llave propia de un proyecto (arriba) para que su agencia tenga piloto automático.</p>
        )}
      </div>
      <p className="grupo-nota">
        Con el piloto encendido aquí y «Activo» en el servidor, v!d hace cada día los videos de la agencia con el brief de su nicho, un hilo por
        video, y al terminar los programa en todas sus redes conectadas (o los deja en borrador en app.kold.gold si no autopublica).
      </p>
    </>
  )
}

function PilotoProyecto({ proyecto }: { proyecto: Proyecto }) {
  const [v, setV] = useState<VistaPiloto | null>(null)
  const [abierta, setAbierta] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const base = `/api/agencia/piloto?proyecto=${encodeURIComponent(proyecto.id)}`
  const leer = (fresco = false) => api<VistaPiloto>(base + (fresco ? '&fresco=1' : '')).then(setV, (e) => setError(e.message))
  useEffect(() => void leer(), [proyecto.id])

  async function hacer(que: string, f: () => Promise<VistaPiloto>, listo?: string) {
    setOcupado(que)
    setError('')
    setAviso('')
    try {
      setV(await f())
      if (listo) setAviso(listo)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado('')
    }
  }
  const local = (encendido: boolean) => hacer('local', () => api('/api/agencia/piloto/config', { proyecto: proyecto.id, encendido }))
  const ahora = () => hacer('ahora', () => api('/api/agencia/piloto/ahora', { proyecto: proyecto.id }), 'Listo: el video ya tiene su hilo y espera su turno.')
  const c = v?.perfil?.contenido
  const resumen = !v
    ? 'Leyendo…'
    : v.aviso
      ? 'Sin conexión con el contenido automático'
      : v.encendido
        ? `Encendido · ${c?.videos_por_dia} al día · ${c?.autopublicar ? 'se programan solos' : 'quedan en borrador'}`
        : !v.local.encendido
          ? 'Apagado aquí'
          : 'Apagado en el servidor (Activo)'

  return (
    <div className="item">
      <div className="fila">
        <span className="logo agencia-punto" style={{ background: cssDeColor(proyecto.color) }} aria-hidden>
          {proyecto.nombre[0].toUpperCase()}
        </span>
        <div className="fila-nombre">
          <strong>{proyecto.nombre}</strong>
          <span className={v?.aviso ? 'falta' : undefined}>
            {resumen}
            {v?.perfil ? ` · ${v.perfil.agencia.nombre}` : ''}
          </span>
        </div>
        <Interruptor on={!!v?.local.encendido} disabled={!v || !!ocupado} onCambiar={local} etiqueta="Piloto automático" />
        <button className="ghost small" onClick={() => setAbierta(!abierta)}>
          {abierta ? 'Cerrar' : 'Ver'}
        </button>
      </div>
      {error && <p className="bad small fila-extra">{error}</p>}
      {aviso && <p className="ok-texto small fila-extra">{aviso}</p>}
      {abierta && v && (
        <div className="fila-extra piloto">
          {v.aviso && (
            <p className="small piloto-aviso">
              <Icono de="alerta" /> {v.aviso}
            </p>
          )}
          {v.perfil && (
            <>
              <FormContenido v={v} ocupado={ocupado === 'guardar'} onGuardar={(cambios) => hacer('guardar', () => api('/api/agencia/piloto/contenido', { proyecto: proyecto.id, cambios }), 'Guardado en el servidor.')} />
              <Brief v={v} />
              <Proximos v={v} />
            </>
          )}
          <div className="fila-acciones">
            <button className="primary small" disabled={!v.encendido || !!ocupado} onClick={ahora} title={v.encendido ? 'Crea el video del siguiente horario libre' : 'Enciende el piloto aquí y en el servidor'}>
              <Icono de="video" /> {ocupado === 'ahora' ? 'Creando…' : 'Hacer uno ahora'}
            </button>
            <button className="ghost small" disabled={!!ocupado} onClick={() => void leer(true)}>
              <Icono de="recargar" /> Actualizar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Lo del servidor (`agencia_contenido`), editable; guarda solo lo que cambió. */
function FormContenido({ v, ocupado, onGuardar }: { v: VistaPiloto; ocupado: boolean; onGuardar(c: Partial<ContenidoAgencia>): void }) {
  const original = v.perfil!.contenido
  const [c, setC] = useState(original)
  const [horarios, setHorarios] = useState(original.horarios.join(', '))
  const [pilares, setPilares] = useState(original.pilares.join(', '))
  useEffect(() => {
    setC(original)
    setHorarios(original.horarios.join(', '))
    setPilares(original.pilares.join(', '))
  }, [original])
  const conectadas = new Set(v.perfil!.cuentas.map((x) => x.familia ?? x.plataforma))
  const pon = <K extends keyof ContenidoAgencia>(k: K, valor: ContenidoAgencia[K]) => setC({ ...c, [k]: valor })
  const nuevo: ContenidoAgencia = { ...c, horarios: lista(horarios).sort(), pilares: lista(pilares) }
  const cambios = Object.fromEntries(Object.entries(nuevo).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(original[k as keyof ContenidoAgencia]))) as Partial<ContenidoAgencia>
  const errores = validarContenido(cambios)
  const texto = (k: 'tono' | 'cta' | 'notas') => ({ value: c[k] ?? '', onChange: (e: { target: { value: string } }) => pon(k, e.target.value || null) })

  return (
    <form className="piloto-form" onSubmit={(e) => (e.preventDefault(), onGuardar(cambios))}>
      <div className="piloto-interruptores">
        <Interruptor on={c.activo} onCambiar={(x) => pon('activo', x)} etiqueta="Activo (servidor)" />
        <Interruptor on={c.autopublicar} onCambiar={(x) => pon('autopublicar', x)} etiqueta="Autopublicar" />
      </div>
      <div className="piloto-redes" role="group" aria-label="Redes">
        {Object.keys(PLATAFORMAS).map((r) => {
          const elegida = !c.redes.length || c.redes.includes(r)
          return (
            <button
              type="button"
              key={r}
              className={`piloto-red${conectada(conectadas, r) ? ' conectada' : ''}${elegida ? ' elegida' : ''}`}
              aria-pressed={elegida}
              title={`${nombrePlataforma(r)}${conectada(conectadas, r) ? ' · conectada' : ' · sin conectar en GHL'}${!c.redes.length ? ' · sin elegir ninguna van todas las conectadas' : ''}`}
              onClick={() => {
                const actuales = c.redes.length ? c.redes : [...conectadas].filter((x) => x in PLATAFORMAS)
                pon('redes', actuales.includes(r) ? actuales.filter((x) => x !== r) : [...actuales, r])
              }}
            >
              <Logo de={r} nombre={nombrePlataforma(r)} chico />
            </button>
          )
        })}
        {c.redes.length > 0 && (
          <button type="button" className="ghost small" onClick={() => pon('redes', [])}>
            Todas
          </button>
        )}
      </div>
      <div className="piloto-campos">
        <label>
          <span className="muted small">Videos por día</span>
          <input type="number" min={1} max={6} value={c.videos_por_dia} onChange={(e) => pon('videos_por_dia', Number(e.target.value))} />
        </label>
        <label>
          <span className="muted small">Horarios ({v.zona})</span>
          <input value={horarios} placeholder="10:00, 19:00" onChange={(e) => setHorarios(e.target.value)} />
        </label>
        <label>
          <span className="muted small">Idioma</span>
          <select value={c.idioma} onChange={(e) => pon('idioma', e.target.value)}>
            {IDIOMAS.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
            {!IDIOMAS.some(([id]) => id === c.idioma) && <option value={c.idioma}>{c.idioma}</option>}
          </select>
        </label>
        <label>
          <span className="muted small">Estilo</span>
          <select value={v.estilos.some((e) => e.id === c.estilo_video) ? c.estilo_video : (v.estilo?.id ?? '')} onChange={(e) => pon('estilo_video', e.target.value)}>
            {v.estilos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted small">Privacidad</span>
          <select value={c.privacidad} onChange={(e) => pon('privacidad', e.target.value as ContenidoAgencia['privacidad'])}>
            <option value="publico">Pública</option>
            <option value="privado">Privada</option>
          </select>
        </label>
        <label>
          <span className="muted small">Tono</span>
          <input {...texto('tono')} placeholder="Cercano, claro, sin tecnicismos" />
        </label>
        <label>
          <span className="muted small">Llamada a la acción</span>
          <input {...texto('cta')} placeholder={v.perfil!.brief?.cta ?? 'La del brief'} />
        </label>
        <label>
          <span className="muted small">Pilares</span>
          <input value={pilares} placeholder={v.perfil!.brief?.pilares.join(', ') || 'Los del brief'} onChange={(e) => setPilares(e.target.value)} />
        </label>
      </div>
      <label>
        <span className="muted small">Notas para los videos</span>
        <textarea rows={2} {...texto('notas')} />
      </label>
      {errores.length > 0 && <p className="bad small">{errores.join(' ')}</p>}
      <div className="fila-acciones">
        <button className="primary small" disabled={ocupado || !Object.keys(cambios).length || errores.length > 0}>
          {ocupado ? 'Guardando…' : 'Guardar en el servidor'}
        </button>
        {original.updated_at && <span className="muted small">Cambiado {hora(original.updated_at)}{original.updated_by ? ` por ${original.updated_by}` : ''}</span>}
      </div>
    </form>
  )
}

const conectada = (conectadas: Set<string>, r: string) => conectadas.has(r)

function Brief({ v }: { v: VistaPiloto }) {
  const b = v.perfil!.brief
  if (!b) return <p className="muted small">Esta agencia no tiene brief de nicho: los videos salen de la memoria del proyecto.</p>
  const bloque = (titulo: string, xs: string[]) =>
    xs.length > 0 && (
      <div>
        <h3>{titulo}</h3>
        <ul>
          {xs.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    )
  return (
    <details className="piloto-brief">
      <summary className="small">
        Brief del nicho: <strong>{b.nombre}</strong> <span className="muted">({b.slug}, {b.idioma})</span>
      </summary>
      {b.resumen && <p className="small">{b.resumen}</p>}
      {b.promesa && <p className="small">Promesa: {b.promesa}</p>}
      <div className="piloto-brief-rejilla small">
        {bloque('Dolores', b.dolores)}
        {bloque('Ganchos', b.ganchos)}
        {bloque('Pilares', b.pilares)}
        {bloque('Preguntas', b.preguntas)}
        {bloque('Momentos', b.momentos)}
        {bloque('Cumplimiento', b.cumplimiento)}
      </div>
      {b.cta && <p className="small">Llamada a la acción: {b.cta}</p>}
    </details>
  )
}

function Proximos({ v }: { v: VistaPiloto }) {
  const turnos = new Map(v.ultimos.map((t) => [t.id, t]))
  return (
    <div className="piloto-listas">
      <div>
        <h3>
          <Icono de="calendario" /> Próximos horarios
        </h3>
        <ul>
          {v.proximos.map((h) => (
            <li key={h.instante} className={`small piloto-${h.estado}`}>
              {hora(h.instante)} · {ESTADOS[h.estado] ?? h.estado}
              {h.turno && turnos.get(h.turno)?.gancho ? <span className="muted"> · {turnos.get(h.turno)!.gancho}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>
          <Icono de="video" /> Últimos videos
        </h3>
        {v.ultimos.length ? (
          <ul>
            {v.ultimos.map((t) => (
              <Turno key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <p className="muted small">Aún ninguno.</p>
        )}
      </div>
    </div>
  )
}

function Turno({ t }: { t: TurnoPiloto }) {
  return (
    <li className={`small piloto-${t.estado}`} title={t.error ?? t.advertencias?.join('\n') ?? ''}>
      {hora(t.instante)} · {ESTADOS[t.estado] ?? t.estado}
      <span className="muted">
        {' '}
        · {t.gancho || 'sin gancho'}
        {t.pilar ? ` · ${t.pilar}` : ''}
      </span>
      {t.error && <span className="bad"> · {t.error}</span>}
    </li>
  )
}

function FilaLlave({ proyecto, titulo, detalle, config, onCambio }: { proyecto?: Proyecto; titulo: string; detalle?: string; config: ConfigAgencia; onCambio(c: ConfigAgencia): void }) {
  const propia = proyecto ? config.proyectos[proyecto.id] : config.defecto
  const [abierta, setAbierta] = useState(false)
  const [llave, setLlave] = useState('')
  const [url, setUrl] = useState(propia?.url ?? config.urlPorDefecto)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [prueba, setPrueba] = useState<(EstadoAgencia & { desde?: string }) | null>(null)
  const usa = propia?.tieneLlave ? 'propia' : proyecto && config.defecto.tieneLlave ? 'defecto' : 'ninguna'

  async function guardar(quitar = false) {
    setOcupado(true)
    setError('')
    try {
      const c = await api<ConfigAgencia>('/api/agencia/llave', { proyecto: proyecto?.id ?? null, llave: quitar ? null : llave.trim() || undefined, url: url.trim() })
      onCambio(c)
      setLlave('')
      setPrueba(null)
      if (!quitar) setAbierta(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    setOcupado(true)
    setError('')
    setPrueba(null)
    try {
      setPrueba(await api('/api/agencia/probar', { proyecto: proyecto?.id ?? null }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="item">
      <div className="fila">
        <span className="logo agencia-punto" style={{ background: proyecto ? cssDeColor(proyecto.color) : undefined }} aria-hidden>
          {(proyecto?.nombre ?? 'D')[0].toUpperCase()}
        </span>
        <div className="fila-nombre">
          <strong>{titulo}</strong>
          <span>
            {usa === 'propia' ? `Llave ${propia?.mascara}` : usa === 'defecto' ? 'Usa la llave por defecto' : 'Sin llave'}
            {detalle ? ` · ${detalle}` : ''}
          </span>
        </div>
        {usa !== 'ninguna' && (
          <button className="ghost small" disabled={ocupado} onClick={probar}>
            {ocupado && !abierta ? 'Probando…' : 'Probar conexión'}
          </button>
        )}
        <button className={propia?.tieneLlave ? 'ghost small' : 'primary small'} onClick={() => setAbierta(!abierta)}>
          {abierta ? 'Cerrar' : propia?.tieneLlave ? 'Cambiar' : 'Pegar llave'}
        </button>
      </div>
      {abierta && (
        <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), guardar())}>
          <div className="opcion-fila">
            <input type="password" autoFocus autoComplete="off" spellCheck={false} placeholder="Llave de agencia v!d (kg_live_…)" value={llave} onChange={(e) => setLlave(e.target.value)} />
            <button className="primary" disabled={ocupado || (!llave.trim() && !propia?.tieneLlave)}>
              Guardar
            </button>
            {propia?.tieneLlave && (
              <button type="button" className="ghost" disabled={ocupado} onClick={() => guardar(true)}>
                Quitar
              </button>
            )}
          </div>
          <label className="agencia-url">
            <span className="muted small">URL de vid-api</span>
            <input type="url" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </form>
      )}
      {error && <p className="bad small fila-extra">{error}</p>}
      {prueba && (
        <div className="fila-extra">
          <ResultadoPrueba e={prueba} />
        </div>
      )}
    </div>
  )
}

function ResultadoPrueba({ e }: { e: EstadoAgencia & { desde?: string } }) {
  return (
    <div className="agencia-prueba">
      <p className="small">
        <span className="ok-texto">Conectado</span> · {e.agencia.nombre}
        {e.agencia.folio ? ` (${e.agencia.folio})` : ''} · subcuenta {e.locationId}
        {e.desde === 'defecto' ? ' · con la llave por defecto' : ''}
      </p>
      <CuentasPorRed cuentas={e.cuentas} />
    </div>
  )
}

/** Las cuentas conectadas, agrupadas por red, con el logo de cada una. */
export function CuentasPorRed({ cuentas }: { cuentas: CuentaSocial[] }) {
  if (!cuentas.length) return <p className="muted small">No hay redes conectadas en la subcuenta de GHL.</p>
  const redes = [...new Set(cuentas.map((c) => c.plataforma))]
  return (
    <div className="redes-conectadas">
      {redes.map((r) => {
        const de = cuentas.filter((c) => c.plataforma === r)
        return (
          <div key={r} className="red-conectada" title={de.map((c) => c.nombre).join('\n')}>
            <Logo de={r} nombre={nombrePlataforma(r)} chico />
            <span className="small">
              {nombrePlataforma(r)} <span className="muted">{de.length}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
