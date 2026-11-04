import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { URL_VID_API } from '../shared/agencia.ts'
import { agencia } from './agencia/index.ts'
import { LlavesAgencia } from './agencia/llaves.ts'
import { planDeTexto, promptDeSkill } from './agencia/skills.ts'
import { clienteVidApi, ErrorVidApi, retryAfter } from './agencia/vid-api.ts'

/** Pruebas de la Fase 4 con fetch simulado: nunca se llama a vid-api de verdad ni se publica nada. */

const LLAVE = 'kg_live_' + 'ab12'.repeat(12)

interface Llamada {
  url: string
  init: RequestInit
  cuerpo: string
}

/** Un fetch que contesta en orden lo que se le da y guarda lo que recibió. */
function simulado(respuestas: (Response | Error | (() => Response))[]) {
  const llamadas: Llamada[] = []
  const f = (async (url: string, init: RequestInit = {}) => {
    const cuerpo = init.body ? Buffer.from(await new Response(init.body as BodyInit).arrayBuffer()).toString('latin1') : ''
    llamadas.push({ url, init, cuerpo })
    const r = respuestas.shift()
    if (!r) throw new Error('sin respuesta simulada')
    if (r instanceof Error) throw r
    return typeof r === 'function' ? r() : r
  }) as unknown as typeof fetch
  return { f, llamadas }
}
const json = (datos: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json', ...headers } })
const sinEsperar = { esperar: async () => {} }

const ESTADO = {
  ok: true,
  op: 'estado',
  agencia: { id: null, folio: null, nombre: 'Kold Gold' },
  locationId: 'qfvg0kx2g8DCdPLmIwjx',
  llave: { prefijo: 'kg_live_ab12', limite_por_minuto: 60 },
  cuentas: [
    { id: 'tt1', plataforma: 'tiktok', nombre: 'Kold Gold', tipo: 'business' },
    { id: 'ig1', plataforma: 'instagram', nombre: 'koldgold' },
    { id: 'yt1', plataforma: 'youtube', nombre: 'Kold Gold TV' }
  ],
  usuarios: [{ id: 'u1', nombre: 'Alan' }]
}

test('vid-api: estado manda la llave en x-vid-key y devuelve las cuentas', async () => {
  const { f, llamadas } = simulado([json(ESTADO)])
  const e = await clienteVidApi({ llave: LLAVE, fetch: f }).estado()
  assert.equal(llamadas[0].url, URL_VID_API)
  assert.equal((llamadas[0].init.headers as Record<string, string>)['x-vid-key'], LLAVE)
  assert.deepEqual(JSON.parse(llamadas[0].cuerpo), { op: 'estado' })
  assert.equal(e.agencia.nombre, 'Kold Gold')
  assert.equal(e.cuentas.length, 3)
  assert.equal(e.locationId, 'qfvg0kx2g8DCdPLmIwjx')
})

test('vid-api: subir un archivo va en multipart, con su avance', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-agencia-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ruta = join(dir, 'corte 1.mp4')
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 7)
  writeFileSync(ruta, bytes)
  const { f, llamadas } = simulado([json({ ok: true, media: { id: 'm1', url: 'https://assets.cdn.filesafe.space/loc/media/x.mp4' } })])
  const avances: number[] = []
  const m = await clienteVidApi({ llave: LLAVE, fetch: f }).subirArchivo(ruta, (a) => avances.push(a.enviado))
  assert.equal(m.url, 'https://assets.cdn.filesafe.space/loc/media/x.mp4')
  const h = llamadas[0].init.headers as Record<string, string>
  assert.match(h['content-type'], /^multipart\/form-data; boundary=/)
  assert.equal(Number(h['content-length']), Buffer.byteLength(llamadas[0].cuerpo, 'latin1'))
  assert.match(llamadas[0].cuerpo, /name="op"\r\n\r\nsubir_media/)
  assert.match(llamadas[0].cuerpo, /name="file"; filename="corte 1.mp4"\r\nContent-Type: video\/mp4/)
  assert.ok(llamadas[0].cuerpo.includes(bytes.toString('latin1')))
  assert.equal(avances.at(-1), bytes.length)
})

