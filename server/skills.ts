import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Card, CambiosCard, Marcas, Serie } from '../shared/types.ts'
import { VENTA } from '../shared/venta.ts'
import type { SkillRef } from './agent.ts'
import { guardar } from './disco.ts'
import { carpetaTrabajo } from './trabajo.ts'
import { cambiosDe, nombreCopia, respaldar, restaurar } from './originales.ts'

/**
 * La carpeta de la app: la primera de arriba con `cards.json` (en el repo, la raíz; en la que se vende, `app\`, también
 * desde `server/radar/rastrear.mjs`).
 */
function raizApp(desde = dirname(fileURLToPath(import.meta.url))): string {
  let dir = desde
  for (let i = 0; i < 4; i++, dir = dirname(dir)) if (existsSync(join(dir, 'cards.json'))) return dir
  return resolve(desde, '..')
}

/**
 * Donde los agentes buscan las skills: SIEMPRE las de v!d, `<app>/skills`, en el repo y en la que se vende (v1.1.1).
 * Hasta la 1.1.0, la que se vende las buscaba en ~/.claude/skills, y si ahí ya había una con el mismo nombre (la de otra
 * app, como Sloth) usaba esa: los videos salían con skills viejas y «Con tus cambios» contaba sus diferencias.
 * `VID_SKILLS`, si ya viene puesta, manda (las pruebas imitan así otra carpeta).
 */
export const SKILLS = process.env.VID_SKILLS || process.env.SLOTH_SKILLS || join(raizApp(), 'skills')
/** Las skills del Claude Code del usuario: las que no son de v!d se pueden usar en los hilos, sin pisar las de v!d. */
const CASA = join(homedir(), '.claude', 'skills')

/**
 * La configuración de Claude propia de v!d (`CLAUDE_CONFIG_DIR`), en `<app>/data/claude`, tanto en el repo como en la app
 * que se vende (v1.1). Antes, la instalada usaba ~/.claude, la del Claude Code del usuario, y cada hilo cargaba lo suyo:
 * sus plugins y hooks (el GateGuard de ECC bloqueó ~90 llamadas en un video), su CLAUDE.md global y sus MCP, en cada una
 * de las ~400 llamadas de un video. Aquí solo están las skills, enlazadas: en el repo, a las del repo; en la que se vende,
 * `skills` es una carpeta con una unión por skill (`skillsDeClaude`): las de v!d (`<app>/skills`) y, con otro nombre, las
 * del usuario en ~/.claude/skills. Con el mismo nombre gana la de v!d.
 *
 * La sesión no se pierde: en la que se vende, la primera vez se copian de ~/.claude solo las credenciales y la cuenta
 * (`heredarSesion`), nunca settings, plugins ni hooks; y `projects` apunta a ~/.claude/projects, para que los hilos de
 * antes se puedan seguir (`resume`). En el repo la cuenta se conecta aparte, una vez, desde v!d.
 */
export function configClaude(app: string, venta = VENTA, casa = join(homedir(), '.claude')): string {
  const dir = join(app, 'data', 'claude')
  mkdirSync(dir, { recursive: true })
  if (venta) skillsDeClaude(join(app, 'skills'), join(dir, 'skills'), join(casa, 'skills'))
  else enlazar(join(app, 'skills'), join(dir, 'skills'))
  if (venta) {
    if (existsSync(join(casa, 'projects'))) enlazar(join(casa, 'projects'), join(dir, 'projects'))
    heredarSesion(dir, casa)
    sincronizarSesion(dir, casa)
  }
  return dir
}

