import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const { sincronizarSesion } = await import('./skills.ts')

const leer = (r: string) => JSON.parse(readFileSync(r, 'utf8'))

test('sincronizarSesion: gana la sesión que vence más tarde, en los dos sentidos, sin tocar mcpOAuth', (t) => {
  const raiz = mkdtempSync(join(tmpdir(), 'vid-sesion-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  const casa = join(raiz, 'usuario', '.claude')
  const dir = join(raiz, 'app', 'data', 'claude')
  mkdirSync(casa, { recursive: true })
  mkdirSync(dir, { recursive: true })
  const oauth = (n: number) => ({ accessToken: `a${n}`, refreshToken: `r${n}`, expiresAt: n })
  writeFileSync(join(casa, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth(200), mcpOAuth: { casa: 1 } }))
  writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth(100), mcpOAuth: { vid: 1 } }))
  // La de v!d venció (la llave de renovación ya cambió en ~/.claude): se trae la de casa.
  assert.equal(sincronizarSesion(dir, casa), 'a-vid')
  assert.deepEqual(leer(join(dir, '.credentials.json')), { claudeAiOauth: oauth(200), mcpOAuth: { vid: 1 } })
  assert.equal(sincronizarSesion(dir, casa), null, 'iguales: nada')
  // v!d renovó: se lleva a casa.
  writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth(300), mcpOAuth: { vid: 1 } }))
  assert.equal(sincronizarSesion(dir, casa), 'a-casa')
  assert.deepEqual(leer(join(casa, '.credentials.json')), { claudeAiOauth: oauth(300), mcpOAuth: { casa: 1 } })
  // Otra cuenta conectada en v!d a propósito: no se toca.
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'otra' } }))
  writeFileSync(join(raiz, 'usuario', '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'alan' } }))
  writeFileSync(join(casa, '.credentials.json'), JSON.stringify({ claudeAiOauth: oauth(900) }))
  assert.equal(sincronizarSesion(dir, casa), null)
  assert.equal(leer(join(dir, '.credentials.json')).claudeAiOauth.expiresAt, 300)
})
