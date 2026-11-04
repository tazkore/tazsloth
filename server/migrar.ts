/**
 * Fase 2 de v!d: las carpetas de datos y de trabajo pasan de TazSloth a `vid-koldgold`. Al primer arranque, si existe la
 * carpeta vieja y no la nueva, se COPIA (nunca se mueve ni se borra la vieja) y en la nueva queda `migrado-de-tazsloth.txt`,
 * que dice de dónde vino. Los hilos guardan su carpeta (`cwd`) con ruta absoluta: los que apuntaban a la carpeta de trabajo
 * vieja se reescriben a la nueva (con respaldo de cada archivo en `data/respaldo-migracion`), y la sesión de Claude Code
 * de esa carpeta se copia a la nueva para que el hilo se pueda retomar.
 *
 * Lo usan el servidor (`migrarServidor`, antes que nada en server/index.ts) y la ventana fuera de Windows
 * (electron/main.ts, con `migrarCarpeta`). El repo en desarrollo sigue con sus datos en `<repo>/data`: eso no cambia.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** El archivo que deja la copia en la carpeta nueva. */
export const MARCA_MIGRACION = 'migrado-de-tazsloth.txt'

const copiar = (de: string, a: string) =>
  cpSync(de, a, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true, preserveTimestamps: true })

const marcar = (nueva: string, vieja: string) =>
  writeFileSync(
    join(nueva, MARCA_MIGRACION),
    `Copiado de ${vieja} el ${new Date().toISOString()} al pasar a v!d by Kold.Gold (Fase 2).\r\nLa carpeta vieja se dejó intacta: bórrala tú cuando compruebes que todo está aquí.\r\n`
  )

/**
 * Copia la primera de `viejas` que exista a `nueva`, si `nueva` aún no existe. Devuelve la que copió, o null. Nunca toca
 * la vieja. Si la copia falla a medias, lo copiado se queda (y la próxima vez ya no se copia: `nueva` existe).
 */
export function migrarCarpeta(viejas: string[], nueva: string): string | null {
  if (existsSync(nueva)) return null
  const vieja = viejas.find((v) => v !== nueva && existsSync(v))
  if (!vieja) return null
  mkdirSync(dirname(nueva), { recursive: true })
  copiar(vieja, nueva)
  marcar(nueva, vieja)
  return vieja
}

/** El nombre de la carpeta de un proyecto de Claude Code (`~/.claude/projects/<esto>`): su ruta con guiones. */
export const proyectoClaude = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

/**
 * En los hilos de `datos/sessions`, la carpeta (`cwd`) que empieza por `de` pasa a empezar por `a`. Antes de cambiar un
 * archivo, lo copia a `datos/respaldo-migracion/sessions`. Devuelve cuántos hilos cambió.
 */
export function reescribirSesiones(datos: string, de: string, a: string, proyectos: string[] = []): number {
  const sesiones = join(datos, 'sessions')
  if (!existsSync(sesiones) || de === a) return 0
  const respaldo = join(datos, 'respaldo-migracion', 'sessions')
  const viejo = de.toLowerCase()
  let cambiados = 0
  for (const f of readdirSync(sesiones)) {
    if (!f.endsWith('.json')) continue
    const ruta = join(sesiones, f)
    try {
      const texto = readFileSync(ruta, 'utf8')
      const meta = JSON.parse(texto) as { cwd?: unknown }
      if (typeof meta.cwd !== 'string' || !meta.cwd.toLowerCase().startsWith(viejo)) continue
      const cwd = a + meta.cwd.slice(de.length)
      mkdirSync(respaldo, { recursive: true })
      if (!existsSync(join(respaldo, f))) writeFileSync(join(respaldo, f), texto)
      for (const p of proyectos) {
        const antes = join(p, proyectoClaude(meta.cwd))
        if (existsSync(antes)) copiar(antes, join(p, proyectoClaude(cwd)))
      }
      writeFileSync(ruta, JSON.stringify({ ...meta, cwd }, null, 2))
      cambiados++
    } catch (e) {
      console.error(`No pude pasar ${f} a la carpeta nueva: ${e instanceof Error ? e.message : e}`)
    }
  }
  return cambiados
}

/**
 * Todo lo del servidor, una vez y antes de que nada cree sus carpetas:
 * - `%APPDATA%\tazsloth` → `%APPDATA%\vid-koldgold` (piezas, agentes, llaves de Mac y Linux, la sesión de Cloudflare);
 * - en el repo, `%LOCALAPPDATA%\tazsloth-dev` → `%LOCALAPPDATA%\vid-koldgold-dev` (la carpeta de trabajo de desarrollo);
 * - en la instalada en Windows, `app\data` y `app\trabajo` de `Programs\tazsloth` → los de esta instalación, si esta aún no
 *   tiene hilos.
 */
export function migrarServidor(app: string, venta: boolean) {
  try {
    const hechas: string[] = []
    const proyectos = [join(app, 'data', 'claude', 'projects'), join(homedir(), '.claude', 'projects')]
    if (process.env.APPDATA) {
      const de = migrarCarpeta([join(process.env.APPDATA, 'tazsloth')], join(process.env.APPDATA, 'vid-koldgold'))
      if (de) hechas.push(de)
    }
    const local = process.env.LOCALAPPDATA || join(homedir(), '.local', 'share')
    if (!venta) {
      const de = migrarCarpeta([join(local, 'tazsloth-dev')], join(local, 'vid-koldgold-dev'))
      if (de) hechas.push(de)
      reescribirSesiones(join(app, 'data'), join(local, 'tazsloth-dev', 'trabajo'), join(local, 'vid-koldgold-dev', 'trabajo'), proyectos)
    } else if (process.platform === 'win32') {
      const vieja = join(local, 'Programs', 'tazsloth', 'app')
      if (vieja.toLowerCase() !== app.toLowerCase() && existsSync(join(vieja, 'data', 'sessions')) && !existsSync(join(app, 'data', 'sessions'))) {
        for (const d of ['data', 'trabajo']) if (existsSync(join(vieja, d))) copiar(join(vieja, d), join(app, d))
        mkdirSync(join(app, 'data'), { recursive: true })
        marcar(join(app, 'data'), vieja)
        hechas.push(vieja)
      }
      reescribirSesiones(join(app, 'data'), join(vieja, 'trabajo'), join(app, 'trabajo'), proyectos)
    }
    for (const h of hechas) console.log(`Copié tus datos de ${h} a la carpeta nueva de v!d (la vieja se queda igual).`)
  } catch (e) {
    console.error(`No pude copiar los datos de TazSloth a la carpeta nueva: ${e instanceof Error ? e.message : e}`)
  }
}
