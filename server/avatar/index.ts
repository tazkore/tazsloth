import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { type EstadoAvatar, type FlujoInfo, MOTORES, type MotorAvatar, type TrabajoAvatar, esMotor } from '../../shared/avatar.ts'
import { VENTA } from '../../shared/venta.ts'
import { cuerpo } from '../http.ts'
import * as comfy from './comfy.ts'
import * as inst from './comfy-instalar.ts'
import { guardarConfig, leerConfig } from './config.ts'
import * as eleven from './elevenlabs.ts'
import { FLUJOS, descargaGB, flujoDe, importarFlujo, leerFlujo, prepararFlujo } from './flujos.ts'
import * as hey from './heygen.ts'
import { type NombreLlave, finalLlave, guardarLlave, leerLlave } from './llaves.ts'
import * as nube from './nube.ts'

/**
 * El motor de avatar de v!d: de un audio (y una imagen o un video del personaje) saca el video del avatar hablando. Los
 * agentes lo piden con el MCP `avatar` (`mcp.mjs`, herramientas `motores`, `generar_avatar` y `estado_avatar`); la línea
 * `Avatar: <motor>` del primer mensaje (`shared/avatar.ts`) dice cuál quiere el usuario. Los motores:
 * - `sprites`: el de siempre (boca abierta y cerrada, `bocas.py` y `alinear.py` de la skill). Aquí no se genera nada.
 * - `comfyui-local`: ComfyUI en la computadora (`comfy.ts`, flujos en `flujos.ts`, instalación en `comfy-instalar.ts`).
 * - `nube-gratis`: Colab o un Space de Hugging Face, guiado; el usuario importa el MP4 (`nube.ts`).
 * - `heygen`: la API oficial (`heygen.ts`) o, a mano, Claude en Chrome (`nube.ts`, `paqueteHeygen`).
 * - `codex`: Codex como orquestador. No genera video: recibe la tarea y llama a los demás motores por este mismo MCP.
 * Nada que gaste dinero o baje gigas corre solo: lo piden el agente (con su audio y su salida) o un botón.
 */

const ESPERA_MAXIMA = 50_000
type Trabajo = TrabajoAvatar & { _arranque?: number }

export interface OpcionesAvatar {
  /** `data/` de la app. */
  datos: string
  /** Si hay una cuenta de Codex conectada (la pone el servidor). */
  codexListo?: () => Promise<boolean> | boolean
  fetch?: typeof fetch
}