test('vid-api: crear un borrador', async () => {
  const { f, llamadas } = simulado([json({ ok: true, post: { id: 'p1', estado: 'draft', tipo: 'reel', fecha: null } })])
  const r = await clienteVidApi({ llave: LLAVE, fetch: f }).crearPost({ estado: 'draft', cuentas: ['ig1'], tipo: 'reel', texto: 'Hola', media: ['https://assets.cdn.filesafe.space/a.mp4'] })
  assert.equal(r.post.id, 'p1')
  const enviado = JSON.parse(llamadas[0].cuerpo)
  assert.equal(enviado.op, 'crear_post')
  assert.equal(enviado.estado, 'draft')
})

test('vid-api: un 429 espera lo que dice Retry-After y reintenta', async () => {
  const esperas: number[] = []
  const { f, llamadas } = simulado([json({ ok: false, code: 'rate_limit', message: 'Límite de peticiones.' }, 429, { 'retry-after': '2' }), json({ ok: true, post: { id: 'p2' } })])
  const r = await clienteVidApi({ llave: LLAVE, fetch: f, esperar: async (ms) => void esperas.push(ms) }).crearPost({ estado: 'draft', cuentas: ['ig1'], tipo: 'post', texto: 'x', media: [] })
  assert.equal(r.post.id, 'p2')
  assert.equal(llamadas.length, 2)
  assert.deepEqual(esperas, [2000])
  assert.equal(retryAfter('120'), 30_000)
  assert.equal(retryAfter(null), undefined)
})

test('vid-api: errores en español, sin la llave, y un 5xx no repite crear_post', async () => {
  // 401: el mensaje de vid-api.
  let s = simulado([json({ ok: false, code: 'llave_invalida', message: 'Llave inválida o revocada.' }, 401)])
  await assert.rejects(clienteVidApi({ llave: LLAVE, fetch: s.f, ...sinEsperar }).estado(), (e: ErrorVidApi) => e.status === 401 && e.code === 'llave_invalida' && e.message === 'Llave inválida o revocada.')
  // 403 sin cuerpo: el de v!d.
  s = simulado([new Response('', { status: 403 })])
  await assert.rejects(clienteVidApi({ llave: LLAVE, fetch: s.f, ...sinEsperar }).estado(), /no tiene permiso/)
  // 5xx: estado se repite (3 intentos); crear_post no.
  s = simulado([json({}, 502), json({}, 503), json(ESTADO)])
  assert.equal((await clienteVidApi({ llave: LLAVE, fetch: s.f, ...sinEsperar }).estado()).agencia.nombre, 'Kold Gold')
  assert.equal(s.llamadas.length, 3)
  s = simulado([json({}, 500), json({ ok: true, post: { id: 'dup' } })])
  await assert.rejects(clienteVidApi({ llave: LLAVE, fetch: s.f, ...sinEsperar }).crearPost({ estado: 'draft', cuentas: ['ig1'], tipo: 'post', texto: 'x', media: [] }), /HTTP 500/)
  assert.equal(s.llamadas.length, 1)
  // Una falla de red que repite la llave no la deja ver.
  s = simulado([new Error(`ECONNRESET con ${LLAVE}`)])
  await assert.rejects(clienteVidApi({ llave: LLAVE, fetch: s.f, intentos: 1 }).estado(), (e: Error) => /No se pudo conectar/.test(e.message) && !e.message.includes(LLAVE))
  // Tiempo límite.
  const lento = ((_: string, init: RequestInit) => new Promise((_, no) => init.signal?.addEventListener('abort', () => no(new Error('abort'))))) as unknown as typeof fetch
  await assert.rejects(clienteVidApi({ llave: LLAVE, fetch: lento, timeoutMs: 30, intentos: 1 }).estado(), /tardó más de/)
  // Sin llave, ni se intenta.
  assert.throws(() => clienteVidApi({ llave: ' ' }), /Falta la llave/)
})

