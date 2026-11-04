import assert from 'node:assert/strict'
import { createServer as http } from 'node:http'
import { createServer, type Server } from 'node:net'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { consultarPuerto, elegirPuerto, type EnPuerto, puertoLibre } from './puerto.ts'

const APP = 'C:\\Users\\Alan\\AppData\\Local\\Programs\\vid-koldgold\\app'

function con(mapa: Record<number, EnPuerto>, ocupados: number[] = []) {
  const vistos: number[] = []
  return {
    vistos,
    consultar: async (p: number) => (vistos.push(p), mapa[p] ?? { hay: 'nada' as const }),
    libre: async (p: number) => !ocupados.includes(p)
  }
}

test('con nada en 4850, la instalada usa 4850 y levanta su servidor', async () => {
  const d = con({})
  assert.deepEqual(await elegirPuerto({ inicial: 4850, app: APP, ...d }), { puerto: 4850, propio: false })
})

test('si en 4850 está su propio servidor (misma carpeta, sin importar mayúsculas), se engancha', async () => {
  const d = con({ 4850: { hay: 'vid', app: APP.toLowerCase() } })
  assert.deepEqual(await elegirPuerto({ inicial: 4850, app: APP, ...d }), { puerto: 4850, propio: true })
})

test('si en 4850 está el repo en desarrollo, salta los reservados por Windows y usa el siguiente libre', async () => {
  const reservados = Array.from({ length: 19 }, (_, i) => 4851 + i) // 4851 a 4869, como en la PC de Alan
  const d = con({ 4850: { hay: 'vid', app: 'C:\\tazkore-sloth' } }, reservados)
  assert.deepEqual(await elegirPuerto({ inicial: 4850, app: APP, ...d }), { puerto: 4870, propio: false })
})

test('un v!d con otro token (401) u otro programa en el puerto tampoco son suyos', async () => {
  const d = con({ 4850: { hay: 'vid' }, 4851: { hay: 'otro' } })
  assert.deepEqual(await elegirPuerto({ inicial: 4850, app: APP, ...d }), { puerto: 4852, propio: false })
})

test('sin puerto libre, error claro', async () => {
  const d = con({}, [4850, 4851, 4852])
  await assert.rejects(elegirPuerto({ inicial: 4850, app: APP, intentos: 2, ...d }), /No encontré un puerto libre/)
})

const escuchar = (s: Server | ReturnType<typeof http>) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)))

test('consultarPuerto lee la carpeta de app de /api/state, y 401 es un v!d ajeno', async (t) => {
  const s = http((req, res) => {
    if (req.headers['x-vid-token'] !== 'bueno') return res.writeHead(401).end('{}')
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: 'C:\\tazkore-sloth', sessions: [] }))
  })
  t.after(() => s.close())
  const p = await escuchar(s)
  assert.deepEqual(await consultarPuerto(p, 'bueno'), { hay: 'vid', app: 'C:\\tazkore-sloth' })
  assert.deepEqual(await consultarPuerto(p, 'malo'), { hay: 'vid' })
  s.close()
  assert.deepEqual(await consultarPuerto(p, 'bueno', 500), { hay: 'nada' })
})

test('puertoLibre: no, si ya escucha alguien; sí, cuando se cierra', async () => {
  const s = createServer()
  const p = await escuchar(s)
  assert.equal(await puertoLibre(p), false)
  await new Promise((r) => s.close(r))
  assert.equal(await puertoLibre(p), true)
})