const esEnlace = (ruta: string) => {
  try {
    return lstatSync(ruta).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * La carpeta `skills` de la configuración de Claude de v!d (`destino`): una unión por cada skill de v!d (`propias`) y, con
 * otro nombre, por cada una del usuario (`delUsuario`, ~/.claude/skills). Las de v!d ganan: una unión con su nombre que
 * apuntaba a otro lado se cambia. Si `destino` era una unión a toda una carpeta (la 1.1.0 apuntaba a ~/.claude/skills),
 * se quita solo la unión. Las uniones que se quedaron sin destino salen. Nunca borra contenido. Se puede llamar siempre.
 */
export function skillsDeClaude(propias: string, destino: string, delUsuario = CASA) {
  try {
    if (esEnlace(destino)) unlinkSync(destino)
    mkdirSync(destino, { recursive: true })
    const carpetas = (dir: string) => {
      try {
        return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || (d.isSymbolicLink() && existsSync(join(dir, d.name)) && statSync(join(dir, d.name)).isDirectory())).map((d) => d.name)
      } catch {
        return []
      }
    }
    const deVid = carpetas(propias)
    const quiere = new Map<string, string>(deVid.map((n) => [n, join(propias, n)]))
    for (const n of carpetas(delUsuario)) {
      if (quiere.has(n)) continue
      try {
        quiere.set(n, realpathSync(join(delUsuario, n)))
      } catch { /* Una unión rota del usuario: no se lleva. */ }
    }
    for (const n of readdirSync(destino)) {
      const ruta = join(destino, n)
      if (esEnlace(ruta) && (!existsSync(ruta) || !quiere.has(n))) unlinkSync(ruta)
    }
    for (const [n, origen] of quiere) {
      const ruta = join(destino, n)
      if (esEnlace(ruta)) {
        if (existsSync(ruta) && realpathSync(ruta).toLowerCase() === realpathSync(origen).toLowerCase()) continue
        unlinkSync(ruta)
      } else if (existsSync(ruta)) {
        // Una carpeta de verdad con ese nombre: solo se aparta si es de v!d (gana); si es del usuario, se queda.
        if (!deVid.includes(n)) continue
        mkdirSync(join(dirname(destino), 'skills-viejas'), { recursive: true })
        renameSync(ruta, join(dirname(destino), 'skills-viejas', `${n}-${Date.now()}`))
      }
      symlinkSync(origen, ruta, 'junction')
    }
  } catch (error) {
    console.error(`No se pudieron poner las skills de v!d en ${destino}: ${error instanceof Error ? error.message : error}`)
  }
}

/** Una unión de `destino` a `origen`, si `destino` no existe aún. */
function enlazar(origen: string, destino: string) {
  try {
    if (existsSync(destino)) return
    mkdirSync(origen, { recursive: true })
    symlinkSync(origen, destino, 'junction')
  } catch (error) {
    console.error(`No se pudo enlazar ${origen} en ${destino}: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * Si la configuración de v!d (`dir`) aún no tiene sesión, copia la del Claude Code del usuario (`casa`, ~/.claude): el
 * archivo de credenciales (`.credentials.json`, en Windows y Linux; en Mac viven en el llavero y se conecta una vez desde
 * Opciones) y, de `~/.claude.json` (al lado de `casa`), solo la cuenta (`oauthAccount`, `userID`) y que ya pasó la
 * bienvenida. Nada de settings, plugins, hooks ni MCP. Una sola vez: si ya hay credenciales, no se tocan. Devuelve si
 * copió algo.
 */
export function heredarSesion(dir: string, casa = join(homedir(), '.claude')): boolean {
  const credenciales = join(dir, '.credentials.json')
  if (existsSync(credenciales) || !existsSync(join(casa, '.credentials.json'))) return false
  try {
    copyFileSync(join(casa, '.credentials.json'), credenciales)
    const estado = join(dir, '.claude.json')
    const suyo = join(dirname(casa), '.claude.json')
    if (!existsSync(estado) && existsSync(suyo)) {
      const d = JSON.parse(readFileSync(suyo, 'utf8'))
      const cuenta = Object.fromEntries(['oauthAccount', 'userID', 'hasCompletedOnboarding', 'lastOnboardingVersion'].filter((k) => k in d).map((k) => [k, d[k]]))
      writeFileSync(estado, JSON.stringify(cuenta, null, 2))
    }
    return true
  } catch (error) {
    console.error(`No se pudo copiar la sesión de Claude a ${dir}: ${error instanceof Error ? error.message : error}`)
    return false
  }
}

/** Lee un JSON; `null` si no existe o no se puede leer. */
function leerJson(ruta: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

/** Escribe sin dejar un archivo a medias: primero a un temporal y luego lo cambia de nombre. */
function escribirJson(ruta: string, datos: unknown) {
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(datos, null, 2))
  renameSync(tmp, ruta)
}

/**
 * v1.1.3. Mantiene una sola sesión de Claude viva entre v!d (`dir`) y el Claude Code del usuario (`casa`, ~/.claude).
 * `heredarSesion` copiaba las credenciales una vez; pero el token de Anthropic dura horas y su llave de renovación
 * (`refreshToken`) cambia cada vez que se renueva. En cuanto el Claude Code del usuario renovaba la suya, la copia de
 * v!d quedaba con una llave vieja: «401 OAuth access token has expired» (5 nov 2026, el Radar semana 45 no arrancó).
 * Aquí gana la que vence más tarde (`claudeAiOauth.expiresAt`) y se copia al otro lado, sin tocar sus `mcpOAuth`.
 * Solo si las dos son la misma cuenta (`oauthAccount.accountUuid` en `.claude.json`), para no pisar otra cuenta
 * conectada a propósito en v!d. Se llama al arrancar, antes de cada hilo de Claude y cada pocos minutos.
 * Devuelve hacia dónde copió: 'a-vid', 'a-casa' o null.
 */
export function sincronizarSesion(dir = process.env.CLAUDE_CONFIG_DIR || '', casa = join(homedir(), '.claude')): 'a-vid' | 'a-casa' | null {
  try {
    if (!dir || resolve(dir).toLowerCase() === resolve(casa).toLowerCase()) return null
    const cuenta = (r: Record<string, any> | null) => r?.oauthAccount?.accountUuid as string | undefined
    const deVid = cuenta(leerJson(join(dir, '.claude.json')))
    const deCasa = cuenta(leerJson(join(dirname(casa), '.claude.json')))
    if (deVid && deCasa && deVid !== deCasa) return null
    const rutaVid = join(dir, '.credentials.json')
    const rutaCasa = join(casa, '.credentials.json')
    const vid = leerJson(rutaVid)
    const suya = leerJson(rutaCasa)
    const vence = (c: Record<string, any> | null) => Number(c?.claudeAiOauth?.expiresAt) || 0
    if (!suya?.claudeAiOauth?.refreshToken && !vid?.claudeAiOauth?.refreshToken) return null
    if (vence(suya) > vence(vid)) {
      escribirJson(rutaVid, { ...(vid ?? {}), claudeAiOauth: suya!.claudeAiOauth })
      return 'a-vid'
    }
    if (vence(vid) > vence(suya) && suya) {
      escribirJson(rutaCasa, { ...suya, claudeAiOauth: vid!.claudeAiOauth })
      return 'a-casa'
    }
    return null
  } catch (error) {
    console.error(`No se pudo sincronizar la sesión de Claude: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

/**
 * Desde la 1.1.1 v!d ya no la usa (sus hilos leen sus skills de su configuración, `skillsDeClaude`) ni escribe en
 * ~/.claude; se queda para quien la llame a propósito.
 * La app que se vende trae sus skills en `<app>/skills`, y Claude las busca en ~/.claude/skills: enlaza ahí, con una
 * unión, cada una que falte. Las que ya están no se tocan, que pueden ser del usuario; solo se rehace la unión que apunta
 * a una carpeta que ya no existe (v!d se movió de sitio).
 */
export function enlazarSkills(app: string) {
  mkdirSync(CASA, { recursive: true })
  for (const nombre of readdirSync(join(app, 'skills'))) {
    const destino = join(CASA, nombre)
    if (existsSync(destino)) continue
    try {
      try {
        if (lstatSync(destino).isSymbolicLink()) unlinkSync(destino)
      } catch { /* No había nada. */ }
      symlinkSync(join(app, 'skills', nombre), destino, 'junction')
    } catch (error) {
      console.error(`No se pudo enlazar la skill ${nombre} en ${CASA}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

/**
 * Codex no mira ~/.claude/skills: busca en las suyas (`$CODEX_HOME/skills` y `~/.agents/skills`), y si dos skills se
 * llaman igual no gana ninguna. Cada skill de v!d se enlaza en las dos a la misma de Claude, para que los dos agentes
 * lean los mismos archivos y un cambio valga para ambos; Codex cuenta una sola vez lo que lleva al mismo sitio. Una copia
 * suelta con el nombre de una skill de v!d (la de una versión de antes) sale a `skills-viejas`, donde Codex ya no la ve.
 */
export function enlazarSkillsCodex(app: string, bases = basesCodex()) {
  for (const base of bases) {
    const carpeta = join(base, 'skills')
    mkdirSync(carpeta, { recursive: true })
    for (const nombre of readdirSync(join(app, 'skills'))) {
      // También las que no son una skill sino lo que comparten (`video-base`), que las demás leen a su lado.
      // Las de v!d mismas (v1.1.1): antes, la de ~/.claude/skills, que podía ser la de otra app con ese nombre.
      const de = join(app, 'skills', nombre)
      if (!existsSync(de) || !statSync(de).isDirectory()) continue
      const destino = join(carpeta, nombre)
      try {
        const origen = realpathSync(de)
        let enlace = false
        try {
          enlace = lstatSync(destino).isSymbolicLink()
        } catch { /* No había nada. */ }
        if (enlace && existsSync(destino) && realpathSync(destino) === origen) continue
        if (enlace) unlinkSync(destino)
        else if (existsSync(destino)) {
          mkdirSync(join(base, 'skills-viejas'), { recursive: true })
          renameSync(destino, join(base, 'skills-viejas', `${nombre}-${Date.now()}`))
        }
        symlinkSync(origen, destino, 'junction')
      } catch (error) {
        console.error(`No se pudo enlazar la skill ${nombre} en ${carpeta}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }
}

/** Donde busca Codex sus skills. */
const basesCodex = () => [process.env.CODEX_HOME || join(homedir(), '.codex'), join(homedir(), '.agents')]

/**
 * Al borrar un estilo tuyo, su skill sale de `<app>/skills` a una copia en `data/skills-tuyas`, por si te arrepientes, y
 * se quitan los enlaces de Claude y Codex que se quedaron sin ella. Una que trae v!d no se toca. Devuelve la copia.
 */
export function guardarSkillTuya(app: string, skill: string, datos: string, enlaces = VENTA ? [join(app, 'data', 'claude', 'skills'), ...basesCodex().map((b) => join(b, 'skills'))] : []) {
  const dir = join(app, 'skills', skill)
  if (!existsSync(dir) || (ORIGINALES && existsSync(join(ORIGINALES, skill)))) return undefined
  const copia = join(datos, 'skills-tuyas', nombreCopia(`estilo borrado ${skill}`))
  mkdirSync(copia, { recursive: true })
  try {
    renameSync(dir, join(copia, skill))
  } catch (error) {
    rmdirSync(copia)
    throw new Error(`No se pudo quitar su skill: algo tiene abierto un archivo de ${dir}. Ciérralo y vuelve a intentarlo. (${error instanceof Error ? error.message : error})`)
  }
  for (const carpeta of enlaces) {
    const enlace = join(carpeta, skill)
    try {
      if (lstatSync(enlace).isSymbolicLink() && !existsSync(enlace)) unlinkSync(enlace)
    } catch { /* No había enlace. */ }
  }
  return copia
}

/**
 * La carpeta de la skill que usan los agentes (la de `SKILLS`), si está. Lo que una skill guarda al trabajar va ahí, que
 * en la app que se vende puede no ser `<app>/skills`: la de una instalación de antes, o una del usuario con ese nombre.
 */
export function carpetaSkill(name: string): string | undefined {
  const dir = join(SKILLS, name)
  return existsSync(dir) ? dir : undefined
}

/** La skill, si está instalada. `undefined` si no. */
export function skillRef(name: string): SkillRef | undefined {
  const path = join(SKILLS, name, 'SKILL.md')
  return existsSync(path) ? { name, path } : undefined
}

/** En la app que se vende, las skills como las trae esta versión (`server/originales.ts`). En el repo no hay. */
const ORIGINALES = process.env.VID_SKILLS_ORIGINALES ?? process.env.SLOTH_SKILLS_ORIGINALES

/**
 * Las skills de una card que tienen original: la suya y las bases que nombra su SKILL.md (video-base, modelos-3d), que
 * no son de ninguna card. Un cambio en video-base también cambia sus videos.
 */
function skillsDeCard(card: Card, todas: Card[]): string[] {
  if (!ORIGINALES || !card.skill || !existsSync(join(ORIGINALES, card.skill))) return []
  const deCards = new Set(todas.flatMap((c) => (c.skill ? [c.skill] : [])))
  let texto = ''
  try {
    texto = readFileSync(join(ORIGINALES, card.skill, 'SKILL.md'), 'utf8')
  } catch { /* Sin SKILL.md no nombra ninguna. */ }
  const bases = readdirSync(ORIGINALES, { withFileTypes: true }).filter((d) => d.isDirectory() && !deCards.has(d.name) && texto.includes(d.name))
  return [card.skill, ...bases.map((d) => d.name)]
}

/** Lo que cambiaste en las skills de una card y tu copia más nueva de ellas. `null` sin original con qué comparar. */
export async function cambiosDeCard(card: Card, todas: Card[], datos: string): Promise<CambiosCard | null> {
  if (!ORIGINALES) return null
  const skills = skillsDeCard(card, todas)
  const cambios = (await Promise.all(skills.map((s) => {
    const dir = carpetaSkill(s)
    return dir ? cambiosDe(join(ORIGINALES, s), dir, s) : []
  }))).flat()
  const tuyas = join(datos, 'skills-tuyas')
  const copia = existsSync(tuyas)
    ? readdirSync(tuyas).sort().reverse().find((c) => skills.some((s) => existsSync(join(tuyas, c, s))))
    : undefined
  return { cambios, ...(copia ? { copia: join(tuyas, copia) } : {}) }
}

/**
 * Vuelve a la original las skills de una card, o solo `uno` de sus archivos. Lo que se pisa se copia antes a
 * `data/skills-tuyas`, por si te arrepientes.
 */
export async function volverAOriginal(card: Card, todas: Card[], datos: string, uno?: { skill: string; archivo: string }) {
  const cambios = ((await cambiosDeCard(card, todas, datos))?.cambios ?? []).filter((c) => !uno || (c.skill === uno.skill && c.archivo === uno.archivo))
  if (!ORIGINALES || !cambios.length) return
  respaldar(cambios, (s) => carpetaSkill(s)!, join(datos, 'skills-tuyas', nombreCopia('antes de volver a la original')))
  for (const s of new Set(cambios.map((c) => c.skill))) {
    restaurar(join(ORIGINALES, s), carpetaSkill(s)!, cambios.filter((c) => c.skill === s).map((c) => c.archivo))
  }
}

/**
 * Las series de una skill: cada `series/<id>.md` de su carpeta, con el título de su primera línea `# `. Un estilo de
 * video tiene además las de `video-base/series` (`video-base/SERIES.md`); con el mismo id, la suya manda.
 */
export function seriesDe(skill: string, estilo: boolean): Serie[] {
  const series = new Map<string, Serie>()
  for (const carpeta of [...(estilo ? ['video-base'] : []), skill]) {
    const dir = join(SKILLS, carpeta, 'series')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const id = f.slice(0, -3)
      const nombre = /^# (.+)$/m.exec(readFileSync(join(dir, f), 'utf8'))?.[1].trim() ?? id
      series.set(id, { id, nombre, archivo: `${carpeta}/series/${f}` })
    }
  }
  return [...series.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Las marcas de la carpeta de trabajo de una card: `marca.json` (la de siempre) y `marcas/<nombre>.json`, una por canal
 * (`MARCA.md` del explicativo, «La marca» de El Diff). Se leen cada vez: las escribe el agente.
 */
export function marcasDe(cwd: string): Marcas {
  const dir = join(cwd, 'marcas')
  const otras = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : []
  let base: string | undefined
  try {
    const m = JSON.parse(readFileSync(join(cwd, 'marca.json'), 'utf8'))
    base = (typeof m.nombre === 'string' && m.nombre) || (typeof m.cierre?.nombre === 'string' && m.cierre.nombre) || ''
  } catch {}
  return { base, otras: otras.sort((a, b) => a.localeCompare(b, 'es')) }
}

export function readCards(file: string, appDir: string): Card[] {
  // Con BOM, como lo deja PowerShell.
  const cards = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as Partial<Card>[]
  if (!Array.isArray(cards)) throw new Error(`${file} no es una lista de cards`)
  // Sin `cwd`, la card trabaja en su propia carpeta de `carpetaTrabajo`. Una etapa sin `muestra` enseña lo de `listo`.
  // Una sin `id` (a medio escribir por un agente) no cuenta.
  return cards.filter((c) => typeof c?.id === 'string' && c.id).map((c) => ({
    ...c,
    cwd: c.cwd ? c.cwd.replace('{app}', appDir) : join(carpetaTrabajo(appDir), c.id!),
    ...(c.etapas ? { etapas: c.etapas.map((e) => ({ ...e, muestra: e.muestra ?? e.listo })) } : {})
  }) as Card)
}

/** Copia la card justo después de la original, con un id libre (`<id>-2`, `<id>-3`…). La skill es la misma. */
export function duplicateCard(file: string, id: string): string {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  const i = cards.findIndex((c) => c.id === id)
  if (i < 0) throw new Error('No existe esa card')
  let n = 2
  while (cards.some((c) => c.id === `${id}-${n}`)) n++
  const copy = { ...cards[i], id: `${id}-${n}`, title: `${cards[i].title} (copia)` }
  cards.splice(i + 1, 0, copy)
  guardar(file, JSON.stringify(cards, null, 2) + '\n')
  return copy.id
}

/** Quita la card de su archivo (cards.json o tus-cards.json). La skill y los hilos que se hicieron con ella se quedan. */
export function removeCard(file: string, id: string) {
  const cards = JSON.parse(readFileSync(file, 'utf8')) as Partial<Card>[]
  if (!cards.some((c) => c.id === id)) throw new Error('No existe esa card')
  guardar(file, JSON.stringify(cards.filter((c) => c.id !== id), null, 2) + '\n')
}
