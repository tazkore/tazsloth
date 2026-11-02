import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'

// El MCP del avatar (`avatar/mcp.mjs`) contra un servidor de v!d de mentira: lo que el agente ve al pedir un video.
test('el MCP del avatar lista los motores, pide el video y espera su turno', async (t) => {
  const pedidos: string[] = []
  const vid = createServer(async (req, res) => {
    let cuerpo = ''
    for await (const p of req) cuerpo += p
    pedidos.push(`${req.method} ${req.url} ${cuerpo}`)
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/avatar')
      return res.end(JSON.stringify({ motores: [{ id: 'sprites', etiqueta: 'Local', listo: true, detalle: 'Siempre.' }, { id: 'heygen', etiqueta: 'Pago', listo: false, detalle: 'Sin llave.' }], comfy: { estado: 'no-instalado' }, flujos: [{ id: 'latentsync', nombre: 'LatentSync 1.5', entrada: 'video+audio', vramGB: 8, cabeEn8: 'si', estado: 'no-instalado', sinFlujo: false }] }))
    if (req.url === '/api/avatar/generar') return res.end(JSON.stringify({ id: 'abc', estado: 'generando', motor: 'comfyui-local' }))
    if (req.url?.startsWith('/api/avatar/trabajos/abc')) return res.end(JSON.stringify({ id: 'abc', estado: 'lista', motor: 'comfyui-local', archivo: 'C:\\v\\fuentes\\avatar\\avatar.mp4' }))
    res.statusCode = 404
    res.end('{"error":"no"}')
  })
  await new Promise<void>((r) => vid.listen(0, '127.0.0.1', r))
  t.after(() => vid.close())
  const mcp = spawn(process.execPath, [join(import.meta.dirname, 'avatar', 'mcp.mjs')], { env: { ...process.env, VID_URL: `http://127.0.0.1:${(vid.address() as AddressInfo).port}`, VID_TOKEN: 'prueba' } })
  t.after(() => mcp.kill())
  const respuestas = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]()
  let n = 0
  const llamar = async (method: string, params?: unknown) => {
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params })}\n`)
    return JSON.parse(String((await respuestas.next()).value))
  }
  assert.equal((await llamar('initialize', { protocolVersion: '2025-06-18' })).result.serverInfo.name, 'avatar')
  assert.deepEqual((await llamar('tools/list')).result.tools.map((h: { name: string }) => h.name), ['motores', 'generar_avatar', 'estado_avatar', 'avatares_heygen'])
  const motores = (await llamar('tools/call', { name: 'motores' })).result.content[0].text
  assert.match(motores, /sprites \[Local\] LISTO/)
  assert.match(motores, /heygen \[Pago\] no listo/)
  assert.match(motores, /flujo latentsync .* 8 GB: si\): no-instalado/)
  const hecha = (await llamar('tools/call', { name: 'generar_avatar', arguments: { motor: 'comfyui-local', audio: 'C:\\a.wav', video: 'C:\\p.mp4', salida: 'C:\\v\\fuentes\\avatar\\avatar.mp4' } })).result
  assert.equal(hecha.isError, undefined)
  assert.match(hecha.content[0].text, /^Listo: C:\\v\\fuentes\\avatar\\avatar\.mp4 \(motor comfyui-local\)/)
  assert.ok(pedidos.some((p) => p.startsWith('POST /api/avatar/generar') && p.includes('"motor":"comfyui-local"')))
  assert.ok(pedidos.some((p) => p.startsWith('GET /api/avatar/trabajos/abc?esperar=40')))
  const error = (await llamar('tools/call', { name: 'estado_avatar', arguments: { id: 'zzz' } })).result
  assert.equal(error.isError, true)
})
