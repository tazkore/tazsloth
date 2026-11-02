import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardar } from '../disco.ts'
import { DATOS } from '../secretos.ts'
import type { FlujoApi } from './comfy.ts'

/**
 * Los flujos de ComfyUI con que v!d anima un avatar, y qué pide cada uno: nodos personalizados (repositorios de GitHub),
 * pesos (archivos de Hugging Face, con su tamaño exacto, medido con una petición HEAD), VRAM y si cabe en 8 GB.
 *
 * Un flujo es un JSON en formato API (`Save (API Format)` de ComfyUI) más un `mapeo`: en qué nodo se pone el video, la
 * imagen y el audio y cuál es el nodo que guarda el resultado. `latentsync.json` viene hecho (`flujos/`). Los otros tres
 * dependen de los nodos de Wan, que cambian a menudo: el usuario abre el ejemplo oficial en ComfyUI (el botón «Instalar
 * modelo» lo deja en su carpeta de flujos), elige sus modelos, lo exporta en formato API y lo importa aquí; el mapeo se
 * adivina por el tipo de cada nodo (`mapearFlujo`). Los de `data/avatar/flujos/` mandan sobre los de la app.
 */

export interface Peso {
  /** Dónde lo baja el instalador (Hugging Face). */
  url: string
  /** Dónde queda, desde la carpeta de ComfyUI (la que tiene `main.py`). */
  destino: string
  bytes: number
  /** Si no se pudo confirmar la carpeta con el código del nodo: viene del ejemplo oficial y conviene mirar. */
  revisarDestino?: boolean
  opcional?: boolean
}

export interface NodoRequerido {
  repo: string
  /** El nombre con que se busca en ComfyUI-Manager. */
  manager: string
  /** Una clase de nodo que trae, para comprobar que cargó. */
  clase?: string
}

export interface FlujoDef {
  id: string
  nombre: string
  entrada: 'video+audio' | 'imagen+audio'
  vramGB: number
  cabeEn8: 'si' | 'justo' | 'no'
  nota: string
  nodos: NodoRequerido[]
  pesos: Peso[]
  /** Pesos que el nodo baja solo la primera vez que corre, y cuánto, en bytes. */
  alPrimerUso?: { que: string; bytes: number }
  /** El ejemplo oficial del nodo, en formato de la interfaz: se deja en la carpeta de flujos de ComfyUI. */
  ejemplo?: { url: string; nombre: string }
  /** `incluido`: la app trae `flujos/<id>.json`. */
  flujo: 'incluido' | 'importar'
  licencia: string
  fuente: string
}

const HF = 'https://huggingface.co'
const VHS: NodoRequerido = { repo: 'Kosinkadink/ComfyUI-VideoHelperSuite', manager: 'ComfyUI-VideoHelperSuite', clase: 'VHS_VideoCombine' }
const WAN: NodoRequerido = { repo: 'kijai/ComfyUI-WanVideoWrapper', manager: 'ComfyUI-WanVideoWrapper', clase: 'WanVideoSampler' }
const KJ: NodoRequerido = { repo: 'kijai/ComfyUI-KJNodes', manager: 'ComfyUI-KJNodes', clase: 'ImageResizeKJv2' }

const WAN_BASE: Peso[] = [
  { url: `${HF}/Kijai/WanVideo_comfy/resolve/main/Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors`, destino: 'models/diffusion_models/Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors', bytes: 16993877896 },
  { url: `${HF}/Kijai/WanVideo_comfy/resolve/main/umt5-xxl-enc-bf16.safetensors`, destino: 'models/text_encoders/umt5-xxl-enc-bf16.safetensors', bytes: 11361845464 },
  { url: `${HF}/Kijai/WanVideo_comfy/resolve/main/Wan2_1_VAE_bf16.safetensors`, destino: 'models/vae/Wan2_1_VAE_bf16.safetensors', bytes: 253806278 },
  { url: `${HF}/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors`, destino: 'models/clip_vision/clip_vision_h.safetensors', bytes: 1264219396 },
  { url: `${HF}/Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors`, destino: 'models/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', bytes: 738005744, opcional: true }
]

