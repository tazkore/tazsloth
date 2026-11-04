import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enmascarar, URL_VID_API, type ConfigAgencia, type LlaveVista } from '../../shared/agencia.ts'
import { guardar } from '../disco.ts'
import { DATOS, guardarSecreto, leerSecreto } from '../secretos.ts'

/**
 * Las llaves de agencia de vid-api, por proyecto, con una «por defecto» para los proyectos sin la suya.
 *
 * - `data/agencia/llaves.json`: `{ defecto?: {url, llave}, proyectos: { <id>: {url, llave} } }`, cifrado con
 *   AES-256-GCM y la llave maestra de `server/secretos.ts` (DPAPI en Windows). Nunca en texto plano ni en un log.
 * - `data/agencia/agencia.json`: lo que no es secreto (el proyecto activo).
 *
 * El proyecto activo (el que se eligió en la barra o en Social Media) decide qué llave reciben los agentes:
 * `VID_AGENCIA_LLAVE` y `VID_API_URL` en el entorno del servidor, que heredan los agentes al arrancar (`exportar`).
 */

interface Llave {
  url: string
  llave: string
}
interface Secretos {
  defecto?: Llave
  proyectos: Record<string, Llave>
}

const ID = /^[\w-]+$/

export class LlavesAgencia {
  readonly archivo: string
  readonly config: string
  constructor(
    readonly dir: string,
    /** La carpeta `data/` (donde vive la llave maestra). */
    readonly datos = DATOS
  ) {
    this.archivo = join(dir, 'llaves.json')
    this.config = join(dir, 'agencia.json')
    mkdirSync(dir, { recursive: true })
  }

  private leer(): Secretos {
    const s = leerSecreto<Secretos>(this.archivo, this.datos)
    return { defecto: s?.defecto, proyectos: s?.proyectos ?? {} }
  }

  private leerConfig(): { activo?: string } {
    try {
      return existsSync(this.config) ? JSON.parse(readFileSync(this.config, 'utf8')) : {}
    } catch {
      return {}
    }
  }

  /** Guarda (o con `llave` vacía o `null`, quita) la llave de un proyecto; sin proyecto, la por defecto. */
  guardar(proyecto: string | null | undefined, llave: string | null | undefined, url?: string) {
    if (proyecto && !ID.test(proyecto)) throw new Error('Ese proyecto no existe.')
    const limpia = (llave ?? '').trim()
    if (limpia && /^pit-/i.test(limpia)) {
      throw new Error('Eso es un token de integración privada de GoHighLevel (pit-…), no la llave de v!d. Emite la «Llave API de v!d» en kold.gold (empieza con kg_live_) y pégala aquí.')
    }
    if (limpia && !/^kg_(live|test)_[0-9a-f]{48}$/.test(limpia)) throw new Error('Esa llave no parece una llave de vid-api: empieza con kg_live_ y lleva 48 caracteres más.')
    const u = (url ?? '').trim() || URL_VID_API
    if (!/^https:\/\/[^\s]+$/i.test(u)) throw new Error('La URL de vid-api tiene que empezar con https://.')
    const s = this.leer()
    const antes = proyecto ? s.proyectos[proyecto] : s.defecto
    // Sin llave nueva pero con URL: cambia solo la URL de la que ya había.
    const valor = limpia ? { url: u, llave: limpia } : llave === undefined && antes ? { ...antes, url: u } : undefined
    if (proyecto) {
      if (valor) s.proyectos[proyecto] = valor
      else delete s.proyectos[proyecto]
    } else if (valor) s.defecto = valor
    else delete s.defecto
    guardarSecreto(this.archivo, s, this.datos)
    this.exportar()
  }

  /** La llave y URL de un proyecto: la suya o, si no tiene, la por defecto. */
  de(proyecto?: string | null): (Llave & { desde: 'proyecto' | 'defecto' }) | undefined {
    const s = this.leer()
    const propia = proyecto ? s.proyectos[proyecto] : undefined
    if (propia) return { ...propia, desde: 'proyecto' }
    return s.defecto ? { ...s.defecto, desde: 'defecto' } : undefined
  }

  /** Lo que ve la interfaz: si hay llave y su máscara, nunca la llave. */
  vista(): ConfigAgencia {
    const s = this.leer()
    const ver = (l?: Llave): LlaveVista => (l ? { url: l.url, tieneLlave: true, mascara: enmascarar(l.llave) } : { url: URL_VID_API, tieneLlave: false })
    return {
      urlPorDefecto: URL_VID_API,
      defecto: ver(s.defecto),
      proyectos: Object.fromEntries(Object.entries(s.proyectos).map(([id, l]) => [id, ver(l)])),
      activo: this.leerConfig().activo
    }
  }

  activo() {
    return this.leerConfig().activo
  }

  /** Cambia el proyecto activo (o ninguno) y lo exporta a los agentes. */
  activar(proyecto?: string | null) {
    if (proyecto && !ID.test(proyecto)) throw new Error('Ese proyecto no existe.')
    const c = this.leerConfig()
    if ((c.activo ?? null) !== (proyecto ?? null)) {
      if (proyecto) c.activo = proyecto
      else delete c.activo
      guardar(this.config, JSON.stringify(c, null, 2) + '\n')
    }
    this.exportar()
  }

  /**
   * `VID_API_URL` y `VID_AGENCIA_LLAVE` en el entorno de este proceso, que heredan los agentes que arranquen después.
   * Sin llave, se quitan. No escribe nada en la consola.
   */
  exportar(entorno: NodeJS.ProcessEnv = process.env) {
    let l: ReturnType<LlavesAgencia['de']>
    try {
      l = this.de(this.activo())
    } catch {
      l = undefined
    }
    entorno.VID_API_URL = l?.url ?? URL_VID_API
    if (l) entorno.VID_AGENCIA_LLAVE = l.llave
    else delete entorno.VID_AGENCIA_LLAVE
  }
}
