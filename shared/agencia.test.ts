import assert from 'node:assert/strict'
import test from 'node:test'
import { enmascarar, proyectoDeMemoria, validarPost, type CuentaSocial, type NuevoPost } from './agencia.ts'

const CUENTAS: CuentaSocial[] = [
  { id: 'tt', plataforma: 'tiktok', nombre: 'tt' },
  { id: 'ig', plataforma: 'instagram', nombre: 'ig' },
  { id: 'yt', plataforma: 'youtube', nombre: 'yt' }
]
const GHL = 'https://assets.cdn.filesafe.space/loc/media/'
const base: NuevoPost = { estado: 'draft', cuentas: ['ig'], tipo: 'post', texto: 'hola', media: [] }
const AHORA = Date.parse('2026-11-02T12:00:00Z')

test('validarPost: las mismas reglas que vid-api', () => {
  assert.deepEqual(validarPost(base, CUENTAS, AHORA), [])
  assert.match(validarPost({ ...base, cuentas: [] }, CUENTAS, AHORA).join(), /al menos una cuenta/)
  assert.match(validarPost({ ...base, estado: 'now' }, CUENTAS, AHORA).join(), /al menos un medio/)
  assert.match(validarPost({ ...base, estado: 'scheduled', media: [GHL + 'a.mp4'], fecha: '2026-11-02T12:00:30Z' }, CUENTAS, AHORA).join(), /un minuto en el futuro/)
  assert.deepEqual(validarPost({ ...base, estado: 'scheduled', tipo: 'reel', media: [GHL + 'a.mp4'], fecha: '2026-11-03T12:00:00Z' }, CUENTAS, AHORA), [])
  assert.match(validarPost({ ...base, tipo: 'reel', media: [GHL + 'a.jpg'] }, CUENTAS, AHORA).join(), /exactamente un video/)
  assert.match(validarPost({ ...base, tipo: 'story', media: [GHL + 'a.jpg', GHL + 'b.jpg'] }, CUENTAS, AHORA).join(), /exactamente un medio/)
  assert.match(validarPost({ ...base, cuentas: ['tt'], media: ['https://otro.com/a.mp4'] }, CUENTAS, AHORA).join(), /biblioteca de GHL/)
  assert.match(validarPost({ ...base, cuentas: ['tt'], media: [GHL + 'a.jpg'] }, CUENTAS, AHORA).join(), /solo acepta video/)
  assert.match(validarPost({ ...base, cuentas: ['yt'], media: [GHL + 'a.mp4'] }, CUENTAS, AHORA).join(), /YouTube necesita un título/)
  assert.deepEqual(validarPost({ ...base, cuentas: ['yt'], media: [GHL + 'a.mp4'], detalles: { youtube: { title: 'T' } } }, CUENTAS, AHORA), [])
  assert.match(validarPost({ ...base, tipoUI: 'carrusel', media: [GHL + 'a.jpg'] }, CUENTAS, AHORA).join(), /de 2 a 10/)
  assert.match(validarPost({ ...base, tipoUI: 'carrusel', media: [GHL + 'a.jpg', GHL + 'b.mp4'] }, CUENTAS, AHORA).join(), /no mezcla/)
})

test('la llave enmascarada y el proyecto de una memoria', () => {
  assert.equal(enmascarar('kg_live_0123456789abcdef'), 'kg_live_0123…cdef')
  assert.equal(enmascarar('corta'), '••••')
  assert.equal(proyectoDeMemoria('C:\\app\\data\\proyectos\\kold-gold\\MEMORIA.md'), 'kold-gold')
  assert.equal(proyectoDeMemoria('/app/data/proyectos/kold-gold/series/radar/MEMORIA.md'), 'kold-gold')
  assert.equal(proyectoDeMemoria('/otra/MEMORIA.md'), undefined)
})
