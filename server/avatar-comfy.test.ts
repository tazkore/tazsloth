import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as comfy from './avatar/comfy.ts'
import { descargar, estadoDeFlujo, verificarEnlaces } from './avatar/comfy-instalar.ts'
import { FLUJOS, descargaGB, esFlujoApi, flujoDe, importarFlujo, leerFlujo, mapearFlujo, prepararFlujo } from './avatar/flujos.ts'
import { importarResultado, paqueteHeygen, prepararNube } from './avatar/nube.ts'

const BASE = 'http://comfy.test'

/** Un ComfyUI de mentira. */
function simulado(estado: { historia?: unknown[]; nodos?: string[]; rechazo?: unknown } = {}) {
  const llamadas: { ruta: string; metodo: string; cuerpo?: any; forma?: FormData }[] = []
  let consultas = 0
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url))
    llamadas.push({ ruta: u.pathname + u.search, metodo: init?.method ?? 'GET', cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, forma: init?.body instanceof FormData ? init.body : undefined })
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status })
    if (u.pathname === '/system_stats') return json({ system: { comfyui_version: '0.43.0' }, devices: [{ name: 'NVIDIA GeForce RTX 4060', vram_total: 8 * 1024 ** 3, vram_free: 7 * 1024 ** 3 }] })
    if (u.pathname === '/object_info') return json(Object.fromEntries((estado.nodos ?? ['LoadAudio', 'VHS_LoadVideo']).map((n) => [n, {}])))
    if (u.pathname === '/upload/image') return json({ name: 'subido.bin', subfolder: '' })
    if (u.pathname === '/prompt') return estado.rechazo ? json(estado.rechazo, 400) : json({ prompt_id: 'p1' })
    if (u.pathname === '/history/p1') return json(estado.historia?.[Math.min(consultas++, estado.historia.length - 1)] ?? {})
    if (u.pathname === '/view') return new Response(new Uint8Array([1, 2, 3]))
    return json({}, 404)
  }) as typeof fetch
  return { f, llamadas }
}

test('detectar: dice la versión y la VRAM, y null si no responde', async () => {
  const s = await comfy.detectar(BASE, simulado().f)
  assert.deepEqual(s, { version: '0.43.0', gpu: 'NVIDIA GeForce RTX 4060', vramTotalGB: 8, vramLibreGB: 7 })
  assert.equal(await comfy.detectar(BASE, (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch), null)
})

test('nodosQueFaltan compara el flujo con lo que ComfyUI tiene cargado', async () => {
  const tiene = await comfy.nodosDisponibles(BASE, simulado({ nodos: ['LoadAudio'] }).f)
  const g = leerFlujo('latentsync')!
  assert.deepEqual(comfy.nodosQueFaltan(g.prompt, tiene).sort(), ['LatentSyncNode', 'VHS_LoadVideo', 'VHS_VideoCombine'])
})

test('subirArchivo manda multipart a /upload/image y devuelve el nombre que ve ComfyUI', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-comfy-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const audio = join(dir, 'voz.wav')
  writeFileSync(audio, 'RIFF')
  const { f, llamadas } = simulado()
  assert.equal(await comfy.subirArchivo(audio, BASE, f), 'subido.bin')
  assert.equal(llamadas[0].ruta, '/upload/image')
  assert.match((llamadas[0].forma!.get('image') as File).name, /^vid-[0-9a-f]{8}-voz\.wav$/)
})

test('encolar: manda el flujo; si ComfyUI lo rechaza, dice qué nodo', async () => {
  const flujo = leerFlujo('latentsync')!.prompt
  const bien = simulado()
  assert.equal(await comfy.encolar(flujo, BASE, bien.f), 'p1')
  assert.deepEqual(Object.keys(bien.llamadas[0].cuerpo.prompt), ['1', '2', '3', '4'])
  const mal = simulado({ rechazo: { error: { message: 'Prompt outputs failed validation' }, node_errors: { 3: { class_type: 'LatentSyncNode', errors: [{ message: 'x', details: 'audio: falta' }] } } } })
  await assert.rejects(comfy.encolar(flujo, BASE, mal.f), /failed validation.*nodo 3 \(LatentSyncNode\): audio: falta/)
})

