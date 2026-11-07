import { createReadStream, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { Readable } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { briefNormal, contenidoNormal, MAX_OTRO, MAX_VIDEO, URL_VID_API, type ContenidoAgencia, type EstadoAgencia, type NuevoPost, type PerfilAgencia, type PostSocial } from '../../shared/agencia.ts'

/**
 * El cliente de vid-api (la API privada de Kold.Gold sobre el Social Planner de GHL). Solo lo usa el servidor: la
 * llave nunca llega al navegador ni a un log, y los errores no la llevan.
 *
 * - `POST <url>` con JSON `{op, …}` y la cabecera `x-vid-key`; `subir_media` de un archivo va en multipart, en un
 *   flujo que cuenta los bytes enviados (`alAvance`), para la barra de progreso.
 * - Tiempo límite por petición (`timeoutMs`), y reintentos con espera (`Retry-After`, o 1, 2, 4 s): 429 en todas las
 *   operaciones (la petición no se atendió); 5xx y fallas de red solo en las que se pueden repetir sin duplicar nada
 *   (`estado`, `listar_posts`, `categorias`, `salud`, `borrar_*`). Crear, editar o subir no se repiten tras un 5xx: un
 *   post repetido en una red es peor que un error.
 * - Errores en español (`ErrorVidApi`): el `message` de vid-api si lo trae (ya viene en español), o uno según el HTTP.
 * - `perfil` y `guardar_contenido` (vid-api 1.3.0) son del contenido automático (`piloto.ts`). Una vid-api más vieja
 *   contesta `op_desconocida`: `esBackendViejo` lo reconoce y el piloto se queda apagado con un aviso.
 */

export class ErrorVidApi extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(mensaje)
  }
}

export interface OpcionesVidApi {
  llave: string
  url?: string
  fetch?: typeof fetch
  timeoutMs?: number
  /** Cuántos intentos en total (con el primero). */
  intentos?: number
  /** Para las pruebas: cómo se espera entre intentos. */
  esperar?: (ms: number) => Promise<void>
}

const REPETIBLES = new Set(['estado', 'perfil', 'listar_posts', 'categorias', 'salud', 'borrar_post', 'borrar_media'])
const ESPERA_MAX = 30_000

const TIPOS: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'
}
export const tipoDeArchivo = (ruta: string) => TIPOS[extname(ruta).toLowerCase()]

/** El texto en español de un error HTTP sin mensaje de vid-api. */
export function mensajeHttp(status: number): string {
  if (status === 400) return 'vid-api rechazó la petición (datos incompletos o inválidos).'
  if (status === 401) return 'La llave de agencia no es válida o fue revocada: emite una nueva en kold.gold y pégala en Opciones → Agencia.'
  if (status === 403) return 'La llave no tiene permiso para esto (necesita vid:write) o tu IP no está permitida.'
  if (status === 404) return 'vid-api no encontró lo que pediste.'
  if (status === 413) return 'El archivo es demasiado grande para vid-api (video hasta 500 MB, imágenes hasta 25 MB).'
  if (status === 422) return 'GHL o la red rechazó la publicación.'
  if (status === 429) return 'Demasiadas peticiones a vid-api: espera un minuto y vuelve a intentarlo.'
  if (status >= 500) return `vid-api no respondió bien (HTTP ${status}). Inténtalo en unos minutos.`
  return `vid-api respondió HTTP ${status}.`
}

/** `Retry-After` en segundos o como fecha; sin él, `undefined`. */
export function retryAfter(valor: string | null, ahora = Date.now()): number | undefined {
  if (!valor) return undefined
  const s = Number(valor)
  if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, ESPERA_MAX)
  const t = Date.parse(valor)
  return Number.isNaN(t) ? undefined : Math.min(Math.max(0, t - ahora), ESPERA_MAX)
}

/** Si el error es de una vid-api que aún no conoce la operación (anterior a la 1.3.0). */
export const esBackendViejo = (e: unknown) => e instanceof ErrorVidApi && (e.code === 'op_desconocida' || e.code === 'op_invalida')

/** `crear_post` también acepta `cuentas: "todas"`: vid-api pone las de `redes_objetivo` del perfil. */
export type PostAEnviar = Omit<NuevoPost, 'cuentas'> & { cuentas: string[] | 'todas' }

/** Quita la llave de cualquier texto antes de mostrarlo. */
const sinLlave = (texto: string, llave: string) => (llave ? texto.split(llave).join('[llave]') : texto)

export interface Avance {
  enviado: number
  total: number
}

