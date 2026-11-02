/**
 * El MCP `avatar`: las herramientas con que un agente (Claude, Codex u OpenCode) pide a v!d el video de un avatar
 * hablando (`index.ts`). Solo habla con la API del servidor (`VID_URL`, con el token `VID_TOKEN` en la cabecera
 * `x-vid-token`). Es JavaScript sin paquetes, para que el Node de v!d lo corra igual en el repo y en la app compilada
 * (`scripts/compilar.mjs` lo copia tal cual). Habla MCP por stdio, un JSON por renglón.
 *
 * Cada herramienta espera como mucho 40 s: Codex corta una herramienta a los 60. Si no acabó, dice el id para seguir
 * esperando con `estado_avatar`. Un video de ComfyUI o de HeyGen tarda minutos: sigue con lo que no lo necesita.
 */
import { createInterface } from 'node:readline'

const URL_VID = process.env.VID_URL ?? process.env.SLOTH_URL ?? 'http://127.0.0.1:4850'
const TOKEN = { 'x-vid-token': process.env.VID_TOKEN ?? '' }
const ESPERA = 40

const HERRAMIENTAS = [
  {
    name: 'motores',
    description:
      'Los motores de avatar de v!d y cuáles están listos ahora: sprites (el de siempre, boca abierta y cerrada), comfyui-local (LatentSync, MuseTalk, InfiniteTalk, FantasyTalking en la GPU del usuario), nube-gratis (Colab o Hugging Face, guiado), heygen (API de pago) y codex (orquestador). También dice qué flujos de ComfyUI están instalados. Úsala antes de generar_avatar si el usuario no dijo el motor con la línea `Avatar:`.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'generar_avatar',
    description:
      'Genera el video del avatar hablando con el motor pedido (la línea `Avatar: <motor>` del mensaje) y deja un .mp4 en `salida`. comfyui-local: pasa `audio` y `video` (LatentSync, MuseTalk) o `imagen` (InfiniteTalk, FantasyTalking); tarda de minutos a horas en una RTX 4060. heygen: pasa `avatar_heygen` y `audio` (o `guion` y `voz_heygen`); GASTA CRÉDITOS del usuario, así que pídelo una sola vez y solo si el usuario eligió heygen. nube-gratis: prepara un cuaderno de Colab y abre las instrucciones; el usuario hace el resto y lo importa. sprites: no genera nada aquí, sigue con tu skill. codex: no genera video; si eres Codex, elige tú el motor real. Si no acabó en 40 s devuelve un id para esperarlo con estado_avatar.',
    inputSchema: {
      type: 'object',
      properties: {
        motor: { type: 'string', enum: ['sprites', 'comfyui-local', 'nube-gratis', 'heygen', 'codex'], description: 'El motor de la línea Avatar:' },
        audio: { type: 'string', description: 'Ruta absoluta del audio (.wav o .mp3) que dice el avatar' },
        imagen: { type: 'string', description: 'Ruta absoluta de la imagen del personaje (.png o .jpg)' },
        video: { type: 'string', description: 'Ruta absoluta de un video del personaje, para los flujos que sincronizan labios' },
        salida: { type: 'string', description: 'Ruta absoluta del .mp4 que deja, como <carpeta del video>/fuentes/avatar/avatar.mp4' },
        flujo: { type: 'string', enum: ['latentsync', 'musetalk', 'infinitetalk', 'fantasytalking'], description: 'Solo comfyui-local: el flujo. Sin él, elige el primero listo que acepte lo que hay.' },
        avatar_heygen: { type: 'string', description: 'Solo heygen: el id del avatar (look), de avatares_heygen' },
        guion: { type: 'string', description: 'Solo heygen sin audio propio: lo que dice, con la voz voz_heygen' },
        voz_heygen: { type: 'string', description: 'Solo heygen con guion: el id de la voz de HeyGen' },
        formato: { type: 'string', enum: ['vertical', 'horizontal'], description: 'Solo heygen: 9:16 o 16:9' },
        carpeta: { type: 'string', description: 'Solo nube-gratis: la carpeta del video (si no, sale de salida)' }
      },
      required: ['motor', 'salida']
    }
  },
  {
    name: 'estado_avatar',
    description: 'Espera hasta 40 s a un video de avatar que pediste con generar_avatar y dice si ya está (y dónde) o por qué falló.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'El id que dio generar_avatar' } }, required: ['id'] }
  },
  {
    name: 'avatares_heygen',
    description: 'Los avatares (looks) de la cuenta de HeyGen del usuario, con su id, para generar_avatar con motor heygen. Primero los propios. No gasta créditos.',
    inputSchema: { type: 'object', properties: { buscar: { type: 'string', description: 'Solo los que tengan esto en su nombre' } } }
  }
]

