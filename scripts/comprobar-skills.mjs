// Comprueba las skills, que `npm run typecheck` y `npm test` no miran: la sintaxis de cada .mjs (`node --check`) y de
// cada .py (`ast.parse`, sin dejar __pycache__), que cada estilo de video haga los dos formatos y los tipos de cada
// plantilla de Remotion. La plantilla se copia a una
// carpeta temporal con un enlace a los node_modules de un video de ese estilo; el enlace se quita con `rmdirSync`, que en
// un enlace solo quita el enlace y en una carpeta llena falla: nunca borra los node_modules de nadie. Sin video de ese
// estilo no hay node_modules y la plantilla se salta (lo dice). Sale con 1 si algo falla.
//   npm run comprobar-skills [-- <skill>...]
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, globSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = join(REPO, 'skills')
const FUERA = ['**/node_modules/**', '**/__pycache__/**', '**/.cache/**']
const pedidas = process.argv.slice(2)
const skills = readdirSync(SKILLS).filter((s) => statSync(join(SKILLS, s)).isDirectory() && (!pedidas.length || pedidas.includes(s)))
const fallos = []
const fallo = (que, salida) => fallos.push(`${que}\n${salida.trim().split('\n').slice(0, 8).map((l) => `    ${l}`).join('\n')}`)
const de = (patron) => skills.flatMap((s) => globSync(patron, { cwd: join(SKILLS, s), exclude: FUERA }).map((r) => join(SKILLS, s, r)))

// Los .mjs y .cjs.
const scripts = de('**/*.{mjs,cjs}')
for (const f of scripts) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status) fallo(relative(REPO, f), r.stderr)
}
console.log(`· ${scripts.length} scripts de Node`)

// Los .py, todos en un solo Python.
const pys = de('**/*.py')
const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version']).status === 0)
if (!python) console.log('· Sin Python en el PATH: no se miran los .py')
else if (pys.length) {
  const codigo = 'import ast,sys\nfor f in sys.argv[1:]:\n  try: ast.parse(open(f,encoding="utf-8").read(),f)\n  except SyntaxError as e: print(f"{f}:{e.lineno}: {e.msg}")'
  const salida = execFileSync(python, ['-I', '-c', codigo, ...pys], { encoding: 'utf8' })
  for (const l of salida.split('\n').filter(Boolean)) fallo(relative(REPO, l.split(':').slice(0, -2).join(':')), l)
  console.log(`· ${pys.length} scripts de Python`)
}

// Todo estilo de video hace vertical y horizontal (skills/video-base/FORMATO.md): la skill de cada card de video dice
// qué hace con `Formato: horizontal`. Una card de video es la que tiene etapas con `fase` (como `sessions.esVideo` del
// servidor): «Nuevo modelo 3D» tiene etapas, pero no hace videos.
const cards = JSON.parse(readFileSync(join(REPO, 'cards.json'), 'utf8')).filter((c) => c.etapas?.some((e) => e.fase) && c.skill && skills.includes(c.skill))
for (const c of cards) {
  if (!readFileSync(join(SKILLS, c.skill, 'SKILL.md'), 'utf8').includes('Formato: horizontal'))
    fallo(`skills/${c.skill}/SKILL.md`, 'No dice qué hace con «Formato: horizontal»: todo estilo de video hace los dos formatos (video-base/FORMATO.md).')
}
console.log(`· ${cards.length} estilos de video, con los dos formatos`)

/**
 * Los node_modules con Remotion de un video de ese estilo: primero los de un video de verdad (de la v!d instalada o de
 * la del repo), de donde se toma lo que el script de crear un video le pone a la plantilla; si no hay, los compartidos
 * (`<estilo>/modulos/*` de El Diff y `sloth-modulos/<estilo>-*` de los demás, ver espacio.py de video-base). De cada
 * grupo, el más nuevo.
 */
function modulosDe(skill) {
  const casa = process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.cache')
  // El trabajo de desarrollo de v!d (server/trabajo.ts): fuera de AppData desde v1.1.
  const dev = process.env.VID_TRABAJO ?? (process.platform === 'win32' ? 'C:\\vid-datos\\trabajo' : null)
  // Cada glob, relativo a `casa`, o `[raíz, glob]`.
  const buscar = (...globs) =>
    globs
      .map((g) => (Array.isArray(g) ? g : [casa, g]))
      .filter(([raiz]) => raiz && existsSync(raiz))
      .flatMap(([raiz, g]) => globSync(g, { cwd: raiz }).map((r) => join(raiz, r)))
      .filter((nm) => existsSync(join(nm, 'remotion', 'package.json')))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  return (
    buscar(`Programs/vid-koldgold/app/trabajo/${skill}/*/node_modules`, [dev, `${skill}/*/node_modules`], `vid-koldgold-dev/trabajo/${skill}/*/node_modules`) ??
    buscar(`Programs/sloth/app/trabajo/${skill}/*/node_modules`, `sloth-dev/trabajo/${skill}/*/node_modules`) ??
    buscar(`${skill}/modulos/*/node_modules`, `sloth-modulos/${skill}-*/node_modules`)
  )
}