test('esperar: sigue preguntando a /history hasta que sale el video, y lo baja', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-comfy-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const fin = { p1: { status: { status_str: 'success', completed: true }, outputs: { 4: { gifs: [{ filename: 'vid-latentsync_00001-audio.mp4', subfolder: '', type: 'output' }] } } } }
  const { f, llamadas } = simulado({ historia: [{}, {}, fin] })
  const salidas = await comfy.esperar('p1', { base: BASE, f, cada: 1 })
  assert.equal(llamadas.filter((l) => l.ruta.startsWith('/history')).length, 3)
  const video = comfy.elVideo(salidas)!
  assert.equal(video.filename, 'vid-latentsync_00001-audio.mp4')
  await comfy.bajar(video, join(dir, 'x', 'avatar.mp4'), BASE, f)
  assert.deepEqual([...readFileSync(join(dir, 'x', 'avatar.mp4'))], [1, 2, 3])
  assert.match(llamadas.at(-1)!.ruta, /^\/view\?filename=vid-latentsync_00001-audio\.mp4&subfolder=&type=output$/)
})

test('esperar: un nodo que falla en ComfyUI sale como error con su nombre', async () => {
  const { f } = simulado({ historia: [{ p1: { status: { status_str: 'error', messages: [['execution_error', { node_type: 'LatentSyncNode', exception_message: 'CUDA out of memory\ndetalle' }]] }, outputs: {} } }] })
  await assert.rejects(comfy.esperar('p1', { base: BASE, f, cada: 1 }), /LatentSyncNode: CUDA out of memory$/)
})

test('flujos: latentsync viene hecho; los de Wan piden importar el suyo', () => {
  assert.ok(leerFlujo('latentsync'))
  assert.equal(leerFlujo('infinitetalk', mkdtempSync(join(tmpdir(), 'vid-datos-'))), null)
  assert.deepEqual(FLUJOS.map((f) => f.id), ['latentsync', 'musetalk', 'infinitetalk', 'fantasytalking'])
  // Lo que cabe en 8 GB.
  assert.deepEqual(FLUJOS.map((f) => f.cabeEn8), ['si', 'si', 'justo', 'justo'])
  assert.ok(descargaGB(flujoDe('latentsync')!) > 5 && descargaGB(flujoDe('infinitetalk')!) > 30)
  for (const f of FLUJOS) for (const p of f.pesos) assert.match(p.url, /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/main\//, f.id)
})

test('mapearFlujo adivina dónde van la imagen, el audio y la salida; importarFlujo guarda y prepararFlujo los llena', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-datos-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const wan = {
    10: { class_type: 'LoadImage', inputs: { image: 'ejemplo.png' } },
    11: { class_type: 'LoadAudio', inputs: { audio: 'ejemplo.mp3' } },
    12: { class_type: 'WanVideoSampler', inputs: { seed: 7, steps: 4 } },
    13: { class_type: 'VHS_VideoCombine', inputs: { frame_rate: 25 } }
  }
  assert.ok(esFlujoApi(wan))
  assert.deepEqual(mapearFlujo(wan), { video: undefined, imagen: { nodo: '10', campo: 'image' }, audio: { nodo: '11', campo: 'audio' }, semilla: { nodo: '12', campo: 'seed' }, salida: '13' })
  const g = importarFlujo('infinitetalk', JSON.stringify(wan), datos)
  assert.ok(existsSync(join(datos, 'avatar', 'flujos', 'infinitetalk.json')))
  assert.equal(leerFlujo('infinitetalk', datos)?.mapeo.salida, '13')
  const listo = prepararFlujo(g, { imagen: 'vid-1-foto.png', audio: 'vid-2-voz.wav' })
  assert.equal(listo['10'].inputs.image, 'vid-1-foto.png')
  assert.equal(listo['11'].inputs.audio, 'vid-2-voz.wav')
  assert.notEqual(listo['12'].inputs.seed, 7)
  assert.equal(g.prompt['10'].inputs.image, 'ejemplo.png') // el original no se toca
})

test('importarFlujo rechaza el formato de la interfaz y los flujos sin audio', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-datos-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  assert.throws(() => importarFlujo('infinitetalk', JSON.stringify({ nodes: [], links: [] }), datos), /Save \(API Format\)/)
  assert.throws(() => importarFlujo('infinitetalk', '{no es json', datos), /JSON válido/)
  assert.throws(() => importarFlujo('infinitetalk', JSON.stringify({ 1: { class_type: 'LoadImage', inputs: { image: 'a.png' } } }), datos), /LoadAudio/)
  assert.throws(() => importarFlujo('inexistente', '{}', datos), /No conozco el flujo/)
})