export const FLUJOS: FlujoDef[] = [
  {
    id: 'latentsync',
    nombre: 'LatentSync 1.5',
    entrada: 'video+audio',
    vramGB: 8,
    cabeEn8: 'si',
    nota: 'Cambia los labios de un video que ya tienes (o de una foto convertida en video quieto) para que digan tu audio. ByteDance da 8 GB de VRAM mínimos para la 1.5 (la 1.6 pide 18 GB). El nodo de ComfyUI trae la 1.6; con estos pesos corre la 1.5.',
    nodos: [{ repo: 'ShmuelRonen/ComfyUI-LatentSyncWrapper', manager: 'ComfyUI-LatentSyncWrapper', clase: 'LatentSyncNode' }, VHS],
    pesos: [
      { url: `${HF}/ByteDance/LatentSync-1.5/resolve/main/latentsync_unet.pt`, destino: 'custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/latentsync_unet.pt', bytes: 5072348184 },
      { url: `${HF}/ByteDance/LatentSync-1.5/resolve/main/whisper/tiny.pt`, destino: 'custom_nodes/ComfyUI-LatentSyncWrapper/checkpoints/whisper/tiny.pt', bytes: 75572083 }
    ],
    alPrimerUso: { que: 'el VAE sd-vae-ft-mse y los detectores de cara que el nodo baja al correr por primera vez', bytes: 700_000_000 },
    flujo: 'incluido',
    licencia: 'LatentSync (ByteDance): Apache 2.0. Nodo de ShmuelRonen: sin licencia declarada en GitHub. VideoHelperSuite: GPL-3.0. v!d no los redistribuye: los baja el usuario.',
    fuente: 'https://github.com/bytedance/LatentSync'
  },
  {
    id: 'musetalk',
    nombre: 'MuseTalk',
    entrada: 'video+audio',
    vramGB: 6,
    cabeEn8: 'si',
    nota: 'Sincroniza labios de un video con tu audio, rápido y ligero. El nodo de Kijai carga el MuseTalk original (1.0); el 1.5 no tiene nodo de ComfyUI confirmado, así que aquí corre el original. Baja su repositorio de Hugging Face solo la primera vez que corre (6.8 GB, con las dos versiones).',
    nodos: [{ repo: 'kijai/ComfyUI-MuseTalk-KJ', manager: 'ComfyUI-MuseTalk-KJ', clase: 'muse_talk_sampler' }, VHS],
    pesos: [],
    alPrimerUso: { que: 'el repositorio TMElyralab/MuseTalk (pesos de la 1.0 y de la 1.5)', bytes: 6_800_000_000 },
    ejemplo: { url: 'https://raw.githubusercontent.com/kijai/ComfyUI-MuseTalk-KJ/main/example_workflows/musetalk_vid2vid_example.json', nombre: 'musetalk_vid2vid_example.json' },
    flujo: 'importar',
    licencia: 'MuseTalk (TMElyralab): código MIT; los modelos que usa (whisper, sd-vae, dwpose) traen sus propias licencias. Nodo de Kijai: sin licencia declarada en GitHub. VideoHelperSuite: GPL-3.0.',
    fuente: 'https://github.com/TMElyralab/MuseTalk'
  },
  {
    id: 'infinitetalk',
    nombre: 'InfiniteTalk (poca VRAM)',
    entrada: 'imagen+audio',
    vramGB: 8,
    cabeEn8: 'justo',
    nota: 'Convierte una imagen y tu audio en un video hablado, sin límite de duración. Usa Wan 2.1 de 14 mil millones de parámetros: en 8 GB de VRAM solo corre con block swap y archivos fp8 o GGUF, muy lento (minutos de cómputo por segundo de video) y con unos 32 GB de RAM de apoyo. Descarga grande.',
    nodos: [WAN, KJ, VHS],
    pesos: [
      ...WAN_BASE,
      { url: `${HF}/Kijai/WanVideo_comfy_fp8_scaled/resolve/main/InfiniteTalk/Wan2_1-InfiniteTalk-Single_fp8_e4m3fn_scaled_KJ.safetensors`, destino: 'models/diffusion_models/Wan2_1-InfiniteTalk-Single_fp8_e4m3fn_scaled_KJ.safetensors', bytes: 2713548210 }
    ],
    alPrimerUso: { que: 'el modelo de audio TencentGameMate/chinese-wav2vec2-base', bytes: 400_000_000 },
    ejemplo: { url: 'https://raw.githubusercontent.com/kijai/ComfyUI-WanVideoWrapper/main/example_workflows/wanvideo_2_1_14B_I2V_InfiniteTalk_example_03.json', nombre: 'wanvideo_2_1_14B_I2V_InfiniteTalk_example_03.json' },
    flujo: 'importar',
    licencia: 'InfiniteTalk (MeiGen-AI), Wan 2.1 y WanVideoWrapper: Apache 2.0. KJNodes y VideoHelperSuite: GPL-3.0.',
    fuente: 'https://github.com/MeiGen-AI/InfiniteTalk'
  },
  {
    id: 'fantasytalking',
    nombre: 'FantasyTalking',
    entrada: 'imagen+audio',
    vramGB: 8,
    cabeEn8: 'justo',
    nota: 'Imagen y audio a video hablado con movimiento de cuerpo. También sobre Wan 2.1 de 14B: mismas condiciones que InfiniteTalk (block swap, lento, mucha RAM).',
    nodos: [WAN, KJ, VHS],
    pesos: [
      ...WAN_BASE,
      { url: `${HF}/Kijai/WanVideo_comfy/resolve/main/fantasytalking_fp16.safetensors`, destino: 'models/diffusion_models/fantasytalking_fp16.safetensors', bytes: 1684038568 },
      { url: `${HF}/facebook/wav2vec2-base-960h/resolve/main/model.safetensors`, destino: 'models/wav2vec2/wav2vec2-base-960h/model.safetensors', bytes: 377607901, revisarDestino: true }
    ],
    ejemplo: { url: 'https://raw.githubusercontent.com/kijai/ComfyUI-WanVideoWrapper/main/example_workflows/wanvideo_2_1_14B_I2V_FantasyTalking_example_01.json', nombre: 'wanvideo_2_1_14B_I2V_FantasyTalking_example_01.json' },
    flujo: 'importar',
    licencia: 'FantasyTalking (Fantasy-AMAP), Wan 2.1 y WanVideoWrapper: Apache 2.0. KJNodes y VideoHelperSuite: GPL-3.0.',
    fuente: 'https://github.com/Fantasy-AMAP/fantasy-talking'
  }
]

