import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cookieDelToken, exentaDeToken, pideLaPagina, tokenDelServidor, tokenValido } from './token.ts'

test('el token se crea una vez (32 bytes) y se vuelve a leer igual', (t) => {
  const datos = mkdtempSync(join(tmpdir(), 'vid-token-'))
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const archivo = join(datos, 'servidor-token')
  const token = tokenDelServidor(archivo)
  assert.equal(Buffer.from(token, 'base64url').length, 32)
  assert.equal(tokenDelServidor(archivo), token)
})

test('se acepta en la cabecera o en la cookie, y nada más', () => {
  const token = 'a'.repeat(43)
  assert.ok(tokenValido({ headers: { 'x-vid-token': token } }, token))
  assert.ok(tokenValido({ headers: { cookie: `otra=1; vid_token=${token}` } }, token))
  assert.ok(!tokenValido({ headers: {} }, token))
  assert.ok(!tokenValido({ headers: { 'x-vid-token': 'b'.repeat(43) } }, token))
  assert.ok(!tokenValido({ headers: { 'x-vid-token': 'corto' } }, token))
  assert.match(cookieDelToken(token), /HttpOnly; SameSite=Strict/)
})

test('solo la vuelta de YouTube y la vista en vivo del estudio van sin token', () => {
  const nav = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/youtube/oauth?code=1&state=2', headers: nav }))
  assert.ok(!exentaDeToken({ method: 'POST', url: '/api/youtube/oauth', headers: nav }))
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor?v=2', headers: { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' } }))
  assert.ok(exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor/motor.js?v=2', headers: { 'sec-fetch-dest': 'script', 'sec-fetch-site': 'same-origin' } }))
  assert.ok(!exentaDeToken({ method: 'GET', url: '/api/sessions/abc/motor', headers: {} }))
  assert.ok(!exentaDeToken({ method: 'GET', url: '/api/state', headers: { 'sec-fetch-site': 'same-origin' } }))
  assert.ok(!exentaDeToken({ method: 'POST', url: '/api/sessions/abc/motor', headers: { 'sec-fetch-dest': 'iframe' } }))
})

test('la cookie solo va con la página de la app, no con la API', () => {
  const nav = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  assert.ok(pideLaPagina({ method: 'GET', url: '/', headers: nav }))
  assert.ok(!pideLaPagina({ method: 'GET', url: '/api/state', headers: nav }))
  assert.ok(!pideLaPagina({ method: 'GET', url: '/', headers: {} }))
})
