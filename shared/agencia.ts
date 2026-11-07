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

/*
 * Contenido automático por agencia («Piloto automático», v!d 1.1.6; contrato en vid-api 1.3.0): `perfil` trae el negocio,
 * la configuración de contenido de la agencia (tabla `agencia_contenido` en Supabase) y el brief de su nicho
 * (`agencia_nicho_brief`, que genera agentes.kold.gold); `guardar_contenido` la cambia. El piloto (`server/agencia/piloto.ts`)
 * hace con eso los videos del día y los programa en todas las redes conectadas.
 */

/** El brief de contenido de un giro o nicho, en un idioma. */
export interface BriefNicho {
  slug: string
  idioma: string
  nombre: string
  categoria?: string
  resumen?: string
  promesa?: string
  dolores: string[]
  /** Los pasos del recorrido del cliente, cortos. */
  momentos: string[]
  kpis: string[]
  preguntas: string[]
  cumplimiento: string[]
  cta?: string
  /** Ideas de gancho derivadas de los dolores, sin vender de frente. */
  ganchos: string[]
  pilares: string[]
}

export type PrivacidadContenido = 'publico' | 'privado'

/** La configuración de contenido de una agencia (`agencia_contenido`, sin `agencia_id`). */
export interface ContenidoAgencia {
  activo: boolean
  autopublicar: boolean
  /** De 1 a 6. */
  videos_por_dia: number
  /** Familias de red (`PLATAFORMAS`); vacío, todas las conectadas. */
  redes: string[]
  /** `HH:MM` en la zona horaria de la agencia. */
  horarios: string[]
  idioma: string
  pilares: string[]
  tono: string | null
  cta: string | null
  /** El estilo de video de v!d: el id de una card (`video-explicativo`) o su nombre corto (`explicativo`). */
  estilo_video: string
  privacidad: PrivacidadContenido
  notas: string | null
  updated_at?: string | null
  updated_by?: string | null
}

export const CONTENIDO_POR_DEFECTO: ContenidoAgencia = {
  activo: false,
  autopublicar: false,
  videos_por_dia: 1,
  redes: [],
  horarios: ['10:00', '19:00'],
  idioma: 'es',
  pilares: [],
  tono: null,
  cta: null,
  estilo_video: 'explicativo',
  privacidad: 'publico',
  notas: null
}

/** Lo que dice `perfil`. */
export interface PerfilAgencia {
  agencia: { id: string | null; folio?: string | null; nombre: string }
  negocio: {
    giro?: string | null
    nicho?: string | null
    ciudad?: string | null
    pais?: string | null
    zona_horaria?: string | null
    sitio_web?: string | null
    idiomas?: string[]
    plan?: string | null
  }
  contenido: ContenidoAgencia
  brief: BriefNicho | null
  cuentas: (CuentaSocial & { familia?: string })[]
  /** Las familias conectadas que entran (las de `contenido.redes`, o todas). */
  redes_objetivo: string[]
}

export const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const textos = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim()) : [])
const textoONulo = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)

/** La configuración tal como venga de vid-api, con los valores por defecto donde falte algo. */
export function contenidoNormal(x: unknown): ContenidoAgencia {
  const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const d = CONTENIDO_POR_DEFECTO
  const n = Number(c.videos_por_dia)
  const horarios = [...new Set(textos(c.horarios).filter((h) => HORA.test(h)))].sort()
  return {
    activo: c.activo === true,
    autopublicar: c.autopublicar === true,
    videos_por_dia: Number.isFinite(n) ? Math.min(6, Math.max(1, Math.round(n))) : d.videos_por_dia,
    redes: textos(c.redes).map((r) => r.toLowerCase()),
    horarios: Array.isArray(c.horarios) ? horarios : d.horarios,
    idioma: textoONulo(c.idioma) ?? d.idioma,
    pilares: textos(c.pilares),
    tono: textoONulo(c.tono),
    cta: textoONulo(c.cta),
    estilo_video: textoONulo(c.estilo_video) ?? d.estilo_video,
    privacidad: c.privacidad === 'privado' ? 'privado' : 'publico',
    notas: textoONulo(c.notas),
    ...(typeof c.updated_at === 'string' ? { updated_at: c.updated_at } : {}),
    ...(typeof c.updated_by === 'string' ? { updated_by: c.updated_by } : {})
  }
}

