/**
 * La app de escritorio de v!d, con Electron. En la que se vende (`npm run compilar`) es vid-koldgold.exe: levanta el servidor
 * con su propio Node (`node\node.exe app\scripts\start.mjs`) y lo enseña en su ventana; al cerrarla se cierra todo, sin
 * quedarse de fondo. v!d no se actualiza sola (Fase 1): una versión nueva se instala encima. En el repo, `npm start` levanta el servidor y abre esta misma ventana con `VID_VENTANA`, su
 * dirección: entonces solo se pone la ventana.
 *
 * En Windows todo va junto a vid-koldgold.exe, como hasta la 0.2: `app\` (el servidor, la interfaz, y tus videos y tus hilos en
 * `app\trabajo` y `app\data`) y `node\`. Al actualizar, el instalador cambia lo demás y deja eso (scripts/instalador.nsh).
 * En Mac y Linux la app no se puede escribir (un .app firmado, un AppImage): el servidor viaja en resources/vid y pasa a
 * `DATOS` al estrenar cada versión, junto a tus videos y tus hilos (`prepararApp`); Node se queda en resources/node.
 * Lo de fuera (enlaces, autorizar cuentas) se abre en el navegador de cada quien; lo que abre el agente, en el de
 * cada hilo, dentro de esta ventana (navegador.ts). Lo compila scripts/electron.mjs.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, type WriteStream } from 'node:fs'
import { cp } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, session, shell, type WebContents } from 'electron'
import { guardar } from '../server/disco.ts'
import { anclada, anclar } from './barra.ts'
import { opcionesClicDerecho } from './clic-derecho.ts'
import { archivos, huella, huellas, nombreCopia, quitarViejos, respaldar } from '../server/originales.ts'
import { guardarAnteriores } from '../server/anteriores.ts'
import { MODELOS_VIEJOS } from './modelos-viejos.ts'
import { migrarCarpeta, reescribirSesiones } from '../server/migrar.ts'
import { enlazarFuera } from '../server/datos-fuera.ts'
import { consultarPuerto, elegirPuerto, puertoLibre } from './puerto.ts'
import { iniciarNavegador, ventanaDelNavegador } from './navegador.ts'

/** En el repo: la dirección del servidor que ya levantó `npm start`. */
const SOLO_VENTANA = process.env.VID_VENTANA ?? process.env.SLOTH_VENTANA
/** La dirección de la interfaz. En la instalada, el puerto puede cambiar al arrancar (`ponerPuerto`, electron/puerto.ts). */
let URL_VID = SOLO_VENTANA ?? `http://localhost:${process.env.PORT ?? '4850'}`
const WINDOWS = process.platform === 'win32'
const MAC = process.platform === 'darwin'
/** Fuera de Windows, dónde viven v!d y lo tuyo: la app no se puede escribir. */
const DATOS = MAC ? join(homedir(), 'Library', 'Application Support', 'vid-koldgold') : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'vid-koldgold')
// Fase 2: la primera vez, lo de TazSloth se copia a la carpeta nueva (la vieja no se toca; server/migrar.ts). En Windows
// lo hace el servidor: ahí todo vive junto al programa.
if (!WINDOWS && !SOLO_VENTANA) {
  const vieja = migrarCarpeta([join(dirname(DATOS), MAC ? 'TazSloth' : 'tazsloth')], DATOS)
  if (vieja) reescribirSesiones(join(DATOS, 'data'), join(vieja, 'trabajo'), join(DATOS, 'trabajo'))
}
/** La carpeta de vid-koldgold.exe. */
const RAIZ = dirname(process.execPath)
const APP = SOLO_VENTANA ? (process.env.VID_APP ?? process.env.SLOTH_APP ?? process.cwd()) : WINDOWS ? join(RAIZ, 'app') : DATOS
/**
 * v1.1: en Windows, con `C:\vid-datos` (o `VID_DATOS` y `VID_TRABAJO`), `app\data` y `app\trabajo` son uniones a las de
 * fuera, antes de que nada las abra (server/datos-fuera.ts). Lo que hizo se anota en el registro al abrirlo.
 */
