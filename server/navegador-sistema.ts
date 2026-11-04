import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { OpcionNavegador, MarcaNavegador, PreferenciaNavegador } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * El navegador de la computadora con que v!d abre ventanas propias: Google Chrome instalado (lo normal, también en Mac,
 * donde casi nunca hay Edge) o Microsoft Edge. Lo usan la voz (entrar con Google), las redes (TikTok Studio), la
 * investigación de Ideas y el agente (`server/chrome-agente.ts`). Siempre con un perfil de v!d (`--user-data-dir`), nunca
 * el tuyo, y por `server/navegador-seguro.ts`.
 *
 * La preferencia (Opciones → Navegador) vive en `data/navegador-preferencia.json`: `chrome` (por omisión), `edge` o
 * `integrado` (solo cambia al agente: navega en la ventana de v!d, como antes de la 1.0.1).
 */

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVO = join(APP, 'data', 'navegador-preferencia.json')

/** Lo que se mira de la computadora: inyectable en las pruebas. */
export interface Entorno {
  plataforma: NodeJS.Platform
  env: Record<string, string | undefined>
  casa: string
  existe(ruta: string): boolean
  /** La ruta que el registro de Windows da a un programa (App Paths), o `null`. */
  registro?(programa: string): string | null
}

/** Donde instala Chrome cada sistema, en orden. Sin el registro ni el PATH: eso lo mira `buscarChrome`. */
export function rutasChrome(e: Pick<Entorno, 'plataforma' | 'env' | 'casa'>): string[] {
  if (e.plataforma === 'win32')
    return [e.env.PROGRAMFILES ?? 'C:\\Program Files', e.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', e.env.LOCALAPPDATA ?? join(e.casa, 'AppData', 'Local')].map((p) =>
      join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')
    )
  if (e.plataforma === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', join(e.casa, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')]
  return ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
}

/** Igual, Edge. */
export function rutasEdge(e: Pick<Entorno, 'plataforma' | 'env' | 'casa'>): string[] {
  if (e.plataforma === 'win32')
    return [e.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', e.env.PROGRAMFILES ?? 'C:\\Program Files', e.env.LOCALAPPDATA ?? join(e.casa, 'AppData', 'Local')].map((p) =>
      join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    )
  if (e.plataforma === 'darwin') return ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', join(e.casa, 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')]
  return ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']
}

/** Un programa en el PATH (Linux): la primera carpeta que lo tenga. */
function enPath(e: Entorno, nombres: string[]): string | null {
  const carpetas = (e.env.PATH ?? '').split(e.plataforma === 'win32' ? ';' : ':').filter(Boolean)
  for (const n of nombres) for (const c of carpetas) if (e.existe(join(c, n))) return join(c, n)
  return null
}

/** Chrome instalado: la variable `VID_CHROME` si la pusiste, sus rutas de siempre, el registro (Windows) o el PATH (Linux). */
export function buscarChrome(e: Entorno = entornoReal()): string | null {
  if (e.env.VID_CHROME && e.existe(e.env.VID_CHROME)) return e.env.VID_CHROME
  const fija = rutasChrome(e).find((r) => e.existe(r))
  if (fija) return fija
  if (e.plataforma === 'win32') {
    const reg = e.registro?.('chrome.exe')
    return reg && e.existe(reg) ? reg : null
  }
  return e.plataforma === 'linux' ? enPath(e, ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) : null
}

/** Edge instalado. */
export function buscarEdge(e: Entorno = entornoReal()): string | null {
  const fija = rutasEdge(e).find((r) => e.existe(r))
  if (fija) return fija
  if (e.plataforma === 'win32') {
    const reg = e.registro?.('msedge.exe')
    return reg && e.existe(reg) ? reg : null
  }
  return e.plataforma === 'linux' ? enPath(e, ['microsoft-edge', 'microsoft-edge-stable']) : null
}

/** El valor por omisión de `HKLM|HKCU\...\App Paths\<programa>`. */
function delRegistro(programa: string): string | null {
  for (const raiz of ['HKLM', 'HKCU'])
    try {
      const salida = execFileSync('reg', ['query', `${raiz}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${programa}`, '/ve'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        timeout: 5000
      })
      const ruta = /REG_\w+\s+(.+)$/m.exec(salida)?.[1].trim().replace(/^"|"$/g, '')
      if (ruta) return ruta
    } catch {
      // No está en esta raíz.
    }
  return null
}

