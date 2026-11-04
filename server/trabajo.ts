import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENTA } from '../shared/venta.ts'
import { type CarpetasFuera, carpetasFuera } from './datos-fuera.ts'

/** Este repo, cuando v!d corre desde aquí. */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * Donde trabajaba la copia del repo hasta v1.1. En Windows, `AppData\Local` la virtualiza el paquete MSIX de Claude
 * Desktop: un v!d arrancado desde ahí y otro desde la terminal veían carpetas distintas. `migrar.ts` la copia a la nueva.
 */
export const TRABAJO_DEV_VIEJO = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'vid-koldgold-dev', 'trabajo')
/**
 * Donde trabaja la copia del repo: fuera de él y, en Windows, fuera de AppData (`C:\vid-datos\trabajo`), para que se vea
 * igual desde cualquier lado. `VID_TRABAJO` la cambia. Espacio en disco la mira también desde la instalada.
 */
export const TRABAJO_DEV = process.env.VID_TRABAJO || (process.platform === 'win32' ? 'C:\\vid-datos\\trabajo' : TRABAJO_DEV_VIEJO)

/**
 * La carpeta donde trabajan los hilos de video y de Ideas: `<app>/trabajo` en la app que se vende. Corriendo desde el
 * repo va fuera de él, porque dentro Claude y Codex leerían en cada hilo las reglas para programar v!d (CLAUDE.md y
 * AGENTS.md), y un video de prueba no se haría como en la computadora de un cliente.
 */
export const carpetaTrabajo = (app: string, fuera: CarpetasFuera | null = carpetasFuera()) =>
  !VENTA && resolve(app) === REPO ? TRABAJO_DEV : (fuera?.trabajo ?? join(app, 'trabajo'))
// La instalada con `C:\vid-datos` (o `VID_DATOS` y `VID_TRABAJO`): sus hilos trabajan en la de fuera, con la misma ruta
// que en el repo; `app\trabajo` es una unión a ella (`datos-fuera.ts`, desde electron/main.ts).