const FUERA: string[] = []
if (WINDOWS && !SOLO_VENTANA) {
  try {
    FUERA.push(...enlazarFuera(APP))
  } catch (e) {
    FUERA.push(`No pude poner tus datos en C:\\vid-datos: ${e instanceof Error ? e.message : e}`)
  }
}
const REGISTRO = join(APP, 'data', 'vid.log')
/** Dónde se dejó la ventana. */
const LUGAR = join(APP, 'data', 'ventana.json')
/** Existe si marcaste «No volver a mostrar» en el aviso al cerrar. */
const SIN_AVISO = join(APP, 'data', 'sin-aviso-al-cerrar.json')
/** --bg de web/src/styles.css: el fondo mientras carga y el de la barra de título. */
const FONDO = '#0b0d12'
let ventana: BrowserWindow | undefined
let servidor: ChildProcess | undefined
let registro: WriteStream | undefined
/** El servidor ya dijo «v!d en …»: la ventana puede cargar la interfaz. */
let listo = !!SOLO_VENTANA
let cerrando = false
// Su propio nombre ante Windows: la ventana se junta con el acceso anclado y los avisos salen a nombre de v!d.
app.setAppUserModelId(SOLO_VENTANA ? 'Gold.Kold.Vid.Dev' : 'Gold.Kold.Vid')
app.setPath('userData', join(APP, 'data', 'ventana'))
nativeTheme.themeSource = 'dark'

if (!app.requestSingleInstanceLock()) app.quit()
else {
  mudarPerfil()
  app.on('second-instance', () => abrir())
  app.on('activate', () => abrir())
  // Cerrar la ventana cierra v!d entera, también en Mac: el servidor y lo que lanzó se detienen (`before-quit`).
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    cerrando = true
    detener()
  })
  ipcMain.on('traer', () => ventana && traer(ventana))
  ipcMain.handle('anclada', () => anclada())
  ipcMain.handle('anclar', () => anclar())
  void app.whenReady().then(iniciar)
}

async function iniciar() {
  permisos()
  Menu.setApplicationMenu(menu())
  iniciarNavegador(APP)
  abrir()
  if (SOLO_VENTANA) return
  mkdirSync(join(APP, 'data'), { recursive: true })
  registro = createWriteStream(REGISTRO)
  for (const f of FUERA) anotar(f)
  process.on('uncaughtException', (e) => anotar(e.stack ?? e.message))
  try {
    if (!WINDOWS) await prepararApp()
    await prepararSkills()
  } catch (e) {
    anotar(`No se pudo poner esta versión de v!d: ${e instanceof Error ? e.message : e}`)
  }
  await ponerPuerto()
  arrancar()
}

/**
 * Si en el puerto de v!d ya contesta otro v!d (de otra carpeta: el repo en desarrollo), esta usa el siguiente libre y
 * levanta ahí su servidor; si contesta el suyo, se engancha (electron/puerto.ts). El servidor y start.mjs lo leen de PORT.
 */
async function ponerPuerto() {
  try {
    const archivo = join(APP, 'data', 'servidor-token')
    const token = process.env.VID_TOKEN || (existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : '')
    const inicial = Number(process.env.PORT ?? 4850)
    const { puerto, propio } = await elegirPuerto({ inicial, app: APP, consultar: (p) => consultarPuerto(p, token), libre: puertoLibre })
    if (puerto !== inicial) anotar(`En el puerto ${inicial} ya hay otro v!d (de otra carpeta): esta usa el ${puerto}.`)
    else if (propio) anotar(`v!d ya corría en el puerto ${puerto}: me engancho a ella.`)
    process.env.PORT = String(puerto)
    URL_VID = `http://localhost:${puerto}`
  } catch (e) {
    anotar(`No pude elegir puerto; sigo con el ${process.env.PORT ?? 4850}: ${e instanceof Error ? e.message : e}`)
  }
}

