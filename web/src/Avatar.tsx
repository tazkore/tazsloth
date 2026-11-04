import { useEffect, useRef, useState } from 'react'
import { MOTORES, type EstadoAvatar, type FlujoInfo, type MotorAvatar } from '../../shared/avatar'
import { api } from './api'
import { Picker } from './Composer'
import './Avatar.css'

/**
 * El motor de avatar en la interfaz (`server/avatar/`): el menú «Avatar» del compositor de un video y, en Opciones, el
 * grupo «Avatares y voz» (proveedor de voz, llaves de ElevenLabs y HeyGen, ComfyUI y sus modelos, nube gratis, HeyGen con
 * Chrome). Lo elegido en el compositor va en la línea `Avatar:` del primer mensaje (`lineaAvatar`, `shared/avatar.ts`).
 * Nada de aquí baja modelos o gasta créditos sin un clic: cada botón dice cuánto.
 */

/** El estado del motor. Mientras algo se instala o arranca, se vuelve a preguntar cada 2 s. */
export function useAvatar() {
  const [estado, setEstado] = useState<EstadoAvatar>()
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const recibir = (p: Promise<EstadoAvatar & { detalle?: string }>) =>
    p.then(
      (e) => (setEstado(e), setError(''), e.detalle && setAviso(e.detalle)),
      (e: Error) => setError(e.message)
    )
  const leer = () => recibir(api<EstadoAvatar>('/api/avatar'))
  useEffect(() => void leer(), [])
  const activo = !!estado && (!!estado.comfy.instalando || !!estado.comfy.arrancando || estado.flujos.some((f) => f.instalando))
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => void leer(), 2000)
    return () => clearInterval(t)
  }, [activo])
  return { estado, error, aviso, setError, setAviso, leer, pedir: (ruta: string, cuerpo: unknown = {}) => recibir(api(ruta, cuerpo)) }
}

export type UsoAvatar = ReturnType<typeof useAvatar>

const CORTO: Record<MotorAvatar, string> = { sprites: 'sprites', 'comfyui-local': 'ComfyUI', 'nube-gratis': 'nube gratis', heygen: 'HeyGen', codex: 'Codex' }

/** El menú «Avatar» del compositor: el motor con su etiqueta Local, Nube o Pago. `valor` vacío es sprites. */
export function SelectorAvatar({ avatar, valor, onCambio }: { avatar: UsoAvatar; valor: string; onCambio(motor: string): void }) {
  const e = avatar.estado
  const actual = (MOTORES.find((m) => m.id === valor) ?? MOTORES[0]).id
  return (
    <Picker
      label={`Avatar: ${CORTO[actual]}`}
      value={actual}
      menuWidth={360}
      groups={[
        {
          label: 'Motor de avatar',
          options: MOTORES.map((m) => {
            const listo = e?.motores.find((x) => x.id === m.id)?.listo
            return { value: m.id, label: `${m.nombre} · ${m.etiqueta}${e && listo === false ? ' (falta preparar)' : ''}` }
          })
        }
      ]}
      onChange={onCambio}
    />
  )
}