test('llaves de agencia: cifradas por proyecto, con la por defecto, y exportadas a los agentes', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-agencia-llaves-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const llaves = new LlavesAgencia(join(datos, 'agencia'), datos)
  const otra = 'kg_live_' + 'cd34'.repeat(12)
  llaves.guardar(null, LLAVE)
  llaves.guardar('kold-gold', otra, 'https://ejemplo.supabase.co/functions/v1/vid-api')
  const archivo = readFileSync(join(datos, 'agencia', 'llaves.json'), 'utf8')
  assert.ok(!archivo.includes(LLAVE) && !archivo.includes(otra) && !archivo.includes('kg_live'), 'las llaves no quedan en texto plano')
  assert.equal(llaves.de('kold-gold')?.llave, otra)
  assert.equal(llaves.de('kold-gold')?.desde, 'proyecto')
  assert.equal(llaves.de('tazkore-ia')?.llave, LLAVE)
  assert.equal(llaves.de('tazkore-ia')?.desde, 'defecto')
  const vista = JSON.stringify(llaves.vista())
  assert.ok(!vista.includes(LLAVE) && !vista.includes(otra), 'la interfaz solo ve la máscara')
  assert.equal(llaves.vista().proyectos['kold-gold'].mascara, `${otra.slice(0, 12)}…${otra.slice(-4)}`)
  const entorno: NodeJS.ProcessEnv = {}
  llaves.activar('kold-gold')
  llaves.exportar(entorno)
  assert.equal(entorno.VID_AGENCIA_LLAVE, otra)
  assert.equal(entorno.VID_API_URL, 'https://ejemplo.supabase.co/functions/v1/vid-api')
  llaves.guardar('kold-gold', null)
  llaves.exportar(entorno)
  assert.equal(entorno.VID_AGENCIA_LLAVE, LLAVE)
  llaves.guardar(null, null)
  llaves.exportar(entorno)
  assert.equal(entorno.VID_AGENCIA_LLAVE, undefined)
  assert.equal(entorno.VID_API_URL, URL_VID_API)
  assert.throws(() => llaves.guardar(null, 'corta'), /no parece una llave/)
  // El token de integración privada de GHL (pit-…) no es la llave de v!d: se rechaza con un aviso claro.
  assert.throws(() => llaves.guardar(null, 'pit-us-' + 'a1b2c3d4-'.repeat(4)), /integración privada de GoHighLevel/)
  assert.throws(() => llaves.guardar(null, LLAVE, 'http://inseguro'), /https/)
})

