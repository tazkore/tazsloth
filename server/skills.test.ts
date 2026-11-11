import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

// skills.ts fija ~/.claude/skills al cargarse: el inicio va a una carpeta de prueba antes de importarlo.
const casa = mkdtempSync(join(tmpdir(), 'vid-skills-'))
process.env.HOME = casa
process.env.USERPROFILE = casa
// Y las skills como las trae v!d, que `guardarSkillTuya` no toca.
const originales = mkdtempSync(join(tmpdir(), 'vid-originales-'))
mkdirSync(join(originales, 'video-base'))
process.env.VID_SKILLS_ORIGINALES = originales
const { configClaude, enlazarSkills, enlazarSkillsCodex, guardarSkillTuya, heredarSesion, marcasDe, skillsDeClaude, SKILLS } = await import('./skills.ts')

test('SKILLS son las de v!d (<app>/skills), no las de ~/.claude/skills', () => {
  assert.equal(realpathSync(SKILLS), realpathSync(join(import.meta.dirname, '..', 'skills')))
})

test('skillsDeClaude: la de v!d gana a la de otra app con el mismo nombre, y se rehace sobre la carpeta de la 1.1.0', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-skc-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const propias = join(raiz, 'app', 'skills')
  const sloth = join(raiz, 'sloth', 'skills')
  const usuario = join(raiz, 'usuario', 'skills')
  for (const d of [join(propias, 'kold-gold'), join(propias, 'video-base'), join(sloth, 'kold-gold'), join(sloth, 'video-documental'), join(usuario, 'supabase')]) mkdirSync(d, { recursive: true })
  writeFileSync(join(propias, 'kold-gold', 'SKILL.md'), '# v!d 1.1')
  writeFileSync(join(sloth, 'kold-gold', 'SKILL.md'), '# sloth viejo')
  // Como en la PC de Alan: ~/.claude/skills con uniones a otra app y skills propias.
  for (const n of ['kold-gold', 'video-documental']) symlinkSync(join(sloth, n), join(usuario, n), 'junction')
  const destino = join(raiz, 'data', 'claude', 'skills')
  mkdirSync(join(raiz, 'data', 'claude'), { recursive: true })
  // La 1.1.0 dejaba `skills` como unión a ~/.claude/skills: se quita la unión, no lo de adentro.
  symlinkSync(usuario, destino, 'junction')
  skillsDeClaude(propias, destino, usuario)
  assert.deepEqual(readdirSync(destino).sort(), ['kold-gold', 'supabase', 'video-base', 'video-documental'])
  assert.equal(readFileSync(join(destino, 'kold-gold', 'SKILL.md'), 'utf8'), '# v!d 1.1')
  assert.equal(realpathSync(join(destino, 'supabase')), realpathSync(join(usuario, 'supabase')))
  assert.equal(readFileSync(join(usuario, 'kold-gold', 'SKILL.md'), 'utf8'), '# sloth viejo', 'lo del usuario no se toca')
  // Otra vez: igual. Y si una skill de v!d se va, su unión sale.
  rmSync(join(propias, 'video-base'), { recursive: true })
  skillsDeClaude(propias, destino, usuario)
  assert.deepEqual(readdirSync(destino).sort(), ['kold-gold', 'supabase', 'video-documental'])
})

test('la configuración de Claude de v!d: en la que se vende, sus skills y la sesión de ~/.claude, sin settings, plugins ni hooks', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-config-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const usuario = join(raiz, 'usuario')
  const suya = join(usuario, '.claude')
  for (const d of ['skills/kold-gold', 'projects/hilo-viejo', 'plugins/ecc']) mkdirSync(join(suya, d), { recursive: true })
  writeFileSync(join(suya, '.credentials.json'), '{"claudeAiOauth":{"accessToken":"a"}}')
  writeFileSync(join(suya, 'settings.json'), '{"hooks":{"PreToolUse":[]},"enabledPlugins":{"ecc":true}}')
  writeFileSync(join(suya, 'CLAUDE.md'), 'reglas globales')
  writeFileSync(join(usuario, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'a@b.c' }, userID: 'u', hasCompletedOnboarding: true, mcpServers: { x: {} }, projects: {} }))
  const app = join(raiz, 'app')
  mkdirSync(join(app, 'skills', 'kold-gold'), { recursive: true })
  mkdirSync(join(suya, 'skills', 'mia'), { recursive: true })

  const dir = configClaude(app, true, suya)
  assert.equal(dir, join(app, 'data', 'claude'))
  assert.deepEqual(readdirSync(dir).sort(), ['.claude.json', '.credentials.json', 'projects', 'skills'])
  // Sus skills son las de v!d (gana la suya aunque el usuario tenga una con ese nombre) y, con otro nombre, las del usuario.
  assert.deepEqual(readdirSync(join(dir, 'skills')).sort(), ['kold-gold', 'mia'])
  assert.equal(realpathSync(join(dir, 'skills', 'kold-gold')), realpathSync(join(app, 'skills', 'kold-gold')))
  assert.equal(realpathSync(join(dir, 'skills', 'mia')), realpathSync(join(suya, 'skills', 'mia')))
  assert.ok(existsSync(join(dir, 'projects', 'hilo-viejo')), 'los hilos de antes se pueden seguir')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8')), { oauthAccount: { emailAddress: 'a@b.c' }, userID: 'u', hasCompletedOnboarding: true })
  // Una vez: si ya hay sesión (otra cuenta, o el token ya se renovó aquí), no se pisa.
  writeFileSync(join(dir, '.credentials.json'), '{"propia":true}')
  assert.equal(heredarSesion(dir, suya), false)
  assert.equal(readFileSync(join(dir, '.credentials.json'), 'utf8'), '{"propia":true}')

  // En el repo, las skills son las del repo y no se copia ninguna sesión.
  const repo = join(raiz, 'repo')
  mkdirSync(join(repo, 'skills'), { recursive: true })
  const dev = configClaude(repo, false, suya)
  assert.deepEqual(readdirSync(dev), ['skills'])
  assert.equal(realpathSync(join(dev, 'skills')), realpathSync(join(repo, 'skills')))
})

