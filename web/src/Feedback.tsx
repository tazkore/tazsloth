import { memo, useEffect, useState } from 'react'
import { api } from './api'
import { dondeEstabaAntes } from './feedback-pantalla'
import './Feedback.css'

/**
 * «Feedback»: cuenta un error o una mejora. v!d arma con el agente local un prompt listo para Claude Code (contexto,
 * pasos para reproducir, archivos probables, criterio de terminado), que se puede editar. «Enviar» lo guarda siempre en
 * la cola de esta computadora (`data/feedback`) y, si hay llave de agencia, también lo manda a Kold.Gold. Las rutas están
 * en `server/feedback.ts`.
 */

type Tipo = 'error' | 'mejora'
interface Entrada {
  archivo: string
  tipo: Tipo
  titulo: string
  estado: 'nuevo' | 'enviado'
  creado: string
  version: string
  prompt: string
  captura?: string
  aviso?: string
}
interface Contexto {
  pantalla?: string
  hilo?: string
  log?: string
}
interface Incluir {
  version: boolean
  pantalla: boolean
  log: boolean
  hilo: boolean
}

const fecha = (iso: string) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

export const Feedback = memo(function Feedback() {
  const [tipo, setTipo] = useState<Tipo>('error')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [captura, setCaptura] = useState<File | null>(null)
  const [incluir, setIncluir] = useState<Incluir>({ version: true, pantalla: true, log: false, hilo: false })
  const [prompt, setPrompt] = useState('')
  const [contexto, setContexto] = useState<Contexto>({})
  const [origen, setOrigen] = useState('')
  const [rutaCaptura, setRutaCaptura] = useState<string | undefined>()
  const [trabajando, setTrabajando] = useState<'armar' | 'enviar' | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [enviaAVid, setEnviaAVid] = useState(false)
  const [version, setVersion] = useState('')
  const [hayLog, setHayLog] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  const antes = dondeEstabaAntes()

  const cargarLista = () =>
    api<{ entradas: Entrada[]; enviaAVid: boolean }>('/api/feedback').then(
      (r) => (setEntradas(r.entradas), setEnviaAVid(r.enviaAVid)),
      () => {}
    )
  useEffect(() => {
    void cargarLista()
    api<{ version: string; log: string | null }>('/api/feedback/contexto').then(
      (r) => (setVersion(r.version), setHayLog(r.log !== null)),
      () => {}
    )
  }, [])
  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(null), 1600)
    return () => clearTimeout(t)
  }, [copiado])

  const marca = (k: keyof Incluir) => (e: { target: { checked: boolean } }) => setIncluir((i) => ({ ...i, [k]: e.target.checked }))

  async function subirCaptura(): Promise<string | undefined> {
    if (!captura) return undefined
    if (rutaCaptura) return rutaCaptura
    const res = await fetch(`/api/upload?name=${encodeURIComponent(captura.name || 'captura.png')}`, { method: 'POST', body: captura })
    if (!res.ok) throw new Error('No se pudo subir la captura.')
    const ruta = ((await res.json()) as { path: string }).path
    setRutaCaptura(ruta)
    return ruta
  }

  async function armar() {
    setTrabajando('armar')
    setError('')
    setAviso('')
    try {
      const ruta = await subirCaptura()
      const r = await api<{ prompt: string; contexto: Contexto; origen: 'claude' | 'plantilla' }>('/api/feedback/armar', {
        tipo,
        titulo,
        descripcion,
        incluir,
        pantalla: antes.pantalla,
        hiloId: antes.hiloId,
        captura: ruta
      })
      setPrompt(r.prompt)
      setContexto(r.contexto)
      setOrigen(r.origen === 'plantilla' ? 'No pude usar al agente: este es el borrador de la plantilla. Edítalo antes de enviar.' : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(null)
    }
  }

  async function enviar() {
    setTrabajando('enviar')
    setError('')
    try {
      const r = await api<{ enviado: boolean; aviso?: string }>('/api/feedback/enviar', { tipo, titulo, prompt, contexto, captura: rutaCaptura })
      setAviso(r.enviado ? 'Enviado a Kold.Gold y guardado en esta computadora.' : (r.aviso ?? 'Guardado en esta computadora.'))
      setTitulo('')
      setDescripcion('')
      setPrompt('')
      setCaptura(null)
      setRutaCaptura(undefined)
      setContexto({})
      void cargarLista()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(null)
    }
  }

  async function reenviar(archivo: string) {
    setError('')
    try {
      const r = await api<{ enviado: boolean; aviso?: string }>('/api/feedback/reenviar', { archivo })
      setAviso(r.enviado ? 'Enviado a Kold.Gold.' : (r.aviso ?? 'No se pudo enviar todavía.'))
      void cargarLista()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const copiar = (e: Entrada) => navigator.clipboard.writeText(e.prompt).then(() => setCopiado(e.archivo), () => {})
  const puedeArmar = !!titulo.trim() && !!descripcion.trim() && trabajando === null

  return (
    <div className="fb">
      <div className="fb-columna">
        <header className="fb-cabeza">
          <div className="fb-antetitulo">Ayúdanos a mejorar</div>
          <h1>Feedback</h1>
          <p>Cuéntanos qué falló o qué te gustaría. v!d arma un prompt listo para Claude Code con lo que pasó; lo revisas y lo envías.</p>
        </header>

        <section className="fb-forma">
          <div className="fb-tipos" role="group" aria-label="Tipo">
            <button className={tipo === 'error' ? 'on' : ''} onClick={() => setTipo('error')}>
              Error
            </button>
            <button className={tipo === 'mejora' ? 'on' : ''} onClick={() => setTipo('mejora')}>
              Mejora
            </button>
          </div>
          <label className="fb-campo">
            <span>Título</span>
            <input value={titulo} maxLength={120} placeholder={tipo === 'error' ? 'No se exporta el video' : 'Un atajo para duplicar un hilo'} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label className="fb-campo">
            <span>{tipo === 'error' ? 'Qué pasó' : 'Qué quieres'}</span>
            <textarea
              rows={5}
              value={descripcion}
              placeholder={tipo === 'error' ? 'Qué hacías, qué esperabas y qué pasó en cambio' : 'Qué te gustaría poder hacer y para qué'}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </label>
          <label className="fb-campo">
            <span>Captura de pantalla (opcional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                setCaptura(e.target.files?.[0] ?? null)
                setRutaCaptura(undefined)
              }}
            />
          </label>
          <fieldset className="fb-incluir">
            <legend>Incluir</legend>
            <label>
              <input type="checkbox" checked={incluir.version} onChange={marca('version')} /> La versión de v!d{version && <span className="muted"> ({version})</span>}
            </label>
            <label>
              <input type="checkbox" checked={incluir.pantalla} onChange={marca('pantalla')} /> La pantalla actual <span className="muted">({antes.pantalla})</span>
            </label>
            <label>
              <input type="checkbox" checked={incluir.log} disabled={!hayLog} onChange={marca('log')} /> Las últimas 200 líneas del registro
              {!hayLog && <span className="muted"> (no hay registro todavía)</span>}
            </label>
            <label>
              <input type="checkbox" checked={incluir.hilo} disabled={!antes.hiloId} onChange={marca('hilo')} /> El hilo actual (un resumen)
              {!antes.hiloId && <span className="muted"> (no estabas en un hilo)</span>}
            </label>
          </fieldset>
          <div className="fb-fila">
            <button className="fb-boton principal" disabled={!puedeArmar} onClick={armar}>
              {trabajando === 'armar' ? 'Armando…' : prompt ? 'Armar de nuevo' : 'Armar prompt'}
            </button>
          </div>
        </section>

        {(prompt || trabajando === 'armar') && (
          <section className="fb-forma">
            <label className="fb-campo">
              <span>Prompt para Claude Code (puedes editarlo)</span>
              <textarea className="fb-prompt" rows={16} value={prompt} placeholder="Armando el prompt…" onChange={(e) => setPrompt(e.target.value)} />
            </label>
            {origen && <p className="fb-nota">{origen}</p>}
            <p className="fb-nota">{enviaAVid ? 'Se guarda en esta computadora y se manda a Kold.Gold.' : 'Se guarda en esta computadora. Para mandarlo a Kold.Gold hace falta la llave de agencia (Opciones → Agencia).'}</p>
            <div className="fb-fila">
              <button className="fb-boton principal" disabled={!prompt.trim() || trabajando !== null} onClick={enviar}>
                {trabajando === 'enviar' ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </section>
        )}
        {error && <p className="bad small">{error}</p>}
        {aviso && <p className="fb-aviso">{aviso}</p>}

        <section className="fb-lista">
          <h2>Mis feedback</h2>
          {entradas.length === 0 ? (
            <p className="muted small">Lo que envíes aparece aquí, con su estado.</p>
          ) : (
            <ul>
              {entradas.map((e) => (
                <li key={e.archivo}>
                  <div className="fb-item-cabeza">
                    <span className={`fb-chip ${e.tipo}`}>{e.tipo === 'error' ? 'Error' : 'Mejora'}</span>
                    <strong>{e.titulo}</strong>
                    <span className={`fb-estado ${e.estado}`} title={e.aviso}>
                      {e.estado === 'enviado' ? 'Enviado' : 'Nuevo'}
                    </span>
                  </div>
                  <div className="fb-item-pie">
                    <span className="muted small">
                      {fecha(e.creado)}
                      {e.version && ` · v${e.version}`}
                    </span>
                    <span className="spacer" />
                    {e.estado === 'nuevo' && enviaAVid && (
                      <button className="fb-boton" onClick={() => reenviar(e.archivo)}>
                        Enviar ahora
                      </button>
                    )}
                    <button className="fb-boton" onClick={() => copiar(e)}>
                      {copiado === e.archivo ? 'Copiado' : 'Copiar prompt'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
})