export function clienteVidApi(o: OpcionesVidApi) {
  const url = (o.url || URL_VID_API).replace(/\/+$/, '')
  const llave = o.llave.trim()
  const f = o.fetch ?? fetch
  const timeoutMs = o.timeoutMs ?? 60_000
  const intentos = Math.max(1, o.intentos ?? 3)
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  if (!llave) throw new ErrorVidApi('Falta la llave de agencia: pégala en Opciones → Agencia.', 401, 'sin_llave')
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url + '/')) throw new ErrorVidApi('La URL de vid-api tiene que empezar con https://.', 400, 'url')

  /** Una petición con reintentos. `cuerpo` es una fábrica: cada intento necesita el suyo (un flujo no se repite). */
  async function pedir<T>(op: string, init: () => { body?: BodyInit; headers?: Record<string, string>; method?: string; ruta?: string }, tiempo = timeoutMs): Promise<T> {
    let ultimo: ErrorVidApi | undefined
    for (let intento = 1; intento <= intentos; intento++) {
      const i = init()
      const control = new AbortController()
      const reloj = setTimeout(() => control.abort(), tiempo)
      let res: Response
      try {
        res = await f(url + (i.ruta ?? ''), {
          method: i.method ?? 'POST',
          headers: { 'x-vid-key': llave, ...(i.headers ?? {}) },
          body: i.body,
          signal: control.signal,
          ...(i.body instanceof ReadableStream ? { duplex: 'half' } : {})
        } as RequestInit)
      } catch (e) {
        clearTimeout(reloj)
        const abortado = control.signal.aborted
        ultimo = new ErrorVidApi(
          abortado ? `vid-api tardó más de ${Math.round(tiempo / 1000)} s en contestar.` : `No se pudo conectar con vid-api: ${sinLlave(e instanceof Error ? e.message : String(e), llave)}`,
          abortado ? 408 : 0,
          abortado ? 'tiempo' : 'red'
        )
        if (REPETIBLES.has(op) && intento < intentos) {
          await esperar(1000 * 2 ** (intento - 1))
          continue
        }
        throw ultimo
      }
      clearTimeout(reloj)
      const texto = await res.text().catch(() => '')
      let datos: { ok?: boolean; code?: string; message?: string; [k: string]: unknown } | null = null
      try {
        datos = texto ? JSON.parse(texto) : null
      } catch {
        datos = null
      }
      if (res.ok && datos?.ok !== false) return (datos ?? {}) as T
      const mensaje = sinLlave(typeof datos?.message === 'string' && datos.message ? datos.message : mensajeHttp(res.status), llave)
      ultimo = new ErrorVidApi(mensaje, res.status, typeof datos?.code === 'string' ? datos.code : undefined)
      const repetir = res.status === 429 || (res.status >= 500 && REPETIBLES.has(op))
      if (!repetir || intento >= intentos) throw ultimo
      await esperar(retryAfter(res.headers.get('retry-after')) ?? 1000 * 2 ** (intento - 1))
    }
    throw ultimo ?? new ErrorVidApi('vid-api no respondió.', 0)
  }

  const op = <T>(nombre: string, datos: Record<string, unknown> = {}, tiempo?: number) =>
    pedir<T>(nombre, () => ({ body: JSON.stringify({ op: nombre, ...datos }), headers: { 'content-type': 'application/json' } }), tiempo)

  return {
    url,
    /** `GET /salud`, sin llave en vid-api (se manda igual: no estorba). */
    salud: () => pedir<{ ok: boolean }>('salud', () => ({ method: 'GET', ruta: '/salud' })),
    estado: async (): Promise<EstadoAgencia> => {
      const r = await op<Partial<EstadoAgencia>>('estado')
      return {
        agencia: r.agencia ?? { id: null, nombre: 'Sin nombre' },
        locationId: r.locationId ?? '',
        llave: r.llave,
        cuentas: Array.isArray(r.cuentas) ? r.cuentas : [],
        usuarios: Array.isArray(r.usuarios) ? r.usuarios : []
      }
    },
    /** Sube por URL: GHL la descarga. */
    subirUrl: async (u: string, nombre?: string) => (await op<{ media: { id: string; url: string } }>('subir_media', { url: u, ...(nombre ? { nombre } : {}) }, 300_000)).media,
    /** Sube un archivo local en multipart, contando lo enviado. */
    subirArchivo: async (ruta: string, alAvance?: (a: Avance) => void) => {
      const tipo = tipoDeArchivo(ruta)
      if (!tipo) throw new ErrorVidApi('Ese tipo de archivo no se puede subir (video MP4, MOV o WEBM; imagen JPG, PNG, WEBP o GIF).', 400, 'tipo')
      const tamano = statSync(ruta).size
      const max = tipo.startsWith('video/') ? MAX_VIDEO : MAX_OTRO
      if (tamano > max) throw new ErrorVidApi(mensajeHttp(413), 413, 'tamano')
      const nombre = basename(ruta).replace(/["\r\n]/g, '_')
      const r = await pedir<{ media: { id: string; url: string } }>(
        'subir_media',
        () => {
          const { cuerpo, tipoContenido, largo } = multipart({ op: 'subir_media', nombre }, { campo: 'file', nombre, tipo, ruta, tamano }, alAvance)
          return { body: cuerpo, headers: { 'content-type': tipoContenido, 'content-length': String(largo) } }
        },
        // Un video grande tarda: un minuto por cada 50 MB, y al menos cinco.
        Math.max(300_000, Math.ceil(tamano / (50 * 1024 * 1024)) * 60_000)
      )
      return r.media
    },
    borrarMedia: (id: string) => op<{ ok: true }>('borrar_media', { id }),
    /** El negocio, la configuración de contenido y el brief del nicho de la agencia (vid-api 1.3.0). */
    perfil: async (): Promise<PerfilAgencia> => {
      const r = await op<Partial<PerfilAgencia> & { contenido?: unknown; brief?: unknown }>('perfil')
      return {
        agencia: r.agencia ?? { id: null, nombre: 'Sin nombre' },
        negocio: r.negocio ?? {},
        contenido: contenidoNormal(r.contenido),
        brief: briefNormal(r.brief),
        cuentas: Array.isArray(r.cuentas) ? r.cuentas : [],
        redes_objetivo: Array.isArray(r.redes_objetivo) ? r.redes_objetivo.map(String) : []
      }
    },
    /** Cambia cualquier parte de la configuración de contenido; devuelve la que quedó. */
    guardarContenido: async (cambios: Partial<ContenidoAgencia>) => contenidoNormal((await op<{ contenido?: unknown }>('guardar_contenido', { ...cambios })).contenido),
    crearPost: async (p: PostAEnviar) => (await op<{ post: { id: string; estado: string; tipo: string; fecha: string | null }; advertencias?: string[] }>('crear_post', { ...p })),
    listarPosts: (filtro: { estado?: string; cuentas?: string[]; desde?: string; hasta?: string; limite?: number; saltar?: number } = {}) =>
      op<{ total: number; posts: PostSocial[] }>('listar_posts', filtro),
    editarPost: (id: string, cambios: Partial<NuevoPost>) => op<{ post: PostSocial }>('editar_post', { ...cambios, id }),
    borrarPost: (id: string) => op<{ ok: true }>('borrar_post', { id }),
    categorias: () => op<{ categorias: { id: string; nombre: string }[] }>('categorias'),
    /** El botón Feedback (`server/feedback.ts`): prompt y contexto de hasta 20 KB cada uno (README de vid-api). */
    feedback: (f: { tipo: 'error' | 'mejora'; titulo: string; prompt: string; version: string; contexto: Record<string, unknown> }, tiempo = 20_000) =>
      op<{ feedback: { id: string; estado: string } }>('feedback', { ...f }, tiempo)
  }
}

export type ClienteVidApi = ReturnType<typeof clienteVidApi>

/** Un multipart/form-data en flujo: los campos, el archivo leído en trozos y el cierre. */
function multipart(campos: Record<string, string>, archivo: { campo: string; nombre: string; tipo: string; ruta: string; tamano: number }, alAvance?: (a: Avance) => void) {
  const limite = `----vid${randomBytes(12).toString('hex')}`
  const partes = Object.entries(campos).map(([k, v]) => `--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('')
  const inicio = Buffer.from(`${partes}--${limite}\r\nContent-Disposition: form-data; name="${archivo.campo}"; filename="${archivo.nombre}"\r\nContent-Type: ${archivo.tipo}\r\n\r\n`)
  const fin = Buffer.from(`\r\n--${limite}--\r\n`)
  const largo = inicio.length + archivo.tamano + fin.length
  let enviado = 0
  async function* trozos() {
    yield inicio
    for await (const t of createReadStream(archivo.ruta, { highWaterMark: 1024 * 1024 })) {
      enviado += (t as Buffer).length
      alAvance?.({ enviado, total: archivo.tamano })
      yield t as Buffer
    }
    yield fin
  }
  return { cuerpo: Readable.toWeb(Readable.from(trozos())) as unknown as ReadableStream, tipoContenido: `multipart/form-data; boundary=${limite}`, largo }
}
