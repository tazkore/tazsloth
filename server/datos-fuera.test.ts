import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { carpetasFuera, enlazar, enlazarFuera, RAIZ_FUERA } from './datos-fuera.ts'
import { carpetaTrabajo } from './trabajo.ts'

function temporal(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vid-fuera-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const real = (r: string) => realpathSync.native(r).toLowerCase()

test('carpetasFuera: VID_DATOS y VID_TRABAJO, o C:\\vid-datos en Windows si existe; si no, null', () => {
  assert.deepEqual(carpetasFuera({ VID_DATOS: 'D:\\d', VID_TRABAJO: 'D:\\t' }, 'linux', () => false), { datos: 'D:\\d', trabajo: 'D:\\t' })
  assert.deepEqual(carpetasFuera({}, 'win32', (r) => r === RAIZ_FUERA), { datos: 'C:\\vid-datos\\data', trabajo: 'C:\\vid-datos\\trabajo' })
  assert.deepEqual(carpetasFuera({ VID_TRABAJO: 'E:\\t' }, 'win32', (r) => r === RAIZ_FUERA), { datos: 'C:\\vid-datos\\data', trabajo: 'E:\\t' })
  assert.equal(carpetasFuera({}, 'win32', () => false), null)
  assert.equal(carpetasFuera({ VID_TRABAJO: 'E:\\t' }, 'linux', () => true), null)
})

test('enlazar mueve lo de dentro a la de fuera vacía y deja una unión', (t) => {
  const dir = temporal(t)
  const app = join(dir, 'app')
  mkdirSync(join(app, 'data', 'sessions'), { recursive: true })
  writeFileSync(join(app, 'data', 'sessions', 'a.json'), '{"id":"a"}')
  const fuera = join(dir, 'vid-datos', 'data')
  const hecho = enlazar(app, 'data', fuera)
  assert.ok(hecho.some((h) => h.startsWith('Moví')))
  assert.ok(lstatSync(join(app, 'data')).isSymbolicLink())
  assert.equal(real(join(app, 'data')), real(fuera))
  assert.equal(readFileSync(join(fuera, 'sessions', 'a.json'), 'utf8'), '{"id":"a"}')
  assert.equal(readFileSync(join(app, 'data', 'sessions', 'a.json'), 'utf8'), '{"id":"a"}')
  // Otra vez: no hace nada.
  assert.deepEqual(enlazar(app, 'data', fuera), [])
})

test('enlazar no mezcla: si las dos tienen algo, la de dentro se aparta sin borrar nada', (t) => {
  const dir = temporal(t)
  const app = join(dir, 'app')
  mkdirSync(join(app, 'trabajo', 'kold-gold'), { recursive: true })
  writeFileSync(join(app, 'trabajo', 'kold-gold', 'viejo.txt'), 'dentro')
  const fuera = join(dir, 'fuera', 'trabajo')
  mkdirSync(join(fuera, 'kold-gold'), { recursive: true })
  writeFileSync(join(fuera, 'kold-gold', 'nuevo.txt'), 'fuera')
  const hecho = enlazar(app, 'trabajo', fuera, new Date('2026-11-04T10:20:30Z'))
  const aparte = join(app, 'trabajo.antes-de-vid-datos-20261104102030')
  assert.ok(hecho.some((h) => h.includes(aparte)))
  assert.equal(readFileSync(join(aparte, 'kold-gold', 'viejo.txt'), 'utf8'), 'dentro')
  assert.equal(readFileSync(join(app, 'trabajo', 'kold-gold', 'nuevo.txt'), 'utf8'), 'fuera')
  assert.equal(readFileSync(join(fuera, 'kold-gold', 'nuevo.txt'), 'utf8'), 'fuera')
})

test('enlazar cambia una unión que apuntaba a otro lado sin tocar lo de ese lado', (t) => {
  const dir = temporal(t)
  const app = join(dir, 'app')
  const otra = join(dir, 'otra')
  mkdirSync(otra, { recursive: true })
  writeFileSync(join(otra, 'x.txt'), 'x')
  enlazar(app, 'data', otra)
  const fuera = join(dir, 'fuera')
  const hecho = enlazar(app, 'data', fuera)
  assert.ok(hecho.some((h) => h.includes('apuntaba a')))
  assert.equal(real(join(app, 'data')), real(fuera))
  assert.ok(existsSync(join(otra, 'x.txt')))
})

test('enlazarFuera pone data y trabajo; sin carpetas de fuera no hace nada', (t) => {
  const dir = temporal(t)
  const app = join(dir, 'app')
  mkdirSync(app, { recursive: true })
  assert.deepEqual(enlazarFuera(app, null), [])
  assert.deepEqual(readdirSync(app), [])
  const fuera = { datos: join(dir, 'f', 'data'), trabajo: join(dir, 'f', 'trabajo') }
  enlazarFuera(app, fuera)
  assert.equal(real(join(app, 'data')), real(fuera.datos))
  assert.equal(real(join(app, 'trabajo')), real(fuera.trabajo))
})

test('carpetaTrabajo de una app que no es el repo: la de fuera si la hay, si no app\\trabajo', () => {
  const app = join(tmpdir(), 'vid-instalada', 'app')
  assert.equal(carpetaTrabajo(app, { datos: 'C:\\vid-datos\\data', trabajo: 'C:\\vid-datos\\trabajo' }), 'C:\\vid-datos\\trabajo')
  assert.equal(carpetaTrabajo(app, null), join(app, 'trabajo'))
})