/** La ventana, o al frente si ya está. Se enseña en cuanto se pide y carga la interfaz cuando el servidor contesta. */
function abrir() {
  if (ventana) return traer(ventana)
  const { maximizada, ...medidas } = lugar()
  const v = new BrowserWindow({
    ...medidas,
    title: 'v!d by Kold.Gold',
    show: false,
    backgroundColor: FONDO,
    // En Windows 11, la barra de título y el borde del color de v!d (Electron los vuelve a pintar al enfocarla). En
    // Windows 10 solo se oscurecen.
    accentColor: FONDO,
    // La compilada lleva el logo en vid-koldgold.exe y en vid-koldgold.app; en el repo es electron.exe, con el suyo. Linux lo pide siempre.
    icon: MAC || (WINDOWS && app.isPackaged) ? undefined : app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(APP, 'assets', WINDOWS ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, autoplayPolicy: 'no-user-gesture-required' }
  })
  ventana = v
  v.setMenuBarVisibility(false)
  enlaces(v.webContents)
  ventanaDelNavegador(v)
  v.webContents.on('context-menu', (_e, p) => {
    const opciones = opcionesClicDerecho(v.webContents, p)
    if (opciones.length) Menu.buildFromTemplate(opciones).popup({ window: v })
  })
  // Si la interfaz se cae, se recarga. Si se cae una y otra vez, recargarla sin parar solo calentaba la máquina: tras la
  // tercera en un minuto se avisa, y Ctrl+R la vuelve a cargar.
  let caidas: number[] = []
  v.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return
    caidas = [...caidas.filter((t) => Date.now() - t < 60_000), Date.now()]
    if (caidas.length <= 3) v.reload()
    else if (caidas.length === 4) dialog.showErrorBox('v!d by Kold.Gold', 'La ventana se cerró varias veces seguidas. Recárgala con Ctrl+R: los agentes y tus archivos siguen trabajando.')
  })
  v.on('close', (e) => {
    // Solo si el servidor es de esta ventana: si no (el repo, o v!d ya abierta de otra forma), cerrarla no detiene nada.
    if (servidor && !cerrando && !existsSync(SIN_AVISO)) {
      e.preventDefault()
      void avisarAlCerrar(v)
    } else guardarLugar(v)
  })
  v.on('closed', () => (ventana = undefined))
  if (maximizada) v.maximize()
  v.show()
  if (listo) void conToken().then(() => v.loadURL(URL_VID))
}

let avisando = false

/** Qué pasa al cerrar la ventana, hasta que marques «No volver a mostrar». */
async function avisarAlCerrar(v: BrowserWindow) {
  if (avisando) return
  avisando = true
  const { response, checkboxChecked } = await dialog.showMessageBox(v, {
    type: 'question',
    title: 'v!d by Kold.Gold',
    message: '¿Cerrar v!d?',
    detail: 'Se cierra por completo, sin quedarse de fondo: se detiene todo lo que esté haciendo, también los videos a medias.',
    buttons: ['Cerrar v!d', 'Cancelar'],
    defaultId: 0,
    cancelId: 1,
    // Botones normales: si no, Windows los pinta como enlaces grandes con flecha.
    noLink: true,
    checkboxLabel: 'No volver a mostrar'
  })
  avisando = false
  if (response !== 0) return
  if (checkboxChecked) {
    try {
      guardar(SIN_AVISO, '{}')
    } catch {
      // Se vuelve a avisar la próxima vez.
    }
  }
  cerrando = true
  v.close()
}

/** Al frente, como estaba antes de minimizarla. */
function traer(v: BrowserWindow) {
  if (v.isMinimized()) v.restore()
  v.show()
  v.focus()
}

