import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'

/**
 * Los caminos guiados, que no tienen API gratis ni se automatizan:
 * - Nube gratis: un cuaderno de Google Colab (GPU T4 gratis) que corre LatentSync 1.5, o el Space de Hugging Face de
 *   LatentSync. El usuario sube el audio y el video o la imagen, baja el MP4 y v!d lo importa (`importarResultado`).
 * - HeyGen con Chrome: un paquete (guion, audio, instrucciones) en la carpeta del video y un prompt para Claude en
 *   Chrome, que hace el video en la web de HeyGen con la sesión del usuario. v!d no toca la web de HeyGen.
 */
export const COLAB = 'https://colab.research.google.com/'
export const SPACE_LATENTSYNC = 'https://huggingface.co/spaces/fffiloni/LatentSync'
export const BUSCAR_SPACES = 'https://huggingface.co/spaces?q=infinitetalk'

const celda = (tipo: 'code' | 'markdown', texto: string) => ({ cell_type: tipo, metadata: {}, source: texto.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l)), ...(tipo === 'code' ? { outputs: [], execution_count: null } : {}) })

/** El cuaderno de Colab para LatentSync 1.5. Sin probar contra un Colab real: sigue el `inference.sh` de ByteDance con los pesos de la 1.5. */
export function cuadernoColab() {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { accelerator: 'GPU', colab: { name: 'vid-latentsync.ipynb', provenance: [] }, kernelspec: { name: 'python3', display_name: 'Python 3' } },
    cells: [
      celda('markdown', '# LatentSync 1.5 para v!d\n\n1. Menu **Entorno de ejecucion > Cambiar tipo de entorno > GPU T4** (gratis).\n2. Ejecuta las celdas en orden. La instalacion tarda unos 10 minutos.\n3. En la celda 3 sube **un video** del personaje (o una imagen) y **el audio** (.wav o .mp3).\n4. El resultado se descarga solo (`video_out.mp4`). Guardalo y, en v!d, pulsa **Importar resultado**.'),
      celda('code', '!git clone --depth 1 https://github.com/bytedance/LatentSync.git\n%cd LatentSync\n!pip install -q -r requirements.txt\n!apt-get -qq install -y libgl1 ffmpeg\n!pip install -q -U "huggingface_hub[cli]"\n!huggingface-cli download ByteDance/LatentSync-1.5 whisper/tiny.pt latentsync_unet.pt --local-dir checkpoints'),
      celda('code', '# Entrada: sube el video (o la imagen) y el audio\nfrom google.colab import files\nsubidos = files.upload()\nnombres = list(subidos)\naudio = next(n for n in nombres if n.lower().endswith((".wav", ".mp3", ".m4a")))\nvisual = next(n for n in nombres if n != audio)\nif visual.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):\n    # Una imagen se vuelve un video quieto de la duracion del audio.\n    !ffmpeg -y -loop 1 -i "{visual}" -i "{audio}" -shortest -r 25 -c:v libx264 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" entrada.mp4\n    visual = "entrada.mp4"\nprint("video:", visual, "audio:", audio)'),
      celda('code', '!python -m scripts.inference \\\n  --unet_config_path configs/unet/stage2.yaml \\\n  --inference_ckpt_path checkpoints/latentsync_unet.pt \\\n  --inference_steps 20 --guidance_scale 2.0 --enable_deepcache \\\n  --video_path "{visual}" --audio_path "{audio}" --video_out_path video_out.mp4\nfiles.download("video_out.mp4")')
    ]
  }
}

/** Abre una dirección o una carpeta con el programa del sistema. */
export function abrir(destino: string) {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [destino]] : process.platform === 'darwin' ? ['open', [destino]] : ['xdg-open', [destino]]
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref()
}

export interface PaqueteNube {
  carpeta: string
  cuaderno: string
  instrucciones: string
}

/** Deja el cuaderno y las instrucciones en `<carpeta del video>/fuentes/avatar/nube/`. */
export function prepararNube(carpetaVideo: string, audio?: string): PaqueteNube {
  if (!isAbsolute(carpetaVideo)) throw new Error('Pasa la ruta absoluta de la carpeta del video.')
  const carpeta = join(carpetaVideo, 'fuentes', 'avatar', 'nube')
  mkdirSync(carpeta, { recursive: true })
  const cuaderno = join(carpeta, 'latentsync-colab.ipynb')
  writeFileSync(cuaderno, JSON.stringify(cuadernoColab(), null, 1))
  if (audio && existsSync(audio)) copyFileSync(audio, join(carpeta, basename(audio)))
  const instrucciones = join(carpeta, 'INSTRUCCIONES.md')
  writeFileSync(
    instrucciones,
    `# Avatar en la nube gratis\n\nElige una de las dos:\n\n## A. Google Colab (GPU T4 gratis)\n1. Abre ${COLAB} e inicia sesion con Google.\n2. Archivo > Subir cuaderno > elige \`latentsync-colab.ipynb\` (esta carpeta).\n3. Entorno de ejecucion > Cambiar tipo de entorno > GPU T4. Ejecuta las celdas en orden.\n4. Cuando la celda 3 pida archivos, sube el video (o la imagen) del personaje y el audio${audio ? ` (${basename(audio)} esta en esta carpeta)` : ''}.\n5. Baja \`video_out.mp4\`.\n\n## B. Space de Hugging Face\n1. Abre ${SPACE_LATENTSYNC}.\n2. Sube el video y el audio, pulsa el boton de generar y baja el resultado. Los Spaces gratis tienen cuota diaria de GPU y limite de duracion; para audios largos usa Colab.\n3. Otros Spaces de InfiniteTalk (comunidad): ${BUSCAR_SPACES}. Revisa de quien son antes de subir tu audio.\n\n## Al terminar\nEn v!d: Opciones > Avatares y voz > Importar resultado, y elige el MP4 que bajaste.\n`
  )
  return { carpeta, cuaderno, instrucciones }
}