export function avatar(opts: OpcionesAvatar) {
  const f = opts.fetch ?? fetch
  const datos = opts.datos
  const trabajos = new Map<string, Trabajo>()
  // Las skills de HeyGen (`skills/heygen-*`) leen la llave de HEYGEN_API_KEY: los agentes que lance v!d la heredan.
  const llaveHeygenEnv = leerLlave('heygen', datos)
  if (llaveHeygenEnv) process.env.HEYGEN_API_KEY = llaveHeygenEnv
  /** La GPU hace una cosa a la vez. */
  let fila: Promise<unknown> = Promise.resolve()
  const enFila = <T>(fn: () => Promise<T>) => {
    const r = fila.then(fn, fn)
    fila = r.catch(() => {})
    return r
  }

  // La lista de voces de ElevenLabs, que se pide a lo más cada 10 minutos.
  let voces: { cuando: number; llave: string; lista: eleven.VozEleven[] } | null = null
  async function vocesEleven(forzar = false): Promise<eleven.VozEleven[]> {
    const llave = leerLlave('elevenlabs', datos)
    if (!llave) return []
    if (!forzar && voces && voces.llave === llave && Date.now() - voces.cuando < 600_000) return voces.lista
    const lista = await eleven.listarVoces(llave, f)
    voces = { cuando: Date.now(), llave, lista }
    return lista
  }

  // ── El estado ────────────────────────────────────────────────────────────────────────────────────────────────

  async function estado(): Promise<EstadoAvatar> {
    const stats = await comfy.detectar(comfy.BASE_COMFY, f)
    const raiz = inst.raizComfy(datos)
    const instalando = inst.progresoDe('comfy')
    const comfyEstado: EstadoAvatar['comfy'] = {
      estado: stats ? 'corriendo' : raiz ? 'instalado' : 'no-instalado',
      base: comfy.BASE_COMFY,
      version: stats?.version,
      gpu: stats?.gpu,
      vramLibreGB: stats?.vramLibreGB,
      propio: inst.esDeV(),
      instalando: instalando && !instalando.fin ? { paso: instalando.paso, avance: instalando.avance, error: instalando.error } : undefined,
      arrancando: inst.arrancandoComfy(),
      carpeta: inst.carpetaComfy()
    }
    const flujos: FlujoInfo[] = FLUJOS.map((x) => {
      const p = inst.progresoDe(x.id)
      return {
        id: x.id,
        nombre: x.nombre,
        entrada: x.entrada,
        vramGB: x.vramGB,
        cabeEn8: x.cabeEn8,
        descargaGB: descargaGB(x),
        nota: x.nota,
        flujo: x.flujo,
        estado: inst.estadoDeFlujo(x, raiz),
        sinFlujo: !leerFlujo(x.id, datos),
        instalando: p && !p.fin ? { paso: p.paso, avance: p.avance, error: p.error } : undefined
      }
    })
    const listoComfy = !!stats && flujos.some((x) => !x.sinFlujo && x.estado !== 'no-instalado')
    const llaveHeygen = leerLlave('heygen', datos)
    const codexListo = (await opts.codexListo?.()) ?? false
    const detalles: Record<MotorAvatar, [boolean, string]> = {
      sprites: [true, 'Siempre disponible.'],
      'comfyui-local': [listoComfy, stats ? (listoComfy ? 'ComfyUI responde y hay un flujo listo.' : 'ComfyUI responde, pero falta instalar o importar un flujo.') : raiz ? 'ComfyUI está instalado pero apagado.' : 'ComfyUI no está instalado.'],
      'nube-gratis': [true, 'Guiado: Colab o Hugging Face.'],
      heygen: [!!llaveHeygen, llaveHeygen ? 'Llave guardada (gasta créditos de HeyGen).' : 'Sin llave: solo "Hacer en HeyGen con Chrome".'],
      codex: [codexListo, codexListo ? 'Codex conectado.' : 'Conecta Codex en Opciones → Agentes.']
    }
    return {
      motores: MOTORES.map((m) => ({ ...m, listo: detalles[m.id][0], detalle: detalles[m.id][1] })),
      comfy: comfyEstado,
      flujos,
      elevenlabs: { llave: finalLlave(leerLlave('elevenlabs', datos)) },
      heygen: { llave: finalLlave(llaveHeygen) },
      codex: { listo: codexListo }
    }
  }

  // ── Generar ──────────────────────────────────────────────────────────────────────────────────────────────────

  const nuevo = (motor: MotorAvatar): Trabajo => {
    const t: Trabajo = { id: randomBytes(6).toString('hex'), estado: 'en-fila', motor }
    trabajos.set(t.id, t)
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    return t
  }
  const absoluta = (ruta: string | undefined, que: string, ext?: RegExp) => {
    if (!ruta || !isAbsolute(ruta) || (ext && !ext.test(ruta))) throw new Error(`${que}: pasa una ruta absoluta${ext ? ` (${ext.source.replace(/[\\$()]/g, '')})` : ''}.`)
    return resolve(ruta)
  }
  const existente = (ruta: string | undefined, que: string) => {
    const r = absoluta(ruta, que)
    if (!existsSync(r)) throw new Error(`No encuentro ${que}: ${r}`)
    return r
  }

  interface Pedido {
    motor: string
    flujo?: string
    imagen?: string
    video?: string
    audio?: string
    guion?: string
    salida?: string
    avatarHeygen?: string
    vozHeygen?: string
    formato?: 'vertical' | 'horizontal'
    carpeta?: string
  }

  /** Elige el flujo de ComfyUI: el pedido, o el primero listo que acepte lo que hay (video o imagen). */
  function elegirFlujo(p: Pedido): string {
    if (p.flujo) {
      if (!flujoDe(p.flujo)) throw new Error(`No conozco el flujo «${p.flujo}». Los hay: ${FLUJOS.map((x) => x.id).join(', ')}.`)
      return p.flujo
    }
    const raiz = inst.raizComfy(datos)
    const listos = FLUJOS.filter((x) => leerFlujo(x.id, datos) && inst.estadoDeFlujo(x, raiz) === 'instalado')
    const ideal = listos.find((x) => (p.video ? x.entrada === 'video+audio' : x.entrada === 'imagen+audio') && x.cabeEn8 === 'si') ?? listos.find((x) => (p.video ? x.entrada === 'video+audio' : true))
    if (!ideal) throw new Error('Ningún flujo de ComfyUI está listo (instalado e importado). Opciones → Avatares y voz → «Instalar modelo». Mientras, usa el motor sprites.')
    return ideal.id
  }

  async function correrComfy(t: Trabajo, p: Pedido) {
    const salida = absoluta(p.salida, 'salida', /\.mp4$/i)
    const audio = existente(p.audio, 'audio')
    const id = elegirFlujo(p)
    const def = flujoDe(id)!
    const guardado = leerFlujo(id, datos)
    if (!guardado) throw new Error(`El flujo ${def.nombre} aún no tiene su JSON: ábrelo en ComfyUI, expórtalo en formato API e impórtalo en Opciones → Avatares y voz.`)
    if (!(await comfy.detectar(comfy.BASE_COMFY, f))) {
      t.paso = 'Arrancando ComfyUI…'
      await inst.arrancarComfy(datos)
    }
    const tiene = await comfy.nodosDisponibles(comfy.BASE_COMFY, f)
    const faltan = comfy.nodosQueFaltan(guardado.prompt, tiene)
    if (faltan.length) throw new Error(`A ComfyUI le faltan nodos para ${def.nombre}: ${faltan.join(', ')}. Pulsa «Instalar modelo» (y reinicia ComfyUI).`)
    if (def.entrada === 'video+audio' && !p.video && !p.imagen) throw new Error(`${def.nombre} pide un video del personaje (o una imagen) y el audio.`)
    if (def.entrada === 'imagen+audio' && !p.imagen) throw new Error(`${def.nombre} pide una imagen del personaje y el audio.`)
    t.paso = 'Subiendo los archivos a ComfyUI…'
    let video = p.video ? existente(p.video, 'video') : undefined
    if (!video && def.entrada === 'video+audio') video = await imagenAVideo(existente(p.imagen, 'imagen'), audio, join(dirname(salida), '_entrada-avatar.mp4'))
    const flujoListo = prepararFlujo(guardado, {
      audio: await comfy.subirArchivo(audio, comfy.BASE_COMFY, f),
      ...(video && guardado.mapeo.video ? { video: await comfy.subirArchivo(video, comfy.BASE_COMFY, f) } : {}),
      ...(def.entrada === 'imagen+audio' && p.imagen ? { imagen: await comfy.subirArchivo(existente(p.imagen, 'imagen'), comfy.BASE_COMFY, f) } : {})
    })
    t.paso = `Encolado en ComfyUI (${def.nombre}). En una RTX 4060 puede tardar de minutos a horas, según el flujo.`
    const pedido = await comfy.encolar(flujoListo, comfy.BASE_COMFY, f)
    const salidas = await comfy.esperar(pedido, { f, alAvanzar: () => (t.paso = `ComfyUI trabaja (${def.nombre})…`) })
    const video_ = comfy.elVideo(salidas)
    if (!video_) throw new Error('ComfyUI terminó, pero el flujo no dejó un video (revisa que su nodo de salida sea VHS_VideoCombine o SaveVideo).')
    await comfy.bajar(video_, salida, comfy.BASE_COMFY, f)
    t.archivo = salida
  }

  async function correrHeygen(t: Trabajo, p: Pedido) {
    const llave = leerLlave('heygen', datos)
    if (!llave) throw new Error('No hay llave de HeyGen. Pégala en Opciones → Avatares y voz, o usa «Hacer en HeyGen con Chrome» (sin llave).')
    const salida = absoluta(p.salida, 'salida', /\.mp4$/i)
    if (!p.avatarHeygen) throw new Error('Falta avatar_heygen: el id de un look (herramienta avatares_heygen o la lista de Opciones).')
    t.paso = 'Pidiendo el video a HeyGen (gasta créditos)…'
    const idVideo = await hey.crearVideo(llave, { avatar: p.avatarHeygen, audio: p.audio ? existente(p.audio, 'audio') : undefined, guion: p.guion, voz: p.vozHeygen, formato: p.formato === 'horizontal' ? '16:9' : '9:16' }, f)
    for (let i = 0; i < 360; i++) {
      const e = await hey.estadoVideo(llave, idVideo, f)
      t.paso = `HeyGen: ${e.estado} (video ${idVideo})`
      if (e.estado === 'error') throw new Error(e.error)
      if (e.estado === 'lista' && e.url) {
        await hey.bajarVideo(e.url, salida, f)
        t.archivo = salida
        return
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    throw new Error(`HeyGen no terminó en 30 minutos. El video ${idVideo} sigue en tu cuenta de HeyGen.`)
  }

  function pedir(p: Pedido): Trabajo {
    if (!esMotor(p.motor)) throw new Error(`Motor «${p.motor}» desconocido. Los hay: ${MOTORES.map((m) => m.id).join(', ')}.`)
    const t = nuevo(p.motor)
    if (p.motor === 'sprites') {
      Object.assign(t, { estado: 'lista', paso: 'sprites no se genera con esta herramienta: sigue con bocas.py y alinear.py de tu skill, como siempre.' })
    } else if (p.motor === 'codex') {
      Object.assign(t, { estado: 'error', error: 'codex no genera video por sí mismo: es el agente que orquesta. Si eres Codex, elige tú el motor real (comfyui-local, heygen o nube-gratis) y vuelve a llamar a generar_avatar con él.' })
    } else if (p.motor === 'nube-gratis') {
      const carpeta = p.carpeta ?? (p.salida ? dirname(dirname(dirname(absoluta(p.salida, 'salida')))) : undefined)
      const paquete = nube.prepararNube(absoluta(carpeta, 'carpeta del video'), p.audio)
      nube.abrir(nube.COLAB)
      nube.abrir(paquete.carpeta)
      Object.assign(t, {
        estado: 'espera-usuario',
        paso: `Preparé el cuaderno de Colab y las instrucciones en ${paquete.carpeta} y abrí Colab. Es un flujo guiado: el usuario sube el audio y la imagen o el video, baja el MP4 y lo importa en Opciones → Avatares y voz → «Importar resultado»${p.salida ? ` (destino: ${p.salida})` : ''}. Mientras, sigue con lo demás o usa sprites.`
      })
    } else {
      void enFila(async () => {
        t.estado = 'generando'
        try {
          if (p.motor === 'comfyui-local') await correrComfy(t, p)
          else await correrHeygen(t, p)
          t.estado = 'lista'
        } catch (e) {
          t.estado = 'error'
          t.error = String(e instanceof Error ? e.message : e).split('\n')[0]
        }
      })
    }
    return t
  }

  // ── La API ───────────────────────────────────────────────────────────────────────────────────────────────────

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/avatar')) return false
    const metodo = req.method ?? 'GET'
    const enviar = (status: number, datos_: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(datos_))
      return true
    }
    const falla = (e: unknown, status = 500) => enviar(status, { error: String(e instanceof Error ? e.message : e).split('\n')[0] })
    try {
      if (path === '/api/avatar' && metodo === 'GET') return enviar(200, await estado())

      // Llaves y preferencias
      if (path === '/api/avatar/llave' && metodo === 'POST') {
        const d = await cuerpo<{ nombre?: NombreLlave; llave?: string | null }>(req)
        if (d.nombre !== 'elevenlabs' && d.nombre !== 'heygen') return enviar(400, { error: 'La llave es de elevenlabs o de heygen.' })
        let detalle = ''
        if (d.llave) {
          // Se prueba antes de guardar: una llave mala no se queda.
          if (d.nombre === 'elevenlabs') {
            const r = await eleven.probar(d.llave.trim(), f)
            detalle = `ElevenLabs la aceptó: ${r.voces} voces, ${r.clones} clones.`
          } else {
            const r = await hey.probar(d.llave.trim(), f)
            detalle = `HeyGen la aceptó (${r.usuario}${r.plan ? `, plan ${r.plan}` : ''}).`
          }
        }
        guardarLlave(d.nombre, d.llave || null, datos)
        voces = null
        if (d.nombre === 'heygen') {
          if (d.llave) process.env.HEYGEN_API_KEY = d.llave.trim()
          else delete process.env.HEYGEN_API_KEY
        }
        return enviar(200, { ...(await estado()), detalle })
      }
      if (path === '/api/avatar/probar' && metodo === 'POST') {
        const d = await cuerpo<{ nombre?: NombreLlave }>(req)
        if (d.nombre !== 'elevenlabs' && d.nombre !== 'heygen') return enviar(400, { error: 'La llave es de elevenlabs o de heygen.' })
        const llave = leerLlave(d.nombre, datos)
        if (!llave) return enviar(409, { error: 'Aún no hay llave guardada.' })
        if (d.nombre === 'elevenlabs') {
          const r = await eleven.probar(llave, f)
          return enviar(200, { detalle: `Funciona: ${r.voces} voces, ${r.clones} clones.` })
        }
        const r = await hey.probar(llave, f)
        return enviar(200, { detalle: `Funciona (${r.usuario}${r.plan ? `, plan ${r.plan}` : ''}).` })
      }
      if (path === '/api/avatar/config') {
        if (metodo === 'GET') return enviar(200, leerConfig(datos))
        const d = await cuerpo<Record<string, unknown>>(req)
        const cambios: Record<string, unknown> = {}
        if (d.vozProveedor === 'gemini' || d.vozProveedor === 'elevenlabs') cambios.vozProveedor = d.vozProveedor
        if (typeof d.vozElevenlabs === 'string') cambios.vozElevenlabs = d.vozElevenlabs
        if (typeof d.comfyRaiz === 'string') {
          if (d.comfyRaiz && !existsSync(join(d.comfyRaiz, 'main.py'))) return enviar(400, { error: 'Esa carpeta no tiene main.py: elige la carpeta ComfyUI (la de adentro del portable).' })
          cambios.comfyRaiz = d.comfyRaiz
        }
        return enviar(200, guardarConfig(cambios, datos))
      }
      if (path === '/api/avatar/elevenlabs/voces' && metodo === 'GET') return enviar(200, { voces: await vocesEleven(new URL(req.url ?? '', 'http://x').searchParams.has('actualizar')) })
      if (path === '/api/avatar/heygen/avatares' && metodo === 'GET') {
        const llave = leerLlave('heygen', datos)
        if (!llave) return enviar(409, { error: 'No hay llave de HeyGen.' })
        return enviar(200, { avatares: await hey.listarAvatares(llave, f) })
      }
      if (path === '/api/avatar/heygen/voces' && metodo === 'GET') {
        const llave = leerLlave('heygen', datos)
        if (!llave) return enviar(409, { error: 'No hay llave de HeyGen.' })
        const q = new URL(req.url ?? '', 'http://x').searchParams
        return enviar(200, { voces: await hey.listarVoces(llave, f, { idioma: q.get('idioma') ?? undefined, propias: q.get('propias') === '1' }) })
      }

      // ComfyUI
      if (path === '/api/avatar/comfy/instalar' && metodo === 'POST') return inst.instalarComfy(datos), enviar(200, await estado())
      if (path === '/api/avatar/comfy/arrancar' && metodo === 'POST') {
        void inst.arrancarComfy(datos).catch((e) => console.error(`ComfyUI: ${e instanceof Error ? e.message : e}`))
        return enviar(200, { ...(await estado()), comfy: { ...(await estado()).comfy, arrancando: true } })
      }
      if (path === '/api/avatar/comfy/detener' && metodo === 'POST') return inst.detenerComfy(), enviar(200, await estado())
      if (path === '/api/avatar/comfy/cancelar' && metodo === 'POST') {
        const d = await cuerpo<{ clave?: string }>(req)
        if (d.clave) inst.cancelar(d.clave)
        return enviar(200, await estado())
      }
      if (path === '/api/avatar/comfy/modelo' && metodo === 'POST') {
        const d = await cuerpo<{ id?: string }>(req)
        inst.instalarFlujo(d.id ?? '', datos)
        return enviar(200, await estado())
      }
      if (path === '/api/avatar/comfy/verificar' && metodo === 'POST') {
        const d = await cuerpo<{ id?: string }>(req)
        const def = flujoDe(d.id ?? '')
        if (!def) return enviar(404, { error: 'No conozco ese flujo.' })
        return enviar(200, { enlaces: await inst.verificarEnlaces(def, f) })
      }
      if (path === '/api/avatar/comfy/flujo' && metodo === 'POST') {
        const d = await cuerpo<{ id?: string; json?: string }>(req)
        importarFlujo(d.id ?? '', d.json ?? '', datos)
        return enviar(200, await estado())
      }

      // Generar y esperar
      if (path === '/api/avatar/generar' && metodo === 'POST') {
        const d = await cuerpo<Pedido>(req)
        return enviar(200, publico(pedir(d)))
      }
      const t = /^\/api\/avatar\/trabajos\/(\w+)$/.exec(path)
      if (t && metodo === 'GET') {
        const trabajo = trabajos.get(t[1])
        if (!trabajo) return enviar(404, { error: 'No conozco ese trabajo: v!d se reinició. Vuelve a pedirlo.' })
        const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
        while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await new Promise((r) => setTimeout(r, 500))
        return enviar(200, publico(trabajo))
      }

      // Nube gratis y HeyGen con Chrome
      if (path === '/api/avatar/nube/preparar' && metodo === 'POST') {
        const d = await cuerpo<{ carpeta?: string; audio?: string }>(req)
        const paquete = nube.prepararNube(absoluta(d.carpeta, 'carpeta del video'), d.audio)
        nube.abrir(nube.COLAB)
        nube.abrir(paquete.carpeta)
        return enviar(200, { ...paquete, colab: nube.COLAB, space: nube.SPACE_LATENTSYNC })
      }
      if (path === '/api/avatar/importar' && metodo === 'POST') {
        const d = await cuerpo<{ origen?: string; salida?: string }>(req)
        return enviar(200, { archivo: nube.importarResultado(d.origen ?? '', d.salida ?? '') })
      }
      if (path === '/api/avatar/heygen/paquete' && metodo === 'POST') {
        const d = await cuerpo<{ carpeta?: string; guion?: string; audio?: string; avatar?: string; formato?: 'vertical' | 'horizontal' }>(req)
        const p = nube.paqueteHeygen({ carpetaVideo: absoluta(d.carpeta, 'carpeta del video'), guion: d.guion ?? '', audio: d.audio, avatar: d.avatar, formato: d.formato })
        nube.abrir(p.carpeta)
        return enviar(200, p)
      }
    } catch (e) {
      return falla(e, 400)
    }
    return false
  }

  return {
    api,
    /** Por qué no se puede reiniciar el servidor: cortaría una descarga o un video a medias. */
    ocupado: (): string | null => {
      if (inst.instalandoAlgo()) return 'v!d está instalando ComfyUI o un modelo de avatar. Espera a que termine o cancélalo.'
      if ([...trabajos.values()].some((t) => t.estado === 'generando' || t.estado === 'en-fila')) return 'v!d está generando un video de avatar. Espera a que termine.'
      return null
    },
    /** Las voces de ElevenLabs para `GET /api/voz`, sin que un fallo de la red rompa la voz de siempre. */
    vocesEleven: async () => ({ conectada: !!leerLlave('elevenlabs', datos), voces: await vocesEleven().catch(() => [] as eleven.VozEleven[]) })
  }
}

