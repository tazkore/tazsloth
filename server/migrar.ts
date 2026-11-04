/**
 * Fase 2 de v!d: las carpetas de datos y de trabajo pasan de TazSloth a `vid-koldgold`. Al primer arranque, si existe la
 * carpeta vieja y no la nueva, se COPIA (nunca se mueve ni se borra la vieja) y en la nueva queda `migrado-de-tazsloth.txt`,
 * que dice de dónde vino. Los hilos guardan su carpeta (`cwd`) con ruta absoluta: los que apuntaban a la carpeta de trabajo
 * vieja se reescriben a la nueva (con respaldo de cada archivo en `data/respaldo-migracion`), y la sesión de Claude Code
 * de esa carpeta se copia a la nueva para que el hilo se pueda retomar.
 *
 * v1.1: en el repo, el trabajo de desarrollo sale de AppData (`%LOCALAPPDATA%\vid-koldgold-dev\trabajo`) a
 * `C:\vid-datos\trabajo` (`TRABAJO_DEV`, trabajo.ts), con el mismo patrón (`migrarTrabajo`).
 *
 * Lo usan el servidor (`migrarServidor`, antes que nada en server/index.ts) y la ventana fuera de Windows
 * (electron/main.ts, con `migrarCarpeta`). El repo en desarrollo sigue con sus datos en `<repo>/data`: eso no cambia.
 */
import { copyFileSync, cpSync, type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'

/** El archivo que deja la copia en la carpeta nueva. */
export const MARCA_MIGRACION = 'migrado-de-tazsloth.txt'
/** El que deja la copia del trabajo de desarrollo fuera de AppData (v1.1). */
export const MARCA_TRABAJO = 'migrado-de-appdata.txt'

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

/** La ruta física de una carpeta (en el paquete MSIX de Claude Desktop, la de `AppData\Local` es otra), o ella misma. */
export function rutaReal(ruta: string): string {
  try {
    return realpathSync.native(ruta)
  } catch {
    return ruta
  }
}

/**
 * Recorre una carpeta sin entrar en enlaces (los `node_modules` de los proyectos de Remotion son enlaces a una caché
 * compartida) ni en `node_modules`. Llama a `ver` con cada archivo o enlace.
 */
export function recorrer(dir: string, ver: (ruta: string, d: Dirent) => void) {
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

/**
 * Los enlaces de una copia que apuntaban dentro de la carpeta de origen (`de`: un hilo de una card que usa la carpeta de
 * otra) pasan a apuntar a la misma carpeta en la copia (`a`), y los que apuntaban a la copia pero no se siguen, también.
 * Solo se toca el enlace de la copia: nunca su destino ni el del origen. Devuelve cuántos rehízo.
 */
export function repuntarEnlaces(dir: string, de: string[], a: string): number {
  let n = 0
  recorrer(dir, (ruta, d) => {
    if (!d.isSymbolicLink()) return
    try {
      const destino = readlinkSync(ruta).replace(/^\\\\\?\\/, '')
      const dentro = (base: string) => {
        const rel = relative(base, destino)
        return rel && !rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel) ? rel : null
      }
      const rel = de.map(dentro).find((r) => r) ?? (existsSync(ruta) ? null : dentro(a))
      if (!rel) return
      const nuevo = join(a, rel)
      if (!existsSync(nuevo)) return
      // La ruta física: si v!d corre dentro de un paquete de Windows (MSIX), AppData\Local está virtualizada y un enlace
      // a la ruta de siempre no lo sigue el sistema.
      const real = rutaReal(nuevo)
      unlinkSync(ruta)
      symlinkSync(real, ruta, statSync(real).isDirectory() ? 'junction' : 'file')
      n++
    } catch (e) {
      console.error(`No pude repuntar el enlace ${ruta}: ${e instanceof Error ? e.message : e}`)
    }
  })
  return n
}

/** Reescribe las rutas de un archivo de texto en su sitio. Devuelve si cambió. */
function reescribir(archivo: string, cambiar: (t: string) => string): boolean {
  const antes = readFileSync(archivo, 'utf8')
  const despues = cambiar(antes)
  if (despues !== antes) writeFileSync(archivo, despues)
  return despues !== antes
}

/** Los `.jsonl` y `.json` de una carpeta, a cualquier profundidad. */
function textos(dir: string): string[] {
  const salen: string[] = []
  const ver = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) ver(join(d, e.name))
      else if (e.isFile() && /\.jsonl?$/.test(e.name)) salen.push(join(d, e.name))
    }
  }
  if (existsSync(dir)) ver(dir)
  return salen
}