test('Codex lee las mismas skills que Claude, y una copia vieja sale de sus carpetas', (t) => {
  t.after(() => rmSync(casa, { recursive: true, force: true }))
  const app = join(casa, 'app')
  for (const s of ['video-el-diff', 'reel-collage', 'otra']) {
    mkdirSync(join(app, 'skills', s), { recursive: true })
    writeFileSync(join(app, 'skills', s, 'SKILL.md'), `# ${s} de ahora`)
  }
  mkdirSync(join(app, 'skills', 'video-base'))
  writeFileSync(join(app, 'skills', 'LEEME.md'), '')
  enlazarSkills(app)
  const codex = join(casa, '.codex')
  const agents = join(casa, '.agents')
  // Una copia vieja suelta en cada carpeta, un enlace a otro sitio y una skill propia de Codex con otro nombre.
  for (const base of [codex, agents]) {
    mkdirSync(join(base, 'skills', 'video-el-diff'), { recursive: true })
    writeFileSync(join(base, 'skills', 'video-el-diff', 'SKILL.md'), '# vieja')
  }
  mkdirSync(join(casa, 'otro-sitio'))
  writeFileSync(join(casa, 'otro-sitio', 'SKILL.md'), '# de otro sitio')
  symlinkSync(join(casa, 'otro-sitio'), join(codex, 'skills', 'reel-collage'), 'junction')
  mkdirSync(join(codex, 'skills', 'propia'))

  enlazarSkillsCodex(app, [codex, agents])
  enlazarSkillsCodex(app, [codex, agents])

  for (const base of [codex, agents]) {
    for (const s of ['video-el-diff', 'reel-collage', 'otra']) {
      assert.equal(realpathSync(join(base, 'skills', s)), realpathSync(join(app, 'skills', s)))
      assert.equal(readFileSync(join(base, 'skills', s, 'SKILL.md'), 'utf8'), `# ${s} de ahora`)
    }
    assert.equal(realpathSync(join(base, 'skills', 'video-base')), realpathSync(join(app, 'skills', 'video-base')))
    assert.ok(!existsSync(join(base, 'skills', 'LEEME.md')))
    const viejas = readdirSync(join(base, 'skills-viejas'))
    assert.equal(viejas.length, 1)
    assert.equal(readFileSync(join(base, 'skills-viejas', viejas[0], 'SKILL.md'), 'utf8'), '# vieja')
  }
  assert.ok(existsSync(join(codex, 'skills', 'propia')))
  assert.ok(existsSync(join(casa, 'otro-sitio', 'SKILL.md')))
})

test('borrar un estilo tuyo guarda su skill en una copia y quita sus enlaces, sin tocar las de v!d', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-tuya-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  t.after(() => rmSync(originales, { recursive: true, force: true }))
  const app = join(raiz, 'app')
  for (const s of ['mio', 'video-base']) {
    mkdirSync(join(app, 'skills', s), { recursive: true })
    writeFileSync(join(app, 'skills', s, 'SKILL.md'), `# ${s}`)
  }
  const enlaces = join(raiz, 'enlaces')
  mkdirSync(enlaces)
  for (const s of ['mio', 'video-base']) symlinkSync(join(app, 'skills', s), join(enlaces, s), 'junction')

  const copia = guardarSkillTuya(app, 'mio', join(app, 'data'), [enlaces])
  assert.ok(copia && /estilo borrado mio$/.test(copia))
  assert.equal(readFileSync(join(copia, 'mio', 'SKILL.md'), 'utf8'), '# mio')
  assert.ok(!existsSync(join(app, 'skills', 'mio')))
  assert.ok(!readdirSync(enlaces).includes('mio'))

  assert.equal(guardarSkillTuya(app, 'video-base', join(app, 'data'), [enlaces]), undefined)
  assert.ok(existsSync(join(app, 'skills', 'video-base', 'SKILL.md')))
  assert.ok(existsSync(join(enlaces, 'video-base', 'SKILL.md')))
})

test('las marcas de una card: la de siempre (marca.json) y una por canal en marcas/', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sloth-marcas-'))
  assert.deepEqual(marcasDe(cwd), { base: undefined, otras: [] })
  writeFileSync(join(cwd, 'marca.json'), JSON.stringify({ cierre: { nombre: '@tech' } }))
  assert.deepEqual(marcasDe(cwd), { base: '@tech', otras: [] })
  mkdirSync(join(cwd, 'marcas'))
  writeFileSync(join(cwd, 'marcas', 'Cocina.json'), '{}')
  writeFileSync(join(cwd, 'marcas', 'Autos.json'), '{}')
  writeFileSync(join(cwd, 'marcas', 'notas.txt'), '')
  assert.deepEqual(marcasDe(cwd), { base: '@tech', otras: ['Autos', 'Cocina'] })
  rmSync(cwd, { recursive: true })
})