/** Dónde se dejó la ventana; la primera vez, o en una pantalla que ya no está, centrada. */
function lugar(): { x?: number; y?: number; width: number; height: number; maximizada?: boolean } {
  try {
    const l = JSON.parse(readFileSync(LUGAR, 'utf8'))
    const visible = screen.getAllDisplays().some(({ workArea: a }) => l.x < a.x + a.width && l.x + l.width > a.x && l.y < a.y + a.height && l.y + l.height > a.y)
    if (visible) return l
  } catch {
    // La primera vez.
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  return { width: Math.round((width * 4) / 5), height: Math.round((height * 5) / 6) }
}

function guardarLugar(v: BrowserWindow) {
  const { x, y, width, height } = v.getNormalBounds()
  try {
    guardar(LUGAR, JSON.stringify({ x, y, width, height, maximizada: v.isMaximized() }))
  } catch {
    // Se abrirá centrada.
  }
}

const propia = (url: string) => url === URL_VID || url.startsWith(`${URL_VID}/`)

/** En el navegador predeterminado. Solo http y https: nada de rutas ni programas. */
function fuera(url: string) {
  try {
    const u = new URL(url)
    if (u.protocol === 'http:' || u.protocol === 'https:') void shell.openExternal(u.href)
  } catch {
    // No era una dirección.
  }
}

/**
 * Lo de fuera, al navegador: un enlace que abre otra pestaña, `window.open` o uno que cambiaría esta página. Lo que abre
 * una pestaña vacía en el clic y le pone la dirección después (el pago, autorizar Codex o YouTube) recibe una ventana
 * oculta que manda esa dirección al navegador y se cierra.
 */
function enlaces(wc: WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { show: false } }
    fuera(url)
    return { action: 'deny' }
  })
  wc.on('did-create-window', (hija) => {
    hija.webContents.on('will-navigate', (e, url) => {
      e.preventDefault()
      fuera(url)
      hija.close()
    })
    setTimeout(() => hija.isDestroyed() || hija.close(), 10 * 60_000)
  })
  wc.on('will-navigate', (e, url) => {
    if (propia(url)) return
    e.preventDefault()
    fuera(url)
  })
}

/** Lo que pide la interfaz (avisos, portapapeles, micrófono) se da sin preguntar: es v!d. A nadie más. */
function permisos() {
  session.defaultSession.setPermissionRequestHandler((_wc, _permiso, responder, d) => responder(propia(d.requestingUrl)))
  session.defaultSession.setPermissionCheckHandler((_wc, _permiso, origen) => propia(origen))
}

/**
 * Editar y Ver, con sus atajos (recargar, el zoom, las herramientas de desarrollo). En Windows no se ve; en Mac es la barra
 * de arriba, con el de la app y el de la ventana.
 */
function menu() {
  const mac = process.platform === 'darwin'
  return Menu.buildFromTemplate([...(mac ? [{ role: 'appMenu' as const }] : []), { role: 'editMenu' }, { role: 'viewMenu' }, ...(mac ? [{ role: 'windowMenu' as const }] : [])])
}

/**
 * Fuera de Windows, el servidor y la interfaz de esta versión (resources/vid) pasan a `DATOS` al estrenarla: cada cosa
 * reemplaza a la de antes, y lo tuyo (data, trabajo, skills) se queda. Los enlaces de node_modules/.bin van tal cual:
 * resueltos, apuntarían dentro de la app, que en un AppImage cambia de sitio cada vez que se abre.
 */
async function prepararApp() {
  const marca = join(APP, 'data', 'skills.txt')
  if (existsSync(marca) && readFileSync(marca, 'utf8') === app.getVersion()) return
  const de = join(process.resourcesPath, 'vid')
  for (const cosa of readdirSync(de)) {
    rmSync(join(APP, cosa), { recursive: true, force: true })
    await cp(join(de, cosa), join(APP, cosa), { recursive: true, verbatimSymlinks: true })
  }
  // La copia hereda la marca de «bajado de internet» del .dmg, y macOS revisaría uno a uno los programas de los paquetes
  // (Claude Code, Codex) al lanzarlos: ya se revisó v!d al abrirla.
  if (MAC) spawnSync('xattr', ['-dr', 'com.apple.quarantine', join(APP, 'node_modules')])
}

