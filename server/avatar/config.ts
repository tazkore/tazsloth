import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardar } from '../disco.ts'
import { DATOS } from '../secretos.ts'

/** Las preferencias de voz y avatar (`data/avatar/config.json`): nada secreto. */
export interface ConfigAvatar {
  /** El proveedor de voz cuando el agente no pide uno ni la línea `Voz:` lo dice. */
  vozProveedor: 'gemini' | 'elevenlabs'
  /** La voz de ElevenLabs por omisión (su id). */
  vozElevenlabs?: string
  /** El modelo de ElevenLabs. Multilingüe por omisión. */
  modeloElevenlabs?: string
  /** La carpeta de ComfyUI (la que tiene `main.py`) si no es la que instaló v!d. */
  comfyRaiz?: string
}

export const MODELO_ELEVENLABS = 'eleven_multilingual_v2'

const archivo = (datos = DATOS) => join(datos, 'avatar', 'config.json')

export function leerConfig(datos?: string): ConfigAvatar {
  try {
    if (existsSync(archivo(datos))) return { vozProveedor: 'gemini', ...JSON.parse(readFileSync(archivo(datos), 'utf8')) }
  } catch {
    // Archivo roto: valen los valores de siempre.
  }
  return { vozProveedor: 'gemini' }
}

export function guardarConfig(cambios: Partial<ConfigAvatar>, datos?: string): ConfigAvatar {
  const nueva = { ...leerConfig(datos), ...cambios }
  mkdirSync(join(datos ?? DATOS, 'avatar'), { recursive: true })
  guardar(archivo(datos), JSON.stringify(nueva, null, 1))
  return nueva
}
