import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { segundosWav } from '../shared/voz.ts'
import { asegurarServidor, detectar, generar } from './avatar/chatterbox.ts'
import { nodosQueFaltan } from './avatar/comfy.ts'
import { guardarConfig } from './avatar/config.ts'
import { type FlujoDef, flujoDe, leerFlujo, prepararFlujo } from './avatar/flujos.ts'
import { pcmAWav } from './avatar/elevenlabs.ts'
import { estadoChatterbox, estadoChatterboxVivo, estadoLatentSync, estadoLatentSyncVivo } from './avatar/local.ts'

/** Una carpeta temporal que se borra sola, y `VID_IA_RAIZ` apuntando a una vacía para que no cuente un C:\vid-ia real. */
function aislado(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vid-local-'))
  const antes = process.env.VID_IA_RAIZ
  process.env.VID_IA_RAIZ = join(dir, 'sin-ia')
  // Y LOCALAPPDATA a otra vacía: ahí deja ComfyUI «Instalar modelo» (`carpetaComfy`), y uno real hace fallar la prueba.
  const local = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = join(dir, 'sin-local')
  t.after(() => {
    if (local === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = local
    if (antes === undefined) delete process.env.VID_IA_RAIZ
    else process.env.VID_IA_RAIZ = antes
    rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status })

// ── LatentSync ───────────────────────────────────────────────────────────────────────────────────────────────────

/** El flujo de LatentSync con pesos diminutos, para no crear archivos de 5 GB en las pruebas. */
const defChico = (): FlujoDef => ({ ...flujoDe('latentsync')!, pesos: [{ url: 'x', destino: 'custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/latentsync_unet.pt', bytes: 8 }] })

function comfyFalso(dir: string, nodos: string[], pesos: boolean) {
  const raiz = join(dir, 'ComfyUI')
  mkdirSync(raiz, { recursive: true })
  writeFileSync(join(raiz, 'main.py'), '')
  for (const n of nodos) mkdirSync(join(raiz, 'custom_nodes', n), { recursive: true })
  if (pesos) {
    mkdirSync(join(raiz, 'custom_nodes', 'ComfyUI-LatentSyncWrapper', 'checkpoints'), { recursive: true })
    writeFileSync(join(raiz, 'custom_nodes', 'ComfyUI-LatentSyncWrapper', 'checkpoints', 'latentsync_unet.pt'), '12345678')
  }
  return raiz
}

test('LatentSync: sin ComfyUI sale «No instalado» y dice qué falta', (t) => {
  const dir = aislado(t)
  const e = estadoLatentSync(dir)
  assert.equal(e.estado, 'no-instalado')
  assert.equal(e.listo, false)
  assert.match(e.texto, /^No instalado: falta ComfyUI/)
  assert.match(e.texto, /instalar-ia-local\.ps1/)
})

test('LatentSync: con ComfyUI pero sin nodo ni modelos es parcial, y con todo queda listo', (t) => {
  const dir = aislado(t)
  const raiz = comfyFalso(dir, [], false)
  guardarConfig({ comfyRaiz: raiz }, dir)
  const parcial = estadoLatentSync(dir, defChico())
  assert.equal(parcial.listo, false)
  assert.ok(parcial.falta.some((x) => x.includes('ComfyUI-LatentSyncWrapper')))
  assert.ok(parcial.falta.some((x) => x.includes('latentsync_unet.pt')))

  comfyFalso(dir, ['ComfyUI-LatentSyncWrapper', 'ComfyUI-VideoHelperSuite'], true)
  const listo = estadoLatentSync(dir, defChico())
  assert.deepEqual(listo.falta, [])
  assert.equal(listo.estado, 'instalado')
  assert.equal(listo.listo, true)
})

test('LatentSync: un peso a medias cuenta como incompleto', (t) => {
  const dir = aislado(t)
  const raiz = comfyFalso(dir, ['ComfyUI-LatentSyncWrapper', 'ComfyUI-VideoHelperSuite'], true)
  writeFileSync(join(raiz, 'custom_nodes', 'ComfyUI-LatentSyncWrapper', 'checkpoints', 'latentsync_unet.pt'), '123')
  guardarConfig({ comfyRaiz: raiz }, dir)
  const e = estadoLatentSync(dir, defChico())
  assert.equal(e.listo, false)
  assert.ok(e.falta.some((x) => x.includes('(incompleto)')))
})

test('LatentSync vivo: con ComfyUI encendido comprueba que cargó LatentSyncNode (fetch simulado)', async (t) => {
  const dir = aislado(t)
  guardarConfig({ comfyRaiz: comfyFalso(dir, ['ComfyUI-LatentSyncWrapper', 'ComfyUI-VideoHelperSuite'], true) }, dir)
  const comfy = (nodos: string[]) =>
    (async (url: string | URL) => {
      if (String(url).endsWith('/system_stats')) return respuesta({ system: { comfyui_version: '0.3.0' }, devices: [{ name: 'RTX 4060', vram_total: 8 * 1024 ** 3, vram_free: 7 * 1024 ** 3 }] })
      if (String(url).endsWith('/object_info')) return respuesta(Object.fromEntries(nodos.map((n) => [n, {}])))
      return respuesta({}, 404)
    }) as typeof fetch
  const sin = await estadoLatentSyncVivo(dir, comfy(['VHS_VideoCombine']), defChico())
  assert.equal(sin.listo, false)
  assert.match(sin.texto, /No instalado: ComfyUI esta encendido pero no cargo el nodo LatentSyncNode/)
  const con = await estadoLatentSyncVivo(dir, comfy(['LatentSyncNode', 'VHS_LoadVideo']), defChico())
  assert.equal(con.estado, 'corriendo')
  assert.equal(con.listo, true)
  const apagado = await estadoLatentSyncVivo(dir, (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch, defChico())
  assert.equal(apagado.estado, 'instalado')
  assert.match(apagado.texto, /ComfyUI esta apagado/)
})

test('LatentSync: el flujo incluido recibe el video, el audio y la semilla, y se sabe qué nodos pide', () => {
  const g = leerFlujo('latentsync')!
  assert.ok(g, 'latentsync.json viene con la app')
  const listo = prepararFlujo(g, { video: 'cara.mp4', audio: 'voz.wav' })
  assert.equal(listo[g.mapeo.video!.nodo].inputs.video, 'cara.mp4')
  assert.equal(listo[g.mapeo.audio!.nodo].inputs.audio, 'voz.wav')
  assert.equal(typeof listo[g.mapeo.semilla!.nodo].inputs.seed, 'number')
  assert.equal(g.prompt[g.mapeo.salida].class_type, 'VHS_VideoCombine')
  assert.deepEqual(nodosQueFaltan(g.prompt, new Set(['VHS_LoadVideo', 'LoadAudio', 'VHS_VideoCombine'])), ['LatentSyncNode'])
})

// ── Chatterbox ───────────────────────────────────────────────────────────────────────────────────────────────────

function venvFalso(dir: string, completo: boolean) {
  const raiz = join(dir, 'chatterbox')
  mkdirSync(join(raiz, 'Scripts'), { recursive: true })
  writeFileSync(join(raiz, 'Scripts', 'python.exe'), '')
  if (completo) {
    mkdirSync(join(raiz, 'Lib', 'site-packages', 'chatterbox'), { recursive: true })
    writeFileSync(join(raiz, 'servidor.py'), '')
  }
  return raiz
}

test('Chatterbox: sin entorno sale «No instalado» con qué falta; con todo, listo', (t) => {
  const dir = aislado(t)
  const sin = estadoChatterbox(dir)
  assert.equal(sin.estado, 'no-instalado')
  assert.equal(sin.listo, false)
  assert.match(sin.texto, /^No instalado: falta el entorno de Python/)

  guardarConfig({ chatterboxRaiz: venvFalso(dir, false) }, dir)
  const medio = estadoChatterbox(dir)
  assert.equal(medio.listo, false)
  assert.equal(medio.estado, 'parcial')
  assert.match(medio.texto, /chatterbox-tts/)

  venvFalso(dir, true)
  const listo = estadoChatterbox(dir)
  assert.equal(listo.listo, true)
  assert.equal(listo.estado, 'instalado')
  assert.deepEqual(listo.falta, [])
})

test('Chatterbox: detectar lee /salud y da null si no responde', async () => {
  const bien = (async (url: string | URL) => (String(url) === 'http://127.0.0.1:8189/salud' ? respuesta({ modelo: 'chatterbox-multilingual', dispositivo: 'cuda' }) : respuesta({}, 404))) as typeof fetch
  assert.deepEqual(await detectar(undefined, bien), { modelo: 'chatterbox-multilingual', dispositivo: 'cuda' })
  assert.equal(await detectar(undefined, (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch), null)
  assert.equal(await detectar(undefined, (async () => respuesta({}, 500)) as typeof fetch), null)
})

test('Chatterbox vivo: encendido sale «corriendo»', async (t) => {
  const dir = aislado(t)
  guardarConfig({ chatterboxRaiz: venvFalso(dir, true) }, dir)
  const f = (async () => respuesta({ modelo: 'chatterbox-multilingual', dispositivo: 'cuda' })) as typeof fetch
  const e = await estadoChatterboxVivo(dir, f)
  assert.equal(e.estado, 'corriendo')
  assert.match(e.texto, /cuda/)
})

test('Chatterbox: generar manda el texto y la referencia y guarda el WAV que devuelve', async (t) => {
  const dir = aislado(t)
  const visto: { url: string; cuerpo: Record<string, unknown> }[] = []
  const wav = pcmAWav(new Uint8Array(24000 * 2)) // 1 s de silencio
  const f = (async (url: string | URL, init?: RequestInit) => {
    visto.push({ url: String(url), cuerpo: JSON.parse(String(init?.body)) })
    return new Response(new Uint8Array(wav), { headers: { 'content-type': 'audio/wav' } })
  }) as typeof fetch
  const salida = join(dir, 'sal', 'voz.wav')
  const r = await generar({ texto: 'Hola mundo desde Kold Gold', salida, referencia: 'C:\\voz\\ref.wav' }, f)
  assert.equal(visto[0].url, 'http://127.0.0.1:8189/tts')
  assert.equal(visto[0].cuerpo.idioma, 'es')
  assert.equal(visto[0].cuerpo.referencia, 'C:\\voz\\ref.wav')
  assert.equal(r.palabras, 5)
  assert.equal(r.segundos, 1)
  assert.ok(existsSync(salida))
  assert.equal(segundosWav(readFileSync(salida)), 1)
})

test('Chatterbox: un error del servidor y un audio que no es WAV salen con su motivo', async () => {
  const falla = (async () => respuesta({ error: 'CUDA out of memory' }, 500)) as typeof fetch
  await assert.rejects(generar({ texto: 'hola', salida: join(tmpdir(), 'x.wav') }, falla), /Chatterbox respondio 500: CUDA out of memory/)
  const basura = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch
  await assert.rejects(generar({ texto: 'hola', salida: join(tmpdir(), 'x.wav') }, basura), /no devolvio un WAV valido/)
})

test('Chatterbox: asegurarServidor lo enciende una vez y espera a que responda; sin instalar, dice qué falta', async (t) => {
  const dir = aislado(t)
  await assert.rejects(asegurarServidor(join(dir, 'nada')), /Chatterbox no esta instalado en/)

  const raiz = venvFalso(dir, true)
  let arrancado = 0
  let vivo = false
  let preguntas = 0
  const f = (async () => {
    preguntas++
    // Responde a partir de la tercera pregunta (después de arrancar): el modelo tarda en cargar.
    if (arrancado && preguntas >= 3) vivo = true
    return vivo ? respuesta({ modelo: 'chatterbox-multilingual', dispositivo: 'cpu' }) : respuesta({}, 503)
  }) as typeof fetch
  const s = await asegurarServidor(raiz, { f, cada: 1, arrancar: (python, script) => {
    arrancado++
    assert.match(python, /Scripts[\\/]python\.exe$/)
    assert.match(script, /servidor\.py$/)
  } })
  assert.equal(arrancado, 1)
  assert.equal(s.dispositivo, 'cpu')
  // Ya encendido: no lo arranca otra vez.
  await asegurarServidor(raiz, { f, arrancar: () => assert.fail('no debía arrancar de nuevo') })
})
