import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, isAbsolute, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { ACCIONES_SKILL, MAX_VIDEO, tipoApi, validarPost, type AccionSkill, type EstadoAgencia, type NuevoPost, type PlanSocial, type TipoUI } from '../../shared/agencia.ts'
import { guardar } from '../disco.ts'
import { cuerpo as body, json as send } from '../http.ts'
import { CABECERA_TOKEN } from '../token.ts'
import type { Proyectos } from '../proyectos.ts'
import { LlavesAgencia } from './llaves.ts'
import { clienteVidApi, ErrorVidApi, tipoDeArchivo, type ClienteVidApi } from './vid-api.ts'
import { correrSkill, planDeTexto } from './skills.ts'

/**
 * `/api/agencia/*`: Opciones → Agencia y la vista Social Media (v!d Fase 4). El navegador nunca ve la llave: cada
 * ruta la toma de `LlavesAgencia` por proyecto y habla con vid-api desde aquí.
 *
 * - `GET config`, `POST llave`, `POST activo`, `POST probar`, `POST estado`: la llave por proyecto y su conexión.
 * - `GET entorno?proyecto=`: la URL y la llave para los scripts de las skills (`social-base/publicar.mjs`). Solo con el
 *   token en la cabecera `x-vid-token` (como lo mandan los procesos locales), nunca con la cookie de la ventana.
 * - `POST archivo` (los bytes, para «o archivo»), `POST subir` → `{trabajo}` y `GET trabajos/<id>`: la subida a la
 *   biblioteca de GHL con su avance.
 * - `POST publicar`, `POST posts`, `POST posts/editar`, `POST posts/borrar`: el Social Planner. Programar o publicar
 *   ya (`scheduled`, `now`) exige `confirmado: true`, que la interfaz manda solo desde el diálogo de confirmación.
 * - `GET/POST plan`: los borradores locales del plan de la semana; `POST skill`: una skill social-* con la memoria.
 */

const MEDIOS = /\.(mp4|mov|m4v|webm|jpe?g|png|webp|gif)$/i

interface Trabajo {
  id: string
  ruta: string
  enviado: number
  total: number
  listo?: { id: string; url: string }
  error?: string
  t: number
}

export interface OpcionesAgencia {
  dir: string
  skills: string
  proyectos: Pick<Proyectos, 'get' | 'leerMemoria' | 'rutaMemoria'>
  /** Para las pruebas. */
  cliente?: (llave: { url: string; llave: string }) => ClienteVidApi
  programaClaude?: () => { pathToClaudeCodeExecutable?: string }
}

