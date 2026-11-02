import { useEffect, useMemo, useState } from 'react'
import {
  enGhl,
  esVideo,
  nombrePlataforma,
  validarPost,
  tipoApi,
  type CuentaSocial,
  type DetallesPost,
  type EstadoAgencia,
  type EstadoPost,
  type NuevoPost,
  type PlanSocial,
  type PostSocial,
  type TipoUI
} from '../../shared/agencia'
import type { Proyecto } from '../../shared/proyectos'
import type { VideoHecho, VideosDeTodos } from '../../shared/types'
import { api } from './api'
import { CuentasPorRed } from './AgenciaOpciones'
import { Confirm } from './Confirm'
import { Logo } from './Logos'
import { useProyectoActivo, useProyectos, vivos } from './Proyectos'
import { Segmento } from './Segmento'
import { BotonSkill, CajaResultado, useSkill } from './SocialSkill'
import './SocialMedia.css'

/**
 * Social Media (v!d Fase 4): publicar por la agencia (vid-api de Kold.Gold → Social Planner de GHL) los videos
 * terminados, con el calendario de lo programado y publicado, y las skills de redes (`skills/social-*`).
 *
 * - Canal «Por agencia (GHL)», el de por omisión; «Directo (como antes)» lleva a Mis videos, donde v!d sigue subiendo
 *   a TikTok, Instagram y YouTube por su cuenta (`server/redes`, `server/youtube*`).
 * - Antes de mandar: las reglas de vid-api en el cliente (`validarPost`), la subida de cada medio a la biblioteca de GHL
 *   con su barra, y para programar o publicar ya, un diálogo con el resumen y el botón Confirmar.
 */

type Canal = 'ghl' | 'directo'
type Cuando = EstadoPost

interface Medio {
  clave: string
  nombre: string
  ruta?: string
  url?: string
  video: boolean
  /** Ya en la biblioteca de GHL. */
  subido?: string
  avance?: number
  error?: string
}

const PRIVACIDAD_TIKTOK = [
  { id: 'PUBLIC_TO_EVERYONE', texto: 'Pública' },
  { id: 'MUTUAL_FOLLOW_FRIENDS', texto: 'Amigos' },
  { id: 'FOLLOWER_OF_CREATOR', texto: 'Seguidores' },
  { id: 'SELF_ONLY', texto: 'Solo yo' }
]
const PRIVACIDAD_YOUTUBE = [
  { id: 'public', texto: 'Público' },
  { id: 'unlisted', texto: 'No listado' },
  { id: 'private', texto: 'Privado' }
]

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta

