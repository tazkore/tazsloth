import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { segundosWav } from '../../shared/voz.ts'

/**
 * La voz con Chatterbox Multilingual (Resemble AI, MIT) en la computadora: clonacion de voz y espanol, gratis. Corre en
 * un entorno de Python propio (`C:\vid-ia\chatterbox`, lo deja `scripts/instalar-ia-local.ps1`) con un servidor HTTP
 * pequeno (`scripts/chatterbox-servidor.py`, copiado alli como `servidor.py`) en 127.0.0.1:8189:
 *   GET  /salud -> { modelo, dispositivo, idiomas }
 *   POST /tts   { texto, idioma, referencia?, exageracion?, cfg? } -> audio/wav (24 kHz, mono)
 * Este archivo es el cliente, igual que `comfy.ts` y `elevenlabs.ts`. Nada de esto corre sin que el motor este instalado
 * (`local.ts` lo comprueba) y el servidor solo se enciende cuando se pide una voz.
 */
export const BASE_CHATTERBOX = 'http://127.0.0.1:8189'
export const FRECUENCIA = 24000

type F = typeof fetch

export interface Salud {
  modelo: string
  dispositivo: string
}

/** Si el servidor de Chatterbox responde en `base`; si no, `null`. */
export async function detectar(base = BASE_CHATTERBOX, f: F = fetch): Promise<Salud | null> {
  try {
    const r = await f(`${base}/salud`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) return null
    const d = (await r.json()) as { modelo?: string; dispositivo?: string }
    return { modelo: d.modelo ?? 'chatterbox', dispositivo: d.dispositivo ?? 'desconocido' }
  } catch {
    return null
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Enciende el servidor (si hace falta) y espera a que responda. `arrancar` se puede cambiar en las pruebas. */
export async function asegurarServidor(
  raiz: string,
  opts: { base?: string; f?: F; limiteMs?: number; cada?: number; arrancar?: (python: string, script: string, cwd: string) => void } = {}
): Promise<Salud> {
  const base = opts.base ?? BASE_CHATTERBOX
  const ya = await detectar(base, opts.f)
  if (ya) return ya
  const python = join(raiz, 'Scripts', 'python.exe')
  const script = join(raiz, 'servidor.py')
  if (!existsSync(python) || !existsSync(script)) throw new Error(`Chatterbox no esta instalado en ${raiz}: falta ${!existsSync(python) ? 'Scripts\\python.exe' : 'servidor.py'}. Corre scripts\\instalar-ia-local.ps1.`)
  const arrancar =
    opts.arrancar ??
    ((py, sc, cwd) => {
      const p = spawn(py, [sc, '--puerto', new URL(base).port || '8189'], { cwd, windowsHide: true, stdio: 'ignore', detached: false })
      p.unref()
    })
  arrancar(python, script, raiz)
  // El modelo tarda en cargar (la primera vez baja los pesos): hasta 10 minutos.
  const fin = Date.now() + (opts.limiteMs ?? 10 * 60_000)
  while (Date.now() < fin) {
    const s = await detectar(base, opts.f)
    if (s) return s
    await espera(opts.cada ?? 1500)
  }
  throw new Error('El servidor de Chatterbox no respondio en 10 minutos. Revisa C:\\vid-ia\\chatterbox (pip, CUDA).')
}

export interface Pedido {
  texto: string
  salida: string
  /** Idioma del texto (codigo de Chatterbox Multilingual): `es` por omision. */
  idioma?: string
  /** Un audio de 10 a 20 s de la voz a clonar (ruta absoluta). Sin el, la voz por omision. */
  referencia?: string
  exageracion?: number
  base?: string
}

/** Genera la voz y la deja en `salida` (WAV 24 kHz mono, igual que ElevenLabs). */
export async function generar(p: Pedido, f: F = fetch): Promise<{ archivo: string; segundos: number; palabras: number }> {
  const r = await f(`${p.base ?? BASE_CHATTERBOX}/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texto: p.texto, idioma: p.idioma ?? 'es', referencia: p.referencia, exageracion: p.exageracion })
  })
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as { error?: string } | null
    throw new Error(`Chatterbox respondio ${r.status}${e?.error ? `: ${e.error}` : ''}.`)
  }
  const wav = Buffer.from(await r.arrayBuffer())
  const segundos = segundosWav(wav)
  if (!segundos) throw new Error('Chatterbox no devolvio un WAV valido.')
  mkdirSync(dirname(p.salida), { recursive: true })
  writeFileSync(p.salida, wav)
  return { archivo: p.salida, segundos: Math.round(segundos * 10) / 10, palabras: p.texto.split(/\s+/).filter(Boolean).length }
}