const publico = ({ _arranque: _, ...t }: Trabajo): TrabajoAvatar => t

/** Un video quieto con la imagen y la duración del audio, para los flujos que piden video. Pide FFmpeg. */
function imagenAVideo(imagen: string, audio: string, salida: string): Promise<string> {
  mkdirSync(dirname(salida), { recursive: true })
  return new Promise((ok, mal) => {
    const p = spawn(process.env.FFMPEG ?? 'ffmpeg', ['-y', '-loop', '1', '-i', imagen, '-i', audio, '-shortest', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', salida], { windowsHide: true, stdio: 'ignore' })
    p.on('error', () => mal(new Error('Este flujo pide un video y solo hay una imagen; para convertirla hace falta FFmpeg (no lo encuentro en el PATH). Pasa un video del personaje.')))
    p.on('exit', (c) => (c === 0 ? ok(salida) : mal(new Error('FFmpeg no pudo convertir la imagen en video.'))))
  })
}

/** El MCP `avatar` para los agentes (`mcp.mjs`): lo corre el Node de v!d y habla con la API de este servidor. */
export function mcpAvatar(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  // Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el MCP a su lado.
  const script = VENTA ? join(aqui, 'avatar', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.VID_URL) return {}
  return { avatar: { type: 'stdio', command: process.execPath, args: [script], env: { VID_URL: process.env.VID_URL, VID_TOKEN: process.env.VID_TOKEN ?? '' } } }
}
