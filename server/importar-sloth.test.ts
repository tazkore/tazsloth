import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { asignacionAlan, importarSloth, MARCA_IMPORTAR, SERIES_SLOTH } from './importar-sloth.ts'
import { cambiosDeRuta, proyectoClaude } from './migrar.ts'

/** Un Sloth de juguete con dos hilos (uno con su sesión de Claude y otro sin ella) y un v!d con un hilo propio. */
function armar(raiz: string) {
  const sloth = join(raiz, 'sloth', 'app')
  const trabajoSloth = join(sloth, 'trabajo', 'kold-gold')
  mkdirSync(join(sloth, 'data', 'sessions'), { recursive: true })
  mkdirSync(join(sloth, 'data', 'attachments'), { recursive: true })
  mkdirSync(join(trabajoSloth, '5-datos-01-10'), { recursive: true })
  mkdirSync(join(trabajoSloth, 'estafas-01-10-tu'), { recursive: true })
  writeFileSync(join(trabajoSloth, '5-datos-01-10', '5-datos-01-10.mp4'), 'video')
  writeFileSync(join(trabajoSloth, 'estafas-01-10-tu', 'estafas-01-10-tu.mp4'), 'video')
  writeFileSync(join(sloth, 'data', 'attachments', '1-zorra.png'), 'png')
  // Una carpeta de otro hilo, enlazada (en Sloth, un hilo de El Diff usaba la del video explicativo).
  symlinkSync(join(trabajoSloth, '5-datos-01-10'), join(trabajoSloth, 'enlazada'), 'junction')
  const adjunto = join(sloth, 'data', 'attachments', '1-zorra.png')
  const meta = (id: string, title: string, carpeta: string, psid?: string) => ({
    id,
    cardId: 'kold-gold',
    title,
    model: 'claude-opus-5-5',
    cwd: trabajoSloth,
    carpeta,
    createdAt: 1,
    updatedAt: 2,
    running: false,
    ...(psid ? { providerSessionId: psid } : {})
  })
  writeFileSync(join(sloth, 'data', 'sessions', 'a1.json'), JSON.stringify(meta('a1', '5 Datos 01/10 — El mar', 'estafas-01-10-tu', 'uuid-1')))
  writeFileSync(
    join(sloth, 'data', 'sessions', 'a1.jsonl'),
    JSON.stringify({ t: 'user', text: `Mira ${adjunto} y trabaja en ${join(trabajoSloth, '5-datos-01-10')}` }) + '\n'
  )
  writeFileSync(join(sloth, 'data', 'sessions', 'b2.json'), JSON.stringify(meta('b2', 'Estafas 01/10 — El SMS', 'estafas-01-10-tu', 'uuid-perdida')))
  writeFileSync(join(sloth, 'data', 'sessions', 'b2.jsonl'), JSON.stringify({ t: 'user', text: 'hola estafas-01-10-tu' }) + '\n')

  // La sesión de Claude Code del primero, en la configuración de Claude de Sloth.
  const claudeSloth = join(raiz, 'claude-sloth', 'projects')
  mkdirSync(join(claudeSloth, proyectoClaude(trabajoSloth), 'uuid-1', 'subagents'), { recursive: true })
  writeFileSync(join(claudeSloth, proyectoClaude(trabajoSloth), 'uuid-1.jsonl'), JSON.stringify({ cwd: trabajoSloth }) + '\n')
  writeFileSync(join(claudeSloth, proyectoClaude(trabajoSloth), 'uuid-1', 'subagents', 's.jsonl'), JSON.stringify({ cwd: trabajoSloth }) + '\n')

  // v!d: ya tiene un hilo `b2` (otro), y el proyecto kold-gold.
  const datos = join(raiz, 'vid', 'data')
  mkdirSync(join(datos, 'sessions'), { recursive: true })
  writeFileSync(join(datos, 'sessions', 'b2.json'), JSON.stringify({ id: 'b2', title: 'de v!d' }))
  mkdirSync(join(datos, 'proyectos', 'kold-gold', 'series'), { recursive: true })
  writeFileSync(join(datos, 'proyectos', 'kold-gold', 'proyecto.json'), JSON.stringify({ id: 'kold-gold', nombre: 'Kold.Gold' }))
  const trabajo = join(raiz, 'vid', 'trabajo')
  const claudeVid = join(raiz, 'vid', 'claude', 'projects')
  return { sloth, datos, trabajo, claudeSloth, claudeVid, trabajoSloth }
}