export function SocialMedia() {
  const proyectos = vivos(useProyectos())
  const activo = useProyectoActivo()
  const [proyectoId, setProyectoId] = useState<string | undefined>(activo?.proyecto)
  const [serieId, setSerieId] = useState<string | undefined>(activo?.serie)
  const [canal, setCanal] = useState<Canal>('ghl')
  const [vista, setVista] = useState<'nueva' | 'calendario'>('nueva')
  const proyecto = proyectos.find((p) => p.id === proyectoId) ?? proyectos.find((p) => p.id === activo?.proyecto) ?? proyectos[0]
  const serie = proyecto?.series.find((s) => s.id === serieId)
  const [estado, setEstado] = useState<EstadoAgencia | null>(null)
  const [errorEstado, setErrorEstado] = useState('')
  const [semilla, setSemilla] = useState<PlanSocial | null>(null)

  useEffect(() => {
    if (!proyecto || canal !== 'ghl') return
    let vivo = true
    setEstado(null)
    setErrorEstado('')
    api<EstadoAgencia>('/api/agencia/estado', { proyecto: proyecto.id }).then(
      (e) => vivo && setEstado(e),
      (e) => vivo && setErrorEstado(e.message)
    )
    return () => void (vivo = false)
  }, [proyecto?.id, canal])

  return (
    <div className="social">
      <div className="social-cabeza">
        <h1>Social Media</h1>
        <div className="social-selectores">
          <select value={proyecto?.id ?? ''} onChange={(e) => (setProyectoId(e.target.value), setSerieId(undefined))} aria-label="Proyecto">
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select value={serie?.id ?? ''} onChange={(e) => setSerieId(e.target.value || undefined)} aria-label="Serie">
            <option value="">Sin serie</option>
            {proyecto?.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <Segmento
            label="Canal"
            valor={canal}
            opciones={[
              { id: 'ghl', texto: 'Por agencia (GHL)', title: 'Con la llave de agencia del proyecto, al Social Planner de app.kold.gold' },
              { id: 'directo', texto: 'Directo (como antes)', title: 'v!d sube por su cuenta a TikTok, Instagram y YouTube' }
            ]}
            onCambio={(v) => setCanal(v as Canal)}
          />
        </div>
      </div>

      {canal === 'directo' ? (
        <div className="panel social-directo">
          <p>
            En el canal directo v!d sube por su cuenta: TikTok por su página, Instagram por la nube y YouTube con tu canal conectado, al ritmo que eliges
            en Mis videos.
          </p>
          <div className="fila-acciones">
            <a className="boton" href="#/mis-videos">
              Ir a Mis videos
            </a>
            <a className="boton ghost" href="#/opciones">
              Conectar las redes
            </a>
          </div>
        </div>
      ) : !proyecto ? (
        <p className="muted">Crea un proyecto en la barra para publicar.</p>
      ) : errorEstado ? (
        <div className="panel social-directo">
          <p className="bad">{errorEstado}</p>
          <a className="boton" href="#/opciones">
            Ir a Opciones → Agencia
          </a>
        </div>
      ) : (
        <>
          {estado ? (
            <div className="social-agencia">
              <span className="muted small">
                {estado.agencia.nombre} · subcuenta {estado.locationId}
              </span>
              <CuentasPorRed cuentas={estado.cuentas} />
            </div>
          ) : (
            <p className="muted small">Conectando con la agencia…</p>
          )}
          <Segmento
            label="Vista"
            valor={vista}
            opciones={[
              { id: 'nueva', texto: 'Nueva publicación' },
              { id: 'calendario', texto: 'Calendario' }
            ]}
            onCambio={(v) => setVista(v as 'nueva' | 'calendario')}
          />
          {vista === 'nueva' && estado && <NuevaPublicacion key={proyecto.id + (semilla?.id ?? '')} proyecto={proyecto} serie={serie?.id} cuentas={estado.cuentas} semilla={semilla} onListo={() => (setSemilla(null), setVista('calendario'))} />}
          {vista === 'calendario' && estado && (
            <Calendario proyecto={proyecto} serie={serie?.id} cuentas={estado.cuentas} onUsar={(p) => (setSemilla(p), setVista('nueva'))} />
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Nueva publicación */

function NuevaPublicacion({ proyecto, serie, cuentas, semilla, onListo }: { proyecto: Proyecto; serie?: string; cuentas: CuentaSocial[]; semilla?: PlanSocial | null; onListo(): void }) {
  const [medios, setMedios] = useState<Medio[]>([])
  const [elegidas, setElegidas] = useState<string[]>(() => (semilla?.redes.length ? cuentas.filter((c) => semilla.redes.includes(c.plataforma)).map((c) => c.id) : []))
  const [tipo, setTipo] = useState<TipoUI>(semilla?.tipo ?? 'reel')
  const [texto, setTexto] = useState(semilla?.texto ?? '')
  const [cuando, setCuando] = useState<Cuando>('draft')
  const [fecha, setFecha] = useState(() => aLocal(semilla?.fecha ? new Date(semilla.fecha) : new Date(Date.now() + 3600_000)))
  const [privTiktok, setPrivTiktok] = useState('PUBLIC_TO_EVERYONE')
  const [tituloYt, setTituloYt] = useState('')
  const [privYt, setPrivYt] = useState('public')
  const [eligiendo, setEligiendo] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const s = useSkill()

  const plataformas = new Set(elegidas.map((id) => cuentas.find((c) => c.id === id)?.plataforma))
  const detalles: DetallesPost = {
    ...(plataformas.has('tiktok') ? { tiktok: { privacyLevel: privTiktok } } : {}),
    ...(plataformas.has('youtube') ? { youtube: { title: tituloYt.trim(), privacyLevel: privYt } } : {})
  }
  const post: NuevoPost = {
    estado: cuando,
    cuentas: elegidas,
    tipo: tipoApi(tipo),
    texto,
    // Para validar, lo que aún no se sube cuenta como de GHL: se sube antes de crear el post.
    media: medios.map((m) => ({ url: m.subido ?? m.url ?? `https://assets.cdn.filesafe.space/pendiente/${encodeURIComponent(m.nombre)}`, tipo: m.video ? 'video/mp4' : 'image/jpeg' })),
    ...(cuando === 'scheduled' ? { fecha: new Date(fecha).toISOString() } : {}),
    ...(Object.keys(detalles).length ? { detalles } : {})
  }
  const errores = validarPost({ ...post, tipoUI: tipo }, cuentas)

  function agregar(nuevos: Medio[]) {
    setMedios((m) => [...m, ...nuevos.filter((n) => !m.some((x) => x.clave === n.clave))])
  }

  async function archivo(f: File) {
    setError('')
    try {
      const res = await fetch('/api/agencia/archivo', { method: 'POST', headers: { 'x-nombre': encodeURIComponent(f.name), 'content-type': 'application/octet-stream' }, body: f })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      agregar([{ clave: d.ruta, nombre: f.name, ruta: d.ruta, video: f.type.startsWith('video/') || esVideo(f.name) }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function subirTodo(): Promise<string[]> {
    const urls: string[] = []
    for (const m of medios) {
      if (m.subido) {
        urls.push(m.subido)
        continue
      }
      const cambiar = (c: Partial<Medio>) => setMedios((ms) => ms.map((x) => (x.clave === m.clave ? { ...x, ...c } : x)))
      if (m.url && enGhl(m.url)) {
        cambiar({ subido: m.url })
        urls.push(m.url)
        continue
      }
      if (m.url) {
        const r = await api<{ media: { url: string } }>('/api/agencia/subir', { proyecto: proyecto.id, url: m.url })
        cambiar({ subido: r.media.url, avance: 1 })
        urls.push(r.media.url)
        continue
      }
      const { trabajo } = await api<{ trabajo: string }>('/api/agencia/subir', { proyecto: proyecto.id, ruta: m.ruta })
      cambiar({ avance: 0, error: undefined })
      for (;;) {
        await esperar(700)
        const t = await api<{ enviado: number; total: number; listo?: { url: string }; error?: string }>(`/api/agencia/trabajos/${trabajo}`)
        if (t.error) {
          cambiar({ error: t.error })
          throw new Error(`${m.nombre}: ${t.error}`)
        }
        if (t.listo) {
          cambiar({ subido: t.listo.url, avance: 1 })
          urls.push(t.listo.url)
          break
        }
        cambiar({ avance: t.total ? t.enviado / t.total : 0 })
      }
    }
    return urls
  }

  async function enviar(confirmado: boolean) {
    setEnviando(true)
    setError('')
    setHecho('')
    try {
      const urls = await subirTodo()
      const media = urls.map((u, i) => ({ url: u, tipo: medios[i]?.video ? 'video/mp4' : 'image/jpeg' }))
      const r = await api<{ post: { id: string; estado: string }; advertencias?: string[] }>('/api/agencia/publicar', {
        proyecto: proyecto.id,
        post: { ...post, media, tipoUI: tipo },
        confirmado,
        ...(semilla ? { planId: semilla.id } : {})
      })
      setHecho(`${cuando === 'draft' ? 'Borrador guardado' : cuando === 'scheduled' ? 'Programada' : 'Publicándose (en unos 90 s)'} en GHL.${r.advertencias?.length ? ` Avisos: ${r.advertencias.join(' ')}` : ''}`)
      setTimeout(onListo, 1200)
    } finally {
      setEnviando(false)
    }
  }

  const redesElegidas = [...plataformas].filter(Boolean) as string[]
  const pedido = (entrada: string) => ({ proyecto: proyecto.id, serie, redes: redesElegidas, entrada })
  const sobreMedios = medios.length ? `Medios: ${medios.map((m) => m.nombre).join(', ')}.` : 'Aún sin medio.'

  return (
    <div className="social-nueva">
      <section className="panel social-bloque">
        <h3>Medios</h3>
        {medios.map((m) => (
          <div key={m.clave} className="medio">
            <span className="medio-nombre">
              {m.video ? 'Video' : 'Imagen'} · {m.nombre}
            </span>
            {m.avance !== undefined && !m.subido && (
              <span className="barra" aria-label="Subiendo">
                <span style={{ width: `${Math.round(m.avance * 100)}%` }} />
              </span>
            )}
            {m.subido && <span className="ok-texto small">En GHL</span>}
            {m.error && <span className="bad small">{m.error}</span>}
            <button className="ghost small" disabled={enviando} onClick={() => setMedios(medios.filter((x) => x.clave !== m.clave))}>
              Quitar
            </button>
          </div>
        ))}
        <div className="fila-acciones">
          <button className="ghost small" onClick={() => setEligiendo(!eligiendo)}>
            De Mis videos
          </button>
          <label className="boton ghost small">
            Archivo…
            <input type="file" accept="video/*,image/*" hidden multiple onChange={(e) => (Array.from(e.target.files ?? []).forEach((f) => void archivo(f)), (e.target.value = ''))} />
          </label>
        </div>
        {eligiendo && (
          <ElegirVideos
            onElegir={(vs) => {
              agregar(vs.map((v) => ({ clave: v.ruta, nombre: v.titulo || v.archivo, ruta: v.ruta, video: true })))
              setEligiendo(false)
            }}
          />
        )}
      </section>

      <section className="panel social-bloque">
        <h3>Redes y cuentas</h3>
        <ElegirCuentas cuentas={cuentas} elegidas={elegidas} onCambio={setElegidas} />
      </section>

      <section className="panel social-bloque">
        <h3>Publicación</h3>
        <Segmento
          label="Tipo"
          valor={tipo}
          opciones={[
            { id: 'reel', texto: 'Reel' },
            { id: 'post', texto: 'Post' },
            { id: 'carrusel', texto: 'Carrusel' },
            { id: 'story', texto: 'Historia' }
          ]}
          onCambio={(v) => setTipo(v as TipoUI)}
        />
        <textarea className="social-texto" rows={7} placeholder="El texto de la publicación" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <div className="social-contador muted small">
          {texto.length} caracteres{texto.length > 125 ? ' · lo visible antes de «más» son los primeros 125' : ''}
        </div>
        <div className="fila-acciones">
          <BotonSkill accion="caption" corriendo={s.corriendo} onClick={() => s.correr('caption', pedido(`Escribe el caption de este ${tipo}. ${sobreMedios}\n${texto ? `Borrador o tema: ${texto}` : 'Tema: usa la memoria del proyecto y el nombre del video.'}`))} />
          <BotonSkill accion="hashtags" corriendo={s.corriendo} disabled={!texto.trim()} onClick={() => s.correr('hashtags', pedido(`Hashtags para este texto:\n${texto}`))} />
          <BotonSkill accion="humanizar" corriendo={s.corriendo} disabled={!texto.trim()} onClick={() => s.correr('humanizar', pedido(`Modo audit y luego reescritura: revisa y humaniza este texto.\n${texto}`))} />
          <BotonSkill accion="carrusel" corriendo={s.corriendo} onClick={() => s.correr('carrusel', pedido(`Planea un carrusel lámina por lámina sobre: ${texto || 'el tema del proyecto'}`))} />
        </div>
        {s.error && <p className="bad small">{s.error}</p>}
        {s.resultado && (
          <CajaResultado
            r={s.resultado}
            onCambio={(t) => s.setResultado({ ...s.resultado!, texto: t })}
            onUsar={(t) => (setTexto(t), s.setResultado(null))}
            usar={s.resultado.accion === 'hashtags' ? 'Agregar al texto' : 'Usar como texto'}
            onCerrar={() => s.setResultado(null)}
          />
        )}
        {plataformas.has('tiktok') && (
          <label className="social-detalle">
            <Logo de="tiktok" chico /> Privacidad en TikTok
            <select value={privTiktok} onChange={(e) => setPrivTiktok(e.target.value)}>
              {PRIVACIDAD_TIKTOK.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.texto}
                </option>
              ))}
            </select>
          </label>
        )}
        {plataformas.has('youtube') && (
          <div className="social-detalle">
            <Logo de="youtube" chico />
            <input placeholder="Título en YouTube (obligatorio, hasta 100)" maxLength={100} value={tituloYt} onChange={(e) => setTituloYt(e.target.value)} />
            <select value={privYt} onChange={(e) => setPrivYt(e.target.value)}>
              {PRIVACIDAD_YOUTUBE.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.texto}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <section className="panel social-bloque">
        <h3>Cuándo</h3>
        <Segmento
          label="Cuándo"
          valor={cuando}
          opciones={[
            { id: 'draft', texto: 'Borrador' },
            { id: 'scheduled', texto: 'Programar' },
            { id: 'now', texto: 'Ahora' }
          ]}
          onCambio={(v) => setCuando(v as Cuando)}
        />
        {cuando === 'scheduled' && <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
        {cuando === 'now' && <p className="muted small">GHL no publica al instante: sale en unos 90 segundos.</p>}
        {!!errores.length && (
          <ul className="social-errores">
            {errores.map((e) => (
              <li key={e} className="small">
                {e}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="bad small">{error}</p>}
        {hecho && <p className="ok-texto small">{hecho}</p>}
        <div className="fila-acciones">
          <button
            className="primary"
            disabled={enviando || !!errores.length}
            onClick={() => (cuando === 'draft' ? enviar(false).catch((e) => setError(e.message)) : setConfirmar(true))}
          >
            {enviando ? 'Enviando…' : cuando === 'draft' ? 'Guardar borrador' : cuando === 'scheduled' ? 'Programar…' : 'Publicar ahora…'}
          </button>
        </div>
      </section>

      {confirmar && (
        <Confirm title={cuando === 'now' ? '¿Publicar ahora?' : '¿Programar esta publicación?'} action="Confirmar" onConfirm={() => enviar(true)} onClose={() => setConfirmar(false)}>
          <Resumen post={post} tipo={tipo} cuentas={cuentas} medios={medios} />
        </Confirm>
      )}
    </div>
  )
}

function Resumen({ post, tipo, cuentas, medios }: { post: NuevoPost; tipo: TipoUI; cuentas: CuentaSocial[]; medios: Medio[] }) {
  const elegidas = cuentas.filter((c) => post.cuentas.includes(c.id))
  return (
    <div className="social-resumen">
      <p>
        <strong>Cuándo:</strong> {post.estado === 'now' ? 'ahora (en unos 90 s)' : new Date(post.fecha!).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}
      </p>
      <p>
        <strong>Tipo:</strong> {tipo} · {medios.length} {medios.length === 1 ? 'medio' : 'medios'}
      </p>
      <div>
        <strong>Redes:</strong>
        <ul>
          {elegidas.map((c) => (
            <li key={c.id}>
              <Logo de={c.plataforma} chico /> {nombrePlataforma(c.plataforma)} · {c.nombre}
            </li>
          ))}
        </ul>
      </div>
      {post.detalles?.youtube?.title && (
        <p>
          <strong>Título en YouTube:</strong> {post.detalles.youtube.title}
        </p>
      )}
      <p>
        <strong>Texto:</strong>
      </p>
      <pre className="social-resumen-texto">{post.texto || '(sin texto)'}</pre>
      <p className="muted small">Esto sale de verdad en las redes de la agencia.</p>
    </div>
  )
}

function ElegirCuentas({ cuentas, elegidas, onCambio }: { cuentas: CuentaSocial[]; elegidas: string[]; onCambio(ids: string[]): void }) {
  const redes = [...new Set(cuentas.map((c) => c.plataforma))]
  if (!cuentas.length) return <p className="muted small">No hay redes conectadas en la subcuenta de GHL de esta agencia.</p>
  const alternar = (id: string) => onCambio(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id])
  return (
    <div className="social-cuentas">
      {redes.map((r) => {
        const de = cuentas.filter((c) => c.plataforma === r)
        const todas = de.every((c) => elegidas.includes(c.id))
        return (
          <div key={r} className="social-red">
            <label className="social-red-titulo">
              <input type="checkbox" checked={todas} onChange={() => onCambio(todas ? elegidas.filter((x) => !de.some((c) => c.id === x)) : [...new Set([...elegidas, ...de.map((c) => c.id)])])} />
              <Logo de={r} nombre={nombrePlataforma(r)} chico /> <strong>{nombrePlataforma(r)}</strong>
            </label>
            {de.map((c) => (
              <label key={c.id} className="social-cuenta">
                <input type="checkbox" checked={elegidas.includes(c.id)} onChange={() => alternar(c.id)} />
                {c.nombre}
                {c.tipo ? <span className="muted small"> · {c.tipo}</span> : null}
              </label>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ElegirVideos({ onElegir }: { onElegir(v: VideoHecho[]): void }) {
  const [videos, setVideos] = useState<VideoHecho[] | null>(null)
  const [marcados, setMarcados] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api<VideosDeTodos>('/api/videos').then((r) => setVideos(r.videos), (e) => setError(e.message))
  }, [])
  if (error) return <p className="bad small">{error}</p>
  if (!videos) return <p className="muted small">Buscando tus videos…</p>
  if (!videos.length) return <p className="muted small">Aún no hay videos terminados.</p>
  return (
    <div className="social-videos">
      {videos.slice(0, 60).map((v) => (
        <label key={v.ruta} className="social-video">
          <input type="checkbox" checked={marcados.includes(v.ruta)} onChange={() => setMarcados(marcados.includes(v.ruta) ? marcados.filter((x) => x !== v.ruta) : [...marcados, v.ruta])} />
          <video src={v.src} muted preload="metadata" />
          <span className="small">
            {v.titulo || v.archivo}
            <span className="muted"> · {v.vertical === false ? 'horizontal' : 'vertical'} · {new Date(v.t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
          </span>
        </label>
      ))}
      <div className="fila-acciones">
        <button className="primary small" disabled={!marcados.length} onClick={() => onElegir(videos.filter((v) => marcados.includes(v.ruta)))}>
          Agregar {marcados.length || ''}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Calendario */

const DIA = 86_400_000
function inicioDeSemana(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function aLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const ESTADOS: Record<string, string> = { draft: 'Borrador', scheduled: 'Programada', published: 'Publicada', failed: 'Falló', in_progress: 'Publicando', deleted: 'Borrada', plan: 'Plan' }
const estadoDe = (e: string) => ESTADOS[e.toLowerCase()] ?? e

type Elemento = { tipo: 'post'; p: PostSocial; fecha?: Date } | { tipo: 'plan'; p: PlanSocial; fecha: Date }

function Calendario({ proyecto, serie, cuentas, onUsar }: { proyecto: Proyecto; serie?: string; cuentas: CuentaSocial[]; onUsar(p: PlanSocial): void }) {
  const [modo, setModo] = useState<'semana' | 'mes'>('semana')
  const [base, setBase] = useState(() => new Date())
  const [posts, setPosts] = useState<PostSocial[]>([])
  const [plan, setPlan] = useState<PlanSocial[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState<Elemento | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const s = useSkill((r) => r.plan?.length && setPlan((p) => [...p, ...r.plan!]))

  const dias = useMemo(() => {
    if (modo === 'semana') {
      const i = inicioDeSemana(base)
      return Array.from({ length: 7 }, (_, k) => new Date(i.getFullYear(), i.getMonth(), i.getDate() + k))
    }
    const primero = new Date(base.getFullYear(), base.getMonth(), 1)
    const i = inicioDeSemana(primero)
    return Array.from({ length: 42 }, (_, k) => new Date(i.getFullYear(), i.getMonth(), i.getDate() + k))
  }, [modo, base])
  const desde = dias[0]
  const hasta = new Date(dias[dias.length - 1].getTime() + DIA)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError('')
    Promise.all([
      api<{ posts: PostSocial[] }>('/api/agencia/posts', { proyecto: proyecto.id, estado: 'todos', desde: desde.toISOString(), hasta: hasta.toISOString() }),
      api<{ plan: PlanSocial[] }>(`/api/agencia/plan?proyecto=${encodeURIComponent(proyecto.id)}`)
    ])
      .then(([r, p]) => vivo && (setPosts(r.posts), setPlan(p.plan)), (e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))
    return () => void (vivo = false)
  }, [proyecto.id, desde.getTime(), vuelta])

  const elementos: Elemento[] = [
    ...posts.map((p) => ({ tipo: 'post' as const, p, fecha: p.fecha ? new Date(p.fecha) : undefined })),
    ...plan.filter((p) => !p.postId).map((p) => ({ tipo: 'plan' as const, p, fecha: new Date(p.fecha) }))
  ]
  const sinFecha = elementos.filter((e) => !e.fecha)
  const mover = (n: number) => setBase(modo === 'semana' ? new Date(base.getTime() + n * 7 * DIA) : new Date(base.getFullYear(), base.getMonth() + n, 1))
  const titulo = modo === 'mes' ? base.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : `Semana del ${desde.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`

  async function guardarPlan(nuevo: PlanSocial[]) {
    setPlan(nuevo)
    await api('/api/agencia/plan', { proyecto: proyecto.id, plan: nuevo })
  }

  return (
    <div className="social-calendario">
      <div className="social-cal-cabeza">
        <button className="ghost small" onClick={() => mover(-1)} aria-label="Anterior">
          ←
        </button>
        <strong className="social-cal-titulo">{titulo}</strong>
        <button className="ghost small" onClick={() => mover(1)} aria-label="Siguiente">
          →
        </button>
        <button className="ghost small" onClick={() => setBase(new Date())}>
          Hoy
        </button>
        <Segmento
          label="Rango"
          valor={modo}
          opciones={[
            { id: 'semana', texto: 'Semana' },
            { id: 'mes', texto: 'Mes' }
          ]}
          onCambio={(v) => setModo(v as 'semana' | 'mes')}
        />
        <span className="social-cal-skills">
          <BotonSkill
            accion="plan"
            corriendo={s.corriendo}
            onClick={() =>
              s.correr('plan', {
                proyecto: proyecto.id,
                serie,
                redes: [...new Set(cuentas.map((c) => c.plataforma))],
                desde: aLocal(inicioDeSemana(new Date(Date.now() + 7 * DIA))).slice(0, 10),
                entrada: `Planea la semana que viene para ${proyecto.nombre}${serie ? ` (serie ${proyecto.series.find((x) => x.id === serie)?.nombre})` : ''}. Redes conectadas: ${[...new Set(cuentas.map((c) => nombrePlataforma(c.plataforma)))].join(', ')}.`
              })
            }
          />
          <BotonSkill
            accion="perfil"
            corriendo={s.corriendo}
            onClick={() =>
              s.correr('perfil', {
                proyecto: proyecto.id,
                serie,
                entrada: `Revisa y propone el perfil de ${proyecto.nombre} en sus redes. Cuentas: ${cuentas.map((c) => `${nombrePlataforma(c.plataforma)} «${c.nombre}»`).join(', ')}. Si no tienes la bio actual, propón una desde la memoria y di qué datos faltan.`
              })
            }
          />
        </span>
      </div>
      {s.error && <p className="bad small">{s.error}</p>}
      {s.resultado && <CajaResultado r={s.resultado} onCambio={(t) => s.setResultado({ ...s.resultado!, texto: t })} onCerrar={() => s.setResultado(null)} />}
      {error && <p className="bad small">{error}</p>}
      {cargando && <p className="muted small">Cargando…</p>}
      <div className={`social-cal-rejilla ${modo}`}>
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => (
          <div key={d} className="social-cal-dia-nombre muted small">
            {d}
          </div>
        ))}
        {dias.map((d) => {
          const del = elementos.filter((e) => e.fecha && mismoDia(e.fecha, d)).sort((a, b) => a.fecha!.getTime() - b.fecha!.getTime())
          const fuera = modo === 'mes' && d.getMonth() !== base.getMonth()
          return (
            <div key={d.getTime()} className={`social-cal-dia${fuera ? ' fuera' : ''}${mismoDia(d, new Date()) ? ' hoy' : ''}`}>
              <span className="social-cal-num small">{d.getDate()}</span>
              {del.map((e) => (
                <Ficha key={`${e.tipo}-${e.p.id}`} e={e} cuentas={cuentas} onAbrir={() => setAbierto(e)} />
              ))}
            </div>
          )
        })}
      </div>
      {!!sinFecha.length && (
        <div className="social-sin-fecha">
          <h3>Borradores sin fecha</h3>
          {sinFecha.map((e) => (
            <Ficha key={`${e.tipo}-${e.p.id}`} e={e} cuentas={cuentas} onAbrir={() => setAbierto(e)} />
          ))}
        </div>
      )}
      {abierto && (
        <Detalle
          e={abierto}
          proyecto={proyecto}
          cuentas={cuentas}
          onCerrar={() => setAbierto(null)}
          onCambio={() => (setAbierto(null), setVuelta((v) => v + 1))}
          onQuitarPlan={(id) => (setAbierto(null), void guardarPlan(plan.filter((p) => p.id !== id)))}
          onUsar={(p) => (setAbierto(null), onUsar(p))}
        />
      )}
    </div>
  )
}

function Ficha({ e, cuentas, onAbrir }: { e: Elemento; cuentas: CuentaSocial[]; onAbrir(): void }) {
  const estado = e.tipo === 'plan' ? 'plan' : e.p.estado
  const redes = e.tipo === 'plan' ? e.p.redes : [...new Set((e.p.cuentas ?? []).map((id) => cuentas.find((c) => c.id === id)?.plataforma).filter(Boolean) as string[])]
  return (
    <button className={`social-ficha estado-${String(estado).toLowerCase()}`} onClick={onAbrir} title={e.p.texto}>
      <span className="social-ficha-arriba">
        {e.fecha && <span className="small">{e.fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
        <span className="social-ficha-estado small">{estadoDe(String(estado))}</span>
      </span>
      <span className="social-ficha-logos">
        {redes.map((r) => (
          <Logo key={r} de={r} nombre={nombrePlataforma(r)} chico />
        ))}
      </span>
      <span className="social-ficha-texto small">{(e.p.texto ?? '').slice(0, 70)}</span>
    </button>
  )
}

function Detalle({ e, proyecto, cuentas, onCerrar, onCambio, onQuitarPlan, onUsar }: { e: Elemento; proyecto: Proyecto; cuentas: CuentaSocial[]; onCerrar(): void; onCambio(): void; onQuitarPlan(id: string): void; onUsar(p: PlanSocial): void }) {
  const [texto, setTexto] = useState(e.p.texto ?? '')
  const [fecha, setFecha] = useState(aLocal(e.fecha ?? new Date(Date.now() + 3600_000)))
  const [pregunta, setPregunta] = useState<'reprogramar' | 'borrar' | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function hacer(f: () => Promise<unknown>) {
    setOcupado(true)
    setError('')
    try {
      await f()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOcupado(false)
    }
  }

  if (e.tipo === 'plan') {
    const plan = e.p
    const ids = cuentas.filter((c) => plan.redes.includes(c.plataforma)).map((c) => c.id)
    return (
      <div className="panel social-detalle-panel">
        <div className="skill-resultado-cabeza">
          <strong>Borrador del plan · {new Date(plan.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          <button className="ghost small" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {plan.nota && <p className="muted small">{plan.nota}</p>}
        <pre className="social-resumen-texto">{plan.texto}</pre>
        {error && <p className="bad small">{error}</p>}
        <div className="fila-acciones">
          <button className="primary small" onClick={() => onUsar(plan)}>
            Usar en una publicación
          </button>
          <button
            className="ghost small"
            disabled={ocupado || !ids.length}
            title={ids.length ? 'Lo guarda como borrador en GHL, sin medios' : 'No hay cuentas conectadas de esas redes'}
            onClick={() =>
              hacer(() => api('/api/agencia/publicar', { proyecto: proyecto.id, planId: plan.id, post: { estado: 'draft', cuentas: ids, tipoUI: plan.tipo, texto: plan.texto, media: [] } }))
            }
          >
            Mandar a GHL como borrador
          </button>
          <button className="ghost small" onClick={() => onQuitarPlan(plan.id)}>
            Quitar del plan
          </button>
        </div>
      </div>
    )
  }

  const p = e.p
  const publicado = /publish|fail/i.test(p.estado)
  return (
    <div className="panel social-detalle-panel">
      <div className="skill-resultado-cabeza">
        <strong>
          {estadoDe(p.estado)}
          {e.fecha ? ` · ${e.fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
        </strong>
        <button className="ghost small" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      <textarea rows={6} value={texto} disabled={publicado} onChange={(ev) => setTexto(ev.target.value)} />
      {!publicado && <input type="datetime-local" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />}
      {error && <p className="bad small">{error}</p>}
      <div className="fila-acciones">
        {!publicado && (
          <button className="primary small" disabled={ocupado || texto === (p.texto ?? '')} onClick={() => hacer(() => api('/api/agencia/posts/editar', { proyecto: proyecto.id, id: p.id, cambios: { texto } }))}>
            Guardar el texto
          </button>
        )}
        {!publicado && (
          <button className="ghost small" disabled={ocupado} onClick={() => setPregunta('reprogramar')}>
            {/draft/i.test(p.estado) ? 'Programar…' : 'Reprogramar…'}
          </button>
        )}
        <button className="ghost small" disabled={ocupado} onClick={() => setPregunta('borrar')}>
          Borrar
        </button>
      </div>
      {pregunta === 'reprogramar' && (
        <Confirm
          title={/draft/i.test(p.estado) ? '¿Programar este borrador?' : '¿Reprogramar la publicación?'}
          action="Confirmar"
          onClose={() => setPregunta(null)}
          onConfirm={() =>
            api('/api/agencia/posts/editar', { proyecto: proyecto.id, id: p.id, confirmado: true, cambios: { estado: 'scheduled', fecha: new Date(fecha).toISOString(), ...(texto !== p.texto ? { texto } : {}) } }).then(onCambio)
          }
        >
          <p>
            Sale el {new Date(fecha).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })} en{' '}
            {[...new Set((p.cuentas ?? []).map((id) => cuentas.find((c) => c.id === id)).filter(Boolean).map((c) => `${nombrePlataforma(c!.plataforma)} (${c!.nombre})`))].join(', ') || 'sus cuentas'}.
          </p>
          <pre className="social-resumen-texto">{texto}</pre>
        </Confirm>
      )}
      {pregunta === 'borrar' && (
        <Confirm title="¿Borrar la publicación?" action="Borrar" danger onClose={() => setPregunta(null)} onConfirm={() => api('/api/agencia/posts/borrar', { proyecto: proyecto.id, id: p.id }).then(onCambio)}>
          <p>Se borra en GHL. Si ya salió en una red, allá no se borra.</p>
        </Confirm>
      )}
    </div>
  )
}