async function pedir(ruta, datos) {
  const r = await fetch(`${URL_VID}${ruta}`, datos ? { method: 'POST', headers: { ...TOKEN, 'content-type': 'application/json' }, body: JSON.stringify(datos) } : { headers: TOKEN })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(json.error ?? `v!d respondió ${r.status}`)
  return json
}

function contar(t) {
  if (t.estado === 'lista') return t.archivo ? `Listo: ${t.archivo} (motor ${t.motor}).` : (t.paso ?? 'Listo.')
  if (t.estado === 'error') throw new Error(`El avatar no salió (${t.motor}): ${t.error}`)
  if (t.estado === 'espera-usuario') return t.paso
  return `Sigue ${t.estado === 'en-fila' ? 'esperando su turno' : 'generándose'} (${t.motor}${t.paso ? `: ${t.paso}` : ''}). Llama a estado_avatar con id "${t.id}" para esperarlo; mientras, sigue con lo que no lo necesita.`
}

const LLAMADAS = {
  async motores() {
    const e = await pedir('/api/avatar')
    return [
      ...e.motores.map((m) => `${m.id} [${m.etiqueta}] ${m.listo ? 'LISTO' : 'no listo'}: ${m.detalle}`),
      `ComfyUI: ${e.comfy.estado}${e.comfy.gpu ? ` (${e.comfy.gpu})` : ''}.`,
      ...e.flujos.map((x) => `flujo ${x.id} (${x.nombre}, ${x.entrada}, ~${x.vramGB} GB de VRAM, 8 GB: ${x.cabeEn8}): ${x.estado}${x.sinFlujo ? ', falta importar su JSON' : ''}`)
    ].join('\n')
  },
  async generar_avatar(a) {
    const t = await pedir('/api/avatar/generar', { motor: a.motor, audio: a.audio, imagen: a.imagen, video: a.video, salida: a.salida, flujo: a.flujo, avatarHeygen: a.avatar_heygen, guion: a.guion, vozHeygen: a.voz_heygen, formato: a.formato, carpeta: a.carpeta })
    return contar(t.estado === 'generando' || t.estado === 'en-fila' ? await pedir(`/api/avatar/trabajos/${t.id}?esperar=${ESPERA}`) : t)
  },
  async estado_avatar({ id }) {
    return contar(await pedir(`/api/avatar/trabajos/${encodeURIComponent(id)}?esperar=${ESPERA}`))
  },
  async avatares_heygen({ buscar } = {}) {
    const { avatares } = await pedir('/api/avatar/heygen/avatares')
    const b = buscar?.toLowerCase()
    const lista = avatares.filter((a) => !b || `${a.nombre} ${a.grupo ?? ''}`.toLowerCase().includes(b)).slice(0, 80)
    return [`${lista.length} avatares${b ? ` con «${buscar}»` : ''}:`, ...lista.map((a) => `${a.id} · ${a.nombre}${a.grupo ? ` (${a.grupo})` : ''}${a.propio ? ' · propio' : ''}`)].join('\n')
  }
}

const responder = (id, cosa) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...cosa })}\n`)

createInterface({ input: process.stdin }).on('line', async (renglon) => {
  let m
  try {
    m = JSON.parse(renglon)
  } catch {
    return
  }
  if (m.id === undefined) return // las notificaciones no se contestan
  if (m.method === 'initialize')
    return responder(m.id, { result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'avatar', version: '1.0.0' } } })
  if (m.method === 'ping') return responder(m.id, { result: {} })
  if (m.method === 'tools/list') return responder(m.id, { result: { tools: HERRAMIENTAS } })
  if (m.method === 'tools/call') {
    const llamada = LLAMADAS[m.params?.name]
    if (!llamada) return responder(m.id, { error: { code: -32602, message: `No hay herramienta ${m.params?.name}` } })
    try {
      responder(m.id, { result: { content: [{ type: 'text', text: await llamada(m.params.arguments ?? {}) }] } })
    } catch (e) {
      responder(m.id, { result: { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true } })
    }
    return
  }
  responder(m.id, { error: { code: -32601, message: `No sé hacer ${m.method}` } })
})