export const flujoDe = (id: string) => FLUJOS.find((f) => f.id === id)

/** Lo que baja un flujo en total, en GB (sin los opcionales). */
export const descargaGB = (f: FlujoDef) => Math.round(((f.pesos.filter((p) => !p.opcional).reduce((t, p) => t + p.bytes, 0) + (f.alPrimerUso?.bytes ?? 0)) / 1e9) * 10) / 10

// ── El JSON de cada flujo ─────────────────────────────────────────────────────────────────────────────────────────

export interface Mapeo {
  video?: { nodo: string; campo: string }
  imagen?: { nodo: string; campo: string }
  audio?: { nodo: string; campo: string }
  semilla?: { nodo: string; campo: string }
  /** El nodo que guarda el video (el que sale en `/history`). */
  salida: string
}

export interface FlujoGuardado {
  nombre?: string
  nota?: string
  mapeo: Mapeo
  prompt: FlujoApi
}

const AQUI = dirname(fileURLToPath(import.meta.url))
const propios = (datos = DATOS) => join(datos, 'avatar', 'flujos')

/** Adivina el mapeo de un flujo API por el tipo de sus nodos. `null` si no encuentra dónde poner el audio o dónde sale. */
export function mapearFlujo(prompt: FlujoApi): Mapeo | null {
  const nodos = Object.entries(prompt)
  const campo = (tipos: RegExp, nombre: string) => {
    const n = nodos.find(([, v]) => tipos.test(v.class_type) && nombre in v.inputs)
    return n ? { nodo: n[0], campo: nombre } : undefined
  }
  const audio = campo(/^(LoadAudio|VHS_LoadAudio(Upload)?)$/, 'audio')
  const salida = nodos.find(([, v]) => /^(VHS_VideoCombine|SaveVideo|SaveWEBM|SaveAnimatedWEBP)$/.test(v.class_type))?.[0]
  if (!audio || !salida) return null
  const semilla = nodos.find(([, v]) => typeof v.inputs.seed === 'number' && !Array.isArray(v.inputs.seed))
  return {
    video: campo(/^(VHS_LoadVideo|LoadVideo)$/, 'video'),
    imagen: campo(/^LoadImage$/, 'image'),
    audio,
    semilla: semilla ? { nodo: semilla[0], campo: 'seed' } : undefined,
    salida
  }
}