/**
 * Las skills viajan en resources\skills y se ponen en app\skills al estrenar cada versión, como hacía el instalador de
 * antes: lo que cada skill guarda de los tuyos (las huellas, el banco de temas, la biblioteca 3D) se queda. Los modelos
 * 3D del dueño de v!d que traían las versiones de antes (la moneda incluida) se van, menos los que cambiaste
 * (`MODELOS_VIEJOS`). Lo que cambiaste en las skills se pisa, pero antes se copia a `data/skills-tuyas`
 * (`respaldarCambios`). Lo que la versión de antes traía y esta ya no se va, si no lo cambiaste (`quitarViejos`). Un
 * estilo que esta versión cambia a fondo (`cambio` en su card) se guarda antes como estaba (`guardarAnteriores`).
 */
async function prepararSkills() {
  const marca = join(APP, 'data', 'skills.txt')
  if (existsSync(marca) && readFileSync(marca, 'utf8') === app.getVersion()) return
  const antes = originalesDeAntes()
  respaldarCambios(antes)
  // Lo que esta versión cambia a fondo (`cambio` en su card), antes de pisarlo: quien lo usaba puede quedarse con el de antes.
  try {
    guardarAnteriores({ cards: JSON.parse(readFileSync(join(APP, 'cards.json'), 'utf8')), skills: join(APP, 'skills'), nuevas: join(process.resourcesPath, 'skills'), datos: join(APP, 'data'), originales: antes })
  } catch (e) {
    anotar(`No se pudieron guardar los estilos de antes: ${e instanceof Error ? e.message : e}`)
  }
  await cp(join(process.resourcesPath, 'skills'), join(APP, 'skills'), { recursive: true })
  // Lo que la versión de antes traía y esta ya no, si sigue como llegó: si no, se quedaría para siempre.
  quitarViejos(antes, join(process.resourcesPath, 'skills'), join(APP, 'skills'))
  guardar(join(APP, 'data', 'skills-originales.json'), JSON.stringify(huellas(join(process.resourcesPath, 'skills'))))
  // Las skills de las versiones de antes llevaban una bitácora que ya no se usa.
  for (const s of readdirSync(join(APP, 'skills'))) rmSync(join(APP, 'skills', s, 'BITACORA.md'), { force: true })
  const modelos = join(APP, 'skills', 'modelos-3d', 'modelos')
  for (const [id, huellas] of Object.entries(MODELOS_VIEJOS)) {
    try {
      const fuente = readFileSync(join(modelos, id, `${id}.tsx`), 'utf8').replaceAll('\r\n', '\n')
      if (huellas.includes(createHash('sha256').update(fuente).digest('hex').slice(0, 16))) rmSync(join(modelos, id), { recursive: true, force: true })
    } catch {
      // No está: nunca llegó o ya se fue.
    }
  }
  writeFileSync(marca, app.getVersion())
}

