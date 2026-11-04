/**
 * Lo que comparten el motor de avatar (`server/avatar/`), su MCP y el compositor: los motores que existen, su etiqueta
 * (Local, Nube o Pago) y la línea `Avatar:` que lleva el primer mensaje de un video (la guía, en `video-base/AVATAR.md`).
 */

export type MotorAvatar = 'sprites' | 'comfyui-local' | 'nube-gratis' | 'heygen' | 'codex'
export type EtiquetaMotor = 'Local' | 'Nube' | 'Pago'

export interface InfoMotor {
  id: MotorAvatar
  nombre: string
  etiqueta: EtiquetaMotor
  /** Qué hace, en una frase para el menú y para el agente. */
  descripcion: string
}

/** Los motores, en el orden del menú. `sprites` es el de siempre y el que vale sin elegir. */
export const MOTORES: InfoMotor[] = [
  { id: 'sprites', nombre: 'Sprites (boca abierta y cerrada)', etiqueta: 'Local', descripcion: 'El de siempre: el personaje abre y cierra la boca con la voz. Sin GPU, sin costo.' },
  { id: 'comfyui-local', nombre: 'ComfyUI en tu computadora', etiqueta: 'Local', descripcion: 'Sincroniza labios con LatentSync, MuseTalk, InfiniteTalk o FantasyTalking en tu GPU. Gratis, pero tarda y necesita instalar modelos.' },
  { id: 'nube-gratis', nombre: 'Nube gratis (Colab o Hugging Face)', etiqueta: 'Nube', descripcion: 'Guiado: subes audio e imagen a un cuaderno de Colab o a un Space, bajas el MP4 y v!d lo importa.' },
  { id: 'heygen', nombre: 'HeyGen', etiqueta: 'Pago', descripcion: 'Avatar de HeyGen con su API (gasta créditos de tu plan) o, sin API, con Claude en Chrome sobre tu sesión.' },
  { id: 'codex', nombre: 'Codex orquesta', etiqueta: 'Nube', descripcion: 'Codex (tu suscripción de ChatGPT) recibe la tarea y usa el MCP avatar con el motor que haya listo. Codex no genera video por sí mismo.' }
]

export const esMotor = (m: unknown): m is MotorAvatar => MOTORES.some((x) => x.id === m)

/** La línea del primer mensaje con el motor elegido. Sin elegir, o con `sprites`, no hay línea: es lo de siempre. */
export function lineaAvatar(motor: string | undefined): string {
  if (!motor || motor === 'sprites' || !esMotor(motor)) return ''
  return `Avatar: ${motor} (cómo, en video-base/AVATAR.md; si no se puede, usa sprites).`
}

/** El motor que dice una línea `Avatar:` de un mensaje, si la lleva. */
export function motorDeLinea(texto: string): MotorAvatar | undefined {
  const m = /^Avatar: ([a-z-]+)/m.exec(texto)?.[1]
  return esMotor(m) ? m : undefined
}

/** Un flujo de ComfyUI: qué pide y si cabe en la GPU del usuario (8 GB de VRAM). */
export interface FlujoInfo {
  id: string
  nombre: string
  entrada: 'video+audio' | 'imagen+audio'
  vramGB: number
  /** `si`: cabe con holgura. `justo`: solo con trucos (block swap) y muy lento. `no`: no cabe. */
  cabeEn8: 'si' | 'justo' | 'no'
  /** Lo que se descarga en total, en GB, aproximado. */
  descargaGB: number
  nota: string
  /** `incluido`: v!d trae su flujo. `importar`: hay que exportar el flujo de ejemplo del nodo en formato API. */
  flujo: 'incluido' | 'importar'
  estado: 'instalado' | 'parcial' | 'no-instalado'
  /** Falta el JSON del flujo (solo si `flujo` es `importar`). */
  sinFlujo: boolean
  instalando?: { paso: string; avance: number; error?: string }
}

export interface EstadoComfy {
  /** `corriendo`: responde en `base`. `instalado`: está en disco pero apagado. */
  estado: 'corriendo' | 'instalado' | 'no-instalado'
  base: string
  version?: string
  gpu?: string
  vramLibreGB?: number
  /** Si lo instaló y lo corre v!d. */
  propio: boolean
  instalando?: { paso: string; avance: number; error?: string }
  arrancando?: boolean
  carpeta: string
}

/** Un motor de IA local (LatentSync, Chatterbox): apagado hasta que se detecta instalado. `texto` explica que falta. */
export interface EstadoLocal {
  id: 'latentsync' | 'chatterbox'
  nombre: string
  estado: 'no-instalado' | 'parcial' | 'instalado' | 'corriendo'
  listo: boolean
  falta: string[]
  ruta?: string
  texto: string
}

export interface EstadoAvatar {
  /** Los motores locales y si estan instalados (`server/avatar/local.ts`). */
  locales: { latentsync: EstadoLocal; chatterbox: EstadoLocal }
  motores: (InfoMotor & { listo: boolean; detalle: string })[]
  comfy: EstadoComfy
  flujos: FlujoInfo[]
  elevenlabs: { llave: string | null }
  heygen: { llave: string | null }
  codex: { listo: boolean }
}

export interface TrabajoAvatar {
  id: string
  estado: 'en-fila' | 'generando' | 'lista' | 'espera-usuario' | 'error'
  motor: MotorAvatar
  /** Lo que va haciendo, para el agente y la interfaz. */
  paso?: string
  archivo?: string
  error?: string
}

/** Una voz de ElevenLabs de la cuenta del usuario (`GET /api/avatar/elevenlabs/voces`). */
export interface VozElevenInfo {
  id: string
  nombre: string
  categoria: string
  descripcion: string
  /** Un clon del usuario (como «Tazkore IA»). */
  clon: boolean
}
