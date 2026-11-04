import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { argumentos, lanzarNavegador, marcaDe, nuevoNavegador } from './navegador-seguro.ts'

test('los argumentos: depurador solo en 127.0.0.1, sin bienvenida, y nunca sin perfil de v!d', () => {
  const a = argumentos(5123, ['--user-data-dir=/v/perfil', '--remote-debugging-port=9222', '--remote-debugging-address=0.0.0.0', 'about:blank'])
  assert.deepEqual(a, ['--remote-debugging-port=5123', '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', '--user-data-dir=/v/perfil', 'about:blank'])
  assert.ok(!a.includes('--remote-debugging-address=0.0.0.0'))
  assert.throws(() => argumentos(1, ['about:blank']), /propio perfil/)
  // Los fijos no se repiten si ya venían.
  assert.equal(argumentos(1, ['--user-data-dir=/p', '--no-first-run']).filter((x) => x === '--no-first-run').length, 1)
})

test('lanza con un proceso simulado: anota puerto y ejecutable, y los suelta al salir', async () => {
  const llamadas: { exe: string; args: string[] }[] = []
  const proceso = Object.assign(new EventEmitter(), { kill: () => proceso.emit('exit', 0), unref() {} })
  const nav = nuevoNavegador()
  await lanzarNavegador(nav, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--user-data-dir=/v/voz-chrome'], {
    puerto: async () => 40123,
    spawn: ((exe: string, args: string[]) => (llamadas.push({ exe, args }), proceso)) as never
  })
  assert.equal(nav.valor, 40123)
  assert.equal(nav.exe, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.ok(llamadas[0].args.includes('--remote-debugging-address=127.0.0.1'))
  assert.ok(llamadas[0].args.includes('--remote-debugging-port=40123'))
  proceso.kill()
  assert.equal(nav.valor, 0)
  assert.equal(nav.proceso, null)
  assert.equal(nav.exe, null)
})

test('un ejecutable que no se puede lanzar no tumba nada', async () => {
  const proceso = Object.assign(new EventEmitter(), { kill() {}, unref() {} })
  const nav = nuevoNavegador()
  await lanzarNavegador(nav, '/no/esta', ['--user-data-dir=/p'], { puerto: async () => 1, spawn: (() => proceso) as never })
  proceso.emit('error', new Error('ENOENT'))
  assert.equal(nav.valor, 0)
})

test('la marca por el ejecutable', () => {
  assert.equal(marcaDe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'), 'edge')
  assert.equal(marcaDe('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'edge')
  assert.equal(marcaDe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), 'chrome')
})