/** Mete el MP4 que el usuario bajó de la nube al video. Comprueba que sea un video de verdad. */
export function importarResultado(origen: string, salida: string): string {
  if (!isAbsolute(origen) || !existsSync(origen) || !statSync(origen).isFile()) throw new Error(`No encuentro ${origen}: pasa la ruta absoluta del MP4 que bajaste.`)
  if (!isAbsolute(salida) || !/\.mp4$/i.test(salida)) throw new Error('El destino tiene que ser la ruta absoluta de un .mp4.')
  if (!/\.(mp4|mov|webm)$/i.test(extname(origen))) throw new Error('Importa el video que bajaste (mp4, mov o webm).')
  const fd = openSync(origen, 'r')
  const cab = Buffer.alloc(12)
  readSync(fd, cab, 0, 12, 0)
  closeSync(fd)
  const esMp4 = cab.toString('latin1', 4, 8) === 'ftyp'
  const esWebm = cab.readUInt32BE(0) === 0x1a45dfa3
  if (!esMp4 && !esWebm) throw new Error(`${basename(origen)} no parece un video (su cabecera no es de MP4 ni de WebM). Puede que la descarga se cortara.`)
  mkdirSync(dirname(salida), { recursive: true })
  copyFileSync(origen, salida)
  return salida
}

export interface PaqueteHeygen {
  carpeta: string
  guion: string
  audio?: string
  prompt: string
}

/**
 * Arma el paquete para hacer el video en la web de HeyGen con Claude en Chrome: `guion.txt`, el audio, las instrucciones
 * y `prompt-claude-chrome.txt`, que la interfaz copia al portapapeles. El prompt no deja que Claude gaste créditos sin
 * que el usuario confirme.
 */
export function paqueteHeygen(opts: { carpetaVideo: string; guion: string; audio?: string; avatar?: string; formato?: 'vertical' | 'horizontal' }): PaqueteHeygen {
  if (!isAbsolute(opts.carpetaVideo)) throw new Error('Pasa la ruta absoluta de la carpeta del video.')
  if (!opts.guion.trim()) throw new Error('Falta el guion.')
  const carpeta = join(opts.carpetaVideo, 'fuentes', 'avatar', 'heygen')
  mkdirSync(carpeta, { recursive: true })
  const guion = join(carpeta, 'guion.txt')
  writeFileSync(guion, opts.guion.trim())
  let audio: string | undefined
  if (opts.audio && existsSync(opts.audio)) {
    audio = join(carpeta, basename(opts.audio))
    if (audio !== opts.audio) copyFileSync(opts.audio, audio)
  }
  const formato = opts.formato === 'horizontal' ? '16:9 (horizontal)' : '9:16 (vertical)'
  const salida = join(opts.carpetaVideo, 'fuentes', 'avatar', 'heygen-video.mp4')
  const prompt = [
    'Quiero que hagas un video con avatar en la web de HeyGen, usando mi sesion de Chrome ya iniciada.',
    '',
    '1. Abre https://app.heygen.com y entra a crear un video con avatar (Avatar video / Create video).',
    `2. Avatar: ${opts.avatar ? `usa «${opts.avatar}»` : 'usa el que yo tenga como favorito o el primero de «Mis avatares»; dime cual elegiste'}. Formato ${formato}.`,
    audio
      ? `3. Voz: NO uses una voz de HeyGen. Sube mi audio (${audio}) con la herramienta de subir archivos y usalo como la voz del avatar (Upload audio / Audio).`
      : '3. Voz: usa una voz de HeyGen en espanol de Mexico si hay, o la mas natural en espanol; dime cual.',
    '4. Guion (copialo tal cual, sin cambiar palabras):',
    '"""',
    opts.guion.trim(),
    '"""',
    '5. ANTES de pulsar Generate/Submit, dime cuantos creditos va a gastar y espera mi confirmacion. No compres ni mejores ningun plan.',
    `6. Cuando el video este listo, descargalo y dime el nombre del archivo. Yo lo importare a v!d (destino: ${salida}).`
  ].join('\n')
  writeFileSync(join(carpeta, 'prompt-claude-chrome.txt'), prompt)
  writeFileSync(
    join(carpeta, 'INSTRUCCIONES.md'),
    `# HeyGen con Claude en Chrome\n\nEsta carpeta tiene lo necesario:\n- \`guion.txt\`: lo que dice el avatar.\n${audio ? `- \`${basename(audio)}\`: tu audio.\n` : ''}- \`prompt-claude-chrome.txt\`: pégalo en Claude en Chrome (la extension) con tu sesion de HeyGen abierta.\n\nv!d copia el prompt a tu portapapeles al armar el paquete. Claude hace los clics en la web de HeyGen; tu confirmas los creditos. Al terminar, baja el MP4 y usa **Importar resultado** en Opciones > Avatares y voz (destino sugerido: \`${salida}\`).\n`
  )
  return { carpeta, guion, audio, prompt }
}