/**
 * En los hilos de `datos/sessions`, la carpeta (`cwd`) que empieza por `de` pasa a empezar por `a`, y las rutas bajo `de`
 * de su registro (`.jsonl`) también. Antes de cambiar un archivo, lo copia a `datos/respaldo-migracion/sessions`. La
 * sesión de Claude Code de esa carpeta (`<proyectos>/<cwd con guiones>`) se copia a la del cwd nuevo con sus rutas
 * reescritas. Devuelve cuántos hilos cambió.
 */
export function reescribirSesiones(datos: string, de: string, a: string, proyectos: string[] = [], extra: [string, string][] = []): number {
  const sesiones = join(datos, 'sessions')
  if (!existsSync(sesiones) || de.toLowerCase() === a.toLowerCase()) return 0
  const respaldo = join(datos, 'respaldo-migracion', 'sessions')
  // También la ruta física de `de`, si la virtualiza el paquete de Claude Desktop, y su nombre con guiones (Claude Code
  // nombra así sus carpetas de `projects` y de temporales), y los cambios de más (`extra`).
  const des = [...new Set([de, rutaReal(de)])]
  const pares: [string, string][] = [...des.flatMap((d): [string, string][] => [[d, a], [proyectoClaude(d), proyectoClaude(a)]]), ...extra]
  const cambiar = cambiosDeRuta(pares)
  const bajo = (cwd: string) => des.some((d) => cwd.toLowerCase().startsWith(d.toLowerCase()))
  let cambiados = 0
  const copiados = new Set<string>()
  for (const f of readdirSync(sesiones)) {
    if (!f.endsWith('.json')) continue
    const ruta = join(sesiones, f)
    try {
      const texto = readFileSync(ruta, 'utf8')
      const meta = JSON.parse(texto) as { cwd?: unknown }
      if (typeof meta.cwd !== 'string' || !bajo(meta.cwd)) continue
      const cwd = cambiar(meta.cwd)
      mkdirSync(respaldo, { recursive: true })
      if (!existsSync(join(respaldo, f))) writeFileSync(join(respaldo, f), texto)
      const registro = join(sesiones, f.replace(/\.json$/, '.jsonl'))
      if (existsSync(registro)) {
        const r = join(respaldo, f.replace(/\.json$/, '.jsonl'))
        if (!existsSync(r)) copiar(registro, r)
        // Su vista (historial.ts) es una copia del registro: se rehace sola al pedirse.
        if (reescribir(registro, cambiar)) rmSync(join(sesiones, 'vistas', f), { force: true })
      }
      for (const p of proyectos) {
        const antes = join(p, proyectoClaude(meta.cwd))
        const despues = join(p, proyectoClaude(cwd))
        if (!existsSync(antes) || copiados.has(antes.toLowerCase())) continue
        copiados.add(antes.toLowerCase())
        copiar(antes, despues)
        const enClaude = cambiosDeRuta([...pares, [antes, despues]])
        for (const t of textos(despues)) reescribir(t, enClaude)
      }
      writeFileSync(ruta, cambiar(JSON.stringify({ ...meta, cwd }, null, 2)))
      cambiados++
    } catch (e) {
      console.error(`No pude pasar ${f} a la carpeta nueva: ${e instanceof Error ? e.message : e}`)
    }
  }
  // Lo que anotó la importación de Sloth (`importar-sloth.ts`) también apunta a la carpeta de trabajo.
  const marcaSloth = join(datos, 'importado-de-sloth.json')
  if (cambiados && existsSync(marcaSloth)) reescribir(marcaSloth, cambiar)
  return cambiados
}

