import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EstadoLocal } from '../../shared/avatar.ts'
import { BASE_CHATTERBOX, detectar as detectarChatterbox } from './chatterbox.ts'
import { BASE_COMFY, detectar as detectarComfy, nodosDisponibles } from './comfy.ts'
import { nodoInstalado, pesoPuesto, raizComfy } from './comfy-instalar.ts'
import { leerConfig } from './config.ts'
import { type FlujoDef, flujoDe, leerFlujo } from './flujos.ts'

/**
 * Los motores de IA locales de v!d (LatentSync para los labios, Chatterbox para la voz) y si ya estan en la
 * computadora. Estan APAGADOS hasta que se detecta que estan instalados: nada los instala ni los baja solo. Los instala
 * `scripts/instalar-ia-local.ps1` (cuando el usuario lo autoriza) en `C:\vid-ia` (o `VID_IA_RAIZ`); si estan en otra
 * carpeta, se pone en Opciones (`comfyRaiz` para ComfyUI, `chatterboxRaiz` para el entorno de Chatterbox).
 */

/** La carpeta donde `instalar-ia-local.ps1` deja ComfyUI y el entorno de Chatterbox. */
export const iaRaiz = () => process.env.VID_IA_RAIZ || 'C:\\vid-ia'

/** El entorno de Python de Chatterbox: el configurado o `C:\vid-ia\chatterbox`. */
export const raizChatterbox = (datos?: string) => leerConfig(datos).chatterboxRaiz || join(iaRaiz(), 'chatterbox')
export const pythonChatterbox = (raiz: string) => join(raiz, 'Scripts', 'python.exe')

const NO = 'No instalado'

/** Chatterbox: el venv con su Python y el paquete `chatterbox`, mas el servidor que le deja el instalador. Solo mira el disco. */
export function estadoChatterbox(datos?: string): EstadoLocal {
  const raiz = raizChatterbox(datos)
  const falta: string[] = []
  if (!existsSync(pythonChatterbox(raiz))) falta.push(`el entorno de Python en ${raiz} (Scripts\\python.exe)`)
  else {
    if (!existsSync(join(raiz, 'Lib', 'site-packages', 'chatterbox'))) falta.push('el paquete chatterbox-tts dentro de ese entorno')
    if (!existsSync(join(raiz, 'servidor.py'))) falta.push('servidor.py (lo copia el instalador)')
  }
  const instalado = falta.length === 0
  return {
    id: 'chatterbox',
    nombre: 'Chatterbox (gratis, local)',
    estado: instalado ? 'instalado' : falta.length < 3 && existsSync(pythonChatterbox(raiz)) ? 'parcial' : 'no-instalado',
    listo: instalado,
    falta,
    ruta: raiz,
    texto: instalado
      ? `Listo en ${raiz}. Voz con clonacion, en espanol, en tu GPU.`
      : `${NO}: falta ${falta.join(' y ')}. Corre scripts\\instalar-ia-local.ps1 (cuando lo autorices) o pon en Opciones la carpeta del entorno de Chatterbox.`
  }
}

/** Chatterbox, y si su servidor ya esta encendido. */
export async function estadoChatterboxVivo(datos?: string, f: typeof fetch = fetch): Promise<EstadoLocal> {
  const e = estadoChatterbox(datos)
  if (!e.listo) return e
  const vivo = await detectarChatterbox(BASE_CHATTERBOX, f)
  return vivo ? { ...e, estado: 'corriendo', texto: `Servidor encendido (${vivo.dispositivo}).` } : e
}

/** LatentSync dentro de ComfyUI: el nodo, el VideoHelperSuite y los pesos de la 1.5. Solo mira el disco. */
export function estadoLatentSync(datos?: string, def: FlujoDef = flujoDe('latentsync')!): EstadoLocal {
  const raiz = raizComfy(datos)
  const falta: string[] = []
  if (!raiz) falta.push('ComfyUI (la carpeta con main.py)')
  else {
    for (const n of def.nodos) if (!nodoInstalado(raiz, n.repo)) falta.push(`el nodo ${n.manager}`)
    for (const p of def.pesos.filter((x) => !x.opcional)) if (!pesoPuesto(raiz, p)) falta.push(`el modelo ${p.destino.split('/').pop()}${existsSync(join(raiz, p.destino)) ? ' (incompleto)' : ''}`)
  }
  if (!leerFlujo('latentsync', datos)) falta.push('el flujo latentsync.json')
  const instalado = falta.length === 0
  return {
    id: 'latentsync',
    nombre: 'LatentSync (gratis, local, ComfyUI)',
    estado: instalado ? 'instalado' : raiz && falta.length < def.nodos.length + def.pesos.length ? 'parcial' : 'no-instalado',
    listo: instalado,
    falta,
    ruta: raiz ?? undefined,
    texto: instalado
      ? `Listo en ${raiz}. Sincroniza los labios de un video con tu audio (8 GB de VRAM).`
      : `${NO}: falta ${falta.join(', ')}. Corre scripts\\instalar-ia-local.ps1 (cuando lo autorices), usa Instalar modelo en Opciones, o pon en Opciones la carpeta de tu ComfyUI.`
  }
}

/** LatentSync, y si ComfyUI esta encendido y cargo el nodo. */
export async function estadoLatentSyncVivo(datos?: string, f: typeof fetch = fetch, def?: FlujoDef): Promise<EstadoLocal> {
  const e = estadoLatentSync(datos, def)
  if (!e.listo) return e
  if (!(await detectarComfy(BASE_COMFY, f))) return { ...e, texto: `${e.texto} ComfyUI esta apagado: v!d lo enciende al generar.` }
  try {
    const tiene = await nodosDisponibles(BASE_COMFY, f)
    if (!tiene.has('LatentSyncNode')) return { ...e, estado: 'parcial', listo: false, falta: ['reiniciar ComfyUI (no cargo LatentSyncNode)'], texto: `${NO}: ComfyUI esta encendido pero no cargo el nodo LatentSyncNode. Reinicialo y revisa su consola.` }
  } catch {
    // Sin /object_info no se puede saber mas: vale lo que dice el disco.
  }
  return { ...e, estado: 'corriendo' }
}

/** Los dos juntos, para el estado del motor de avatar. */
export async function estadosLocales(datos?: string, f: typeof fetch = fetch): Promise<{ latentsync: EstadoLocal; chatterbox: EstadoLocal }> {
  const [latentsync, chatterbox] = await Promise.all([estadoLatentSyncVivo(datos, f), estadoChatterboxVivo(datos, f)])
  return { latentsync, chatterbox }
}