export const entornoReal = (): Entorno => ({ plataforma: process.platform, env: process.env, casa: homedir(), existe: existsSync, registro: delRegistro })

/** Lo detectado, una vez por arranque (el registro es un proceso). `fresco` vuelve a mirar (Opciones lo pide al abrirse). */
let detectado: { chrome: string | null; edge: string | null } | null = null
export function detectados(fresco = false) {
  if (!detectado || fresco) detectado = { chrome: buscarChrome(), edge: buscarEdge() }
  return detectado
}

const PREFERENCIAS: PreferenciaNavegador[] = ['chrome', 'edge', 'integrado']

export function leerPreferencia(archivo = ARCHIVO): PreferenciaNavegador {
  try {
    const p = JSON.parse(readFileSync(archivo, 'utf8')).navegador
    return PREFERENCIAS.includes(p) ? p : 'chrome'
  } catch {
    return 'chrome'
  }
}

export function guardarPreferencia(p: PreferenciaNavegador, archivo = ARCHIVO) {
  if (!PREFERENCIAS.includes(p)) throw new Error(`Navegador desconocido: ${p}`)
  mkdirSync(dirname(archivo), { recursive: true })
  guardar(archivo, JSON.stringify({ navegador: p }, null, 1))
}

/**
 * El navegador de las ventanas propias de v!d (voz, redes, Ideas) según la preferencia: Chrome y, sin él, Edge; con
 * `edge`, al revés. `integrado` solo cambia al agente: aquí cuenta como `chrome`. `null` si no hay ninguno.
 */
export function elegirNavegador(p: PreferenciaNavegador, hay: { chrome: string | null; edge: string | null }): { marca: MarcaNavegador; exe: string } | null {
  const orden: MarcaNavegador[] = p === 'edge' ? ['edge', 'chrome'] : ['chrome', 'edge']
  for (const marca of orden) if (hay[marca]) return { marca, exe: hay[marca]! }
  return null
}

/** El de ahora, con la preferencia guardada. Lanza un error que se lee si no hay ninguno. */
export function navegadorExterno(): { marca: MarcaNavegador; exe: string } {
  const elegido = elegirNavegador(leerPreferencia(), detectados())
  if (!elegido) throw new Error('No encontré Google Chrome (ni Microsoft Edge). Instala Chrome desde google.com/chrome y vuelve a intentarlo.')
  return elegido
}

export const nombreMarca = (m: MarcaNavegador) => (m === 'chrome' ? 'Chrome' : 'Edge')

/**
 * El perfil de v!d de `base` para un navegador. El de Edge sigue en `base` (donde estaba antes de la 1.0.1); el de
 * Chrome va en `base-chrome`: las cookies de Edge no se pueden pasar a Chrome de forma fiable (las cifra cada navegador
 * con su llave), así que la primera vez se vuelve a iniciar sesión.
 */
export const perfilDe = (base: string, marca: MarcaNavegador) => (marca === 'chrome' ? `${base}-chrome` : base)

/** El archivo que deja v!d en el perfil de Chrome cuando vio en él la sesión (de Google o de la red). */
export const MARCA_SESION = '.vid-sesion'

/**
 * ¿Hay que volver a iniciar sesión por el cambio a Chrome? Había perfil de Edge y el de Chrome aún no tuvo sesión
 * (`marcarSesion`): la carpeta sola no basta, se crea al abrirlo sin ventana.
 */
export const faltaSesionEnChrome = (base: string, marca: MarcaNavegador, existe: (r: string) => boolean = existsSync) =>
  marca === 'chrome' && existe(base) && !existe(join(perfilDe(base, 'chrome'), MARCA_SESION))

/** Apunta que el perfil de Chrome de `base` ya tiene sesión. */
export function marcarSesion(base: string, marca: MarcaNavegador) {
  if (marca !== 'chrome') return
  const archivo = join(perfilDe(base, 'chrome'), MARCA_SESION)
  if (existsSync(archivo)) return
  try {
    mkdirSync(dirname(archivo), { recursive: true })
    guardar(archivo, new Date().toISOString())
  } catch {
    // Solo es un aviso: la próxima vez se vuelve a intentar.
  }
}

export function estadoNavegador(fresco = false): OpcionNavegador {
  const hay = detectados(fresco)
  const preferencia = leerPreferencia()
  const usa = elegirNavegador(preferencia, hay)
  return { preferencia, chrome: hay.chrome, edge: hay.edge, usa: usa?.marca ?? null }
}
