import { join } from 'node:path'
import { DATOS, guardarSecreto, leerSecreto } from '../secretos.ts'

/**
 * Las llaves de ElevenLabs y HeyGen. Van cifradas con AES-256-GCM y la llave maestra de Windows (`secretos.ts`) en
 * `data/avatar/llaves.json`: ninguna llave se escribe en claro, en el registro ni en un archivo de un video. Si no hay
 * llave guardada, vale la variable de entorno del usuario (`ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`), que también leen los
 * scripts y las skills de HeyGen.
 */
export type NombreLlave = 'elevenlabs' | 'heygen'

const ENTORNO: Record<NombreLlave, string> = { elevenlabs: 'ELEVENLABS_API_KEY', heygen: 'HEYGEN_API_KEY' }

export function archivoLlaves(datos = DATOS) {
  return join(datos, 'avatar', 'llaves.json')
}

function todas(datos?: string): Partial<Record<NombreLlave, string>> {
  try {
    return leerSecreto<Partial<Record<NombreLlave, string>>>(archivoLlaves(datos), datos) ?? {}
  } catch (e) {
    console.error(`No se pudieron leer las llaves de avatar y voz: ${e instanceof Error ? e.message : 'error'}`)
    return {}
  }
}

export function leerLlave(nombre: NombreLlave, datos?: string): string {
  return todas(datos)[nombre] || process.env[ENTORNO[nombre]] || ''
}

/** Guarda la llave (o la quita con `null`). */
export function guardarLlave(nombre: NombreLlave, llave: string | null, datos?: string) {
  const { [nombre]: _, ...resto } = todas(datos)
  guardarSecreto(archivoLlaves(datos), llave ? { ...resto, [nombre]: llave.trim() } : resto, datos)
}

/** Lo único de la llave que se enseña: sus últimas 4 letras. */
export const finalLlave = (llave: string) => (llave ? llave.slice(-4) : null)
