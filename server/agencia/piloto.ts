import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  validarContenido,
  validarPost,
  type CardResumen,
  type ContenidoAgencia,
  type EstadoPost,
  type PerfilAgencia,
  type PilotoLocal,
  type TurnoPiloto,
  type VistaPiloto
} from '../../shared/agencia.ts'
import type { Card, Model } from '../../shared/types.ts'
import { lineaVoz } from '../../shared/voz.ts'
import { guardar } from '../disco.ts'
import { esBackendViejo, type PostAEnviar } from './vid-api.ts'

/**
 * «Piloto automático» de contenido por agencia (v!d 1.1.6). Cada 10 minutos mira los proyectos con llave de agencia
 * propia (la por defecto no cuenta: la compartirían varios proyectos y cada video saldría dos veces) y, si los dos
 * interruptores están encendidos, hace los videos que faltan para hoy:
 *
 * - `perfil` de vid-api (1.3.0) trae el negocio, la configuración de contenido de la agencia (`activo`, `autopublicar`,
 *   `videos_por_dia`, `horarios` en su `zona_horaria`, `redes`, `estilo_video`, `privacidad`…) y el brief de su nicho.
 *   Una vid-api anterior contesta `op_desconocida`: el piloto se queda apagado y la sección lo dice.
 * - Por cada horario de hoy que sigue libre (y está a más de `MARGEN` de ahora) crea UN hilo, un video por hilo, del
 *   estilo de `estilo_video` (`cardDelEstilo`). Todos van como un lote (`sessions.crearLote`): esperan su turno y el
 *   repartidor arranca solo los que caben en la máquina. Si un hilo del piloto de ese proyecto aún trabaja o espera, no
 *   se crea ninguno más.
 * - El primer mensaje lleva el brief del nicho, la regla de oro (no vender de frente), el gancho y el pilar elegidos
 *   (rotan sin repetir los últimos: `elegirRotando`) y cómo entregar el video al acabar el render.
 * - Lo que se hizo se guarda en `<dir>/<proyecto>.json` (`guardar()`): el interruptor local, el modelo y la voz, y los
 *   turnos con su horario, su hilo, el gancho y el pilar, y cómo acabó la publicación.
 *
 * La confirmación. Programar o publicar por vid-api exige siempre que una persona confirme: `POST publicar` y
 * `posts/editar` piden `confirmado: true`, que solo manda el diálogo de Social Media, y `social-base/publicar.mjs`
 * crea siempre borradores. Para el piloto, la confirmación es el doble interruptor: el `activo` de la agencia en el
 * servidor (`agencia_contenido`, lo cambia la agencia o su staff) Y el «Piloto automático» de este proyecto en Opciones →
 * Agencia (apagado por defecto). Se implementa así, y solo así:
 *
 * 1. Cada turno nace con un boleto al azar (`TurnoPiloto.id`), de un solo uso y atado a su proyecto y a su horario. El
 *    hilo lo recibe en su primer mensaje y entrega con `publicar.mjs --piloto <boleto>`, que llama a
 *    `POST /api/agencia/piloto/entregar` con el token de los procesos locales (cabecera `x-vid-token`, nunca la cookie
 *    de la ventana).
 * 2. `entregar` vuelve a leer los dos interruptores en ese momento (`estadoDelPost`): con uno apagado no se sube nada.
 *    Con los dos, el post va `scheduled` en el horario del turno si `autopublicar`, o en `draft` (queda en el Social
 *    Planner de app.kold.gold para aprobarlo) si no. Siempre `cuentas: "todas"` (las de `redes_objetivo`), tipo `reel`.
 * 3. Nada más usa este camino: `publicar`, `posts/editar` y `publicar.mjs` sin `--piloto` siguen pidiendo la
 *    confirmación de siempre, y un boleto usado, de otro proyecto o inventado no vale.
 */

