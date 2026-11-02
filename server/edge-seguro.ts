import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'

/**
 * Los Edge de v!d que se manejan por CDP (las redes, la investigación de Ideas y la voz). Tres reglas, en un solo lugar:
 * el depurador solo escucha en 127.0.0.1 (`--remote-debugging-address`), el puerto es uno libre al azar en vez de uno
 * fijo que cualquier cosa de la computadora podría probar, y ningún Edge sigue vivo cuando v!d se cierra.
 */

/** Un puerto libre de esta computadora (se pide al sistema y se suelta; Edge lo toma enseguida). */
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

/** El puerto del Edge de un perfil (`valor`, 0 mientras no hay) y el proceso que lo abrió. */
export interface EdgeDepurable {
  valor: number
  proceso: ChildProcess | null
}

export const nuevoEdge = (): EdgeDepurable => ({ valor: 0, proceso: null })

/** Los Edge abiertos por este proceso, para cerrarlos al salir. */
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

/** Los argumentos que abren el depurador de Edge solo hacia esta computadora y en el puerto dado. */
export const argsDepurador = (puerto: number) => [`--remote-debugging-port=${puerto}`, '--remote-debugging-address=127.0.0.1']

/** Abre `exe` con el depurador en un puerto libre; deja el puerto en `edge.valor`. */
export async function lanzarEdge(edge: EdgeDepurable, exe: string, args: string[]): Promise<void> {
  enganchar()
  edge.valor = await puertoLibre()
  const p = spawn(exe, [...argsDepurador(edge.valor), ...args], { stdio: 'ignore' })
  p.unref()
  vivos.add(p)
  edge.proceso = p
  p.once('exit', () => {
    vivos.delete(p)
    if (edge.proceso === p) {
      edge.proceso = null
      edge.valor = 0
    }
  })
}

/** Cierra el Edge de un perfil si v!d lo abrió. */
export function cerrarEdge(edge: EdgeDepurable) {
  edge.proceso?.kill()
}
