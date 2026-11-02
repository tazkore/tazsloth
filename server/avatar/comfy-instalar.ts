import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { type FlujoDef, FLUJOS, type Peso, descargaGB } from './flujos.ts'
import { BASE_COMFY, detectar } from './comfy.ts'
import { leerConfig } from './config.ts'

/**
 * Instala y arranca ComfyUI (portable de NVIDIA) y los nodos y modelos de cada flujo. NADA de esto corre solo: cada
 * función la llama un botón de Opciones → «Avatares y voz» (rutas `/api/avatar/comfy/*`), porque descarga archivos de
 * varios GB (ComfyUI, 2 GB; LatentSync, 5 GB; Wan, 33 GB).
 *
 * - ComfyUI: la última versión portable de NVIDIA de https://github.com/comfyanonymous/ComfyUI/releases (el repositorio
 *   se mudó a Comfy-Org; GitHub redirige). Es un `.7z`: se extrae con 7-Zip si está y, si no, con `tar` de Windows.
 * - Nodos: el .zip de cada repositorio de GitHub a `custom_nodes/` y `pip install -r requirements.txt` con el Python del
 *   portable. Es lo mismo que haría ComfyUI-Manager, sin depender de que esté instalado (el portable no lo trae).
 * - Pesos: descarga directa con reanudación (`.part`) y comprobación del tamaño exacto.
 * Todo queda en `%LOCALAPPDATA%\vid-koldgold\comfyui` (o `~/.cache/vid-koldgold/comfyui`).
 */
const execP = promisify(execFile)

export interface Progreso {
  paso: string
  /** 0 a 1. */
  avance: number
  error?: string
  fin?: boolean
}

export const carpetaComfy = () => join(process.env.LOCALAPPDATA ?? join(homedir(), '.cache'), 'vid-koldgold', 'comfyui')
const PORTABLE = 'ComfyUI_windows_portable'

/** La carpeta de ComfyUI con `main.py`: la que dijo el usuario en la configuración o la que instaló v!d. */
export function raizComfy(datos?: string): string | null {
  const dicha = leerConfig(datos).comfyRaiz
  const candidatas = [dicha, join(carpetaComfy(), PORTABLE, 'ComfyUI')].filter((c): c is string => !!c)
  return candidatas.find((c) => existsSync(join(c, 'main.py'))) ?? null
}

const pythonDe = (raiz: string) => join(dirname(raiz), 'python_embeded', 'python.exe')

// ── El estado de lo que se está instalando ──────────────────────────────────────────────────────────────────────────

const progresos = new Map<string, Progreso>()
const cancelados = new Set<string>()
export const progresoDe = (clave: string) => progresos.get(clave)
export const instalandoAlgo = () => [...progresos.values()].some((p) => !p.fin && !p.error)

function anotar(clave: string, p: Partial<Progreso>) {
  progresos.set(clave, { paso: '', avance: 0, ...progresos.get(clave), ...p })
}

class Cancelado extends Error {
  constructor() {
    super('Instalación cancelada.')
  }
}

export function cancelar(clave: string) {
  cancelados.add(clave)
}

const revisarCancelado = (clave: string) => {
  if (cancelados.has(clave)) throw new Cancelado()
}

// ── Descargas ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Baja `url` a `destino` reanudando un `.part` si lo hay. Comprueba `bytes` si se sabe. */
export async function descargar(url: string, destino: string, opts: { bytes?: number; alAvanzar?: (hechos: number, total: number) => void; clave?: string; f?: typeof fetch } = {}) {
  const f = opts.f ?? fetch
  if (opts.bytes && existsSync(destino) && statSync(destino).size === opts.bytes) return destino
  mkdirSync(dirname(destino), { recursive: true })
  const parcial = `${destino}.part`
  let hechos = existsSync(parcial) ? statSync(parcial).size : 0
  const r = await f(url, { headers: hechos ? { Range: `bytes=${hechos}-` } : {}, redirect: 'follow' })
  if (r.status === 416) hechos = 0 // el .part ya estaba entero o no sirve: se empieza de nuevo
  else if (!r.ok && r.status !== 206) throw new Error(`No se pudo bajar ${basename(destino)} (${r.status}). ${url}`)
  if (!r.body) throw new Error(`${url} no devolvió datos.`)
  const reanuda = r.status === 206
  if (!reanuda) hechos = 0
  const total = hechos + Number(r.headers.get('content-length') ?? 0)
  const salida = createWriteStream(parcial, { flags: reanuda ? 'a' : 'w' })
  const cuerpo = Readable.fromWeb(r.body as never)
  cuerpo.on('data', (c: Buffer) => {
    hechos += c.length
    opts.alAvanzar?.(hechos, total)
    if (opts.clave && cancelados.has(opts.clave)) cuerpo.destroy(new Cancelado())
  })
  await pipeline(cuerpo, salida)
  const tam = statSync(parcial).size
  if (opts.bytes && tam !== opts.bytes) {
    rmSync(parcial, { force: true })
    throw new Error(`${basename(destino)} bajó incompleto (${tam} de ${opts.bytes} bytes). Vuelve a pulsar el botón.`)
  }
  renameSync(parcial, destino)
  return destino
}