export function agencia(o: OpcionesAgencia) {
  const llaves = new LlavesAgencia(o.dir)
  llaves.exportar()
  const subidas = join(o.dir, 'subidas')
  const planes = join(o.dir, 'planes')
  const trabajos = new Map<string, Trabajo>()
  const estados = new Map<string, { t: number; estado: EstadoAgencia }>()

  function cliente(proyecto?: string | null) {
    const l = llaves.de(proyecto)
    if (!l) throw new ErrorVidApi('Este proyecto no tiene llave de agencia (ni hay una por defecto): pégala en Opciones → Agencia.', 401, 'sin_llave')
    return (o.cliente ?? ((x) => clienteVidApi(x)))({ url: l.url, llave: l.llave })
  }

  async function estado(proyecto?: string | null, fresco = false) {
    const clave = proyecto ?? ''
    const ya = estados.get(clave)
    if (ya && !fresco && Date.now() - ya.t < 60_000) return ya.estado
    const e = await cliente(proyecto).estado()
    estados.set(clave, { t: Date.now(), estado: e })
    return e
  }

  const planDe = (proyecto: string) => join(planes, `${proyecto.replace(/[^\w-]/g, '')}.json`)
  function leerPlan(proyecto: string): PlanSocial[] {
    try {
      return JSON.parse(readFileSync(planDe(proyecto), 'utf8'))
    } catch {
      return []
    }
  }
  function guardarPlan(proyecto: string, plan: PlanSocial[]) {
    mkdirSync(planes, { recursive: true })
    guardar(planDe(proyecto), JSON.stringify(plan, null, 2) + '\n')
  }

  /** Lo que se puede subir: un video o imagen que existe (de Mis videos o de «o archivo»). */
  function medioLocal(ruta: unknown): string {
    if (typeof ruta !== 'string' || !isAbsolute(ruta) || !MEDIOS.test(ruta)) throw new Error('Solo se suben videos o imágenes de tu computadora.')
    if (!existsSync(ruta) || !statSync(ruta).isFile()) throw new Error('Ese archivo ya no está.')
    return ruta
  }

  /** Un post que se manda: las mismas reglas que vid-api, y la confirmación humana si no es borrador. */
  async function preparar(proyecto: string | undefined, entrada: Partial<NuevoPost> & { tipoUI?: TipoUI }, confirmado: unknown): Promise<NuevoPost> {
    const tipoUI = entrada.tipoUI ?? entrada.tipo ?? 'post'
    const post: NuevoPost = {
      estado: entrada.estado ?? 'draft',
      cuentas: Array.isArray(entrada.cuentas) ? entrada.cuentas.map(String) : [],
      tipo: tipoApi(tipoUI as TipoUI),
      texto: String(entrada.texto ?? ''),
      media: Array.isArray(entrada.media) ? entrada.media : [],
      ...(entrada.fecha ? { fecha: entrada.fecha } : {}),
      ...(entrada.detalles ? { detalles: entrada.detalles } : {}),
      ...(entrada.usuario_id ? { usuario_id: entrada.usuario_id } : {}),
      ...(entrada.categoria ? { categoria: entrada.categoria } : {})
    }
    if (post.estado !== 'draft' && confirmado !== true) throw new Error('Programar o publicar necesita tu confirmación en v!d.')
    const cuentas = (await estado(proyecto)).cuentas
    const errores = validarPost({ ...post, tipoUI: tipoUI as TipoUI }, cuentas)
    if (errores.length) throw new Error(errores.join(' '))
    return post
  }

  async function subir(proyecto: string | undefined, ruta: string): Promise<string> {
    const c = cliente(proyecto)
    const id = randomBytes(8).toString('hex')
    const t: Trabajo = { id, ruta, enviado: 0, total: statSync(ruta).size, t: Date.now() }
    trabajos.set(id, t)
    for (const [k, v] of trabajos) if (Date.now() - v.t > 6 * 3600_000) trabajos.delete(k)
    c.subirArchivo(ruta, (a) => {
      t.enviado = a.enviado
      t.total = a.total
    }).then(
      (m) => void (t.listo = m),
      (e) => void (t.error = e instanceof Error ? e.message : String(e))
    )
    return id
  }

  /** Guarda los bytes que manda la ventana («o archivo») en `subidas/`, hasta 500 MB. */
  async function recibirArchivo(req: IncomingMessage): Promise<string> {
    const nombre = decodeURIComponent(String(req.headers['x-nombre'] ?? 'archivo')).replace(/[^\w.-]+/g, '-').slice(-80) || 'archivo'
    if (!MEDIOS.test(nombre)) throw new Error('Solo se suben videos o imágenes.')
    mkdirSync(subidas, { recursive: true })
    const ruta = join(subidas, `${Date.now().toString(36)}-${nombre}`)
    let n = 0
    const tope = new Transform({
      transform(trozo, _, listo) {
        n += trozo.length
        if (n > MAX_VIDEO) return listo(new Error('El archivo pasa de 500 MB.'))
        listo(null, trozo)
      }
    })
    await pipeline(req, tope, createWriteStream(ruta))
    return ruta
  }

  async function skill(entrada: { accion?: string; proyecto?: string; serie?: string; entrada?: string; redes?: string[]; desde?: string }) {
    const accion = entrada.accion as AccionSkill
    if (!ACCIONES_SKILL[accion]) throw new Error('Esa acción no existe.')
    let memoria = ''
    let memoriaSerie = ''
    let rutaMemoria: string | undefined
    if (entrada.proyecto && o.proyectos.get(entrada.proyecto)) {
      memoria = o.proyectos.leerMemoria(entrada.proyecto)
      rutaMemoria = o.proyectos.rutaMemoria(entrada.proyecto)
      if (entrada.serie) {
        try {
          memoriaSerie = o.proyectos.leerMemoria(entrada.proyecto, entrada.serie)
        } catch { /* La serie ya no existe. */ }
      }
    }
    const texto = await correrSkill(
      o.skills,
      { accion, entrada: String(entrada.entrada ?? ''), memoria, memoriaSerie, rutaMemoria, redes: entrada.redes, desde: entrada.desde },
      { programa: o.programaClaude?.(), cwd: join(o.skills, ACCIONES_SKILL[accion].skill) }
    )
    if (accion !== 'plan' || !entrada.proyecto) return { texto }
    const plan = planDeTexto(texto, entrada.serie)
    if (plan.length) guardarPlan(entrada.proyecto, [...leerPlan(entrada.proyecto), ...plan])
    return { texto, plan }
  }

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/api/agencia/')) return false
    const ruta = path.slice('/api/agencia/'.length)
    const method = req.method ?? 'GET'
    const intentar = async (f: () => unknown | Promise<unknown>) => {
      try {
        send(res, 200, await f())
      } catch (e) {
        const status = e instanceof ErrorVidApi ? (e.status >= 400 && e.status < 600 ? (e.status >= 500 ? 502 : e.status === 401 || e.status === 403 ? 400 : e.status) : 502) : 400
        send(res, status, { error: e instanceof Error ? e.message : String(e), ...(e instanceof ErrorVidApi && e.code ? { code: e.code } : {}) })
      }
      return true
    }
    const datos = async <T>() => (await body<T>(req)) ?? ({} as T)

    if (ruta === 'config' && method === 'GET') return intentar(() => llaves.vista())
    if (ruta === 'llave' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string | null; llave?: string | null; url?: string }>()
        if (d.proyecto && !o.proyectos.get(d.proyecto)) throw new Error('Ese proyecto no existe.')
        llaves.guardar(d.proyecto ?? null, d.llave, d.url)
        estados.delete(d.proyecto ?? '')
        if (!d.proyecto) estados.clear()
        return llaves.vista()
      })
    if (ruta === 'activo' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string | null }>()
        llaves.activar(d.proyecto && o.proyectos.get(d.proyecto) ? d.proyecto : null)
        return { ok: true }
      })
    if ((ruta === 'probar' || ruta === 'estado') && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string | null }>()
        const l = llaves.de(d.proyecto)
        const e = await estado(d.proyecto, ruta === 'probar')
        return { ...e, desde: l?.desde }
      })
    if (ruta === 'entorno' && method === 'GET') {
      // Solo procesos locales: la ventana manda el token en su cookie, no en la cabecera.
      if (typeof req.headers[CABECERA_TOKEN] !== 'string') return send(res, 403, { error: 'Solo para los scripts locales de v!d.' })
      const l = llaves.de(url.searchParams.get('proyecto'))
      return send(res, l ? 200 : 404, l ? { url: l.url, llave: l.llave, desde: l.desde } : { error: 'Sin llave de agencia para ese proyecto.' })
    }
    if (ruta === 'archivo' && method === 'POST') return intentar(async () => ({ ruta: await recibirArchivo(req) }))
    if (ruta === 'subir' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; ruta?: string; url?: string }>()
        if (d.url) {
          if (!/^https:\/\//i.test(d.url)) throw new Error('La URL tiene que ser https.')
          return { media: await cliente(d.proyecto).subirUrl(d.url) }
        }
        const r = medioLocal(d.ruta)
        if (!tipoDeArchivo(r)) throw new Error('Ese tipo de archivo no se puede subir.')
        return { trabajo: await subir(d.proyecto, r), nombre: basename(r) }
      })
    const tr = /^trabajos\/([\w]+)$/.exec(ruta)
    if (tr && method === 'GET')
      return intentar(() => {
        const t = trabajos.get(tr[1])
        if (!t) throw new Error('Esa subida ya no está.')
        return { enviado: t.enviado, total: t.total, listo: t.listo, error: t.error }
      })
    if (ruta === 'publicar' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; post?: Partial<NuevoPost> & { tipoUI?: TipoUI }; confirmado?: boolean; planId?: string }>()
        const post = await preparar(d.proyecto, d.post ?? {}, d.confirmado)
        const r = await cliente(d.proyecto).crearPost(post)
        if (d.planId && d.proyecto) guardarPlan(d.proyecto, leerPlan(d.proyecto).map((p) => (p.id === d.planId ? { ...p, postId: r.post?.id } : p)))
        return r
      })
    if (ruta === 'posts' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; estado?: string; desde?: string; hasta?: string }>()
        const c = cliente(d.proyecto)
        const posts = []
        let total = 0
        // De 50 en 50, hasta 300.
        for (let saltar = 0; saltar < 300; saltar += 50) {
          const r = await c.listarPosts({ estado: d.estado ?? 'todos', desde: d.desde, hasta: d.hasta, limite: 50, saltar })
          total = r.total ?? 0
          posts.push(...(r.posts ?? []))
          if (!r.posts?.length || posts.length >= total) break
        }
        return { total, posts }
      })
    if (ruta === 'posts/editar' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; id?: string; cambios?: Partial<NuevoPost>; confirmado?: boolean }>()
        if (!d.id) throw new Error('Falta la publicación.')
        const cambios = d.cambios ?? {}
        if (cambios.estado && cambios.estado !== 'draft' && d.confirmado !== true) throw new Error('Programar o publicar necesita tu confirmación en v!d.')
        if (cambios.fecha && d.confirmado !== true) throw new Error('Reprogramar necesita tu confirmación en v!d.')
        if (cambios.fecha && Date.parse(cambios.fecha) < Date.now() + 60_000) throw new Error('La fecha tiene que ser al menos un minuto en el futuro.')
        return cliente(d.proyecto).editarPost(d.id, cambios)
      })
    if (ruta === 'posts/borrar' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; id?: string }>()
        if (!d.id) throw new Error('Falta la publicación.')
        return cliente(d.proyecto).borrarPost(d.id)
      })
    if (ruta === 'plan' && method === 'GET')
      return intentar(() => {
        const p = url.searchParams.get('proyecto')
        if (!p || !o.proyectos.get(p)) throw new Error('Ese proyecto no existe.')
        return { plan: leerPlan(p) }
      })
    if (ruta === 'plan' && method === 'POST')
      return intentar(async () => {
        const d = await datos<{ proyecto?: string; plan?: PlanSocial[] }>()
        if (!d.proyecto || !o.proyectos.get(d.proyecto)) throw new Error('Ese proyecto no existe.')
        const plan = (Array.isArray(d.plan) ? d.plan : []).filter((p) => p && typeof p.id === 'string' && typeof p.fecha === 'string').slice(0, 500)
        guardarPlan(d.proyecto, plan)
        return { plan }
      })
    if (ruta === 'skill' && method === 'POST') return intentar(async () => skill(await datos()))
    return false
  }

  return { api, llaves }
}
