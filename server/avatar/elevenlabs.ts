import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { segundosWav } from '../../shared/voz.ts'
import { MODELO_ELEVENLABS } from './config.ts'

/**
 * ElevenLabs como proveedor de voz, junto al de Google AI Studio: la misma interfaz que el MCP `voz` (el agente pide
 * `generar_voz` con `proveedor: "elevenlabs"` y recibe un WAV de 24 kHz, mono, igual que el de AI Studio, para que
 * `alinear.py` y el resto del pipeline no cambien). La API es la oficial (https://elevenlabs.io/docs/api-reference), con
 * la llave del usuario en la cabecera `xi-api-key`; cada carácter generado gasta cuota de su plan.
 *
 * Pide el audio como PCM de 24 kHz (`pcm_24000`) y le pone la cabecera WAV aquí, sin FFmpeg. Un guion largo se parte
 * por párrafos (la API acepta unos 5.000 caracteres por pedido) y las partes se juntan.
 */
const API = 'https://api.elevenlabs.io'
export const FRECUENCIA = 24000
/** Lo que cabe en un pedido, con margen bajo el límite de la API. */
const MAXIMO = 4500

export interface VozEleven {
  id: string
  nombre: string
  /** `cloned` / `professional` son clones del usuario (como «Tazkore IA»). */
  categoria: string
  descripcion: string
  clon: boolean
}

type F = typeof fetch

async function pedir(f: F, llave: string, ruta: string, init: RequestInit = {}): Promise<Response> {
  const r = await f(`${API}${ruta}`, { ...init, headers: { 'xi-api-key': llave, ...(init.headers ?? {}) } })
  if (r.ok) return r
  const cuerpo = (await r.json().catch(() => null)) as { detail?: { status?: string; message?: string } | string } | null
  const d = cuerpo?.detail
  const detalle = typeof d === 'string' ? d : d?.message
  const estado = typeof d === 'object' ? d?.status : undefined
  if (r.status === 401) throw new Error('ElevenLabs no aceptó esa llave. Cópiala de nuevo en elevenlabs.io → Developers → API Keys.')
  if (estado === 'quota_exceeded' || r.status === 402) throw new Error(`Se acabó la cuota de caracteres de tu plan de ElevenLabs${detalle ? ` (${detalle})` : ''}. Pide la voz al usuario o usa AI Studio.`)
  if (r.status === 429) throw new Error('ElevenLabs pide esperar (demasiados pedidos a la vez). Vuelve a intentarlo en un minuto.')
  throw new Error(`ElevenLabs respondió ${r.status}${detalle ? `: ${detalle}` : ''}.`)
}

/** Las voces de la cuenta: las de la biblioteca y los clones propios. */
export async function listarVoces(llave: string, f: F = fetch): Promise<VozEleven[]> {
  const r = await pedir(f, llave, '/v1/voices')
  const json = (await r.json()) as { voices?: { voice_id: string; name: string; category?: string; description?: string | null; labels?: Record<string, string> }[] }
  return (json.voices ?? []).map((v) => ({
    id: v.voice_id,
    nombre: v.name,
    categoria: v.category ?? 'premade',
    descripcion: v.description || Object.values(v.labels ?? {}).filter(Boolean).join(' · '),
    clon: v.category === 'cloned' || v.category === 'professional'
  }))
}

/** Prueba la llave pidiendo las voces. Devuelve cuántas hay y cuántas son clones. */
export async function probar(llave: string, f: F = fetch) {
  const voces = await listarVoces(llave, f)
  return { voces: voces.length, clones: voces.filter((v) => v.clon).length }
}

/** Una voz por su id o por su nombre (sin importar mayúsculas). */
export function buscarVoz(voces: VozEleven[], pedida: string): VozEleven | undefined {
  const p = pedida.trim().toLowerCase()
  return voces.find((v) => v.id === pedida.trim()) ?? voces.find((v) => v.nombre.toLowerCase() === p) ?? voces.find((v) => v.nombre.toLowerCase().includes(p))
}

