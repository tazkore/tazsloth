import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { MARCA_MIGRACION, migrarCarpeta, reescribirSesiones } from './migrar.ts'

test('la carpeta de TazSloth se copia a la nueva una sola vez y la vieja se queda igual', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-migrar-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const vieja = join(raiz, 'tazsloth')
  const nueva = join(raiz, 'vid-koldgold')
  mkdirSync(join(vieja, 'piezas'), { recursive: true })
  writeFileSync(join(vieja, 'piezas', 'a.txt'), 'hola')
  assert.equal(migrarCarpeta([vieja], nueva), vieja)
  assert.equal(readFileSync(join(nueva, 'piezas', 'a.txt'), 'utf8'), 'hola')
  assert.ok(existsSync(join(nueva, MARCA_MIGRACION)))
  assert.ok(existsSync(join(vieja, 'piezas', 'a.txt')))
  // Con la nueva ya hecha no se vuelve a copiar.
  writeFileSync(join(vieja, 'piezas', 'b.txt'), 'otra')
  assert.equal(migrarCarpeta([vieja], nueva), null)
  assert.equal(existsSync(join(nueva, 'piezas', 'b.txt')), false)
  // Sin vieja no hace nada.
  assert.equal(migrarCarpeta([join(raiz, 'no-existe')], join(raiz, 'otra')), null)
})

test('los hilos que trabajaban en la carpeta vieja pasan a la nueva, con respaldo y su sesión de Claude', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-migrar-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const datos = join(raiz, 'data')
  const proyectos = join(raiz, 'projects')
  const de = join(raiz, 'tazsloth-dev', 'trabajo')
  const a = join(raiz, 'vid-koldgold-dev', 'trabajo')
  mkdirSync(join(datos, 'sessions'), { recursive: true })
  writeFileSync(join(datos, 'sessions', 'h1.json'), JSON.stringify({ id: 'h1', cwd: join(de, 'video-explicativo', 'x') }))
  writeFileSync(join(datos, 'sessions', 'h2.json'), JSON.stringify({ id: 'h2', cwd: join(raiz, 'otra') }))
  const proyecto = join(de, 'video-explicativo', 'x').replace(/[^a-zA-Z0-9]/g, '-')
  mkdirSync(join(proyectos, proyecto), { recursive: true })
  writeFileSync(join(proyectos, proyecto, 's.jsonl'), '{}')
  assert.equal(reescribirSesiones(datos, de, a, [proyectos]), 1)
  assert.equal(JSON.parse(readFileSync(join(datos, 'sessions', 'h1.json'), 'utf8')).cwd, join(a, 'video-explicativo', 'x'))
  assert.equal(JSON.parse(readFileSync(join(datos, 'sessions', 'h2.json'), 'utf8')).cwd, join(raiz, 'otra'))
  assert.ok(existsSync(join(datos, 'respaldo-migracion', 'sessions', 'h1.json')))
  assert.ok(existsSync(join(proyectos, join(a, 'video-explicativo', 'x').replace(/[^a-zA-Z0-9]/g, '-'), 's.jsonl')))
})