/** Cada cuánto mira los proyectos. */
export const CADA = 10 * 60_000
/** Un horario a menos de esto ya no da tiempo de hacer el video: se salta. */
export const MARGEN = 30 * 60_000
/** Lo más pronto que se programa un video que llegó tarde a su horario. */
const MINIMO_FUTURO = 10 * 60_000
/** Cuántos turnos se guardan por proyecto. */
const TURNOS = 200
/** La zona si la agencia no trae una que sirva. */
export const ZONA_POR_DEFECTO = 'America/Mexico_City'
/** Cómo se rellena el día si `videos_por_dia` pasa de los horarios que hay. */
const RELLENO = ['13:00', '16:00', '21:00', '08:00', '11:00', '18:00', '15:00', '20:00', '09:00', '12:00', '17:00', '22:00']
const IDIOMAS: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' }

export interface ClientePiloto {
  perfil(): Promise<PerfilAgencia>
  guardarContenido(c: Partial<ContenidoAgencia>): Promise<ContenidoAgencia>
  subirArchivo(ruta: string): Promise<{ id: string; url: string }>
  crearPost(p: PostAEnviar): Promise<{ post: { id: string; estado: string; fecha?: string | null }; advertencias?: string[] }>
}

export interface HilosPiloto {
  /** Crea los hilos (un lote, un video por hilo) y devuelve sus ids en el mismo orden. */
  crear(p: { proyecto: string; cardId: string; modelo: string; esfuerzo?: string; videos: { title: string; text: string }[] }): string[]
  /** Si el hilo trabaja o espera su turno; `undefined` si ya no existe. */
  trabajando(id: string): boolean | undefined
}

export interface OpcionesPiloto {
  dir: string
  skills: string
  /** Los proyectos que tienen llave de agencia propia. */
  proyectosConLlave(): string[]
  existe(proyecto: string): boolean
  cliente(proyecto: string): ClientePiloto
  cards(): Card[]
  modelos(): Model[]
  hilos: HilosPiloto
  ahora?: () => number
}

interface Archivo extends PilotoLocal {
  turnos: TurnoPiloto[]
}

/* ---------- Horas en la zona de la agencia ---------- */

export function zonaValida(tz?: string | null): string {
  if (!tz) return ZONA_POR_DEFECTO
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return ZONA_POR_DEFECTO
  }
}

const formatos = new Map<string, Intl.DateTimeFormat>()
function partes(t: number, tz: string) {
  let f = formatos.get(tz)
  if (!f) formatos.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })))
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

/** El día (`AAAA-MM-DD`) y la hora (`HH:MM`) de un instante en una zona. */
export function enZona(t: number, tz: string): { fecha: string; hora: string } {
  const p = partes(t, tz)
  const dos = (x: number) => String(x).padStart(2, '0')
  return { fecha: `${p.y}-${dos(p.m)}-${dos(p.d)}`, hora: `${dos(p.h)}:${dos(p.mi)}` }
}

/** El instante (ms) de un día y una hora en una zona, con su horario de verano. */
export function instanteDe(fecha: string, hora: string, tz: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, m - 1, d, h, mi)
  const desfase = (t: number) => {
    const p = partes(t, tz)
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
  }
  let t = comoUtc - desfase(comoUtc)
  const otro = desfase(t)
  if (comoUtc - otro !== t) t = comoUtc - otro
  return t
}

export function sumarDia(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/* ---------- Qué toca hoy ---------- */

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))

/** Los horarios de un día: los de la agencia, tantos como `videos_por_dia` (si faltan, se rellena lejos de los que hay). */
export function horariosDelDia(c: Pick<ContenidoAgencia, 'horarios' | 'videos_por_dia'>): string[] {
  const n = Math.min(6, Math.max(1, c.videos_por_dia || 1))
  const lista = [...new Set(c.horarios)].sort().slice(0, n)
  for (const h of RELLENO) {
    if (lista.length >= n) break
    if (lista.every((x) => Math.abs(minutos(x) - minutos(h)) >= 60)) lista.push(h)
  }
  return lista.sort()
}

