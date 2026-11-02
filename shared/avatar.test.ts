import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOTORES, lineaAvatar, motorDeLinea } from './avatar.ts'

test('lineaAvatar: sprites o sin elegir no lleva línea; los demás motores, sí', () => {
  assert.equal(lineaAvatar(undefined), '')
  assert.equal(lineaAvatar('sprites'), '')
  assert.equal(lineaAvatar('motor-inventado'), '')
  assert.match(lineaAvatar('comfyui-local'), /^Avatar: comfyui-local \(cómo, en video-base\/AVATAR\.md; si no se puede, usa sprites\)\.$/)
})

test('motorDeLinea lee el motor de un mensaje', () => {
  assert.equal(motorDeLinea(`Haz un video\n\nFormato: vertical\n\n${lineaAvatar('heygen')}`), 'heygen')
  assert.equal(motorDeLinea('Avatar: nada'), undefined)
  assert.equal(motorDeLinea('sin línea'), undefined)
})

test('cada motor tiene etiqueta Local, Nube o Pago, y sprites es el primero', () => {
  assert.equal(MOTORES[0].id, 'sprites')
  for (const m of MOTORES) assert.ok(['Local', 'Nube', 'Pago'].includes(m.etiqueta), m.id)
  assert.equal(new Set(MOTORES.map((m) => m.id)).size, MOTORES.length)
})
