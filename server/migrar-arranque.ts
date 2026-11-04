/**
 * Se importa primero en server/index.ts: copia las carpetas de TazSloth a las de v!d (`migrar.ts`) antes de que otro
 * módulo cree las suyas. Desde el repo, también el trabajo de desarrollo de AppData a `TRABAJO_DEV` (v1.1).
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENTA } from '../shared/venta.ts'
import { migrarServidor } from './migrar.ts'
import { TRABAJO_DEV, TRABAJO_DEV_VIEJO } from './trabajo.ts'

migrarServidor(resolve(dirname(fileURLToPath(import.meta.url)), '..'), VENTA, { viejo: TRABAJO_DEV_VIEJO, nuevo: TRABAJO_DEV })
