/**
 * v!d 1.1 — Historial de Sloth: trae los hilos que se hicieron en el Sloth original (su carpeta de app, con `data` y
 * `trabajo`) a los datos de v!d. Todo se COPIA: el Sloth de origen no se mueve ni se borra.
 *
 * - Hilos (`data/sessions/<id>.json` y `.jsonl`), sin pisar ids que v!d ya tenga (si choca, el importado se renombra).
 * - Sus carpetas de trabajo (`<sloth>/trabajo/<card>`) a la de v!d, sin pisar archivos que ya estén.
 * - `miniaturas`, `previas` y `attachments` de `data` (se regeneran si hace falta: van por ruta).
 * - En los `.json` y `.jsonl` copiados, las rutas viejas (trabajo, attachments, skills) pasan a las de v!d.
 * - Cada hilo queda en su proyecto y su serie (`asignar`), y se crean las series que falten (`series`).
 * - La sesión de Claude Code del hilo, si está en la configuración de Claude de Sloth, se copia a la de v!d en la carpeta
 *   de `projects` del cwd nuevo: así el hilo se puede continuar. Si no está, el hilo queda como historial: al escribirle
 *   se abre otra sesión que empieza con el resumen del hilo (`resumir`).
 * - Deja `data/importado-de-sloth.json` con lo importado: correrlo otra vez no duplica nada.
 *
 * Lo llama `POST /api/importar/sloth` (Opciones → Historial de Sloth).
 */
import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import type { SessionMeta } from '../shared/types.ts'
import { proyectoClaude } from './migrar.ts'

/** El archivo que deja la importación en `data` de v!d. */
export const MARCA_IMPORTAR = 'importado-de-sloth.json'

/** Dónde buscar el Sloth original si no se dice cuál. Gana el primero que tenga hilos. */
export function slothDetectado(): string | null {
  const local = process.env.LOCALAPPDATA || join(homedir(), '.local', 'share')
  const candidatos = [
    process.env.SLOTH_APP,
    join(local, 'Programs', 'sloth', 'app'),
    join(local, 'Programs', 'Sloth', 'app'),
    'C:\\sloth\\dist\\instalador\\win-unpacked\\app',
    join(homedir(), 'sloth', 'dist', 'instalador', 'win-unpacked', 'app')
  ].filter((c): c is string => !!c)
  return candidatos.find((c) => existsSync(join(c, 'data', 'sessions'))) ?? null
}

export interface SerieNueva {
  proyecto: string
  id: string
  nombre: string
  memoria: string
}

export interface OpcionesImportar {
  /** La carpeta de app de Sloth: la que tiene `data` y `trabajo`. */
  sloth: string
  /** `data` de v!d. */
  datos: string
  /** La carpeta de trabajo de v!d (`carpetaTrabajo`). */
  trabajo: string
  /** Las skills de v!d: las rutas a las skills de Sloth pasan aquí. */
  skills?: string
  /** Las carpetas `projects` de Claude donde Sloth guardó sus sesiones, por orden. */
  claudeOrigen?: string[]
  /** La carpeta `projects` de Claude de v!d (`CLAUDE_CONFIG_DIR/projects`). */
  claudeDestino: string
  /** El proyecto y la serie de cada hilo. Solo se asignan si existen en `data/proyectos`. */
  asignar?: (meta: SessionMeta) => { proyecto?: string; serie?: string } | undefined
  /** Series que se crean (si su proyecto existe y ellas no) antes de asignar. */
  series?: SerieNueva[]
}

export interface HiloImportado {
  /** El id en Sloth y el que tiene en v!d (el mismo, salvo que chocara). */
  sloth: string
  id: string
  title: string
  cwd: string
  carpeta?: string
  proyecto?: string
  serie?: string
  /** Si su sesión de Claude Code se copió: se continúa como siempre. Si no, queda como historial. */
  continuable: boolean
  nota?: string
}