/** Parte un texto en trozos de a lo más `max` caracteres, por párrafos y, si hace falta, por frases. */
export function partirTexto(texto: string, max = MAXIMO): string[] {
  const trozos: string[] = []
  let actual = ''
  const meter = (t: string) => {
    if (actual && actual.length + t.length + 2 > max) (trozos.push(actual), (actual = ''))
    actual = actual ? `${actual}\n\n${t}` : t
  }
  for (const parrafo of texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (parrafo.length <= max) {
      meter(parrafo)
      continue
    }
    for (const frase of parrafo.match(/[^.!?]+[.!?]*\s*/g) ?? [parrafo]) {
      for (let i = 0; i < frase.length; i += max) meter(frase.slice(i, i + max).trim())
    }
  }
  if (actual) trozos.push(actual)
  return trozos
}

/** La cabecera WAV (PCM de 16 bits, mono) de unas muestras crudas. */
export function pcmAWav(pcm: Uint8Array, frecuencia = FRECUENCIA): Buffer {
  const cab = Buffer.alloc(44)
  cab.write('RIFF', 0)
  cab.writeUInt32LE(36 + pcm.length, 4)
  cab.write('WAVEfmt ', 8)
  cab.writeUInt32LE(16, 16)
  cab.writeUInt16LE(1, 20) // PCM
  cab.writeUInt16LE(1, 22) // mono
  cab.writeUInt32LE(frecuencia, 24)
  cab.writeUInt32LE(frecuencia * 2, 28)
  cab.writeUInt16LE(2, 32)
  cab.writeUInt16LE(16, 34)
  cab.write('data', 36)
  cab.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([cab, pcm])
}

export interface Pedido {
  llave: string
  /** Id o nombre de la voz. */
  voz: string
  texto: string
  /** La ruta absoluta del .wav (o .mp3) que deja. */
  salida: string
  modelo?: string
}

/** Genera la voz y la deja en `salida`. `.mp3` baja el audio tal cual; lo demás sale como WAV de 24 kHz. */
export async function generar(p: Pedido, f: F = fetch): Promise<{ archivo: string; segundos: number; voz: string; palabras: number }> {
  const voces = await listarVoces(p.llave, f)
  const voz = buscarVoz(voces, p.voz)
  if (!voz) throw new Error(`Tu cuenta de ElevenLabs no tiene la voz «${p.voz}». Mira las que hay con la herramienta voces (proveedor elevenlabs).`)
  const mp3 = /\.mp3$/i.test(p.salida)
  const partes = partirTexto(p.texto)
  const audios: Buffer[] = []
  for (let i = 0; i < partes.length; i++) {
    const r = await pedir(f, p.llave, `/v1/text-to-speech/${encodeURIComponent(voz.id)}?output_format=${mp3 ? 'mp3_44100_128' : 'pcm_24000'}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: partes[i],
        model_id: p.modelo ?? MODELO_ELEVENLABS,
        // Para que las partes de un guion largo suenen continuas.
        ...(i > 0 ? { previous_text: partes[i - 1].slice(-300) } : {}),
        ...(i < partes.length - 1 ? { next_text: partes[i + 1].slice(0, 300) } : {})
      })
    })
    audios.push(Buffer.from(await r.arrayBuffer()))
  }
  const crudo = Buffer.concat(audios)
  if (!crudo.length) throw new Error('ElevenLabs no devolvió audio.')
  mkdirSync(dirname(p.salida), { recursive: true })
  if (mp3) {
    writeFileSync(p.salida, crudo)
    return { archivo: p.salida, segundos: Math.round((crudo.length / 16000) * 10) / 10, voz: voz.nombre, palabras: p.texto.split(/\s+/).length }
  }
  const wav = pcmAWav(crudo)
  writeFileSync(p.salida, wav)
  return { archivo: p.salida, segundos: Math.round((segundosWav(wav) ?? crudo.length / (FRECUENCIA * 2)) * 10) / 10, voz: voz.nombre, palabras: p.texto.split(/\s+/).length }
}
