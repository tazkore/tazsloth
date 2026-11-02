import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { dirname } from 'node:path'
import { guardar } from './disco.ts'

/**
 * El token del servidor local: 32 bytes al azar en `data/servidor-token`, creado al arrancar si no existe. Se exige en
 * todas las rutas `/api` y en `/ws`, además de las validaciones de `origen.ts` (Host, Origin, Sec-Fetch-Site).
 * - La ventana (Electron o el navegador en modo dev) lo recibe en una cookie HttpOnly y SameSite=Strict que el servidor
 *   pone al servir el HTML de la app a una navegación de confianza (`ponerCookie`); el JavaScript de la página no lo ve.
 * - Lo que llama al servidor desde fuera del navegador (el MCP de voz, los scripts de las skills, scripts/start.mjs)
 *   lo manda en la cabecera `x-vid-token`, y lo recibe en la variable `VID_TOKEN` junto a `VID_URL`.
 * Exentas (`exentaDeToken`): la vuelta de Google a YouTube OAuth, que llega de otro sitio (la cookie Strict no viaja) y
 * se comprueba con su state y PKCE; y la vista en vivo del estudio (motor/vivo), solo GET y solo cargada como marco o
 * recurso del navegador desde la otra dirección de esta computadora, que tampoco lleva la cookie.
 */
export const CABECERA_TOKEN = 'x-vid-token'
export const COOKIE_TOKEN = 'vid_token'

export function tokenDelServidor(archivo: string): string {
  if (existsSync(archivo)) {
    const t = readFileSync(archivo, 'utf8').trim()
    if (/^[\w-]{43,}$/.test(t)) return t
  }
  mkdirSync(dirname(archivo), { recursive: true })
  const t = randomBytes(32).toString('base64url')
  guardar(archivo, t)
  if (process.platform !== 'win32') chmodSync(archivo, 0o600)
  return t
}

/** El token que trae la petición: en la cabecera o en la cookie. */
export function tokenDe(req: Pick<IncomingMessage, 'headers'>): string | undefined {
  const cabecera = req.headers[CABECERA_TOKEN]
  if (typeof cabecera === 'string' && cabecera) return cabecera
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=')
    if (k === COOKIE_TOKEN) return v.join('=')
  }
  return undefined
}

export function tokenValido(req: Pick<IncomingMessage, 'headers'>, token: string): boolean {
  const dado = tokenDe(req)
  if (!dado) return false
  const a = Buffer.from(dado)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Las rutas que no llevan token (ver la cabecera). Se piden además de `peticionDeConfianza`. */
export function exentaDeToken(req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>): boolean {
  if (req.method !== 'GET') return false
  const ruta = req.url?.split('?')[0] ?? ''
  const navegacion = req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document'
  if (ruta === '/api/youtube/oauth' && navegacion) return true
  // El marco mismo, o lo que carga ese marco desde su propia dirección.
  const delMarco = req.headers['sec-fetch-dest'] === 'iframe' || req.headers['sec-fetch-site'] === 'same-origin'
  return /^\/api\/sessions\/[\w-]+\/(motor|vivo)(\/|$)/.test(ruta) && delMarco
}

/** Si a esta petición se le da la cookie: una navegación del navegador a la página de la app (no a la API). */
export const pideLaPagina = (req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>) =>
  req.method === 'GET' && !req.url?.startsWith('/api/') && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document'

export const cookieDelToken = (token: string) => `${COOKIE_TOKEN}=${token}; HttpOnly; SameSite=Strict; Path=/`
