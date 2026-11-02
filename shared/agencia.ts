/**
 * Agencia y Social Media (v!d Fase 4): lo que comparten el servidor (`server/agencia/`) y la interfaz
 * (`web/src/SocialMedia.tsx`, `web/src/AgenciaOpciones.tsx`). vid-api es la API privada de Kold.Gold sobre el Social
 * Planner de GoHighLevel; cada agencia emite su llave en kold.gold y la pega en Opciones → Agencia, por proyecto.
 * Las reglas de `validarPost` son las mismas que aplica vid-api (README de `supabase/functions/vid-api` en koldgold).
 */

export const URL_VID_API = 'https://udzsxmgyedojtirjpepc.supabase.co/functions/v1/vid-api'

/** Las plataformas que GHL conecta, con el id de su logo (`web/src/Logos.tsx`). */
export const PLATAFORMAS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  google: 'Google',
  twitter: 'X',
  pinterest: 'Pinterest',
  threads: 'Threads',
  bluesky: 'Bluesky'
} as const

export const nombrePlataforma = (p: string) => (PLATAFORMAS as Record<string, string>)[p] ?? p

/** Una cuenta conectada en la subcuenta de GHL de la agencia (op `estado`). */
export interface CuentaSocial {
  id: string
  plataforma: string
  nombre: string
  tipo?: string
}

/** Lo que dice `estado`, sin la llave. */
export interface EstadoAgencia {
  agencia: { id: string | null; folio?: string | null; nombre: string }
  locationId: string
  llave?: { prefijo?: string; limite_por_minuto?: number }
  cuentas: CuentaSocial[]
  usuarios: { id: string; nombre: string }[]
}

export type EstadoPost = 'draft' | 'scheduled' | 'now'
export type TipoPost = 'post' | 'reel' | 'story'
/** En la interfaz, «carrusel» es un `post` con 2 a 10 imágenes. */
export type TipoUI = TipoPost | 'carrusel'

export interface MedioPost {
  url: string
  /** `video/mp4`, `image/jpeg`…; sin él se adivina por la extensión. */
  tipo?: string
}

export interface DetallesPost {
  tiktok?: { privacyLevel?: string; [k: string]: unknown }
  youtube?: { title?: string; privacyLevel?: string; [k: string]: unknown }
  instagram?: Record<string, unknown>
  facebook?: Record<string, unknown>
  linkedin?: Record<string, unknown>
  [red: string]: Record<string, unknown> | undefined
}

/** El cuerpo de `crear_post`, sin `op`. */
export interface NuevoPost {
  estado: EstadoPost
  cuentas: string[]
  tipo: TipoPost
  texto: string
  media: (string | MedioPost)[]
  /** ISO 8601. Obligatoria con `scheduled`. */
  fecha?: string
  usuario_id?: string
  categoria?: string
  detalles?: DetallesPost
}

/** Una publicación de `listar_posts`. */
export interface PostSocial {
  id: string
  estado: string
  tipo?: string
  texto?: string
  fecha?: string | null
  cuentas?: string[]
  media?: (string | MedioPost)[]
}

/** Un borrador local del plan de la semana (Content Planner): vive en v!d hasta que se manda a GHL. */
export interface PlanSocial {
  id: string
  fecha: string
  redes: string[]
  tipo: TipoUI
  texto: string
  nota?: string
  serie?: string
  /** El post de GHL, si ya se mandó como borrador. */
  postId?: string
}

/** La configuración de la agencia que ve la interfaz: nunca la llave, solo si hay y su máscara. */
export interface LlaveVista {
  url: string
  tieneLlave: boolean
  mascara?: string
}
export interface ConfigAgencia {
  urlPorDefecto: string
  defecto: LlaveVista
  proyectos: Record<string, LlaveVista>
  /** El proyecto activo: su llave es la que reciben los agentes en `VID_AGENCIA_LLAVE`. */
  activo?: string
}

/** Las skills de redes que la interfaz puede lanzar (`server/agencia/skills.ts`). */
export const ACCIONES_SKILL = {
  caption: { skill: 'social-caption-writer', nombre: 'Escribir caption' },
  hashtags: { skill: 'social-hashtag-strategist', nombre: 'Hashtags' },
  humanizar: { skill: 'social-humanizer', nombre: 'Humanizar y auditar' },
  plan: { skill: 'social-content-planner', nombre: 'Plan de la semana' },
  carrusel: { skill: 'social-carousel-planner', nombre: 'Carrusel' },
  perfil: { skill: 'social-profile-optimizer', nombre: 'Optimizar perfil' },
  gancho: { skill: 'social-hook-extractor', nombre: 'Extraer gancho' },
  reaprovechar: { skill: 'social-repurposer', nombre: 'Reaprovechar' },
  audiencia: { skill: 'social-audience-insights', nombre: 'Audiencia' }
} as const
export type AccionSkill = keyof typeof ACCIONES_SKILL