export interface ResultadoImportar {
  origen: string
  /** Los que se importaron en esta vuelta. */
  hilos: HiloImportado[]
  /** Los que ya estaban importados de antes. */
  yaEstaban: number
  /** Las carpetas de trabajo copiadas (`<card>`), con sus mp4 y su tamaño en v!d. */
  carpetas: { card: string; mp4: number; bytes: number }[]
  series: string[]
  adjuntos: number
  /** Los enlaces de la copia que apuntaban a Sloth y ahora apuntan a v!d. */
  enlaces: number
  errores: string[]
}

interface Marca {
  origen: string
  hilos: Record<string, HiloImportado & { fecha: string }>
}

/** El reparto de Alan: todo a Kold.Gold salvo el sketch de Tazkore IA, con sus series. */
export function asignacionAlan(meta: SessionMeta): { proyecto?: string; serie?: string } {
  const t = meta.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/tazkore|roast/.test(t)) return { proyecto: 'tazkore-ia' }
  if (/radar/.test(t)) return { proyecto: 'kold-gold', serie: 'kold-gold-radar' }
  if (/^5 datos/.test(t)) return { proyecto: 'kold-gold', serie: '5-datos' }
  if (/^estafas/.test(t)) return { proyecto: 'kold-gold', serie: 'estafas' }
  return { proyecto: 'kold-gold' }
}