/** Valida que `x` sea un flujo en formato API: nodos con `class_type` e `inputs`. La interfaz de ComfyUI exporta otro formato (`nodes`, `links`). */
export function esFlujoApi(x: unknown): x is FlujoApi {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const v = Object.values(x as object)
  return v.length > 0 && v.every((n) => !!n && typeof n === 'object' && typeof (n as { class_type?: unknown }).class_type === 'string' && typeof (n as { inputs?: unknown }).inputs === 'object')
}

/** El flujo guardado de `id`: el que importó el usuario o el que trae la app. `null` si aún no hay. */
export function leerFlujo(id: string, datos?: string): FlujoGuardado | null {
  for (const archivo of [join(propios(datos), `${id}.json`), join(AQUI, 'flujos', `${id}.json`)]) {
    if (!existsSync(archivo)) continue
    const g = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<FlujoGuardado> & FlujoApi
    // Un JSON de flujo API pelado (lo que baja `Save (API Format)`) se acepta tal cual.
    if (g.mapeo && g.prompt) return g as FlujoGuardado
    if (esFlujoApi(g)) {
      const mapeo = mapearFlujo(g)
      if (mapeo) return { mapeo, prompt: g }
    }
  }
  return null
}

/** Importa un flujo API del usuario para `id`. Dice qué falta si no encuentra dónde poner el audio. */
export function importarFlujo(id: string, texto: string, datos?: string): FlujoGuardado {
  if (!flujoDe(id)) throw new Error(`No conozco el flujo «${id}».`)
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('Ese archivo no es un JSON válido.')
  }
  const dado = json as Partial<FlujoGuardado>
  const prompt = dado.prompt && dado.mapeo ? dado.prompt : json
  if (!esFlujoApi(prompt)) throw new Error('Ese JSON es el formato de la interfaz de ComfyUI. Ábrelo en ComfyUI y expórtalo con «Save (API Format)» (en Ajustes activa «Dev mode options» si no sale).')
  const mapeo = dado.mapeo ?? mapearFlujo(prompt)
  if (!mapeo) throw new Error('No encuentro en ese flujo un nodo LoadAudio (el audio) ni uno que guarde el video (VHS_VideoCombine o SaveVideo). Revisa que sea el flujo completo.')
  const f = flujoDe(id)!
  if (f.entrada === 'imagen+audio' && !mapeo.imagen && !mapeo.video) throw new Error('El flujo no tiene un nodo LoadImage para la imagen del avatar.')
  mkdirSync(propios(datos), { recursive: true })
  const g: FlujoGuardado = { nombre: f.nombre, mapeo, prompt }
  guardar(join(propios(datos), `${id}.json`), JSON.stringify(g))
  return g
}

/** Lista de flujos que tienen JSON (de la app o importado). */
export const flujosListos = (datos?: string) => FLUJOS.filter((f) => leerFlujo(f.id, datos)).map((f) => f.id)

/** Pone la imagen, el video, el audio y la semilla en una copia del flujo. */
export function prepararFlujo(g: FlujoGuardado, entradas: { video?: string; imagen?: string; audio: string }): FlujoApi {
  const copia = structuredClone(g.prompt)
  const poner = (d: { nodo: string; campo: string } | undefined, valor: string | number | undefined, que: string) => {
    if (valor === undefined) return
    if (!d || !copia[d.nodo]) throw new Error(`Este flujo no tiene dónde poner ${que}.`)
    copia[d.nodo].inputs[d.campo] = valor
  }
  poner(g.mapeo.audio, entradas.audio, 'el audio')
  if (entradas.video) poner(g.mapeo.video, entradas.video, 'el video')
  if (entradas.imagen) poner(g.mapeo.imagen, entradas.imagen, 'la imagen')
  poner(g.mapeo.semilla, Math.floor(Math.random() * 2 ** 31), 'la semilla')
  return copia
}

/** Los archivos de flujo importados (para la interfaz). */
export const importados = (datos?: string) => (existsSync(propios(datos)) ? readdirSync(propios(datos)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [])

export const tamanoDe = (ruta: string) => (existsSync(ruta) ? statSync(ruta).size : -1)