const gb = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} GB`

function Barra({ avance }: { avance: number }) {
  return (
    <div className="av-barra" role="progressbar" aria-valuenow={Math.round(avance * 100)}>
      <span style={{ width: `${Math.max(2, Math.min(100, avance * 100))}%` }} />
    </div>
  )
}

/** Una llave (ElevenLabs o HeyGen): pegar, probar, quitar. Se prueba contra el servicio antes de guardarse. */
function LlaveAvatar({ nombre, titulo, para, ayuda, url, final, uso }: { nombre: 'elevenlabs' | 'heygen'; titulo: string; para: string; ayuda: string; url: string; final: string | null | undefined; uso: UsoAvatar }) {
  const [pegando, setPegando] = useState(false)
  const [llave, setLlave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [probando, setProbando] = useState('')
  const guardar = async (valor: string | null) => {
    setOcupado(true)
    uso.setError('')
    uso.setAviso('')
    await uso.pedir('/api/avatar/llave', { nombre, llave: valor })
    setOcupado(false)
    setLlave('')
    setPegando(false)
  }
  const probar = () => {
    setProbando('Probando…')
    api<{ detalle: string }>('/api/avatar/probar', { nombre }).then(
      (r) => setProbando(r.detalle),
      (e: Error) => setProbando(e.message)
    )
  }
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>{titulo}</strong>
          <span>{para}</span>
        </div>
        {final ? (
          <div className="av-acciones">
            <span className="estado mono">…{final}</span>
            <button className="ghost small" onClick={probar}>
              Probar
            </button>
            <button className="ghost small" onClick={() => setPegando(true)}>
              Cambiar
            </button>
            <button className="ghost small" disabled={ocupado} onClick={() => void guardar(null)}>
              Quitar
            </button>
          </div>
        ) : (
          !pegando && (
            <button className="primary" onClick={() => setPegando(true)}>
              Añadir llave
            </button>
          )
        )}
      </div>
      {pegando && (
        <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), llave.trim() && void guardar(llave.trim()))}>
          <div className="opcion-fila">
            <input type="password" autoFocus placeholder="Pega tu llave" value={llave} onChange={(e) => setLlave(e.target.value)} autoComplete="off" />
            <button className="primary" disabled={ocupado || !llave.trim()}>
              {ocupado ? 'Probando…' : 'Guardar'}
            </button>
            <button type="button" className="ghost" onClick={() => (setPegando(false), setLlave(''))}>
              Cancelar
            </button>
          </div>
          <p className="muted small">
            {ayuda} Se prueba antes de guardarse y queda cifrada en esta computadora.{' '}
            <a href={url} target="_blank" rel="noreferrer">
              Conseguir una llave ↗
            </a>
          </p>
        </form>
      )}
      {probando && <p className="muted small fila-extra">{probando}</p>}
    </div>
  )
}

const ETIQUETA_8 = { si: ['Cabe en 8 GB', 'ok'], justo: ['Justo en 8 GB', 'justo'], no: ['No cabe en 8 GB', 'no'] } as const

function FilaFlujo({ f, uso, comfyListo }: { f: FlujoInfo; uso: UsoAvatar; comfyListo: boolean }) {
  const archivo = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [etiqueta, clase] = ETIQUETA_8[f.cabeEn8]
  const importar = async (file: File | undefined) => {
    if (!file) return
    setMsg('')
    try {
      await uso.pedir('/api/avatar/comfy/flujo', { id: f.id, json: await file.text() })
      setMsg('Flujo importado.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>
            {f.nombre} <span className={`av-etiqueta ${clase}`}>{etiqueta}</span>
          </strong>
          <span>
            {f.entrada === 'video+audio' ? 'Video y audio' : 'Imagen y audio'} · ~{f.vramGB} GB de VRAM · descarga de ~{gb(f.descargaGB)} · {f.estado === 'instalado' ? 'instalado' : f.estado === 'parcial' ? 'a medias' : 'sin instalar'}
            {f.sinFlujo ? ' · falta importar su flujo' : ''}
          </span>
        </div>
        <div className="av-acciones">
          {f.instalando && !f.instalando.error ? (
            <button className="ghost small" onClick={() => void uso.pedir('/api/avatar/comfy/cancelar', { clave: f.id })}>
              Cancelar
            </button>
          ) : (
            <button className="primary small" disabled={!uso.estado?.comfy || uso.estado.comfy.estado === 'no-instalado'} title={uso.estado?.comfy.estado === 'no-instalado' ? 'Primero instala ComfyUI portátil' : `Baja unos ${gb(f.descargaGB)}`} onClick={() => void uso.pedir('/api/avatar/comfy/modelo', { id: f.id })}>
              {f.estado === 'instalado' ? 'Reinstalar' : `Instalar modelo (${gb(f.descargaGB)})`}
            </button>
          )}
          {(f.flujo === 'importar' || f.sinFlujo) && (
            <>
              <button className="ghost small" onClick={() => archivo.current?.click()} title="El flujo exportado de ComfyUI con «Save (API Format)»">
                Importar flujo
              </button>
              <input ref={archivo} type="file" accept=".json,application/json" hidden onChange={(e) => (void importar(e.target.files?.[0]), (e.target.value = ''))} />
            </>
          )}
        </div>
      </div>
      <div className="fila-extra">
        <p className="av-nota">{f.nota}</p>
        {f.instalando && (
          <>
            <Barra avance={f.instalando.avance} />
            <p className={f.instalando.error ? 'bad small' : 'muted small'}>{f.instalando.error ?? f.instalando.paso}</p>
          </>
        )}
        {msg && <p className="muted small">{msg}</p>}
        {!comfyListo && f.estado !== 'no-instalado' && <p className="av-nota">ComfyUI está apagado: se arranca solo al pedir un video.</p>}
      </div>
    </div>
  )
}

/** Un campo de ruta que se guarda con su botón (vacío vuelve al valor por omisión). */
function CampoRuta({ titulo, ayuda, valor, placeholder, guardar }: { titulo: string; ayuda: string; valor: string | undefined; placeholder: string; guardar(v: string): Promise<unknown> }) {
  const [texto, setTexto] = useState(valor ?? '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setTexto(valor ?? ''), [valor])
  const cambiado = texto.trim() !== (valor ?? '')
  return (
    <div className="fila">
      <div className="fila-nombre">
        <strong>{titulo}</strong>
        <span>{ayuda}</span>
      </div>
      <div className="av-acciones">
        <input style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)', minWidth: 220 }} placeholder={placeholder} value={texto} onChange={(x) => setTexto(x.target.value)} aria-label={titulo} />
        <button className="ghost small" disabled={!cambiado || guardando} onClick={() => (setGuardando(true), void guardar(texto.trim()).finally(() => setGuardando(false)))}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

/** LatentSync y Chatterbox: si están instalados (`EstadoAvatar.locales`) y dónde está Chatterbox y su voz de referencia. */
function MotoresLocales({ locales, config, guardar }: { locales: EstadoAvatar['locales'] | undefined; config: { chatterboxRaiz?: string; chatterboxReferencia?: string } | undefined; guardar(cambios: object): Promise<unknown> }) {
  const estado = (l: EstadoAvatar['locales']['latentsync'] | undefined) => (!l ? 'Mirando…' : l.texto || (l.listo ? 'Instalado' : 'No instalado'))
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>LatentSync (labios en tu GPU)</strong>
          <span className={locales?.latentsync.listo ? undefined : 'muted'}>{estado(locales?.latentsync)}</span>
        </div>
      </div>
      <div className="fila">
        <div className="fila-nombre">
          <strong>Chatterbox (voz local)</strong>
          <span className={locales?.chatterbox.listo ? undefined : 'muted'}>{estado(locales?.chatterbox)}</span>
        </div>
      </div>
      <CampoRuta titulo="Carpeta de Chatterbox" ayuda="El entorno de Python de Chatterbox (la carpeta que tiene Scripts\python.exe). Vacío: C:\vid-ia\chatterbox." valor={config?.chatterboxRaiz} placeholder="C:\vid-ia\chatterbox" guardar={(v) => guardar({ chatterboxRaiz: v })} />
      <CampoRuta titulo="Voz de referencia" ayuda="Un audio de 10 a 20 s con la voz que Chatterbox clona cuando el agente no pasa otro." valor={config?.chatterboxReferencia} placeholder="C:\ruta\a\mi-voz.wav" guardar={(v) => guardar({ chatterboxReferencia: v })} />
      <div className="fila-extra">
        <p className="av-nota">Los dos se quedan apagados hasta detectarlos instalados. Para instalarlos: scripts\instalar-ia-local.ps1 -Autorizado.</p>
      </div>
    </div>
  )
}

/** Opciones → Avatares y voz. */
export function AvatarOpciones() {
  const uso = useAvatar()
  const e = uso.estado
  const [config, setConfig] = useState<{ vozProveedor: 'gemini' | 'elevenlabs' | 'chatterbox'; vozElevenlabs?: string; chatterboxRaiz?: string; chatterboxReferencia?: string }>()
  const [voces, setVoces] = useState<{ id: string; nombre: string; clon: boolean }[]>([])
  useEffect(() => void api<typeof config>('/api/avatar/config').then(setConfig, () => {}), [])
  useEffect(() => {
    if (e?.elevenlabs.llave) void api<{ voces: { id: string; nombre: string; clon: boolean }[] }>('/api/avatar/elevenlabs/voces').then((r) => setVoces(r.voces), () => setVoces([]))
    else setVoces([])
  }, [e?.elevenlabs.llave])
  const guardarConfig = (cambios: object) => api<typeof config>('/api/avatar/config', cambios).then(setConfig, (x: Error) => uso.setError(x.message))

  // «Importar resultado» (nube) y «Hacer en HeyGen con Chrome»: piden rutas porque el video vive en su carpeta.
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [carpeta, setCarpeta] = useState('')
  const [guion, setGuion] = useState('')
  const [audio, setAudio] = useState('')
  const [nota, setNota] = useState('')
  const decir = (p: Promise<string>) => p.then(setNota, (x: Error) => setNota(x.message))

  if (!e) return <div className="item"><div className="fila"><span className="muted small">{uso.error || 'Mirando…'}</span></div></div>
  const c = e.comfy
  const estadoComfy = c.estado === 'corriendo' ? `Funcionando en ${c.base}${c.gpu ? ` · ${c.gpu}` : ''}${c.vramLibreGB ? ` · ${c.vramLibreGB} GB libres` : ''}` : c.estado === 'instalado' ? 'Instalado, apagado' : 'No está instalado'
  return (
    <>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>Proveedor de voz</strong>
            <span>El de los videos nuevos cuando el menú «Voz» no dice otro. AI Studio es gratis con tu cuenta de Google; ElevenLabs gasta caracteres de tu plan.</span>
          </div>
          <Picker
            className="acciones"
            label={<span className="estado">{config?.vozProveedor === 'elevenlabs' ? 'ElevenLabs' : config?.vozProveedor === 'chatterbox' ? 'Chatterbox (local)' : 'Google AI Studio'}</span>}
            value={config?.vozProveedor ?? 'gemini'}
            groups={[
              {
                label: 'Proveedor',
                options: [
                  { value: 'gemini', label: 'Google AI Studio (Gemini TTS)' },
                  { value: 'elevenlabs', label: 'ElevenLabs' },
                  { value: 'chatterbox', label: e.locales?.chatterbox.listo ? 'Chatterbox (local, gratis)' : 'Chatterbox (local, no instalado)' }
                ]
              }
            ]}
            onChange={(v) => void guardarConfig({ vozProveedor: v })}
          />
        </div>
        {e.elevenlabs.llave && voces.length > 0 && (
          <div className="fila">
            <div className="fila-nombre">
              <strong>Voz de ElevenLabs por omisión</strong>
              <span>Los clones, como «Tazkore IA», salen primero.</span>
            </div>
            <Picker
              className="acciones"
              label={<span className="estado">{voces.find((v) => v.id === config?.vozElevenlabs)?.nombre ?? 'Elegir…'}</span>}
              value={config?.vozElevenlabs ?? ''}
              menuWidth={300}
              groups={[{ label: 'Voces', options: [...voces].sort((a, b) => Number(b.clon) - Number(a.clon)).map((v) => ({ value: v.id, label: `${v.nombre}${v.clon ? ' · clon' : ''}` })) }]}
              onChange={(v) => void guardarConfig({ vozElevenlabs: v })}
            />
          </div>
        )}
      </div>
      <MotoresLocales locales={e.locales} config={config} guardar={guardarConfig} />
      <LlaveAvatar nombre="elevenlabs" titulo="ElevenLabs" para="Voz multilingüe y tus clones (como «Tazkore IA»). Sale como WAV de 24 kHz, igual que AI Studio." ayuda="Pega tu API key de ElevenLabs." url="https://elevenlabs.io/app/settings/api-keys" final={e.elevenlabs.llave} uso={uso} />
      <LlaveAvatar nombre="heygen" titulo="HeyGen" para="Avatares y videos con su API oficial. Cada video gasta créditos de tu plan de API." ayuda="Pega tu API key de HeyGen (platform.heygen.com)." url="https://platform.heygen.com/api-keys" final={e.heygen.llave} uso={uso} />
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>ComfyUI</strong>
            <span>{estadoComfy}</span>
          </div>
          <div className="av-acciones">
            {c.instalando && !c.instalando.error ? (
              <button className="ghost small" onClick={() => void uso.pedir('/api/avatar/comfy/cancelar', { clave: 'comfy' })}>
                Cancelar
              </button>
            ) : c.estado === 'no-instalado' ? (
              <button className="primary" onClick={() => void uso.pedir('/api/avatar/comfy/instalar')} title="Baja ComfyUI portátil de NVIDIA (unos 2 GB) a tu carpeta de datos">
                Instalar ComfyUI portátil (2 GB)
              </button>
            ) : c.estado === 'instalado' ? (
              <button className="primary" disabled={c.arrancando} onClick={() => void uso.pedir('/api/avatar/comfy/arrancar')}>
                {c.arrancando ? 'Arrancando…' : 'Arrancar ComfyUI'}
              </button>
            ) : (
              c.propio && (
                <button className="ghost small" onClick={() => void uso.pedir('/api/avatar/comfy/detener')}>
                  Detener
                </button>
              )
            )}
          </div>
        </div>
        <div className="fila-extra">
          {c.instalando && (
            <>
              <Barra avance={c.instalando.avance} />
              <p className={c.instalando.error ? 'bad small' : 'muted small'}>{c.instalando.error ?? c.instalando.paso}</p>
            </>
          )}
          <p className="av-nota">Tu equipo tiene 8 GB de VRAM: LatentSync y MuseTalk caben con holgura; InfiniteTalk y FantasyTalking solo con block swap, muy lentos. Si ya tienes ComfyUI abierto en {c.base}, v!d lo detecta solo.</p>
        </div>
      </div>
      {e.flujos.map((f) => (
        <FilaFlujo key={f.id} f={f} uso={uso} comfyListo={c.estado === 'corriendo'} />
      ))}
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>Nube gratis</strong>
            <span>Colab (GPU T4 gratis) o un Space de Hugging Face. Subes audio e imagen, bajas el MP4 y lo importas aquí.</span>
          </div>
        </div>
        <div className="fila-extra">
          <div className="av-enlaces">
            <a href="https://colab.research.google.com/" target="_blank" rel="noreferrer">
              Google Colab ↗
            </a>
            <a href="https://huggingface.co/spaces/fffiloni/LatentSync" target="_blank" rel="noreferrer">
              Space de LatentSync ↗
            </a>
            <a href="https://huggingface.co/spaces?q=infinitetalk" target="_blank" rel="noreferrer">
              Spaces de InfiniteTalk ↗
            </a>
          </div>
          <div className="av-campos">
            <div className="opcion-fila">
              <input placeholder="Carpeta del video (ruta completa) para el cuaderno de Colab" value={carpeta} onChange={(x) => setCarpeta(x.target.value)} />
              <button className="ghost" disabled={!carpeta.trim()} onClick={() => void decir(api<{ carpeta: string }>('/api/avatar/nube/preparar', { carpeta: carpeta.trim() }).then((r) => `Cuaderno e instrucciones en ${r.carpeta}.`))}>
                Preparar cuaderno
              </button>
            </div>
            <div className="opcion-fila">
              <input placeholder="MP4 que bajaste (ruta completa)" value={origen} onChange={(x) => setOrigen(x.target.value)} />
              <input placeholder="Destino en el video (…\fuentes\avatar\avatar.mp4)" value={destino} onChange={(x) => setDestino(x.target.value)} />
              <button className="ghost" disabled={!origen.trim() || !destino.trim()} onClick={() => void decir(api<{ archivo: string }>('/api/avatar/importar', { origen: origen.trim(), salida: destino.trim() }).then((r) => `Importado: ${r.archivo}`))}>
                Importar resultado
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>Hacer en HeyGen con Chrome</strong>
            <span>Arma el paquete (guion, audio e instrucciones) en la carpeta del video y copia un prompt para Claude en Chrome, que hace el video en la web de HeyGen con tu sesión. Sin llave de API.</span>
          </div>
        </div>
        <div className="fila-extra av-campos">
          <input style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)' }} placeholder="Carpeta del video (ruta completa)" value={carpeta} onChange={(x) => setCarpeta(x.target.value)} />
          <input style={{ padding: '7px 11px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)' }} placeholder="Audio (ruta completa, opcional)" value={audio} onChange={(x) => setAudio(x.target.value)} />
          <textarea placeholder="Guion que dice el avatar" value={guion} onChange={(x) => setGuion(x.target.value)} />
          <div>
            <button
              className="primary"
              disabled={!carpeta.trim() || !guion.trim()}
              onClick={() =>
                void decir(
                  api<{ prompt: string; carpeta: string }>('/api/avatar/heygen/paquete', { carpeta: carpeta.trim(), guion, audio: audio.trim() || undefined }).then(async (r) => {
                    await navigator.clipboard.writeText(r.prompt).catch(() => {})
                    return `Paquete en ${r.carpeta}. El prompt para Claude en Chrome ya está en tu portapapeles.`
                  })
                )
              }
            >
              Armar paquete y copiar prompt
            </button>
          </div>
        </div>
      </div>
      <div className="item">
        <div className="fila">
          <div className="fila-nombre">
            <strong>Codex como orquestador</strong>
            <span>{e.codex.listo ? 'Con Codex conectado, elige «Codex orquesta» en el menú Avatar: el agente decide el motor y usa el MCP avatar. Codex no genera video por sí mismo.' : 'Conecta Codex en Agentes para usarlo como orquestador.'}</span>
          </div>
        </div>
      </div>
      {(uso.error || uso.aviso || nota) && <p className={`${uso.error ? 'bad' : 'muted'} small fila-extra`}>{uso.error || uso.aviso || nota}</p>}
    </>
  )
}