test('el historial de Sloth se copia a v!d con rutas nuevas, proyecto, serie y sesión de Claude, y sin duplicar', async (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-importar-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const a = armar(raiz)
  const opciones = {
    sloth: a.sloth,
    datos: a.datos,
    trabajo: a.trabajo,
    claudeOrigen: [a.claudeSloth],
    claudeDestino: a.claudeVid,
    asignar: asignacionAlan,
    series: SERIES_SLOTH
  }
  const r = await importarSloth(opciones)
  assert.equal(r.hilos.length, 2)
  assert.deepEqual(r.series.sort(), ['kold-gold/5-datos', 'kold-gold/estafas'])
  assert.deepEqual(r.carpetas, [{ card: 'kold-gold', mp4: 2, bytes: 10 }])
  assert.equal(r.errores.length, 0)

  // El primero: cwd nuevo, carpeta corregida, serie 5-datos y su sesión de Claude en la carpeta del cwd nuevo.
  const cwd = join(a.trabajo, 'kold-gold')
  const h1 = JSON.parse(readFileSync(join(a.datos, 'sessions', 'a1.json'), 'utf8'))
  assert.equal(h1.cwd, cwd)
  assert.equal(h1.carpeta, '5-datos-01-10')
  assert.equal(h1.proyecto, 'kold-gold')
  assert.equal(h1.serie, '5-datos')
  assert.equal(h1.providerSessionId, 'uuid-1')
  const registro = readFileSync(join(a.datos, 'sessions', 'a1.jsonl'), 'utf8')
  assert.ok(registro.includes(JSON.stringify(join(a.datos, 'attachments', '1-zorra.png')).slice(1, -1)))
  assert.ok(!registro.includes('sloth'))
  const sesion = join(a.claudeVid, proyectoClaude(cwd), 'uuid-1.jsonl')
  assert.equal(JSON.parse(readFileSync(sesion, 'utf8')).cwd, cwd)
  assert.equal(JSON.parse(readFileSync(join(a.claudeVid, proyectoClaude(cwd), 'uuid-1', 'subagents', 's.jsonl'), 'utf8')).cwd, cwd)
  assert.ok(r.hilos.find((h) => h.sloth === 'a1')?.continuable)

  // El segundo chocaba con un id de v!d: entra con otro, y sin su sesión queda como historial que se resume.
  const h2 = r.hilos.find((h) => h.sloth === 'b2')!
  assert.equal(h2.id, 'b2-sloth')
  assert.equal(h2.serie, 'estafas')
  assert.equal(h2.continuable, false)
  const m2 = JSON.parse(readFileSync(join(a.datos, 'sessions', 'b2-sloth.json'), 'utf8'))
  assert.equal(m2.providerSessionId, undefined)
  assert.equal(m2.resumir, true)
  assert.equal(JSON.parse(readFileSync(join(a.datos, 'sessions', 'b2.json'), 'utf8')).title, 'de v!d')

  // Copiado, no movido.
  assert.ok(existsSync(join(a.trabajoSloth, '5-datos-01-10', '5-datos-01-10.mp4')))
  assert.ok(existsSync(join(a.sloth, 'data', 'sessions', 'a1.jsonl')))
  assert.ok(existsSync(join(cwd, '5-datos-01-10', '5-datos-01-10.mp4')))
  assert.ok(existsSync(join(a.datos, 'attachments', '1-zorra.png')))
  assert.ok(existsSync(join(a.datos, 'proyectos', 'kold-gold', 'series', '5-datos', 'MEMORIA.md')))
  assert.ok(existsSync(join(a.datos, MARCA_IMPORTAR)))
  // El enlace de la copia apunta a la copia; el de Sloth, a Sloth.
  assert.equal(r.enlaces, 1)
  assert.equal(realpathSync(join(cwd, 'enlazada')).toLowerCase(), realpathSync(join(cwd, '5-datos-01-10')).toLowerCase())
  assert.equal(realpathSync(join(a.trabajoSloth, 'enlazada')).toLowerCase(), realpathSync(join(a.trabajoSloth, '5-datos-01-10')).toLowerCase())

  // Otra vez: nada nuevo.
  const otra = await importarSloth(opciones)
  assert.equal(otra.hilos.length, 0)
  assert.equal(otra.yaEstaban, 2)
  assert.equal(readdirSync(join(a.datos, 'sessions')).filter((f) => f.endsWith('.json')).length, 3)
})

test('las rutas cambian con \\, con \\\\ de JSON y con /, sin importar mayúsculas', () => {
  const cambiar = cambiosDeRuta([['C:\\sloth\\app\\trabajo', 'C:\\vid\\trabajo']])
  assert.equal(cambiar('C:\\sloth\\app\\trabajo\\x'), 'C:\\vid\\trabajo\\x')
  assert.equal(cambiar('"c:\\\\Sloth\\\\app\\\\trabajo\\\\x"'), '"C:\\\\vid\\\\trabajo\\\\x"')
  assert.equal(cambiar('C:/sloth/app/trabajo/x'), 'C:/vid/trabajo/x')
  assert.equal(cambiar('otra C:\\slothy'), 'otra C:\\slothy')
})

test('el reparto de Alan: el sketch a Tazkore IA, el radar a su serie y lo demás a Kold.Gold', () => {
  const m = (title: string) => ({ title }) as Parameters<typeof asignacionAlan>[0]
  assert.deepEqual(asignacionAlan(m('Sketch de roast con Tazkore IA')), { proyecto: 'tazkore-ia' })
  assert.deepEqual(asignacionAlan(m('Kold Gold Radar — noticias')), { proyecto: 'kold-gold', serie: 'kold-gold-radar' })
  assert.deepEqual(asignacionAlan(m('Estafas 02/10 — La llamada')), { proyecto: 'kold-gold', serie: 'estafas' })
  assert.deepEqual(asignacionAlan(m('Mito o realidad: contenedor perdido al mar')), { proyecto: 'kold-gold' })
})