export interface Horario {
  fecha: string
  hora: string
  instante: number
}

/** Los horarios de hoy que siguen libres (sin turno) y aún dan tiempo: cuántos videos faltan para hoy. */
export function faltanHoy(c: Pick<ContenidoAgencia, 'horarios' | 'videos_por_dia'>, turnos: Pick<TurnoPiloto, 'fecha' | 'hora'>[], ahora: number, tz: string): Horario[] {
  const { fecha } = enZona(ahora, tz)
  const tomados = new Set(turnos.map((t) => `${t.fecha} ${t.hora}`))
  return horariosDelDia(c)
    .map((hora) => ({ fecha, hora, instante: instanteDe(fecha, hora, tz) }))
    .filter((h) => !tomados.has(`${h.fecha} ${h.hora}`) && h.instante >= ahora + MARGEN)
}

/** El siguiente horario libre, de hoy o de los dos días que siguen («Hacer uno ahora»). */
export function siguienteLibre(c: Pick<ContenidoAgencia, 'horarios' | 'videos_por_dia'>, turnos: Pick<TurnoPiloto, 'fecha' | 'hora'>[], ahora: number, tz: string): Horario | undefined {
  const tomados = new Set(turnos.map((t) => `${t.fecha} ${t.hora}`))
  const hoy = enZona(ahora, tz).fecha
  for (let dia = 0; dia < 3; dia++) {
    const fecha = sumarDia(hoy, dia)
    for (const hora of horariosDelDia(c)) {
      const instante = instanteDe(fecha, hora, tz)
      if (!tomados.has(`${fecha} ${hora}`) && instante >= ahora + MARGEN) return { fecha, hora, instante }
    }
  }
  return undefined
}

/**
 * El que toca de una lista: el que nunca se usó, o el que se usó hace más tiempo. `usados` va del más viejo al más
 * nuevo. Así no se repite ninguno de los últimos mientras haya otro.
 */