/** Las dos series de diez videos que Alan hizo en Sloth para Kold.Gold. `estafas` es la del banco de video-base. */
export const SERIES_SLOTH: SerieNueva[] = [
  {
    proyecto: 'kold-gold',
    id: '5-datos',
    nombre: '5 datos que te harán reír de la logística',
    memoria: `# 5 datos que te harán reír de la logística (Kold.Gold)

Serie de diez episodios verticales para TikTok con cinco datos curiosos y reales de la logística, contados con humor.
Se hicieron en Sloth los episodios 01 (Lo que el mar perdió y devolvió), 02 (Barcos atorados: seis días y ocho años) y
03 (Aviones ballena, pandas y flores); su carpeta es \`5-datos-0X-10\`.

## Formato

- Título del hilo: «5 Datos 0X/10 — <tema>».
- Gancho con el dato más llamativo, luego «Episodio N de cinco datos que te harán reír de la logística».
- Cinco datos numerados (uno a cinco), cada uno con su año o su cifra y un remate corto.
- Adelanto del siguiente: «En el episodio N+1: …».
- La zorra anfitriona siempre en una esquina inferior y siempre en movimiento; modelos 3D de la biblioteca y nuevos con
  el logo original de Kold Gold y su paleta; rótulo fijo de la serie.

## Tema

Historias reales y curiosas de carga, barcos, aviones, contenedores y aduanas. Un tema por episodio que una los cinco
datos. Que no se repita uno ya hecho.

## Reglas

- Cada dato se comprueba con su fuente antes de generar la voz.
- No vender de frente: Kold Gold solo en el puente final.

## Cierre

Un puente del tema a lo que hace Kold Gold (p. ej. «a tu carga la vemos en vivo, con GPS y temperatura, en la Torre de
Control de Kold Gold») y: «Cotiza hoy en kold punto gold. Kold Gold: logística integrada global.»
`
  },
  {
    proyecto: 'kold-gold',
    id: 'estafas',
    nombre: 'Desmontando estafas',
    memoria: `# Desmontando estafas (Kold.Gold)

Serie de diez casos verticales para TikTok: una estafa de paquetería, aduanas o logística, desarmada para que quien lo
ve la reconozca. Sigue la serie «estafas» de video-base. Se hicieron en Sloth los casos 01 («Tu paquete no llegó»: el
SMS trampa), 02 (La llamada que solo pide «un codiguito») y 03 (La «aduana» que te cobra por correo); su carpeta es
\`estafas-0X-10-<palabra>\`.

## Formato

- Título del hilo: «Estafas 0X/10 — <la estafa>».
- Gancho: el mensaje de la estafa en la cara; luego «Desmontando estafas, caso N».
- Cómo funciona del lado del estafador, una cifra de lo que se ha llevado con su fuente oficial, tres señales de alerta
  y qué hacer si ya caíste.
- Adelanto del siguiente: «En el caso N+1: …».
- La zorra anfitriona siempre en una esquina inferior y siempre en movimiento; modelos 3D con el logo original de Kold
  Gold y su paleta; rótulo fijo de la serie (claqueta «Desmontando estafas · Caso N»).

## Tema

Estafas que suplantan paqueterías, aduanas, navieras o bancos y que le pueden llegar mañana a quien importa, exporta o
espera un paquete en México. Que no se repita una ya hecha.

## Reglas

- Cifras y casos con fuente comprobable (FTC, policía cibernética, Profeco, SAT/ANAM, la empresa suplantada).
- Sin nombres de víctimas.
- No vender de frente: Kold Gold solo en el puente final.

## Cierre

Un puente a Kold Gold (p. ej. «con Kold Gold tus guías viven en tu portal y ves tu carga en vivo; si un mensaje te cobra
fuera de ahí, desconfía») y: «Cotiza hoy en kold punto gold. Kold Gold: logística integrada global.»
`
  }
]

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Los cambios de ruta de un texto: cada par `de → a` en sus formas (con `\`, con `\\` como va dentro de un JSON, con
 * `\\\\` como va en un JSON dentro de otro, y con `/`). Sin distinguir mayúsculas, como Windows.
 */
export function cambiosDeRuta(pares: [string, string][]): (texto: string) => string {
  const reglas: [RegExp, string][] = []
  for (const [de, a] of [...pares].sort((x, y) => y[0].length - x[0].length)) {
    const formas = (r: string) => [r.replace(/\//g, '\\'), r.replace(/[\\/]/g, '\\\\'), r.replace(/[\\/]/g, '\\\\\\\\'), r.replace(/\\/g, '/')]
    const des = formas(de)
    const as = formas(a)
    // Las formas más largas primero: `\\\\` contiene a `\\`.
    for (const k of [2, 1, 0, 3]) reglas.push([new RegExp(escapar(des[k]), 'gi'), as[k]])
  }
  return (texto) => reglas.reduce((t, [re, a]) => t.replace(re, () => a), texto)
}

const leerJson = <T>(archivo: string): T | null => {
  try {
    return JSON.parse(readFileSync(archivo, 'utf8')) as T
  } catch {
    return null
  }
}

const copiar = (de: string, a: string) => cp(de, a, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true, preserveTimestamps: true })

/** Reescribe las rutas de un archivo de texto en su sitio. */
async function reescribir(archivo: string, cambiar: (t: string) => string) {
  const antes = await readFile(archivo, 'utf8')
  const despues = cambiar(antes)
  if (despues !== antes) await writeFile(archivo, despues)
}

/** Los `.jsonl` y `.json` de una carpeta, a cualquier profundidad. */
function textos(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && /\.jsonl?$/.test(d.name))
    .map((d) => join(d.parentPath, d.name))
}

/**
 * Recorre una carpeta sin entrar en enlaces (los `node_modules` de los proyectos de Remotion son enlaces a una caché
 * compartida) ni en `node_modules`. Llama a `ver` con cada archivo o enlace.
 */
function recorrer(dir: string, ver: (ruta: string, d: Dirent) => void) {
  let hijos: Dirent[]
  try {
    hijos = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const d of hijos) {
    const ruta = join(dir, d.name)
    if (d.isDirectory()) {
      if (d.name !== 'node_modules') recorrer(ruta, ver)
    } else ver(ruta, d)
  }
}

/** Cuántos mp4 y cuántos bytes hay en una carpeta, sin contar lo enlazado ni `node_modules`. */
function medir(dir: string): { mp4: number; bytes: number } {
  let mp4 = 0
  let bytes = 0
  recorrer(dir, (ruta, d) => {
    if (!d.isFile()) return
    try {
      bytes += statSync(ruta).size
    } catch {}
    if (/\.mp4$/i.test(d.name)) mp4++
  })
  return { mp4, bytes }
}

/**
 * Los enlaces de la copia que apuntaban dentro del trabajo de Sloth (un hilo de una card que usa la carpeta de otra)
 * pasan a apuntar a la misma carpeta en v!d. Solo se toca el enlace de la copia: nunca su destino ni el de Sloth.
 */
function repuntarEnlaces(dir: string, de: string, a: string): number {
  let n = 0
  recorrer(dir, (ruta, d) => {
    if (!d.isSymbolicLink()) return
    try {
      const destino = readlinkSync(ruta).replace(/^\\\\\?\\/, '')
      const dentro = (base: string) => {
        const rel = relative(base, destino)
        return rel && !rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel) ? rel : null
      }
      // A Sloth, o a v!d pero roto (se hizo con la ruta virtualizada, ver abajo).
      const rel = dentro(de) ?? (existsSync(ruta) ? null : dentro(a))
      if (!rel) return
      const nuevo = join(a, rel)
      if (!existsSync(nuevo)) return
      // La ruta real: si v!d corre dentro de un paquete de Windows (MSIX), AppData\Local está virtualizada y un enlace a
      // la ruta de siempre no lo sigue el sistema.
      const real = realpathSync.native(nuevo)
      unlinkSync(ruta)
      symlinkSync(real, ruta, statSync(real).isDirectory() ? 'junction' : 'file')
      n++
    } catch (e) {
      console.error(`No pude repuntar el enlace ${ruta}: ${e instanceof Error ? e.message : e}`)
    }
  })
  return n
}

/**
 * Si la carpeta del hilo (`carpeta`) no sale nunca en su historial y otra carpeta de su `cwd` sí, era otra: en Sloth
 * el panel de etapas pudo quedarse con la de un hilo vecino. Se queda la que más sale.
 */
function carpetaReal(historial: string, cwd: string, carpeta?: string): string | undefined {
  if (!carpeta || !existsSync(cwd) || historial.includes(carpeta)) return carpeta
  let mejor: [string, number] | undefined
  for (const d of readdirSync(cwd, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const veces = historial.split(d.name).length - 1
    if (veces > 0 && (!mejor || veces > mejor[1])) mejor = [d.name, veces]
  }
  return mejor?.[0] ?? carpeta
}

/** Un id que no use v!d: el mismo, o con `-sloth`, `-sloth2`… */
function idLibre(sesiones: string, id: string) {
  const usado = (i: string) => existsSync(join(sesiones, `${i}.json`)) || existsSync(join(sesiones, `${i}.jsonl`))
  if (!usado(id)) return id
  for (let k = 1; ; k++) {
    const otro = `${id}-sloth${k > 1 ? k : ''}`
    if (!usado(otro)) return otro
  }
}

/** Crea las series que falten, con su `serie.json` y su `MEMORIA.md`. Devuelve las creadas (`proyecto/serie`). */
function crearSeries(proyectos: string, series: SerieNueva[]): string[] {
  const hechas: string[] = []
  for (const s of series) {
    if (!existsSync(join(proyectos, s.proyecto, 'proyecto.json'))) continue
    const dir = join(proyectos, s.proyecto, 'series', s.id)
    if (existsSync(join(dir, 'serie.json'))) continue
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'serie.json'), JSON.stringify({ id: s.id, nombre: s.nombre, creado: Date.now() }, null, 2) + '\n')
    if (!existsSync(join(dir, 'MEMORIA.md'))) writeFileSync(join(dir, 'MEMORIA.md'), s.memoria)
    hechas.push(`${s.proyecto}/${s.id}`)
  }
  return hechas
}

/** La importación. Ver el comentario del módulo. */
export async function importarSloth(o: OpcionesImportar): Promise<ResultadoImportar> {
  const origenSesiones = join(o.sloth, 'data', 'sessions')
  if (!existsSync(origenSesiones)) throw new Error(`No encontré hilos de Sloth en ${origenSesiones}.`)
  const slothTrabajo = join(o.sloth, 'trabajo')
  const sesiones = join(o.datos, 'sessions')
  const proyectos = join(o.datos, 'proyectos')
  mkdirSync(sesiones, { recursive: true })
  const archivoMarca = join(o.datos, MARCA_IMPORTAR)
  const marca: Marca = leerJson<Marca>(archivoMarca) ?? { origen: o.sloth, hilos: {} }
  const claudeOrigen = o.claudeOrigen ?? [join(o.sloth, 'data', 'claude', 'projects'), join(homedir(), '.claude', 'projects')]
  const r: ResultadoImportar = { origen: o.sloth, hilos: [], yaEstaban: 0, carpetas: [], series: [], adjuntos: 0, enlaces: 0, errores: [] }

  // Las rutas de Sloth que pasan a las de v!d.
  const pares: [string, string][] = [
    [slothTrabajo, o.trabajo],
    [join(o.sloth, 'data', 'attachments'), join(o.datos, 'attachments')]
  ]
  if (o.skills) pares.push([join(o.sloth, 'skills'), o.skills])

  r.series = crearSeries(proyectos, o.series ?? [])

  // Los hilos por importar, y las carpetas de trabajo que usan.
  const nuevos: SessionMeta[] = []
  for (const f of readdirSync(origenSesiones)) {
    if (!f.endsWith('.json')) continue
    const meta = leerJson<SessionMeta>(join(origenSesiones, f))
    if (!meta?.id) continue
    if (marca.hilos[meta.id]) {
      r.yaEstaban++
      continue
    }
    nuevos.push(meta)
  }
  const cards = new Set<string>()
  for (const m of nuevos) {
    const rel = relative(slothTrabajo, m.cwd)
    if (rel && !rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel)) cards.add(rel.split(/[\\/]/)[0])
  }

  // 1. Lo pesado: las carpetas de trabajo y los adjuntos (sin pisar nada).
  for (const card of cards) {
    try {
      await copiar(join(slothTrabajo, card), join(o.trabajo, card))
      r.carpetas.push({ card, ...medir(join(o.trabajo, card)) })
    } catch (e) {
      r.errores.push(`No pude copiar la carpeta de trabajo ${card}: ${e instanceof Error ? e.message : e}`)
    }
  }
  // Ya copiadas todas (también las de antes), los enlaces entre ellas apuntan a la copia y no a Sloth.
  if (existsSync(slothTrabajo))
    for (const card of readdirSync(slothTrabajo)) if (existsSync(join(o.trabajo, card))) r.enlaces += repuntarEnlaces(join(o.trabajo, card), slothTrabajo, o.trabajo)
  if (nuevos.length) {
    for (const d of ['attachments', 'miniaturas', 'previas']) {
      const de = join(o.sloth, 'data', d)
      if (!existsSync(de)) continue
      try {
        await copiar(de, join(o.datos, d))
        if (d === 'attachments') r.adjuntos = readdirSync(de).length
      } catch (e) {
        r.errores.push(`No pude copiar data/${d}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // 2. Cada hilo: su registro con las rutas nuevas, su proyecto y su sesión de Claude.
  for (const m of nuevos) {
    try {
      const id = idLibre(sesiones, m.id)
      const viejoCwd = m.cwd
      const cambiar = cambiosDeRuta(pares)
      const cwd = cambiar(viejoCwd)
      const historialViejo = existsSync(join(origenSesiones, `${m.id}.jsonl`)) ? await readFile(join(origenSesiones, `${m.id}.jsonl`), 'utf8') : ''
      const meta: SessionMeta = { ...m, id, cwd, running: false, background: [] }
      const carpeta = carpetaReal(historialViejo, cwd, m.carpeta)
      const nota: string[] = []
      if (carpeta !== m.carpeta) {
        meta.carpeta = carpeta
        nota.push(`su carpeta era ${carpeta}, no ${m.carpeta}`)
      }
      const asignado = o.asignar?.(m)
      delete meta.proyecto
      delete meta.serie
      if (asignado?.proyecto && existsSync(join(proyectos, asignado.proyecto, 'proyecto.json'))) {
        meta.proyecto = asignado.proyecto
        if (asignado.serie && existsSync(join(proyectos, asignado.proyecto, 'series', asignado.serie, 'serie.json'))) meta.serie = asignado.serie
      }

      // La sesión de Claude Code: `projects/<cwd con guiones>/<id>.jsonl` y su carpeta `<id>/` (subagentes, salidas).
      let continuable = false
      const psid = m.providerSessionId
      if (psid) {
        const viejo = proyectoClaude(viejoCwd)
        const nuevo = proyectoClaude(cwd)
        const base = claudeOrigen.find((p) => existsSync(join(p, viejo, `${psid}.jsonl`)))
        if (base) {
          const destino = join(o.claudeDestino, nuevo)
          mkdirSync(destino, { recursive: true })
          const cambiarClaude = cambiosDeRuta([...pares, [join(base, viejo), destino]])
          const jsonl = join(destino, `${psid}.jsonl`)
          if (!existsSync(jsonl)) await writeFile(jsonl, cambiarClaude(await readFile(join(base, viejo, `${psid}.jsonl`), 'utf8')))
          if (existsSync(join(base, viejo, psid))) {
            await copiar(join(base, viejo, psid), join(destino, psid))
            for (const t of textos(join(destino, psid))) await reescribir(t, cambiarClaude)
          }
          if (existsSync(join(base, viejo, 'memory'))) await copiar(join(base, viejo, 'memory'), join(destino, 'memory'))
          continuable = true
        }
      }
      if (!continuable) {
        // Sin su sesión, el siguiente mensaje abre otra que empieza con el resumen del hilo.
        delete meta.providerSessionId
        meta.resumir = true
        nota.push(psid ? 'su sesión de Claude Code no estaba en la configuración de Sloth: queda como historial' : 'no tenía sesión del agente: queda como historial')
      }

      await writeFile(join(sesiones, `${id}.jsonl`), cambiar(historialViejo))
      writeFileSync(join(sesiones, `${id}.json`), JSON.stringify(meta, null, 2))
      const hilo: HiloImportado = {
        sloth: m.id,
        id,
        title: m.title,
        cwd,
        ...(meta.carpeta ? { carpeta: meta.carpeta } : {}),
        ...(meta.proyecto ? { proyecto: meta.proyecto } : {}),
        ...(meta.serie ? { serie: meta.serie } : {}),
        continuable,
        ...(nota.length ? { nota: nota.join('; ') } : {})
      }
      r.hilos.push(hilo)
      marca.hilos[m.id] = { ...hilo, fecha: new Date().toISOString() }
      writeFileSync(archivoMarca, JSON.stringify(marca, null, 2) + '\n')
    } catch (e) {
      r.errores.push(`No pude importar el hilo ${m.id} (${m.title}): ${e instanceof Error ? e.message : e}`)
    }
  }
  if (!existsSync(archivoMarca)) writeFileSync(archivoMarca, JSON.stringify(marca, null, 2) + '\n')
  return r
}

let enCurso: Promise<ResultadoImportar> | null = null

/** Una sola importación a la vez: el segundo clic espera a la primera. */
export function importarUnaVez(o: OpcionesImportar): Promise<ResultadoImportar> {
  return (enCurso ??= importarSloth(o).finally(() => (enCurso = null)))
}
