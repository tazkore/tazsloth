import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { esCifrado } from './secretos.ts'
import { guardarConfig, leerConfig } from './avatar/config.ts'
import { archivoLlaves, finalLlave, guardarLlave, leerLlave } from './avatar/llaves.ts'

test('las llaves de ElevenLabs y HeyGen se guardan cifradas, no en claro', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-llaves-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  assert.equal(leerLlave('elevenlabs', datos), '')
  guardarLlave('elevenlabs', '  sk_secreta_1234  ', datos)
  guardarLlave('heygen', 'hg_otra_9876', datos)
  const crudo = readFileSync(archivoLlaves(datos), 'utf8')
  assert.ok(esCifrado(JSON.parse(crudo)))
  assert.doesNotMatch(crudo, /secreta|otra/)
  assert.equal(leerLlave('elevenlabs', datos), 'sk_secreta_1234')
  assert.equal(finalLlave(leerLlave('heygen', datos)), '9876')
  guardarLlave('elevenlabs', null, datos)
  assert.equal(leerLlave('elevenlabs', datos), '')
  assert.equal(leerLlave('heygen', datos), 'hg_otra_9876')
})

test('la configuración: AI Studio por omisión y los cambios se conservan', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-config-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  assert.deepEqual(leerConfig(datos), { vozProveedor: 'gemini' })
  guardarConfig({ vozProveedor: 'elevenlabs', vozElevenlabs: 'v2' }, datos)
  guardarConfig({ comfyRaiz: 'C:\\ComfyUI' }, datos)
  assert.deepEqual(leerConfig(datos), { vozProveedor: 'elevenlabs', vozElevenlabs: 'v2', comfyRaiz: 'C:\\ComfyUI' })
})