export function elegirRotando(lista: string[], usados: string[]): string {
  const opciones = [...new Set(lista.filter(Boolean))]
  if (!opciones.length) return ''
  let mejor = opciones[0]
  let cuando = Infinity
  for (const o of opciones) {
    const i = usados.lastIndexOf(o)
    if (i < cuando) (mejor = o), (cuando = i)
  }
  return mejor
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/**
 * La card de `estilo_video`: la de ese id, la `video-<estilo>` (`explicativo` → `video-explicativo`) o la de ese nombre.
 * Solo estilos de video (etapas con `fase`). Si no hay, la del explicativo o el primer estilo de video.
 */
export function cardDelEstilo(cards: Card[], estilo: string): Card | undefined {
  const videos = cards.filter((c) => c.etapas?.some((e) => e.fase))
  const e = sinAcentos(estilo)
  return (
    videos.find((c) => c.id === estilo) ??
    videos.find((c) => c.id === `video-${e}`) ??
    videos.find((c) => sinAcentos(c.title) === e || sinAcentos(c.title) === `video ${e}`) ??
    videos.find((c) => c.id === 'video-explicativo') ??
    videos[0]
  )
}

/** Un modelo de Claude Sonnet, o de Claude, o el primero. */
export function modeloPorDefecto(modelos: Model[]): Model | undefined {
  return modelos.find((m) => /sonnet/i.test(m.id) && !m.id.includes(':')) ?? modelos.find((m) => !m.id.includes(':')) ?? modelos[0]
}

/**
 * La confirmación del piloto: el doble interruptor. Con los dos encendidos, `scheduled` si la agencia autopublica o
 * `draft` si no; con uno apagado, `null` (no se publica nada).
 */
export function estadoDelPost(local: Pick<PilotoLocal, 'encendido'>, contenido: Pick<ContenidoAgencia, 'activo' | 'autopublicar'>): EstadoPost | null {
  if (local.encendido !== true || contenido.activo !== true) return null
  return contenido.autopublicar ? 'scheduled' : 'draft'
}

/** Las cuentas a las que va: las de `redes_objetivo` (o todas, si viene vacío), con su familia como plataforma. */
export function cuentasObjetivo(perfil: PerfilAgencia) {
  const objetivo = new Set(perfil.redes_objetivo)
  return perfil.cuentas.map((c) => ({ ...c, plataforma: c.familia ?? c.plataforma })).filter((c) => !objetivo.size || objetivo.has(c.plataforma))
}

/** Los detalles de TikTok y YouTube según la privacidad de la agencia. */
export function detallesDe(privacidad: ContenidoAgencia['privacidad'], redes: Set<string>, titulo: string) {
  const publico = privacidad !== 'privado'
  return {
    ...(redes.has('tiktok') ? { tiktok: { privacyLevel: publico ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY' } } : {}),
    ...(redes.has('youtube') ? { youtube: { title: titulo.slice(0, 100), privacyLevel: publico ? 'public' : 'private' } } : {})
  }
}

const lista = (titulo: string, xs: string[] | undefined) => (xs?.length ? `- ${titulo}:\n${xs.map((x) => `  - ${x}`).join('\n')}` : '')

/** El primer mensaje de un video del piloto. */
export function primerMensaje(p: {
  perfil: PerfilAgencia
  card: Pick<Card, 'voz'>
  local: PilotoLocal
  turno: Pick<TurnoPiloto, 'id' | 'fecha' | 'hora' | 'gancho' | 'pilar'>
  proyecto: string
  zona: string
  publicar: string
}): string {
  const { perfil, turno } = p
  const c = perfil.contenido
  const b = perfil.brief
  const n = perfil.negocio
  const idioma = IDIOMAS[c.idioma] ?? c.idioma
  const negocio = [n.giro, n.nicho && n.nicho !== n.giro ? n.nicho : '', [n.ciudad, n.pais].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
  const cta = c.cta ?? b?.cta
  const redes = perfil.redes_objetivo.length ? perfil.redes_objetivo.join(', ') : 'todas las conectadas'
  const voz = p.local.voz
    ? lineaVoz(p.card, p.local.voz)
    : p.card.voz === false || p.card.voz?.propia
      ? ''
      : 'Voz: genérala tú; nadie la va a mandar (es el piloto automático). Usa la voz que diga la memoria del proyecto o tu skill y, si no dicen ninguna, una de AI Studio que vaya con el tono (cómo, en video-base/VOZ.md).'
  const destino = c.autopublicar
    ? `v!d lo sube a la biblioteca de GHL y lo programa para el ${turno.fecha} a las ${turno.hora} (${p.zona}) en todas las redes conectadas de la agencia (${redes}).`
    : `v!d lo sube a la biblioteca de GHL y lo deja en borrador, para el ${turno.fecha} a las ${turno.hora} (${p.zona}), en el Social Planner de app.kold.gold: la agencia lo aprueba ahí.`
  return [
    `Un video vertical (9:16) del piloto automático de contenido de v!d para «${perfil.agencia.nombre}»${negocio ? ` (${negocio})` : ''}. Nadie lo revisa mientras lo haces: decide tú y no preguntes; si algo falta, elige lo más sensato y sigue.`,
    'Regla de oro: no vendas de frente. El video explica, emociona o entretiene a quien tiene ese problema; la marca sale sutil, solo al final (una línea o el logo, junto a la llamada a la acción). Nada de precios, promociones ni «contáctanos» en medio.',
    `Gancho (los primeros 3 segundos y el texto del primer cuadro): ${turno.gancho || 'elígelo tú de los dolores del brief'}`,
    `Pilar: ${turno.pilar || 'educar'}`,
    [`Idioma: ${idioma}.`, c.tono ? `Tono: ${c.tono}.` : '', cta ? `Llamada a la acción (al final, suave): ${cta}` : ''].filter(Boolean).join(' '),
    b
      ? [
          `Brief del nicho «${b.nombre}» (${b.slug}, ${b.idioma}):`,
          b.resumen ? `- Resumen: ${b.resumen}` : '',
          b.promesa ? `- Promesa: ${b.promesa}` : '',
          lista('Dolores', b.dolores),
          lista('Momentos del cliente', b.momentos),
          lista('Lo que mide', b.kpis),
          lista('Preguntas frecuentes', b.preguntas),
          lista('Cumplimiento (no lo rompas)', b.cumplimiento),
          lista('Otros ganchos (no uses estos en este video)', b.ganchos.filter((g) => g !== turno.gancho))
        ]
          .filter(Boolean)
          .join('\n')
      : 'Brief del nicho: no hay uno para este giro. Sácalo de la memoria del proyecto y del sitio de la agencia, sin inventar datos.',
    c.notas ? `Notas de la agencia: ${c.notas}` : '',
    'No inventes datos: ningún número, cliente, testimonio o resultado que no venga de aquí o de la memoria del proyecto.',
    'Formato: vertical',
    voz,
    [
      'Al terminar el render (el video vertical final, con su portada):',
      `1. Escribe en tu carpeta (la de la línea Carpeta:) el archivo publicar/caption.txt con el texto de la publicación, en ${idioma}: el gancho, dos a cuatro líneas que aporten, la llamada a la acción y de 3 a 5 hashtags (social-base/references/voice-rules.md). Hasta 2,200 caracteres.`,
      `2. Corre: node "${p.publicar}" --piloto ${turno.id} --proyecto ${p.proyecto} --medio "<ruta absoluta del mp4 final>" --texto-archivo "<ruta absoluta de caption.txt>" --titulo "<título para YouTube, hasta 100 caracteres>"`,
      `   ${destino} No uses crear_post, publicar.mjs sin --piloto ni otra vía: el boleto ${turno.id} vale solo para este video y este horario, una vez.`,
      '3. Si falla, di el error en una línea; reinténtalo una sola vez.'
    ].join('\n'),
    `Piloto: ${turno.id} · ${turno.fecha} ${turno.hora} (${p.zona})`
  ]
    .filter(Boolean)
    .join('\n\n')
}

/* ---------- El piloto ---------- */

const VIDEO = /\.(mp4|mov|m4v|webm)$/i

export function piloto(o: OpcionesPiloto) {
  const ahora = o.ahora ?? Date.now
  const perfiles = new Map<string, { t: number; perfil?: PerfilAgencia; aviso?: string; codigo?: string }>()
  const ocupados = new Set<string>()
  mkdirSync(o.dir, { recursive: true })

  const rutaDe = (proyecto: string) => join(o.dir, `${proyecto.replace(/[^\w-]/g, '')}.json`)
  function leer(proyecto: string): Archivo {
    try {
      const a = JSON.parse(readFileSync(rutaDe(proyecto), 'utf8')) as Partial<Archivo>
      return { ...a, encendido: a.encendido === true, turnos: Array.isArray(a.turnos) ? a.turnos : [] }
    } catch {
      return { encendido: false, turnos: [] }
    }
  }
  function escribir(proyecto: string, a: Archivo) {
    a.turnos = a.turnos.slice(-TURNOS)
    guardar(rutaDe(proyecto), JSON.stringify(a, null, 2) + '\n')
  }
  const local = ({ turnos: _, ...l }: Archivo): PilotoLocal => l

  /** El perfil, con un minuto de memoria (o fresco). Si falla, el aviso que lo dice. */
  async function perfilDe(proyecto: string, fresco = false) {
    const ya = perfiles.get(proyecto)
    if (ya && !fresco && ahora() - ya.t < 60_000) return ya
    let r: { t: number; perfil?: PerfilAgencia; aviso?: string; codigo?: string }
    try {
      r = { t: ahora(), perfil: await o.cliente(proyecto).perfil() }
    } catch (e) {
      r = esBackendViejo(e)
        ? { t: ahora(), codigo: 'backend_viejo', aviso: 'El servidor de Kold.Gold aún no tiene el contenido automático (vid-api 1.3.0, operación «perfil»). El piloto se queda apagado hasta que lo actualicen.' }
        : { t: ahora(), codigo: (e as { code?: string }).code ?? 'error', aviso: e instanceof Error ? e.message : String(e) }
    }
    perfiles.set(proyecto, r)
    return r
  }

  /**
   * Crea los videos que faltan para hoy (o, con `uno`, el del siguiente horario libre). Devuelve cuántos hizo y, si
   * ninguno, por qué.
   */
  async function revisarProyecto(proyecto: string, opciones: { uno?: boolean } = {}): Promise<{ hechos: number; motivo?: string }> {
    if (ocupados.has(proyecto)) return { hechos: 0, motivo: 'ocupado' }
    ocupados.add(proyecto)
    try {
      const a = leer(proyecto)
      if (!a.encendido) return { hechos: 0, motivo: 'apagado_local' }
      const p = await perfilDe(proyecto, true)
      if (!p.perfil) return { hechos: 0, motivo: p.codigo ?? 'error' }
      const perfil = p.perfil
      const c = perfil.contenido
      if (!c.activo) return { hechos: 0, motivo: 'apagado_servidor' }
      if (!opciones.uno && a.turnos.some((t) => t.sesion && o.hilos.trabajando(t.sesion) === true)) return { hechos: 0, motivo: 'trabajando' }
      const zona = zonaValida(perfil.negocio.zona_horaria)
      const horarios = opciones.uno ? [siguienteLibre(c, a.turnos, ahora(), zona)].filter((h): h is Horario => !!h) : faltanHoy(c, a.turnos, ahora(), zona)
      if (!horarios.length) return { hechos: 0, motivo: 'al_dia' }
      const card = cardDelEstilo(o.cards(), c.estilo_video)
      if (!card) throw new Error('No hay ningún estilo de video para el piloto.')
      const modelo = a.modelo ?? modeloPorDefecto(o.modelos())?.id
      if (!modelo) throw new Error('No hay ningún modelo disponible para los hilos del piloto.')
      const ganchos = perfil.brief?.ganchos.length ? perfil.brief.ganchos : (perfil.brief?.dolores ?? [])
      const pilares = c.pilares.length ? c.pilares : (perfil.brief?.pilares ?? [])
      const usadosG = a.turnos.map((t) => t.gancho)
      const usadosP = a.turnos.map((t) => t.pilar)
      const nuevos: TurnoPiloto[] = horarios.map((h) => {
        const gancho = elegirRotando(ganchos, usadosG)
        const pilar = elegirRotando(pilares, usadosP)
        usadosG.push(gancho)
        usadosP.push(pilar)
        return { id: randomBytes(12).toString('hex'), fecha: h.fecha, hora: h.hora, instante: new Date(h.instante).toISOString(), cardId: card.id, gancho, pilar, creado: ahora(), estado: 'hilo' }
      })
      const publicar = join(o.skills, 'social-base', 'publicar.mjs')
      const videos = nuevos.map((t) => ({
        title: `Piloto · ${t.hora} · ${t.gancho || perfil.agencia.nombre}`.slice(0, 80),
        text: primerMensaje({ perfil, card, local: local(a), turno: t, proyecto, zona, publicar })
      }))
      const ids = o.hilos.crear({ proyecto, cardId: card.id, modelo, esfuerzo: a.esfuerzo, videos })
      nuevos.forEach((t, i) => (t.sesion = ids[i]))
      a.turnos.push(...nuevos)
      escribir(proyecto, a)
      return { hechos: nuevos.length }
    } finally {
      ocupados.delete(proyecto)
    }
  }

  async function revisar() {
    for (const proyecto of o.proyectosConLlave()) {
      if (!o.existe(proyecto)) continue
      try {
        await revisarProyecto(proyecto)
      } catch (e) {
        console.error(`Piloto de ${proyecto}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  /** Lo que enseña la sección «Contenido automático». */
  async function vista(proyecto: string, fresco = false): Promise<VistaPiloto> {
    const a = leer(proyecto)
    const p = await perfilDe(proyecto, fresco)
    const zona = zonaValida(p.perfil?.negocio.zona_horaria)
    const cards = o.cards().filter((c) => c.etapas?.some((e) => e.fase))
    const resumen = (c: Card): CardResumen => ({ id: c.id, title: c.title })
    const card = p.perfil ? cardDelEstilo(cards, p.perfil.contenido.estilo_video) : undefined
    const proximos: VistaPiloto['proximos'] = []
    if (p.perfil) {
      const hoy = enZona(ahora(), zona).fecha
      for (const fecha of [hoy, sumarDia(hoy, 1)]) {
        for (const hora of horariosDelDia(p.perfil.contenido)) {
          const instante = instanteDe(fecha, hora, zona)
          const t = a.turnos.findLast((x) => x.fecha === fecha && x.hora === hora)
          proximos.push({ fecha, hora, instante: new Date(instante).toISOString(), estado: t ? t.estado : instante < ahora() + MARGEN ? 'pasado' : 'libre', ...(t ? { turno: t.id } : {}) })
        }
      }
    }
    return {
      proyecto,
      local: local(a),
      ...(p.aviso ? { aviso: p.aviso } : {}),
      ...(p.codigo ? { codigo: p.codigo } : {}),
      ...(p.perfil ? { perfil: p.perfil } : {}),
      encendido: !!p.perfil && estadoDelPost(a, p.perfil.contenido) !== null,
      zona,
      proximos,
      ultimos: a.turnos.slice(-10).reverse(),
      ...(card ? { estilo: resumen(card) } : {}),
      estilos: cards.map(resumen)
    }
  }

  /** El interruptor local, el modelo y la voz. */
  function configurar(proyecto: string, cambios: Partial<PilotoLocal>) {
    const a = leer(proyecto)
    if ('encendido' in cambios) a.encendido = cambios.encendido === true
    for (const k of ['modelo', 'esfuerzo', 'voz'] as const) {
      if (!(k in cambios)) continue
      const v = cambios[k]
      if (typeof v === 'string' && v.trim()) a[k] = v.trim()
      else delete a[k]
    }
    escribir(proyecto, a)
    return local(a)
  }

  /** Cambia la configuración de contenido de la agencia en el servidor (`guardar_contenido`). */
  async function contenido(proyecto: string, cambios: Partial<ContenidoAgencia>) {
    const permitidos = ['activo', 'autopublicar', 'videos_por_dia', 'redes', 'horarios', 'idioma', 'pilares', 'tono', 'cta', 'estilo_video', 'privacidad', 'notas'] as const
    const limpio = Object.fromEntries(permitidos.filter((k) => k in cambios).map((k) => [k, cambios[k]])) as Partial<ContenidoAgencia>
    if (limpio.horarios) limpio.horarios = [...new Set(limpio.horarios)].sort()
    const errores = validarContenido(limpio)
    if (errores.length) throw new Error(errores.join(' '))
    try {
      await o.cliente(proyecto).guardarContenido(limpio)
    } catch (e) {
      if (esBackendViejo(e)) throw new Error('El servidor de Kold.Gold aún no tiene el contenido automático (vid-api 1.3.0): no se pudo guardar.')
      throw e
    }
    perfiles.delete(proyecto)
    return vista(proyecto, true)
  }

  /**
   * Lo que entrega el hilo de un turno (`publicar.mjs --piloto`): sube el video y crea el post, de fondo. Devuelve en
   * seguida; el hilo pregunta con `entrega`.
   */
  async function entregar(d: { ticket?: string; proyecto?: string; ruta?: string; texto?: string; titulo?: string }) {
    const proyecto = String(d.proyecto ?? '')
    if (!/^[\w-]+$/.test(proyecto) || !o.existe(proyecto)) throw new Error('Ese proyecto no existe.')
    const a = leer(proyecto)
    const turno = a.turnos.find((t) => t.id === d.ticket)
    if (!turno) throw new Error('Ese boleto del piloto no existe en este proyecto.')
    if (turno.estado !== 'hilo') throw new Error('Ese boleto del piloto ya se usó.')
    const ruta = d.ruta
    if (typeof ruta !== 'string' || !isAbsolute(ruta) || !VIDEO.test(ruta) || !existsSync(ruta) || !statSync(ruta).isFile()) throw new Error('Pasa la ruta absoluta del video final (mp4, mov o webm).')
    const texto = String(d.texto ?? '').trim()
    if (!texto) throw new Error('Falta el texto de la publicación.')
    // Los dos interruptores, otra vez, en este momento.
    const p = await perfilDe(proyecto, true)
    if (!p.perfil) throw new Error(p.aviso ?? 'No se pudo leer el perfil de la agencia.')
    const estado = estadoDelPost(a, p.perfil.contenido)
    if (!estado) throw new Error('El piloto de este proyecto está apagado (aquí o en el servidor): no se publicó nada.')
    const perfil = p.perfil
    const cuentas = cuentasObjetivo(perfil)
    if (!cuentas.length) throw new Error('La agencia no tiene redes conectadas para el piloto en el Social Planner.')
    turno.estado = 'subiendo'
    delete turno.error
    escribir(proyecto, a)
    const terminar = (cambios: Partial<TurnoPiloto>) => {
      const b = leer(proyecto)
      const t = b.turnos.find((x) => x.id === turno.id)
      if (!t) return
      Object.assign(t, cambios)
      escribir(proyecto, b)
    }
    void (async () => {
      try {
        const media = await o.cliente(proyecto).subirArchivo(ruta)
        const redes = new Set(cuentas.map((c) => c.plataforma))
        const titulo = (d.titulo?.trim() || turno.gancho || texto.split('\n')[0]).slice(0, 100)
        const fecha = new Date(Math.max(Date.parse(turno.instante), ahora() + MINIMO_FUTURO)).toISOString()
        const post: PostAEnviar = { estado, cuentas: 'todas', tipo: 'reel', texto, media: [{ url: media.url, tipo: 'video/mp4' }], fecha, detalles: detallesDe(perfil.contenido.privacidad, redes, titulo) }
        const errores = validarPost({ ...post, cuentas: cuentas.map((c) => c.id), tipoUI: 'reel' }, cuentas, ahora())
        if (errores.length) throw new Error(errores.join(' '))
        const r = await o.cliente(proyecto).crearPost(post)
        terminar({ estado: estado === 'scheduled' ? 'programado' : 'borrador', post: { id: r.post.id, estado: r.post.estado, fecha: r.post.fecha ?? fecha }, ...(r.advertencias?.length ? { advertencias: r.advertencias } : {}) })
      } catch (e) {
        terminar({ estado: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return { ok: true, ticket: turno.id, estado: 'subiendo' as const, destino: estado }
  }

  function entrega(proyecto: string, ticket: string) {
    const t = leer(proyecto).turnos.find((x) => x.id === ticket)
    if (!t) throw new Error('Ese boleto del piloto no existe en este proyecto.')
    return t
  }

  let reloj: NodeJS.Timeout | undefined
  /** Empieza a mirar: al minuto de arrancar y cada `CADA`. */
  function arrancar() {
    if (reloj) return
    setTimeout(() => void revisar(), 60_000).unref()
    reloj = setInterval(() => void revisar(), CADA)
    reloj.unref()
  }

  return { revisar, revisarProyecto, vista, configurar, contenido, entregar, entrega, arrancar, leer }
}

export type Piloto = ReturnType<typeof piloto>