/**
 * Si no hay un video de verdad de donde tomarlo, lo que el script de crear un video le pone a la plantilla, sacado del
 * repo igual que lo hace él: la moneda con `modelos-3d/scripts/modelos.py usar moneda` (video-explicativo/scripts/nuevo.py),
 * el personaje por omisión de la skill (marca.py) y, para el reel, un `public/voz.json` vacío con la forma que deja
 * `scripts/voz.py` (la voz de cada reel se genera con su guion; aquí solo hace falta para los tipos). Devuelve lo que puso.
 */
function delRepo(s, faltan, tmp) {
  const puestos = []
  for (const m of new Set(faltan.map((f) => f.replaceAll('\\', '/')))) {
    if (existsSync(join(tmp, m)) || existsSync(join(tmp, m + '.tsx')) || existsSync(join(tmp, m + '.ts'))) continue
    if (m === 'src/modelos/moneda' && python) {
      const r = spawnSync(python, ['-B', '-X', 'utf8', join(SKILLS, 'modelos-3d', 'scripts', 'modelos.py'), 'usar', 'moneda'], { cwd: tmp, encoding: 'utf8' })
      if (!r.status && existsSync(join(tmp, 'src', 'modelos', 'moneda.tsx'))) puestos.push(m)
    } else if (m === 'src/datos/personaje.json' && existsSync(join(SKILLS, s, 'personaje', 'personaje.json'))) {
      cpSync(join(SKILLS, s, 'personaje', 'personaje.json'), join(tmp, m))
      puestos.push(m)
    } else if (m === 'public/voz.json') {
      mkdirSync(join(tmp, 'public'), { recursive: true })
      writeFileSync(join(tmp, m), JSON.stringify({ voz: '', rate: '', duracion: 0, frases: [] }) + '\n')
      puestos.push(m)
    }
  }
  return puestos
}

// Las plantillas.
const tsc = join(REPO, 'node_modules', 'typescript', 'bin', 'tsc')
for (const s of skills) {
  const plantilla = join(SKILLS, s, 'plantilla')
  if (!existsSync(join(plantilla, 'tsconfig.json'))) continue
  const nm = modulosDe(s)
  if (!nm) {
    console.log(`· ${s}/plantilla: sin un video de este estilo con node_modules, no se miran sus tipos`)
    continue
  }
  const tmp = mkdtempSync(join(tmpdir(), `comprobar-${s}-`))
  const enlace = join(tmp, 'node_modules')
  try {
    cpSync(plantilla, tmp, { recursive: true, filter: (r) => !/[\\/](node_modules|out|\.cache)$/.test(r) })
    symlinkSync(nm, enlace, 'junction')
    let r
    // Lo que el script de crear un video le pone después (la moneda, personaje.json…) se toma del proyecto de esos
    // node_modules: solo lo que falta, y hasta que no falte nada que ese proyecto tenga.
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      r = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'], { cwd: tmp, encoding: 'utf8' })
      const proyecto = dirname(nm)
      const faltan = [...r.stdout.matchAll(/^(.+?)\(\d+,\d+\): error TS2307: Cannot find module '(\.[^']+)'/gm)].map(([, f, m]) => relative(tmp, join(tmp, dirname(f), m)))
      const traidos = faltan.flatMap((m) => {
        const archivo = ['', '.ts', '.tsx', '.json', '/index.ts', '/index.tsx'].map((e) => m + e).find((x) => existsSync(join(proyecto, x)) && statSync(join(proyecto, x)).isFile())
        return archivo && !existsSync(join(tmp, archivo)) ? [cpSync(join(proyecto, archivo), join(tmp, archivo))] : []
      })
      if (!r.status) break
      if (!traidos.length && !delRepo(s, faltan, tmp).length) break
    }
    if (r.status) fallo(`skills/${s}/plantilla (tipos, con ${nm})`, r.stdout + r.stderr)
    console.log(`· ${s}/plantilla: tipos`)
  } finally {
    if (existsSync(enlace) || lstatSync(enlace, { throwIfNoEntry: false })) process.platform === 'win32' ? rmdirSync(enlace) : unlinkSync(enlace)
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (fallos.length) {
  console.error(`\n${fallos.length} con errores:\n\n${fallos.join('\n\n')}`)
  process.exit(1)
}
console.log('\nTodo bien.')
