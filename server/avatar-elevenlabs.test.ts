import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { segundosWav } from '../shared/voz.ts'
import { buscarVoz, generar, listarVoces, partirTexto, pcmAWav, probar } from './avatar/elevenlabs.ts'

const VOCES = {
  voices: [
    { voice_id: 'v1', name: 'Rachel', category: 'premade', labels: { accent: 'american', gender: 'female' } },
    { voice_id: 'v2', name: 'Tazkore IA', category: 'cloned', description: 'Mi voz' }
  ]
}

/** Un ElevenLabs de mentira que apunta lo que le piden. */
function simulado(opciones: { estado?: number; cuerpoError?: unknown } = {}) {
  const llamadas: { url: string; metodo: string; llave: string | null; cuerpo?: Record<string, unknown> }[] = []
  const f = (async (url: string | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    llamadas.push({ url: String(url), metodo: init?.method ?? 'GET', llave: h.get('xi-api-key'), cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (opciones.estado) return new Response(JSON.stringify(opciones.cuerpoError ?? {}), { status: opciones.estado })
    if (String(url).endsWith('/v1/voices')) return new Response(JSON.stringify(VOCES))
    // 100 muestras de PCM de 16 bits por pedido.
    return new Response(new Uint8Array(200), { headers: { 'content-type': 'audio/pcm' } })
  }) as typeof fetch
  return { f, llamadas }
}

test('listarVoces: manda la llave y marca los clones', async () => {
  const { f, llamadas } = simulado()
  const voces = await listarVoces('LLAVE', f)
  assert.equal(llamadas[0].url, 'https://api.elevenlabs.io/v1/voices')
  assert.equal(llamadas[0].llave, 'LLAVE')
  assert.deepEqual(voces.map((v) => [v.nombre, v.clon]), [['Rachel', false], ['Tazkore IA', true]])
  assert.equal(voces[0].descripcion, 'american · female')
  assert.deepEqual(await probar('LLAVE', f), { voces: 2, clones: 1 })
})

test('buscarVoz: por id, por nombre exacto o parcial', () => {
  const voces = [{ id: 'v1', nombre: 'Rachel', categoria: 'premade', descripcion: '', clon: false }, { id: 'v2', nombre: 'Tazkore IA', categoria: 'cloned', descripcion: '', clon: true }]
  assert.equal(buscarVoz(voces, 'v2')?.nombre, 'Tazkore IA')
  assert.equal(buscarVoz(voces, 'tazkore ia')?.id, 'v2')
  assert.equal(buscarVoz(voces, 'tazk')?.id, 'v2')
  assert.equal(buscarVoz(voces, 'nadie'), undefined)
})

test('pcmAWav pone una cabecera que segundosWav entiende', () => {
  const wav = pcmAWav(new Uint8Array(48000), 24000) // 24.000 muestras de 16 bits = 1 s
  assert.equal(wav.length, 44 + 48000)
  assert.equal(segundosWav(wav), 1)
})

test('partirTexto: respeta párrafos y el máximo', () => {
  assert.deepEqual(partirTexto('Uno.\n\nDos.\n\nTres.', 100), ['Uno.\n\nDos.\n\nTres.'])
  const trozos = partirTexto(['a'.repeat(60), 'b'.repeat(60), 'c'.repeat(60)].join('\n\n'), 100)
  assert.equal(trozos.length, 3)
  const largo = partirTexto('Frase uno. Frase dos. Frase tres. Frase cuatro.', 25)
  assert.ok(largo.every((t) => t.length <= 25), largo.join('|'))
  assert.equal(largo.join(' ').replace(/\s+/g, ' ').includes('Frase cuatro.'), true)
})

test('generar: pide pcm_24000 con el modelo multilingüe y deja un WAV de 24 kHz', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-eleven-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { f, llamadas } = simulado()
  const salida = join(dir, 'fuentes', 'voz', 'ai-studio.wav')
  const r = await generar({ llave: 'K', voz: 'tazkore ia', texto: 'Hola a todos', salida }, f)
  const tts = llamadas.find((l) => l.metodo === 'POST')!
  assert.equal(tts.url, 'https://api.elevenlabs.io/v1/text-to-speech/v2?output_format=pcm_24000')
  assert.equal(tts.cuerpo?.model_id, 'eleven_multilingual_v2')
  assert.equal(tts.cuerpo?.text, 'Hola a todos')
  assert.equal(r.voz, 'Tazkore IA')
  const wav = readFileSync(salida)
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.length, 44 + 200)
  assert.equal(r.segundos, Math.round((100 / 24000) * 10) / 10)
})

test('generar: un guion largo se parte en pedidos con el contexto de los vecinos', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-eleven-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { f, llamadas } = simulado()
  const texto = ['a'.repeat(3000), 'b'.repeat(3000)].join('\n\n')
  await generar({ llave: 'K', voz: 'Rachel', texto, salida: join(dir, 'v.wav') }, f)
  const pedidos = llamadas.filter((l) => l.metodo === 'POST')
  assert.equal(pedidos.length, 2)
  assert.equal(pedidos[0].cuerpo?.previous_text, undefined)
  assert.ok(String(pedidos[0].cuerpo?.next_text).startsWith('b'))
  assert.ok(String(pedidos[1].cuerpo?.previous_text).startsWith('a'))
  assert.equal(readFileSync(join(dir, 'v.wav')).length, 44 + 400)
})

test('generar: .mp3 baja el audio tal cual y una voz que no existe lo dice', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vid-eleven-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { f, llamadas } = simulado()
  await generar({ llave: 'K', voz: 'Rachel', texto: 'Hola', salida: join(dir, 'v.mp3') }, f)
  assert.match(llamadas.find((l) => l.metodo === 'POST')!.url, /output_format=mp3_44100_128$/)
  await assert.rejects(generar({ llave: 'K', voz: 'Fantasma', texto: 'Hola', salida: join(dir, 'x.wav') }, f), /no tiene la voz «Fantasma»/)
})

test('los errores de ElevenLabs salen en español y sin la llave', async () => {
  await assert.rejects(listarVoces('SECRETA', simulado({ estado: 401 }).f), (e: Error) => /no aceptó esa llave/.test(e.message) && !e.message.includes('SECRETA'))
  await assert.rejects(listarVoces('K', simulado({ estado: 401, cuerpoError: { detail: { status: 'quota_exceeded', message: 'sin caracteres' } } }).f), /no aceptó/)
  await assert.rejects(generar({ llave: 'K', voz: 'Rachel', texto: 'x', salida: join(tmpdir(), 'x.wav') }, simulado({ estado: 429 }).f), /demasiados pedidos/)
  await assert.rejects(listarVoces('K', simulado({ estado: 400, cuerpoError: { detail: { status: 'quota_exceeded', message: 'sin caracteres' } } }).f), /cuota de caracteres/)
})