const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i
const IMAGEN = /\.(jpe?g|png|webp|gif|heic)(\?|#|$)/i

/** Si un medio es video: por su tipo o por la extensión de su URL. */
export function esVideo(m: string | MedioPost): boolean {
  const tipo = typeof m === 'string' ? undefined : m.tipo
  if (tipo) return tipo.startsWith('video/')
  return VIDEO.test(typeof m === 'string' ? m : m.url)
}
export const esImagen = (m: string | MedioPost) => {
  const tipo = typeof m === 'string' ? undefined : m.tipo
  return tipo ? tipo.startsWith('image/') : IMAGEN.test(typeof m === 'string' ? m : m.url)
}

/** Los medios que viven en la biblioteca de GHL (los únicos que acepta TikTok). */
export const enGhl = (url: string) => /^https:\/\/(assets\.cdn\.filesafe\.space|storage\.googleapis\.com\/msgsndr|[\w.-]*leadconnectorhq\.com|[\w.-]*filesafe\.space)\//i.test(url)

/** Los límites de subida de vid-api. */
export const MAX_VIDEO = 500 * 1024 * 1024
export const MAX_OTRO = 25 * 1024 * 1024

/** Del tipo de la interfaz al de vid-api: el carrusel es un `post`. */
export const tipoApi = (t: TipoUI): TipoPost => (t === 'carrusel' ? 'post' : t)

/**
 * Las reglas de vid-api, en español, antes de mandar nada. `cuentas` son las de `estado` (para saber la plataforma de
 * cada id); `ahora`, para probar. Devuelve los errores; vacío, se puede mandar.
 */
export function validarPost(p: NuevoPost & { tipoUI?: TipoUI }, cuentas: CuentaSocial[] = [], ahora = Date.now()): string[] {
  const errores: string[] = []
  const plataformas = new Set(p.cuentas.map((id) => cuentas.find((c) => c.id === id)?.plataforma).filter(Boolean) as string[])
  const media = p.media ?? []
  const videos = media.filter(esVideo)
  if (!p.cuentas.length) errores.push('Elige al menos una cuenta (GHL la pide incluso en borrador).')
  if (!['draft', 'scheduled', 'now'].includes(p.estado)) errores.push('El estado tiene que ser borrador, programado o ahora.')
  if (!['post', 'reel', 'story'].includes(p.tipo)) errores.push('El tipo tiene que ser post, reel o story.')
  if (p.estado !== 'draft' && !media.length) errores.push('Para programar o publicar hace falta al menos un medio.')
  if (p.estado === 'scheduled') {
    const t = p.fecha ? Date.parse(p.fecha) : NaN
    if (Number.isNaN(t)) errores.push('Elige la fecha y hora de la publicación.')
    else if (t < ahora + 60_000) errores.push('La fecha tiene que ser al menos un minuto en el futuro.')
  }
  if (p.tipo === 'reel' && (media.length !== 1 || videos.length !== 1)) errores.push('Un reel lleva exactamente un video.')
  if (p.tipo === 'story' && media.length !== 1) errores.push('Una historia lleva exactamente un medio.')
  if (p.tipoUI === 'carrusel') {
    if (media.length < 2 || media.length > 10) errores.push('Un carrusel lleva de 2 a 10 medios.')
    if (videos.length && videos.length !== media.length) errores.push('Un carrusel no mezcla imágenes y videos.')
  }
  if (plataformas.has('tiktok')) {
    if (media.some((m) => !esVideo(m))) errores.push('TikTok solo acepta video.')
    if (media.some((m) => !enGhl(typeof m === 'string' ? m : m.url))) errores.push('TikTok solo acepta medios de la biblioteca de GHL: súbelos primero.')
    if (p.estado !== 'draft' && !videos.length) errores.push('TikTok necesita un video.')
  }
  if (plataformas.has('youtube')) {
    const titulo = p.detalles?.youtube?.title?.trim() ?? ''
    if (!titulo) errores.push('YouTube necesita un título.')
    else if (titulo.length > 100) errores.push('El título de YouTube es de 100 caracteres como máximo.')
    if (!videos.length) errores.push('YouTube necesita un video.')
  }
  if (plataformas.has('instagram') && p.texto.length > 2200) errores.push('Instagram acepta hasta 2,200 caracteres.')
  return [...new Set(errores)]
}

/** La llave enmascarada: el prefijo y los últimos 4. */
export function enmascarar(llave: string): string {
  const l = llave.trim()
  if (l.length <= 12) return '••••'
  return `${l.slice(0, 12)}…${l.slice(-4)}`
}

/** El id del proyecto a partir de la ruta de su memoria (`…/proyectos/<id>/MEMORIA.md` o `…/series/<s>/MEMORIA.md`). */
export function proyectoDeMemoria(ruta: string): string | undefined {
  return /[\\/]proyectos[\\/]([\w-]+)[\\/](?:series[\\/][\w-]+[\\/])?MEMORIA\.md$/i.exec(ruta.trim())?.[1]
}