/**
 * Copia una carpeta sin seguir sus enlaces: cada enlace (los `node_modules` de los videos, una carpeta de otro hilo) se
 * vuelve a crear apuntando a lo mismo, en vez de copiar lo que hay detrás. `cpSync` en Windows copia el contenido de
 * las uniones (junctions). No pisa lo que ya esté.
 */
export function copiarConEnlaces(de: string, a: string) {
  mkdirSync(a, { recursive: true })
  for (const d of readdirSync(de, { withFileTypes: true })) {
    const origen = join(de, d.name)
    const destino = join(a, d.name)
    if (d.isSymbolicLink()) {
      if (existsSync(destino)) continue
      const objetivo = readlinkSync(origen)
      let carpeta = true
      try {
        carpeta = statSync(origen).isDirectory()
      } catch {}
      symlinkSync(objetivo.replace(/^\\\\\?\\/, ''), destino, carpeta ? 'junction' : 'file')
    } else if (d.isDirectory()) copiarConEnlaces(origen, destino)
    else if (d.isFile() && !existsSync(destino)) {
      copyFileSync(origen, destino)
      const s = statSync(origen)
      utimesSync(destino, s.atime, s.mtime)
    }
  }
}

/**
 * v1.1: copia la carpeta de trabajo de desarrollo `vieja` a `nueva` si `nueva` aún no existe, sin tocar la vieja. Los
 * enlaces de la copia que apuntaban dentro de la vieja (o a su ruta física) apuntan a la copia. Deja `MARCA_TRABAJO`.
 * Devuelve si copió.
 */
export function migrarTrabajo(vieja: string, nueva: string): boolean {
  if (vieja.toLowerCase() === nueva.toLowerCase() || existsSync(nueva) || !existsSync(vieja)) return false
  mkdirSync(dirname(nueva), { recursive: true })
  copiarConEnlaces(vieja, nueva)
  repuntarEnlaces(nueva, [...new Set([vieja, rutaReal(vieja)])], nueva)
  writeFileSync(
    join(nueva, MARCA_TRABAJO),
    `Copiado de ${vieja} el ${new Date().toISOString()} al sacar de AppData el trabajo de desarrollo de v!d (v1.1).\r\nLa carpeta vieja se dejó intacta: bórrala tú cuando compruebes que todo está aquí.\r\n`
  )
  return true
}

/**
 * Todo lo del servidor, una vez y antes de que nada cree sus carpetas:
 * - `%APPDATA%\tazsloth` → `%APPDATA%\vid-koldgold` (piezas, agentes, llaves de Mac y Linux, la sesión de Cloudflare);
 * - en el repo, `%LOCALAPPDATA%\tazsloth-dev` → `%LOCALAPPDATA%\vid-koldgold-dev`, y su `trabajo` → `trabajo.nuevo`
 *   (`TRABAJO_DEV`: `C:\vid-datos\trabajo` en Windows, v1.1);
 * - en la instalada en Windows, `app\data` y `app\trabajo` de `Programs\tazsloth` → los de esta instalación, si esta aún no
 *   tiene hilos.
 */
export function migrarServidor(app: string, venta: boolean, trabajo?: { viejo: string; nuevo: string }) {
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
      const viejo = trabajo?.viejo ?? join(local, 'vid-koldgold-dev', 'trabajo')
      reescribirSesiones(join(app, 'data'), join(local, 'tazsloth-dev', 'trabajo'), viejo, proyectos)
      if (trabajo) {
        if (migrarTrabajo(trabajo.viejo, trabajo.nuevo)) hechas.push(trabajo.viejo)
        // Si la carpeta de arriba solo tenía el trabajo (`vid-koldgold-dev`), lo que la nombra pasa a la nueva (`vid-datos`).
        const arriba = dirname(trabajo.viejo)
        const solo = existsSync(arriba) && readdirSync(arriba).every((n) => n === 'trabajo' || n.endsWith('.txt'))
        const extra: [string, string][] = solo ? [[arriba, dirname(trabajo.nuevo)]] : []
        if (existsSync(trabajo.nuevo)) reescribirSesiones(join(app, 'data'), trabajo.viejo, trabajo.nuevo, proyectos, extra)
      }
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