/** El brief tal como venga, o null si no trae nada que sirva. */
export function briefNormal(x: unknown): BriefNicho | null {
  if (!x || typeof x !== 'object') return null
  const b = x as Record<string, unknown>
  const slug = textoONulo(b.slug)
  if (!slug) return null
  return {
    slug,
    idioma: textoONulo(b.idioma) ?? 'es',
    nombre: textoONulo(b.nombre) ?? slug,
    ...(textoONulo(b.categoria) ? { categoria: textoONulo(b.categoria)! } : {}),
    ...(textoONulo(b.resumen) ? { resumen: textoONulo(b.resumen)! } : {}),
    ...(textoONulo(b.promesa) ? { promesa: textoONulo(b.promesa)! } : {}),
    dolores: textos(b.dolores),
    momentos: textos(b.momentos),
    kpis: textos(b.kpis),
    preguntas: textos(b.preguntas),
    cumplimiento: textos(b.cumplimiento),
    ...(textoONulo(b.cta) ? { cta: textoONulo(b.cta)! } : {}),
    ganchos: textos(b.ganchos),
    pilares: textos(b.pilares)
  }
}

/** Los errores de un cambio de configuración, antes de mandarlo a `guardar_contenido` (las mismas reglas que vid-api). */
export function validarContenido(c: Partial<ContenidoAgencia>): string[] {
  const e: string[] = []
  for (const k of ['activo', 'autopublicar'] as const) if (k in c && typeof c[k] !== 'boolean') e.push(`«${k}» tiene que ser sí o no.`)
  if ('videos_por_dia' in c && !(Number.isInteger(c.videos_por_dia) && c.videos_por_dia! >= 1 && c.videos_por_dia! <= 6)) e.push('Los videos por día van de 1 a 6.')
  if ('horarios' in c && (!Array.isArray(c.horarios) || !c.horarios.every((h) => typeof h === 'string' && HORA.test(h)))) e.push('Cada horario va como HH:MM (24 horas).')
  if ('redes' in c && (!Array.isArray(c.redes) || !c.redes.every((r) => typeof r === 'string' && r in PLATAFORMAS))) e.push('Hay una red que no existe.')
  if ('privacidad' in c && c.privacidad !== 'publico' && c.privacidad !== 'privado') e.push('La privacidad es pública o privada.')
  if ('pilares' in c && (!Array.isArray(c.pilares) || !c.pilares.every((p) => typeof p === 'string'))) e.push('Los pilares son una lista de textos.')
  for (const k of ['idioma', 'estilo_video'] as const) if (k in c && (typeof c[k] !== 'string' || !c[k]!.trim())) e.push(`Falta «${k}».`)
  for (const k of ['tono', 'cta', 'notas'] as const) if (k in c && c[k] !== null && typeof c[k] !== 'string') e.push(`«${k}» tiene que ser texto.`)
  return e
}

/** Lo que el piloto guarda de este lado, por proyecto: su interruptor y con qué hace los videos. */
export interface PilotoLocal {
  /** El interruptor de Opciones → Agencia. Apagado por defecto: sin él, el `activo` del servidor no basta. */
  encendido: boolean
  /** El modelo y el esfuerzo de sus hilos; sin ellos, uno de Claude Sonnet o el primero que haya. */
  modelo?: string
  esfuerzo?: string
  /** La voz del video (`lineaVoz`, `shared/voz.ts`); sin ella, la de la marca o la del estilo. */
  voz?: string
}

export type EstadoTurno = 'hilo' | 'subiendo' | 'programado' | 'borrador' | 'error'

/** Un video del piloto: su horario, el hilo que lo hace y lo que pasó al publicarlo. */
export interface TurnoPiloto {
  /** El boleto con que el hilo entrega su video (`publicar.mjs --piloto`): de un solo uso, vale para este horario. */
  id: string
  /** `AAAA-MM-DD` y `HH:MM` en la zona de la agencia, y el instante en ISO. */
  fecha: string
  hora: string
  instante: string
  sesion?: string
  cardId: string
  gancho: string
  pilar: string
  creado: number
  estado: EstadoTurno
  /** Si se publicó con `scheduled` (los dos interruptores y `autopublicar`) o quedó en borrador. */
  post?: { id: string; estado: string; fecha?: string | null }
  advertencias?: string[]
  error?: string
}

/** Lo que enseña la sección «Contenido automático». */
export interface VistaPiloto {
  proyecto: string
  local: PilotoLocal
  /** Sin perfil: el motivo (backend viejo, sin llave, red…). */
  aviso?: string
  /** `backend_viejo`: vid-api aún no tiene `perfil`; el piloto se queda apagado. */
  codigo?: string
  perfil?: PerfilAgencia
  /** Si el piloto puede trabajar ahora: los dos interruptores. */
  encendido: boolean
  zona: string
  /** Los horarios de hoy y de mañana, con lo que tiene cada uno. */
  proximos: { fecha: string; hora: string; instante: string; estado: 'libre' | 'pasado' | EstadoTurno; turno?: string }[]
  ultimos: TurnoPiloto[]
  /** El estilo con que saldrán (la card que le toca a `estilo_video`). */
  estilo?: CardResumen
  estilos: CardResumen[]
}

export interface CardResumen {
  id: string
  title: string
}