test('descargar reanuda un .part con Range y comprueba el tamaño exacto', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-descarga-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const destino = join(dir, 'm', 'modelo.bin')
  mkdirSync(join(dir, 'm'), { recursive: true })
  writeFileSync(`${destino}.part`, Buffer.from([1, 2, 3]))
  const pedidos: (string | null)[] = []
  const f = (async (_u: string, init?: RequestInit) => {
    pedidos.push(new Headers(init?.headers).get('range'))
    return new Response(new Uint8Array([4, 5, 6, 7]), { status: 206, headers: { 'content-length': '4' } })
  }) as unknown as typeof fetch
  await descargar('https://huggingface.co/x/y/resolve/main/modelo.bin', destino, { bytes: 7, f })
  assert.deepEqual(pedidos, ['bytes=3-'])
  assert.deepEqual([...readFileSync(destino)], [1, 2, 3, 4, 5, 6, 7])
  assert.equal(existsSync(`${destino}.part`), false)
  // Ya está entero: no vuelve a pedir nada.
  await descargar('https://x/y', destino, { bytes: 7, f: (async () => { throw new Error('no debía pedir') }) as unknown as typeof fetch })
  // Un archivo de tamaño distinto al esperado se rechaza y no queda a medias.
  const corto = join(dir, 'corto.bin')
  const f2 = (async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-length': '2' } })) as unknown as typeof fetch
  await assert.rejects(descargar('https://x/y', corto, { bytes: 9, f: f2 }), /incompleto/)
  assert.equal(existsSync(corto), false)
})

test('estadoDeFlujo mira nodos y pesos en la carpeta de ComfyUI', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-raiz-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const f = flujoDe('latentsync')!
  assert.equal(estadoDeFlujo(f, null), 'no-instalado')
  assert.equal(estadoDeFlujo(f, raiz), 'no-instalado')
  mkdirSync(join(raiz, 'custom_nodes', 'ComfyUI-LatentSyncWrapper'), { recursive: true })
  assert.equal(estadoDeFlujo(f, raiz), 'parcial')
  // Un peso con el tamaño equivocado no cuenta.
  const tiny = join(raiz, f.pesos[1].destino)
  mkdirSync(join(tiny, '..'), { recursive: true })
  writeFileSync(tiny, 'corto')
  assert.equal(statSync(tiny).size === f.pesos[1].bytes, false)
  assert.equal(estadoDeFlujo(f, raiz), 'parcial')
})

test('verificarEnlaces usa HEAD y compara el tamaño, sin bajar nada', async () => {
  const f = flujoDe('latentsync')!
  const metodos: string[] = []
  const fetcher = (async (_u: string, init?: RequestInit) => {
    metodos.push(init?.method ?? 'GET')
    return new Response(null, { headers: { 'x-linked-size': String(f.pesos[0].bytes) } })
  }) as unknown as typeof fetch
  const r = await verificarEnlaces(f, fetcher)
  assert.deepEqual([...new Set(metodos)], ['HEAD'])
  assert.deepEqual(r.map((x) => x.ok), [true, false]) // el segundo mide otra cosa en esta simulación
})

test('nube: el cuaderno de Colab, el paquete de HeyGen y la importación del MP4', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-nube-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const paquete = prepararNube(dir)
  const nb = JSON.parse(readFileSync(paquete.cuaderno, 'utf8'))
  assert.equal(nb.nbformat, 4)
  assert.ok(JSON.stringify(nb).includes('LatentSync-1.5'))
  assert.match(readFileSync(paquete.instrucciones, 'utf8'), /Importar resultado/)

  const audio = join(dir, 'voz.wav')
  writeFileSync(audio, 'RIFF')
  const h = paqueteHeygen({ carpetaVideo: dir, guion: 'Hola mundo', audio, avatar: 'Alan' })
  assert.ok(existsSync(h.guion) && existsSync(join(h.carpeta, 'voz.wav')) && existsSync(join(h.carpeta, 'INSTRUCCIONES.md')))
  assert.match(h.prompt, /«Alan»/)
  assert.match(h.prompt, /Hola mundo/)
  assert.match(h.prompt, /ANTES de pulsar Generate\/Submit, dime cuantos creditos/)

  const mp4 = join(dir, 'bajado.mp4')
  writeFileSync(mp4, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(8)]))
  assert.equal(importarResultado(mp4, join(dir, 'fuentes', 'avatar', 'avatar.mp4')), join(dir, 'fuentes', 'avatar', 'avatar.mp4'))
  const roto = join(dir, 'roto.mp4')
  writeFileSync(roto, '<html>Not found</html>')
  assert.throws(() => importarResultado(roto, join(dir, 'o.mp4')), /no parece un video/)
  assert.throws(() => importarResultado(join(dir, 'nada.mp4'), join(dir, 'o.mp4')), /No encuentro/)
})
