import { type ChildProcess, spawn as spawnReal } from 'node:child_process'
import { createServer } from 'node:net'
import type { MarcaNavegador } from '../shared/types.ts'

/**
 * El lanzador de los navegadores instalados (Chrome o Edge) que v!d maneja por CDP: la voz, las redes, la investigación de
 * Ideas y el agente (`chrome-agente.ts`). Las reglas, en un solo lugar:
 * - el depurador solo escucha en 127.0.0.1 (`--remote-debugging-address`);
 * - el puerto es uno libre al azar, no uno fijo que cualquier cosa de la computadora podría probar;
 * - siempre con un perfil de v!d (`--user-data-dir`), nunca el tuyo: sin él no se lanza (Chrome tampoco abre su
 *   depurador en el perfil de siempre desde la 136);
 * - sin la bienvenida ni la pregunta de navegador por omisión;
 * - ninguno sigue vivo cuando v!d se cierra.
 */

/** Un puerto libre de esta computadora (se pide al sistema y se suelta; el navegador lo toma enseguida). */
export function puertoLibre(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer()
    s.unref()
    s.on('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => ok(port))
    })
  })
}

/** El puerto del navegador de un perfil (`valor`, 0 mientras no hay), el proceso que lo abrió y cuál es. */
export interface NavegadorDepurable {
  valor: number
  proceso: ChildProcess | null
  /** Con qué ejecutable se abrió: si cambias de navegador en Opciones, el abierto se cierra y se abre el otro. */
  exe: string | null
}

export const nuevoNavegador = (): NavegadorDepurable => ({ valor: 0, proceso: null, exe: null })

/** Los abiertos por este proceso, para cerrarlos al salir. */
const vivos = new Set<ChildProcess>()
let enganchado = false

function cerrarTodos() {
  for (const p of vivos) {
    try {
      p.kill()
    } catch {
      // Ya se había ido.
    }
  }
  vivos.clear()
}

function enganchar() {
  if (enganchado) return
  enganchado = true
  process.once('exit', cerrarTodos)
  for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(senal, () => (cerrarTodos(), process.exit()))
}

/** Los argumentos que abren el depurador solo hacia esta computadora y en el puerto dado. */
export const argsDepurador = (puerto: number) => [`--remote-debugging-port=${puerto}`, '--remote-debugging-address=127.0.0.1']

/** Lo que va siempre, además del depurador. */
export const ARGS_FIJOS = ['--no-first-run', '--no-default-browser-check']

/**
 * Todos los argumentos: el depurador, los fijos y los de quien lo abre. Quita cualquier `--remote-debugging-*` que venga
 * en `args` (el puerto y la dirección los pone esto) y exige `--user-data-dir`.
 */
export function argumentos(puerto: number, args: string[]): string[] {
  const propios = args.filter((a) => !/^--remote-debugging-(port|address|pipe)\b/.test(a))
  if (!propios.some((a) => a.startsWith('--user-data-dir='))) throw new Error('Un navegador de v!d se abre siempre con su propio perfil (--user-data-dir).')
  return [...argsDepurador(puerto), ...ARGS_FIJOS.filter((f) => !propios.includes(f)), ...propios]
}

/** Para las pruebas: con qué se lanza el proceso. */
export interface Lanzador {
  spawn: typeof spawnReal
  puerto(): Promise<number>
}
const real: Lanzador = { spawn: spawnReal, puerto: puertoLibre }

/** Abre `exe` (Chrome o Edge) con el depurador en un puerto libre; deja el puerto en `nav.valor`. */
export async function lanzarNavegador(nav: NavegadorDepurable, exe: string, args: string[], l: Lanzador = real): Promise<void> {
  enganchar()
  const puerto = await l.puerto()
  const p = l.spawn(exe, argumentos(puerto, args), { stdio: 'ignore', windowsHide: false })
  p.unref?.()
  nav.valor = puerto
  nav.exe = exe
  vivos.add(p)
  nav.proceso = p
  p.once('exit', () => {
    vivos.delete(p)
    if (nav.proceso === p) {
      nav.proceso = null
      nav.valor = 0
      nav.exe = null
    }
  })
  // Uno que no se pudo lanzar (no existe, sin permiso) avisa por `error`: sin esto, tumbaría el servidor.
  p.once('error', () => {
    vivos.delete(p)
    if (nav.proceso === p) Object.assign(nav, nuevoNavegador())
  })
}

/** Cierra el navegador de un perfil si v!d lo abrió. */
export function cerrarNavegador(nav: NavegadorDepurable) {
  nav.proceso?.kill()
}

/** ¿Contesta su depurador? */
export const responde = (nav: NavegadorDepurable) =>
  nav.valor
    ? fetch(`http://127.0.0.1:${nav.valor}/json/version`).then(
        (r) => r.ok,
        () => false
      )
    : Promise.resolve(false)

/** Espera a que conteste (hasta 20 s). */
export async function esperarQueResponda(nav: NavegadorDepurable, intentos = 40) {
  for (let i = 0; i < intentos && !(await responde(nav)); i++) await new Promise((r) => setTimeout(r, 500))
  return responde(nav)
}

/** El texto para los avisos: «Chrome» o «Edge», según el ejecutable. */
export const marcaDe = (exe: string): MarcaNavegador => (/msedge|microsoft edge|microsoft-edge/i.test(exe) ? 'edge' : 'chrome')