async function extraer(archivo: string, destino: string) {
  mkdirSync(destino, { recursive: true })
  const siete = [process.env.ProgramFiles && join(process.env.ProgramFiles, '7-Zip', '7z.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], '7-Zip', '7z.exe')].filter((p): p is string => !!p && existsSync(p))
  const intentos: [string, string[]][] = [
    ...siete.map((s): [string, string[]] => [s, ['x', '-y', `-o${destino}`, archivo]]),
    ['7z', ['x', '-y', `-o${destino}`, archivo]],
    ['tar', ['-xf', archivo, '-C', destino]]
  ]
  let ultimo = ''
  for (const [cmd, args] of intentos) {
    try {
      await execP(cmd, args, { windowsHide: true, maxBuffer: 1 << 24, timeout: 30 * 60_000 })
      return
    } catch (e) {
      ultimo = e instanceof Error ? e.message.split('\n')[0] : String(e)
    }
  }
  throw new Error(`No pude extraer ${basename(archivo)} (${ultimo}). Instala 7-Zip (winget install 7zip.7zip) y vuelve a intentarlo.`)
}

// ── ComfyUI ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** El .7z portable de NVIDIA de la última versión. */
export async function ultimaPortable(f: typeof fetch = fetch): Promise<{ version: string; url: string; bytes: number }> {
  for (const repo of ['Comfy-Org/ComfyUI', 'comfyanonymous/ComfyUI']) {
    const r = await f(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vid-koldgold' } }).catch(() => null)
    if (!r?.ok) continue
    const d = (await r.json()) as { tag_name: string; assets: { name: string; browser_download_url: string; size: number }[] }
    const a = d.assets.find((x) => x.name === 'ComfyUI_windows_portable_nvidia.7z') ?? d.assets.find((x) => /portable_nvidia(?!_cu\d+_)(?!_arm).*\.7z$/.test(x.name))
    if (a) return { version: d.tag_name, url: a.browser_download_url, bytes: a.size }
  }
  throw new Error('No encontré la versión portable de NVIDIA en las versiones de ComfyUI (GitHub). Descárgala a mano de github.com/comfyanonymous/ComfyUI/releases y extráela en la carpeta que dice Opciones.')
}

/** Botón «Instalar ComfyUI portátil». Baja unos 2 GB. Devuelve enseguida; el avance está en `progresoDe('comfy')`. */
export function instalarComfy(datos?: string): void {
  if (process.platform !== 'win32') throw new Error('El instalador portátil de ComfyUI es de Windows con NVIDIA. En otra computadora instala ComfyUI como dice su documentación y pon su carpeta en la configuración.')
  if (raizComfy(datos)) throw new Error('ComfyUI ya está instalado.')
  if (instalandoAlgo()) throw new Error('Ya se está instalando algo. Espera a que termine.')
  cancelados.delete('comfy')
  anotar('comfy', { paso: 'Buscando la última versión…', avance: 0, error: undefined, fin: false })
  void (async () => {
    try {
      const { version, url, bytes } = await ultimaPortable()
      const carpeta = carpetaComfy()
      const archivo = join(carpeta, 'descarga', 'ComfyUI_windows_portable_nvidia.7z')
      await descargar(url, archivo, { bytes, clave: 'comfy', alAvanzar: (h, t) => anotar('comfy', { paso: `Bajando ComfyUI ${version} (${(h / 1e9).toFixed(2)} de ${(t / 1e9).toFixed(2)} GB)`, avance: (t ? h / t : 0) * 0.8 }) })
      revisarCancelado('comfy')
      anotar('comfy', { paso: 'Extrayendo (unos minutos)…', avance: 0.85 })
      await extraer(archivo, carpeta)
      rmSync(join(carpeta, 'descarga'), { recursive: true, force: true })
      if (!raizComfy(datos)) throw new Error('Se extrajo, pero no encuentro ComfyUI/main.py en la carpeta.')
      anotar('comfy', { paso: `ComfyUI ${version} instalado.`, avance: 1, fin: true })
    } catch (e) {
      anotar('comfy', { error: e instanceof Cancelado ? 'Cancelada. Lo ya bajado se conserva para seguir después.' : e instanceof Error ? e.message : String(e) })
    }
  })()
}

let proceso: ChildProcess | null = null
let arrancando = false
export const arrancandoComfy = () => arrancando
export const esDeV = () => !!proceso && proceso.exitCode === null

/** Botón «Arrancar ComfyUI»: lo lanza como proceso hijo, sin ventana, y espera a que responda. */
export async function arrancarComfy(datos?: string): Promise<void> {
  if (await detectar()) return
  const raiz = raizComfy(datos)
  if (!raiz) throw new Error('ComfyUI no está instalado. Pulsa «Instalar ComfyUI portátil».')
  const python = pythonDe(raiz)
  if (!existsSync(python)) throw new Error(`No encuentro ${python}: la carpeta no es la versión portable. Arráncalo tú y v!d lo detecta en ${BASE_COMFY}.`)
  if (arrancando) return
  arrancando = true
  try {
    proceso = spawn(python, ['-s', join(raiz, 'main.py'), '--windows-standalone-build', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch'], {
      cwd: dirname(raiz),
      windowsHide: true,
      stdio: 'ignore'
    })
    proceso.on('exit', () => (proceso = null))
    for (let i = 0; i < 180 && proceso; i++) {
      if (await detectar()) return
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error('ComfyUI no respondió en 3 minutos. Ábrelo con run_nvidia_gpu.bat para ver su consola.')
  } finally {
    arrancando = false
  }
}

/** Apaga el ComfyUI que arrancó v!d (no toca uno que arrancó el usuario). */
export function detenerComfy() {
  proceso?.kill()
  proceso = null
}

// ── Nodos y modelos de un flujo ─────────────────────────────────────────────────────────────────────────────────────

const nombreDeRepo = (repo: string) => repo.split('/')[1]
export const nodoInstalado = (raiz: string, repo: string) => existsSync(join(raiz, 'custom_nodes', nombreDeRepo(repo)))
const pesoPuesto = (raiz: string, p: Peso) => existsSync(join(raiz, p.destino)) && statSync(join(raiz, p.destino)).size === p.bytes

/** Si lo que pide un flujo está en disco. Con `raiz` `null` (ComfyUI ajeno o sin instalar) no se puede saber. */
export function estadoDeFlujo(f: FlujoDef, raiz: string | null): 'instalado' | 'parcial' | 'no-instalado' {
  if (!raiz) return 'no-instalado'
  const nodos = f.nodos.map((n) => nodoInstalado(raiz, n.repo))
  const pesos = f.pesos.filter((p) => !p.opcional).map((p) => pesoPuesto(raiz, p))
  const todo = [...nodos, ...pesos]
  if (todo.every(Boolean)) return 'instalado'
  return todo.some(Boolean) ? 'parcial' : 'no-instalado'
}

async function instalarNodo(raiz: string, repo: string, clave: string) {
  const destino = join(raiz, 'custom_nodes', nombreDeRepo(repo))
  if (existsSync(destino)) return
  const tmp = join(raiz, 'custom_nodes', `.descarga-${nombreDeRepo(repo)}`)
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  const zip = join(tmp, 'repo.zip')
  await descargar(`https://github.com/${repo}/archive/HEAD.zip`, zip, { clave })
  await extraer(zip, join(tmp, 'x'))
  const dentro = readdirSync(join(tmp, 'x'))
  if (dentro.length !== 1) throw new Error(`El zip de ${repo} no tiene la forma esperada.`)
  renameSync(join(tmp, 'x', dentro[0]), destino)
  rmSync(tmp, { recursive: true, force: true })
  const requisitos = join(destino, 'requirements.txt')
  const python = pythonDe(raiz)
  if (existsSync(requisitos) && existsSync(python)) {
    anotar(clave, { paso: `Instalando las dependencias de ${nombreDeRepo(repo)} (pip)…` })
    await execP(python, ['-s', '-m', 'pip', 'install', '-r', requisitos], { windowsHide: true, maxBuffer: 1 << 26, timeout: 30 * 60_000, cwd: destino }).catch((e) => {
      throw new Error(`pip no pudo instalar las dependencias de ${nombreDeRepo(repo)}: ${String(e.stderr ?? e.message).trim().split('\n').slice(-2).join(' ')}`)
    })
  } else if (existsSync(requisitos)) {
    anotar(clave, { paso: `${nombreDeRepo(repo)} pide dependencias (requirements.txt); este ComfyUI no es el portable: instálalas tú.` })
  }
}

/**
 * Botón «Instalar modelo»: nodos, pesos y el flujo de ejemplo del flujo `id`. Devuelve enseguida. Con ComfyUI apagado o
 * ajeno no se puede (los archivos van a su carpeta): pide instalar el portable o decir dónde está.
 */
export function instalarFlujo(id: string, datos?: string): void {
  const f = FLUJOS.find((x) => x.id === id)
  if (!f) throw new Error(`No conozco el flujo «${id}».`)
  const raiz = raizComfy(datos)
  if (!raiz) throw new Error('Primero instala ComfyUI portátil (o pon la carpeta de tu ComfyUI en la configuración): los modelos van dentro de su carpeta.')
  if (instalandoAlgo()) throw new Error('Ya se está instalando algo. Espera a que termine.')
  cancelados.delete(id)
  anotar(id, { paso: 'Empezando…', avance: 0, error: undefined, fin: false })
  void (async () => {
    try {
      const pasos = f.nodos.length + f.pesos.filter((p) => !p.opcional).length + (f.ejemplo ? 1 : 0)
      let hecho = 0
      const sube = () => anotar(id, { avance: ++hecho / pasos })
      for (const n of f.nodos) {
        revisarCancelado(id)
        anotar(id, { paso: `Instalando el nodo ${nombreDeRepo(n.repo)}…` })
        await instalarNodo(raiz, n.repo, id)
        sube()
      }
      for (const p of f.pesos.filter((x) => !x.opcional)) {
        revisarCancelado(id)
        const base = hecho
        await descargar(p.url, join(raiz, p.destino), {
          bytes: p.bytes,
          clave: id,
          alAvanzar: (h) => anotar(id, { paso: `Bajando ${basename(p.destino)} (${(h / 1e9).toFixed(2)} de ${(p.bytes / 1e9).toFixed(2)} GB)`, avance: (base + h / p.bytes) / pasos })
        })
        sube()
      }
      if (f.ejemplo) {
        anotar(id, { paso: 'Dejando el flujo de ejemplo en ComfyUI…' })
        await descargar(f.ejemplo.url, join(raiz, 'user', 'default', 'workflows', f.ejemplo.nombre))
        sube()
      }
      if (esDeV()) {
        anotar(id, { paso: 'Reiniciando ComfyUI para que cargue los nodos nuevos…' })
        detenerComfy()
        await arrancarComfy(datos)
      }
      anotar(id, { paso: f.flujo === 'importar' ? `Listo (${descargaGB(f)} GB). Falta abrir el ejemplo en ComfyUI, elegir tus modelos, exportarlo en formato API e importarlo aquí.` : `Listo (${descargaGB(f)} GB). Reinicia ComfyUI si estaba abierto.`, avance: 1, fin: true })
    } catch (e) {
      anotar(id, { error: e instanceof Cancelado ? 'Cancelada. Lo ya bajado se conserva.' : e instanceof Error ? e.message : String(e) })
    }
  })()
}

/** Revisa que los enlaces de pesos de un flujo respondan, con peticiones HEAD (no baja nada). */
export async function verificarEnlaces(f: FlujoDef, fetcher: typeof fetch = fetch): Promise<{ destino: string; ok: boolean; bytes?: number; esperado: number }[]> {
  return Promise.all(
    f.pesos.map(async (p) => {
      const r = await fetcher(p.url, { method: 'HEAD', redirect: 'follow' }).catch(() => null)
      const bytes = Number(r?.headers.get('x-linked-size') ?? r?.headers.get('content-length') ?? 0) || undefined
      return { destino: p.destino, ok: !!r?.ok && (!bytes || bytes === p.bytes), bytes, esperado: p.bytes }
    })
  )
}
