import assert from 'node:assert/strict'
import test from 'node:test'
import { dondeEstaba } from './feedback-pantalla.ts'

test('de un hash sale la pantalla y el hilo', () => {
  assert.deepEqual(dondeEstaba('#/s/abc123'), { pantalla: 'Hilo', hiloId: 'abc123' })
  assert.deepEqual(dondeEstaba('#/opciones'), { pantalla: 'Opciones' })
  assert.deepEqual(dondeEstaba('#/mis-videos/video-explicativo'), { pantalla: 'Mis videos' })
  assert.deepEqual(dondeEstaba('#/modelos-3d'), { pantalla: 'Modelos 3D' })
  assert.deepEqual(dondeEstaba('#/new/kold-gold'), { pantalla: 'Hilo nuevo (kold-gold)' })
  assert.deepEqual(dondeEstaba(''), { pantalla: 'Inicio' })
})