/** Las huellas de las skills como las trajo la versión de antes (`data/skills-originales.json`); vacía si es de antes de la lista. */
function originalesDeAntes(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(APP, 'data', 'skills-originales.json'), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Antes de poner las skills de esta versión, lo que cambiaste en las de antes y que esta pisaría se copia a
 * `data/skills-tuyas/<fecha> antes de la <versión>`. Es tuyo lo que no es como lo trajo su versión (`antes`); viniendo
 * de una sin esa lista, todo lo que esta pisaría con otra cosa, que puede ser tuyo. Si la copia falla, no se pisa nada
 * (`prepararSkills` lo vuelve a intentar al abrir otra vez).
 */
function respaldarCambios(antes: Record<string, string>) {
  const nuevas = join(process.resourcesPath, 'skills')
  const cambios = archivos(nuevas).flatMap((r) => {
    const f = join(APP, 'skills', r)
    if (!existsSync(f)) return []
    const h = huella(f)
    return h === huella(join(nuevas, r)) || h === antes[r] ? [] : [{ skill: r.split('/')[0], archivo: r.slice(r.indexOf('/') + 1) }]
  })
  respaldar(cambios, (s) => join(APP, 'skills', s), join(APP, 'data', 'skills-tuyas', nombreCopia(`antes de la ${app.getVersion()}`)))
}

/**
 * Hasta la 0.2.5 la ventana era WebView2, con su perfil en este mismo sitio: lo que guardó la interfaz (los borradores, lo
 * que elegiste) pasa al de Electron. Antes de abrirlo, que después ya no se puede.
 */
function mudarPerfil() {
  const perfil = app.getPath('userData')
  const viejo = join(perfil, 'EBWebView')
  if (!existsSync(viejo)) return
  const guardado = join(viejo, 'Default', 'Local Storage')
  try {
    if (existsSync(guardado) && !existsSync(join(perfil, 'Local Storage'))) cpSync(guardado, join(perfil, 'Local Storage'), { recursive: true })
    rmSync(viejo, { recursive: true, force: true })
    rmSync(join(APP, 'data', 'ventana.txt'), { force: true })
  } catch {
    // Es comodidad: sin ella, la interfaz empieza de cero.
  }
}

/** El servidor, sin consola. Lo que dice queda en app\data\vid.log. */
function arrancar() {
  const node = WINDOWS ? join(RAIZ, 'node', 'node.exe') : join(process.resourcesPath, 'node', 'bin', 'node')
  // La ventana la pone este proceso, no start.mjs. Fuera de Windows, en su propio grupo, para cerrarlo con lo que lanzó.
  // Con las skills como las trae esta versión, para «Volver a la original» (server/originales.ts).
  const env = { ...process.env, VID_SKILLS_ORIGINALES: join(process.resourcesPath, 'skills') }
  const s = spawn(node, ['scripts/start.mjs', '--no-open'], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' })
  servidor = s
  s.stdout!.on('data', escribir)
  s.stderr!.on('data', escribir)
  s.on('error', (e) => {
    dialog.showErrorBox('v!d by Kold.Gold', `No se pudo abrir v!d: ${e.message}`)
    salir()
  })
  // Solo el que sigue siendo el de v!d.
  s.on('exit', (codigo) => s === servidor && termino(codigo))
}

function escribir(d: Buffer) {
  registro?.write(d)
  // Lo que escribe el servidor al quedar escuchando (server/index.ts).
  if (!listo && String(d).includes('v!d en ')) marcarListo()
}

function marcarListo() {
  listo = true
  void conToken().then(() => ventana?.loadURL(URL_VID))
}

/**
 * El token del servidor local (server/token.ts): la página lo recibe en su cookie al cargarse, y aquí se pone antes, de
 * `VID_TOKEN` o de `data/servidor-token`, por si la ventana se recarga sin pasar por esa navegación.
 */
async function conToken() {
  try {
    const archivo = join(APP, 'data', 'servidor-token')
    const token = process.env.VID_TOKEN || (existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() : '')
    if (token) await session.defaultSession.cookies.set({ url: URL_VID, name: 'vid_token', value: token, httpOnly: true, sameSite: 'strict', path: '/' })
  } catch {
    // Sin ella, la página la recibe del servidor al cargarse.
  }
}

/**
 * start.mjs terminó solo. Con 0, v!d ya corría (abierta de otra forma): queda su ventana, y al cerrarla se sale. Si no,
 * el servidor se cayó tres veces seguidas.
 */
function termino(codigo: number | null) {
  servidor = undefined
  if (cerrando) return
  if (codigo === 0) {
    marcarListo()
    if (!ventana) app.quit()
    return
  }
  dialog.showMessageBoxSync({ type: 'warning', title: 'v!d by Kold.Gold', message: 'v!d se cerró.', detail: `Lo que pasó está en el registro:\n${REGISTRO}` })
  salir()
}

/** El servidor y lo que lanzó (start.mjs, los agentes, el radar…). */
function detener() {
  const pid = servidor?.pid
  servidor = undefined
  if (!pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      // Ya había salido.
    }
  }
}

function salir() {
  cerrando = true
  detener()
  app.quit()
}

function anotar(texto: unknown) {
  registro?.write(`[vid] ${texto}\n`)
}

