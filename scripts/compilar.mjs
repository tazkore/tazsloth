// Compila v!d para venderla. `npm run compilar` arma en dist/vid-koldgold la app que se instala en otra computadora y la
// mete en su instalador, en dist/instalador: vid-koldgold-Setup-<versión>.exe en Windows, vid-koldgold-<versión>-mac-x64.dmg (y su
// .zip, con el que se actualiza) en Mac y vid-koldgold-<versión>-linux-x86_64.AppImage en Linux. Cada sistema se compila en el
// suyo: lleva su Node y los paquetes de ese sistema. Es una app de Electron (electron/main.ts) y la empaqueta
// electron-builder. No se actualiza sola: no hay feed de actualizaciones (v!d Fase 1). Con
// `--sin-instalador` la deja lista para abrir, sin instalar, en dist/instalador. Lleva su propio Node, la interfaz y el
// servidor ya armados, y solo las skills de sus
// cards. No lleva lo que solo sirve aquí: tus datos (`data/`, `trabajo/`, y tus huellas, tus poses y tus modelos 3D en
// las skills) ni Ideas. Lo que se esconde en el código depende de `VENTA` (`shared/venta.ts`).
import { execFileSync, execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { build as esbuild } from 'esbuild'
import { build as vite } from 'vite'
import { Arch, build as empaquetar, Platform } from 'electron-builder'
import { armarVentana } from './electron.mjs'
import { notarizar } from './notarizar.mjs'
import { compresionInstalador } from './instalador-config.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(REPO, 'dist')
const SALIDA = join(DIST, 'vid-koldgold')
const APP = join(SALIDA, 'app')
/** La ventana (main.cjs y preload.cjs), que electron-builder empaqueta como la app de Electron, y ayudante.exe. */
const VENTANA = join(DIST, 'ventana')
const ICONO = join(REPO, 'assets', 'icon.ico')
/** El de Mac y Linux, de web/public/icon.svg a 1024 px. */
const ICONO_PNG = join(REPO, 'assets', 'icon.png')
const WINDOWS = process.platform === 'win32'
const MAC = process.platform === 'darwin'
/** v!d no arma la variante de macOS 12 de Sloth (Electron 43 / Node 22): siempre la normal. */
const MAC12 = false
// GitHub pasa vacío un secreto que no existe, y electron-builder tomaría ese vacío por un certificado. Y el certificado
// de Apple es solo para Mac: con él, electron-builder también firma el de Windows, que no confía en Apple (la firma sale
// «UnknownError»), y apunta al firmante en app-update.yml. Esa versión ya no acepta ninguna otra: electron-updater pide
// una firma válida de ese firmante, baja el instalador entero, lo rechaza y vuelve a empezar. Les pasó a la 0.4.0 y la
// 0.4.1 de Windows, que solo se arreglan instalando a mano. Al final se comprueba que no vuelva a pasar.
for (const v of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) if (!process.env[v] || process.platform !== 'darwin') delete process.env[v]
/** Con el certificado de Apple (CSC_LINK, ver docs/adr/0006), la de Mac va firmada y notarizada (scripts/notarizar.mjs), y se actualiza sola. */
const MAC_FIRMADA = MAC && !!process.env.CSC_LINK
const VERSION = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version
const SIN_INSTALADOR = process.argv.includes('--sin-instalador')

/** Además de las de cada card: la base común de los estilos, la biblioteca de modelos 3D y las de redes (`social-*`, Social Media). */
const SKILLS_BASE = ['video-base', 'modelos-3d', ...readdirSync(join(REPO, 'skills')).filter((s) => s.startsWith('social-'))]
/**
 * Los paquetes que el servidor carga o lanza. Lo demás ya va dentro de server/index.mjs o de la interfaz. De los agentes
 * van solo su SDK y su lanzador: su programa (cientos de MB cada uno) se baja al elegirlo (`server/agentes.ts`).
 */
const PAQUETES = ['@anthropic-ai/claude-agent-sdk', '@openai/codex', '@opencode/client', '@playwright/mcp', 'playwright-core', 'ws']
/** Lo que no se copia de las skills ni de los procesos de Python. */
const BASURA = new Set(['__pycache__', 'node_modules', '.git', '.cache'])
/**
 * Lo tuyo dentro de las skills, que se llena solo con los videos de cada cliente: tus huellas, tus poses y el banco de
 * temas de las series, que cada estilo guarda en su `series/banco`.
 */
const TUYO = ['video-explicativo/huellas/registro.jsonl', 'video-explicativo/huellas/hojas', 'reel-collage/personaje'].map((r) => join(REPO, 'skills', r))
const esBanco = (ruta) => basename(ruta) === 'banco' && basename(dirname(ruta)) === 'series'
/**
 * Tus modelos 3D también son tuyos: cada cliente empieza con la biblioteca vacía y hace los suyos. La moneda que trae de
 * protagonista la plantilla del explicativo va aparte (`modelos-3d/plantilla`), sin enseñarse. Los que llevaban las
 * versiones de antes los quita la app al actualizarse (electron/modelos-viejos.ts).
 */
const MODELOS = join(REPO, 'skills', 'modelos-3d', 'modelos')
const limpio = (ruta) => !BASURA.has(basename(ruta)) && !TUYO.includes(ruta) && !esBanco(ruta) && dirname(ruta) !== MODELOS

/** Ideas no se vende: `VENTA` nunca la abre, y aquí su código se cambia por nada para que no viaje en la app. */
const IDEAS = /[\\/](server[\\/]ideas[\\/](index|mcp)\.ts|web[\\/]src[\\/]Ideas\.tsx)$/
const SIN_IDEAS = 'export const Ideas = null, ideas = null, herramientasIdeas = () => ({})'

const paso = (texto) => console.log(`\n· ${texto}`)
// Compilada desde un hilo de v!d, heredaría el `development` de su Vite, y React saldría en modo desarrollo.
process.env.NODE_ENV = 'production'

paso('Comprobando los tipos')
execSync('npm run typecheck', { cwd: REPO, stdio: 'inherit' })

try {
  rmSync(SALIDA, { recursive: true, force: true })
} catch (error) {
  throw new Error(`No se pudo borrar ${SALIDA}: cierra la v!d compilada si está abierta. (${error.message})`)
}
mkdirSync(APP, { recursive: true })

paso('Armando la interfaz')
await vite({
  root: join(REPO, 'web'),
  configFile: false,
  mode: 'production',
  logLevel: 'warn',
  plugins: [react(), { name: 'sin-ideas', enforce: 'pre', load: (id) => (IDEAS.test(id) ? SIN_IDEAS : undefined) }],
  define: { __VENTA__: 'true' },
  build: { outDir: join(APP, 'web'), emptyOutDir: true, chunkSizeWarningLimit: 4000 }
})

paso('Armando el servidor')
// El Worker de `nube/`, que la app monta en la cuenta de Cloudflare de cada quien (`server/redes/cloudflare.ts`).
const nube = await esbuild({ entryPoints: [join(REPO, 'nube', 'src', 'index.ts')], bundle: true, format: 'esm', target: 'es2022', write: false, logLevel: 'warning' })
const { metafile } = await esbuild({
  entryPoints: {
    'server/index': join(REPO, 'server', 'index.ts'),
    'server/radar/rastrear': join(REPO, 'server', 'radar', 'rastrear.ts')
  },
  outdir: APP,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  // El Node que viaja en la app: el 22 en la de macOS 12.
  target: MAC12 ? 'node22' : 'node24',
  packages: 'external',
  define: { __VENTA__: 'true', __NUBE__: JSON.stringify(nube.outputFiles[0].text) },
  minifySyntax: true,
  plugins: [{ name: 'sin-ideas', setup: (b) => b.onLoad({ filter: IDEAS }, () => ({ contents: SIN_IDEAS, loader: 'js' })) }],
  metafile: true,
  logLevel: 'warning'
})
// Un paquete que el servidor importa y no va en `PAQUETES` faltaría en la otra computadora.
const paquete = (ruta) => ruta.split('/').slice(0, ruta.startsWith('@') ? 2 : 1).join('/')
const faltan = new Set(
  Object.values(metafile.outputs)
    .flatMap((o) => o.imports)
    .filter((i) => i.external && !i.path.startsWith('node:') && !PAQUETES.includes(paquete(i.path)))
    .map((i) => i.path)
)
if (faltan.size) throw new Error(`El servidor importa paquetes que no van en la app: ${[...faltan].join(', ')}. Añádelos a PAQUETES.`)
// La página del motor en vivo no va dentro del servidor: la arma cada proyecto de video con sus propios paquetes.
cpSync(join(REPO, 'server', 'motor-pagina.jsx'), join(APP, 'server', 'motor-pagina.jsx'))
// El MCP de la voz lo lanza cada agente con el Node de v!d: va tal cual, sin paquetes.
cpSync(join(REPO, 'server', 'voz', 'mcp.mjs'), join(APP, 'server', 'voz', 'mcp.mjs'))
// El de Google Flow (server/flow/), igual.
mkdirSync(join(APP, 'server', 'flow'), { recursive: true })
cpSync(join(REPO, 'server', 'flow', 'mcp.mjs'), join(APP, 'server', 'flow', 'mcp.mjs'))
// El del avatar (server/avatar/), igual, y los flujos de ComfyUI que trae la app (flujos.ts los busca junto al servidor).
mkdirSync(join(APP, 'server', 'avatar'), { recursive: true })
cpSync(join(REPO, 'server', 'avatar', 'mcp.mjs'), join(APP, 'server', 'avatar', 'mcp.mjs'))
cpSync(join(REPO, 'server', 'avatar', 'flujos'), join(APP, 'server', 'flujos'), { recursive: true })
// El que lanza Playwright MCP a demanda, igual.
cpSync(join(REPO, 'server', 'navegador-mcp.mjs'), join(APP, 'server', 'navegador-mcp.mjs'))
// El puente con el SDK de Cursor: server/cursor.ts lo copia junto al SDK que se baja y lo corre con el Node de v!d.
cpSync(join(REPO, 'server', 'cursor-puente.mjs'), join(APP, 'server', 'cursor-puente.mjs'))

paso('Instalando los paquetes')
const instalada = (p) => JSON.parse(readFileSync(join(REPO, 'node_modules', p, 'package.json'), 'utf8')).version
const dependencias = Object.fromEntries(PAQUETES.map((p) => [p, instalada(p)]))
writeFileSync(join(APP, 'package.json'), `${JSON.stringify({ name: 'vid-koldgold', version: VERSION, private: true, type: 'module', dependencies: dependencias }, null, 2)}\n`)
// Sin los opcionales: son los programas de Claude y Codex para cada sistema, que se bajan al elegirlos.
execSync('npm install --omit=dev --omit=optional --no-audit --no-fund --prefer-offline', { cwd: APP, stdio: 'inherit' })
// Lo que corre es el .js: los tipos, las fuentes y sus mapas son la mitad de node_modules.
for (const f of readdirSync(join(APP, 'node_modules'), { recursive: true, withFileTypes: true })) if (f.isFile() && /\.([cm]?ts|map)$/.test(f.name)) rmSync(join(f.parentPath, f.name))

// Las skills van aparte, en resources: la app las pone en app\skills al estrenar cada versión sin pisar lo que llevan de
// tus videos (`prepararSkills` en electron/main.ts).
paso('Copiando las cards, sus skills y los procesos de Python')
const cards = JSON.parse(readFileSync(join(REPO, 'cards.json'), 'utf8'))
cpSync(join(REPO, 'cards.json'), join(APP, 'cards.json'))
const skills = [...new Set([...SKILLS_BASE, ...cards.flatMap((c) => (c.skill ? [c.skill] : []))])]
for (const s of skills) cpSync(join(REPO, 'skills', s), join(SALIDA, 'skills', s), { recursive: true, filter: limpio })
cpSync(join(REPO, 'python', 'procesos'), join(APP, 'python', 'procesos'), { recursive: true, filter: limpio })
cpSync(join(REPO, 'scripts', 'start.mjs'), join(APP, 'scripts', 'start.mjs'))

// Lo que se vende no lleva nada tuyo ni React en modo desarrollo: antes se buscaba a mano y siempre quedaba algo.
paso('Revisando lo que se vende')
// Las palabras que delatan al dueño (su usuario, sus cuentas) no van en el código: son VID_TUYO, una expresión
// regular en sus variables y en los secretos del repo. Sin ella, esta parte no se revisa.
const PATRON_TUYO = process.env.VID_TUYO || process.env.SLOTH_TUYO
const TUYO_EN_TEXTO = PATRON_TUYO ? new RegExp(PATRON_TUYO, 'i') : null
if (!TUYO_EN_TEXTO) console.warn('Sin VID_TUYO: no reviso si lo que se vende lleva algo tuyo.')
const REACT_DEV = /react-dom-client\.development|react\.development/
const hallazgos = [APP, join(SALIDA, 'skills')].flatMap((raiz) =>
  readdirSync(raiz, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && !join(f.parentPath, f.name).slice(raiz.length).split(/[\\/]/).includes('node_modules'))
    .flatMap((f) => {
      const ruta = join(f.parentPath, f.name)
      const texto = readFileSync(ruta, 'latin1')
      const tuyo = TUYO_EN_TEXTO?.exec(texto)
      return [...(tuyo ? [`${ruta.slice(DIST.length + 1)}: «${tuyo[0]}»`] : []), ...(REACT_DEV.test(texto) ? [`${ruta.slice(DIST.length + 1)}: React en modo desarrollo`] : [])]
    })
)
if (hallazgos.length) throw new Error(`Lo que se vende lleva algo que no debe:\n${hallazgos.join('\n')}`)

paso('Copiando Node')
if (WINDOWS) {
  const NODE = dirname(process.execPath)
  for (const f of ['node.exe', 'npm', 'npm.cmd', 'npm.ps1', 'npx', 'npx.cmd', 'npx.ps1']) cpSync(join(NODE, f), join(SALIDA, 'node', f))
  cpSync(join(NODE, 'node_modules', 'npm'), join(SALIDA, 'node', 'node_modules', 'npm'), { recursive: true })
} else {
  // Como lo instala nodejs.org: bin/node y lib/node_modules/npm. Allí npm y npx son enlaces; aquí, dos guiones, que un
  // enlace no llega igual al empaquetado.
  const NODE = dirname(dirname(process.execPath))
  cpSync(process.execPath, join(SALIDA, 'node', 'bin', 'node'))
  cpSync(join(NODE, 'lib', 'node_modules', 'npm'), join(SALIDA, 'node', 'lib', 'node_modules', 'npm'), { recursive: true })
  for (const [f, cli] of [['npm', 'npm-cli.js'], ['npx', 'npx-cli.js']])
    writeFileSync(join(SALIDA, 'node', 'bin', f), `#!/bin/sh\nd="$(dirname "$0")"\nexec "$d/node" "$d/../lib/node_modules/npm/bin/${cli}" "$@"\n`, { mode: 0o755 })
}

paso('Armando la ventana')
rmSync(VENTANA, { recursive: true, force: true })
await armarVentana(VENTANA, { macFirmada: MAC_FIRMADA, mac12: MAC12 })
if (WINDOWS) {
  // ayudante.exe, que ancla v!d a la barra de tareas en los Windows de antes y la desancla al desinstalarla
  // (electron/barra.ts): C# con el csc de .NET Framework 4, que trae Windows.
  const AYUDANTE = join(REPO, 'scripts', 'ayudante')
  execFileSync(
    join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    ['-nologo', '-target:winexe', '-platform:x64', `-win32icon:${ICONO}`, `-out:${join(VENTANA, 'ayudante.exe')}`, ...readdirSync(AYUDANTE).map((f) => join(AYUDANTE, f))],
    { stdio: 'inherit' }
  )
}
// Su nombre (`vid-koldgold`) es la carpeta donde se instala: %LOCALAPPDATA%\Programs\vid-koldgold. productName y la
// descripción llevan el nombre visible («v!d by Kold.Gold»); el «!» no va en nombres de archivo ni de carpeta (exe,
// instalador, carpeta), que usan `vid-koldgold`. La descripción es el nombre que enseña Windows (el Administrador de tareas). En Windows lleva koffi, con el que vid-koldgold.exe le pide anclarla.
// Linux pide además una página de la app.
const ventana = {
  name: 'vid-koldgold',
  productName: 'v!d by Kold.Gold',
  version: VERSION,
  description: 'v!d by Kold.Gold',
  author: 'Kold Gold SAPI',
  homepage: 'https://github.com/tazkore/tazsloth',
  // En Linux, el nombre con que el escritorio junta la ventana con su icono.
  desktopName: 'vid-koldgold.desktop',
  main: 'main.cjs',
  dependencies: WINDOWS ? { koffi: instalada('koffi') } : {}
}
writeFileSync(join(VENTANA, 'package.json'), `${JSON.stringify(ventana, null, 2)}\n`)
execSync('npm install --omit=dev --no-audit --no-fund --prefer-offline', { cwd: VENTANA, stdio: 'inherit' })

/**
 * Lo que va fuera de app.asar. En Windows, junto a vid-koldgold.exe, como hasta la 0.2: tus videos y tus hilos se quedan en app
 * (scripts/instalador.nsh). En Mac y Linux, en resources: la app lo copia a tu carpeta al estrenar cada versión
 * (`prepararApp` en electron/main.ts). electron-builder nunca copia la carpeta node_modules de lo que copia: va aparte.
 */
const fuera = WINDOWS
  ? [
      { from: APP, to: 'app' },
      { from: join(APP, 'node_modules'), to: 'app/node_modules' },
      { from: join(SALIDA, 'node'), to: 'node' },
      { from: join(SALIDA, 'node', 'node_modules'), to: 'node/node_modules' }
    ]
  : [
      { from: APP, to: 'vid' },
      { from: join(APP, 'node_modules'), to: 'vid/node_modules' },
      { from: join(SALIDA, 'node'), to: 'node' },
      { from: join(SALIDA, 'node', 'lib', 'node_modules'), to: 'node/lib/node_modules' }
    ]
/** vid-koldgold.exe es siempre la app: ni un Node (ELECTRON_RUN_AS_NODE) ni otro código fuera de su app.asar. */
const FUSIBLES = { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, onlyLoadAppFromAsar: true }

/**
 * Ubuntu 24.04 (y los que le siguen) no deja a un programa cualquiera crear el espacio aislado de Chromium, y un AppImage
 * no puede traer el otro (chrome-sandbox con setuid): v!d no abriría. Ahí, y solo ahí, sale sin él: el ejecutable pasa a
 * vid.bin y en su lugar queda un guion que lo mira antes de abrirlo. Los fusibles se ponen aquí, antes de cambiarle el
 * nombre: electron-builder los pondría después, en el guion.
 */
async function linuxSinAislamiento(ctx) {
  if (ctx.electronPlatformName !== 'linux') return
  await ctx.packager.addElectronFuses(ctx, await ctx.packager.generateFuseConfig(FUSIBLES))
  const exe = join(ctx.appOutDir, ctx.packager.executableName)
  renameSync(exe, `${exe}.bin`)
  const guion = [
    '#!/bin/sh',
    'd="$(dirname "$(readlink -f "$0")")"',
    'if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then',
    `  exec "$d/${basename(exe)}.bin" --no-sandbox "$@"`,
    'fi',
    `exec "$d/${basename(exe)}.bin" "$@"`
  ]
  writeFileSync(exe, `${guion.join('\n')}\n`, { mode: 0o755 })
}

const ARCH = process.arch === 'arm64' ? Arch.arm64 : Arch.x64
const objetivo = WINDOWS
  ? Platform.WINDOWS.createTarget(SIN_INSTALADOR ? 'dir' : 'nsis', Arch.x64)
  : MAC
    ? Platform.MAC.createTarget(SIN_INSTALADOR ? 'dir' : ['dmg', 'zip'], ARCH)
    : Platform.LINUX.createTarget(SIN_INSTALADOR ? 'dir' : 'AppImage', ARCH)

paso(SIN_INSTALADOR ? 'Empaquetando' : 'Armando el instalador')
const hechos = await empaquetar({
  // Desde la ventana y no desde el repo: si no, electron-builder metería en app.asar los paquetes del repo.
  projectDir: VENTANA,
  targets: objetivo,
  publish: 'never',
  config: {
    // Su nombre ante Windows (AppUserModelID): el acceso anclado y los avisos son de v!d.
    appId: 'Gold.Kold.Vid',
    electronVersion: JSON.parse(readFileSync(join(REPO, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    productName: 'v!d by Kold.Gold',
    // Sin «!» en nombres de archivo: el ejecutable, los instaladores y la carpeta usan vid-koldgold.
    executableName: 'vid-koldgold',
    copyright: 'Kold Gold SAPI · basado en Sloth de Vancci (Apache-2.0)',
    directories: { app: VENTANA, output: join(DIST, 'instalador') },
    files: ['**/*', '!ayudante.exe'],
    extraFiles: WINDOWS ? fuera : [],
    extraResources: [
      ...(WINDOWS ? [] : fuera),
      { from: join(SALIDA, 'skills'), to: 'skills' },
      ...(WINDOWS ? [{ from: join(VENTANA, 'ayudante.exe'), to: 'ayudante.exe' }] : [{ from: ICONO_PNG, to: 'icon.png' }])
    ],
    win: { icon: ICONO },
    nsis: {
      ...compresionInstalador,
      // Con sus pasos, para elegir en qué disco va (scripts/instalador.nsh). Las actualizaciones siguen sin preguntar nada.
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      runAfterFinish: true,
      createDesktopShortcut: true,
      shortcutName: 'v!d by Kold.Gold',
      uninstallDisplayName: 'v!d by Kold.Gold',
      artifactName: 'vid-koldgold-Setup-${version}.${ext}',
      installerIcon: ICONO,
      uninstallerIcon: ICONO,
      include: join(REPO, 'scripts', 'instalador.nsh'),
      installerLanguages: ['es_ES'],
      language: '3082'
    },
    mac: {
      icon: ICONO_PNG,
      category: 'public.app-category.video',
      artifactName: 'vid-koldgold-${version}-mac-${arch}.${ext}',
      // Sin certificado, firma ad hoc: sin ninguna, macOS dice que v!d «está dañada». Con ella, se
      // abre una vez desde Configuración → Privacidad y seguridad → «Abrir de todos modos».
      identity: MAC_FIRMADA ? undefined : '-',
      hardenedRuntime: MAC_FIRMADA,
      // electron-builder esperaría a Apple sin límite: lo hace scripts/notarizar.mjs, con tiempo máximo.
      notarize: false,
      entitlements: join(REPO, 'scripts', 'mac.entitlements'),
      entitlementsInherit: join(REPO, 'scripts', 'mac.entitlements'),
      // La voz se graba en la interfaz: sin esto, macOS ni siquiera pregunta por el micrófono.
      extendInfo: { NSMicrophoneUsageDescription: 'v!d graba tu voz para los videos.' }
    },
    dmg: { artifactName: 'vid-koldgold-${version}-mac-${arch}.${ext}' },
    linux: {
      icon: ICONO_PNG,
      category: 'AudioVideo',
      synopsis: 'Cada skill es una card: describes el trabajo y el agente lo hace a la vista.',
      artifactName: 'vid-koldgold-${version}-linux-${arch}.${ext}',
      syncDesktopName: true
    },
    // La app va en español: de los 55 idiomas de Chromium solo hacen falta el suyo y el inglés, al que recurre.
    electronLanguages: ['es', 'es-419', 'en-US'],
    afterPack: linuxSinAislamiento,
    afterSign: notarizar,
    // Los de Linux, en linuxSinAislamiento.
    electronFuses: WINDOWS || MAC ? FUSIBLES : undefined,
    npmRebuild: false
  }
})
// Una de Windows con firmante en app-update.yml no se actualiza sola con una firma en que Windows no confíe (arriba).
const configUpdater = join(DIST, 'instalador', 'win-unpacked', 'resources', 'app-update.yml')
if (WINDOWS && existsSync(configUpdater) && /publisherName/.test(readFileSync(configUpdater, 'utf8'))) {
  throw new Error(`La de Windows salió firmada (publisherName en ${configUpdater}): no podría actualizarse sola. Quita el certificado.`)
}
console.log(`\nListo:\n${hechos.filter((f) => !/\.(blockmap|yml)$/.test(f)).join('\n') || join(DIST, 'instalador')}`)
