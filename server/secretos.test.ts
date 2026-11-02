import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { cifrar, descifrar, esCifrado, guardarSecreto, leerSecreto, llaveMaestra } from './secretos.ts'

test('AES-256-GCM: lo cifrado se descifra igual y no deja ver el texto', () => {
  const llave = randomBytes(32)
  const c = cifrar('sk-ant-secreta-1234', llave)
  assert.ok(esCifrado(c))
  assert.doesNotMatch(JSON.stringify(c), /secreta/)
  assert.equal(descifrar(c, llave), 'sk-ant-secreta-1234')
  // Otra llave, o el texto alterado, no se descifran.
  assert.throws(() => descifrar(c, randomBytes(32)))
  assert.throws(() => descifrar({ ...c, datos: Buffer.from('otra cosa').toString('base64') }, llave))
})

test('un agentes.json en texto plano se migra a cifrado sin perder llaves', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-secretos-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const archivo = join(datos, 'agentes.json')
  const plano = { claude: { llave: 'sk-ant-api03-prueba', api: true }, codex: { llave: 'sk-proj-prueba' } }
  writeFileSync(archivo, JSON.stringify(plano, null, 2))
  assert.deepEqual(leerSecreto(archivo, datos), plano)
  const guardado = JSON.parse(readFileSync(archivo, 'utf8'))
  assert.ok(esCifrado(guardado))
  assert.doesNotMatch(readFileSync(archivo, 'utf8'), /sk-ant|sk-proj/)
  // La llave maestra queda en su archivo (DPAPI en Windows) y vuelve a abrir lo guardado.
  assert.ok(existsSync(join(datos, process.platform === 'win32' ? 'llave-maestra.dpapi' : 'llave-maestra')))
  assert.equal(llaveMaestra(datos).length, 32)
  assert.deepEqual(leerSecreto(archivo, datos), plano)
  guardarSecreto(archivo, { ...plano, deepseek: { llave: 'sk-ds' } }, datos)
  assert.equal(leerSecreto<typeof plano & { deepseek: { llave: string } }>(archivo, datos)?.deepseek.llave, 'sk-ds')
  assert.equal(leerSecreto(join(datos, 'no-existe.json'), datos), undefined)
})
