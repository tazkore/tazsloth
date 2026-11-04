/**
 * v1.1: en Windows, la instalada puede guardar tus hilos (`app\data`) y tus videos (`app\trabajo`) fuera de la carpeta del
 * programa, en `C:\vid-datos\data` y `C:\vid-datos\trabajo`: así los ven igual la instalada y el repo, sobreviven a
 * cualquier reinstalación y no caen en `AppData\Local` (que el paquete MSIX de Claude Desktop virtualiza).
 *
 * Se activa con `VID_DATOS` y `VID_TRABAJO` (cada carpeta) o, en Windows, si existe `C:\vid-datos`. Si no, todo sigue como
 * siempre, dentro de `app\`. La ventana (electron/main.ts) llama a `enlazarFuera` antes de abrir nada: `app\data` y
 * `app\trabajo` pasan a ser uniones (junctions) a las de fuera, así que el código que usa `join(APP, 'data')` no cambia.
 * Lo que ya hubiera dentro se MUEVE a la de fuera si esta está vacía; si las dos tienen algo, la de dentro se aparta con
 * otro nombre (`data.antes-de-vid-datos-<fecha>`) y no se borra nada.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { copiarConEnlaces } from './migrar.ts'

/** La carpeta de fuera por omisión en Windows. Solo se usa si ya existe (la crea el repo: `C:\vid-datos\trabajo`). */
export const RAIZ_FUERA = 'C:\\vid-datos'

export interface CarpetasFuera {
  datos: string
  trabajo: string
}

/** Dónde van `data` y `trabajo` fuera de la app, o null si van dentro (lo de siempre). */
export function carpetasFuera(env: NodeJS.ProcessEnv = process.env, plataforma: string = process.platform, existe: (r: string) => boolean = existsSync): CarpetasFuera | null {
  const raiz = plataforma === 'win32' && existe(RAIZ_FUERA) ? RAIZ_FUERA : null
  const datos = env.VID_DATOS || (raiz && join(raiz, 'data'))
  const trabajo = env.VID_TRABAJO || (raiz && join(raiz, 'trabajo'))
  return datos && trabajo ? { datos, trabajo } : null
}

const vacia = (dir: string) => {
  try {
    return readdirSync(dir).length === 0
  } catch {
    return true
  }
}

const igual = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** El destino de un enlace (sin el `\\?\` de Windows), o null si no es un enlace. */
function destinoEnlace(ruta: string): string | null {
  try {
    if (!lstatSync(ruta).isSymbolicLink()) return null
    return readlinkSync(ruta).replace(/^\\\\\?\\/, '')
  } catch {
    return null
  }
}

/**
 * Pone `app\<nombre>` como unión a `destino`. Devuelve lo que hizo, en frases, para el registro. Nunca borra contenido:
 * solo quita enlaces o carpetas vacías.
 */
export function enlazar(app: string, nombre: string, destino: string, ahora = new Date()): string[] {
  const enlace = join(app, nombre)
  const hecho: string[] = []
  if (igual(enlace, destino)) return hecho
  const actual = destinoEnlace(enlace)
  if (actual !== null) {
    if (igual(actual, destino) || (existsSync(destino) && existsSync(enlace) && igual(realpathSync.native(enlace), realpathSync.native(destino)))) return hecho
    unlinkSync(enlace)
    hecho.push(`${enlace} apuntaba a ${actual}: ahora a ${destino}`)
  } else if (existsSync(enlace)) {
    if (vacia(enlace)) rmdirSync(enlace)
    else if (!existsSync(destino) || vacia(destino)) {
      mkdirSync(dirname(destino), { recursive: true })
      if (existsSync(destino)) rmdirSync(destino)
      try {
        renameSync(enlace, destino)
        hecho.push(`Moví ${enlace} a ${destino}`)
      } catch {
        // Otra unidad, o algo abierto: se copia y la de dentro se aparta.
        copiarConEnlaces(enlace, destino)
        const aparte = `${enlace}.copiado-a-vid-datos`
        renameSync(enlace, aparte)
        hecho.push(`Copié ${enlace} a ${destino} (la de dentro quedó en ${aparte})`)
      }
    } else {
      const aparte = `${enlace}.antes-de-vid-datos-${ahora.toISOString().slice(0, 19).replace(/[-:T]/g, '')}`
      renameSync(enlace, aparte)
      hecho.push(`${destino} ya tenía datos: los de ${enlace} quedaron aparte en ${aparte}`)
    }
  }
  mkdirSync(destino, { recursive: true })
  mkdirSync(app, { recursive: true })
  symlinkSync(destino, enlace, 'junction')
  hecho.push(`${enlace} → ${destino}`)
  return hecho
}

/** `app\data` y `app\trabajo` a las carpetas de fuera, si las hay (`carpetasFuera`). Devuelve lo que hizo. */
export function enlazarFuera(app: string, fuera: CarpetasFuera | null = carpetasFuera()): string[] {
  if (!fuera) return []
  return [...enlazar(app, 'data', fuera.datos), ...enlazar(app, 'trabajo', fuera.trabajo)]
}
