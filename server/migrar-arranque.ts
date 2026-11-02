/**
 * Se importa primero en server/index.ts: copia las carpetas de TazSloth a las de v!d (`migrar.ts`) antes de que otro
 * módulo cree las suyas.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENTA } from '../shared/venta.ts'
import { migrarServidor } from './migrar.ts'

migrarServidor(resolve(dirname(fileURLToPath(import.meta.url)), '..'), VENTA)