test('rutas de agencia: confirmar para programar, la llave solo para procesos locales', async (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-agencia-rutas-'))
  const entornoAntes = { llave: process.env.VID_AGENCIA_LLAVE, url: process.env.VID_API_URL }
  t.after(() => {
    rmSync(datos, { recursive: true, force: true })
    for (const [k, v] of [['VID_AGENCIA_LLAVE', entornoAntes.llave], ['VID_API_URL', entornoAntes.url]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v)
  })
  const creados: unknown[] = []
  const falso = {
    estado: async () => ESTADO,
    crearPost: async (p: unknown) => (creados.push(p), { post: { id: 'p9', estado: 'draft', tipo: 'reel', fecha: null } })
  }
  const a = agencia({
    dir: join(datos, 'agencia'),
    skills: join(datos, 'skills'),
    proyectos: { get: (id: string) => (id === 'kold-gold' ? ({ id } as never) : null), leerMemoria: () => '', rutaMemoria: () => '' },
    cliente: () => falso as never
  })
  a.llaves.guardar('kold-gold', LLAVE)
  const servidor = createServer(async (req, res) => {
    if (!(await a.api(req, res, new URL(req.url!, 'http://x')))) res.writeHead(404).end()
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  t.after(() => servidor.close())
  const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api/agencia`
  const post = (ruta: string, cuerpo: unknown) => fetch(`${base}/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
  const medio = 'https://assets.cdn.filesafe.space/loc/media/v.mp4'

  // La config no trae la llave.
  const config = await (await fetch(`${base}/config`)).text()
  assert.ok(!config.includes(LLAVE))
  // Programar sin confirmar: no se manda nada.
  let r = await post('publicar', { proyecto: 'kold-gold', post: { estado: 'scheduled', fecha: new Date(Date.now() + 3600_000).toISOString(), cuentas: ['ig1'], tipoUI: 'reel', texto: 'x', media: [medio] } })
  assert.equal(r.status, 400)
  assert.match((await r.json()).error, /confirmación/)
  assert.equal(creados.length, 0)
  // Las reglas de vid-api, antes de mandar: TikTok sin video de GHL.
  r = await post('publicar', { proyecto: 'kold-gold', post: { estado: 'draft', cuentas: ['tt1'], tipoUI: 'post', texto: 'x', media: ['https://otro.sitio/foto.jpg'] } })
  assert.equal(r.status, 400)
  assert.match((await r.json()).error, /TikTok solo acepta video/)
  // Un borrador sí.
  r = await post('publicar', { proyecto: 'kold-gold', post: { estado: 'draft', cuentas: ['ig1'], tipoUI: 'reel', texto: 'Hola', media: [medio] } })
  assert.equal(r.status, 200)
  assert.equal((creados[0] as { estado: string }).estado, 'draft')
  // Programado y confirmado.
  r = await post('publicar', { proyecto: 'kold-gold', confirmado: true, post: { estado: 'scheduled', fecha: new Date(Date.now() + 3600_000).toISOString(), cuentas: ['ig1'], tipoUI: 'reel', texto: 'x', media: [medio] } })
  assert.equal(r.status, 200)
  // La llave: no con la cookie de la ventana, sí con la cabecera de un proceso local.
  assert.equal((await fetch(`${base}/entorno?proyecto=kold-gold`, { headers: { cookie: 'vid_token=x' } })).status, 403)
  const local = await fetch(`${base}/entorno?proyecto=kold-gold`, { headers: { 'x-vid-token': 'x' } })
  assert.equal((await local.json()).llave, LLAVE)
  // Subir: solo videos o imágenes que existen.
  r = await post('subir', { proyecto: 'kold-gold', ruta: resolve('package.json') })
  assert.equal(r.status, 400)
})

test('skills de redes: el prompt lleva la skill, sus referencias y la memoria; el plan sale del JSON', () => {
  const skills = resolve('skills')
  const p = promptDeSkill(skills, { accion: 'caption', entrada: 'Un reel sobre aduanas', memoria: '# Kold.Gold\nNo vender de frente.', rutaMemoria: 'C:/x/proyectos/kold-gold/MEMORIA.md', redes: ['instagram', 'tiktok'] })
  assert.match(p, /social-caption-writer\/SKILL\.md/)
  assert.match(p, /No vender de frente/)
  assert.match(p, /Un reel sobre aduanas/)
  assert.match(p, /social-base\/references\/redes\.md/)
  assert.match(p, /No publiques nada/)
  assert.throws(() => promptDeSkill(skills, { accion: 'otra' as never, entrada: '' }), /no existe/)
  const plan = planDeTexto('Listo.\n```json\n[{"fecha":"2026-11-09T10:00","redes":["instagram"],"tipo":"reel","texto":"Uno","nota":"el corte 1"},{"fecha":"mal","texto":"x"},{"fecha":"2026-11-10T10:00","tipo":"rarito","texto":"Dos"}]\n```', 'radar')
  assert.equal(plan.length, 2)
  assert.equal(plan[0].tipo, 'reel')
  assert.equal(plan[0].serie, 'radar')
  assert.equal(plan[1].tipo, 'post')
  assert.deepEqual(planDeTexto('sin json'), [])
})
