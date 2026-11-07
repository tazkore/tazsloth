import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CONTENIDO_POR_DEFECTO, type ContenidoAgencia, type PerfilAgencia } from '../../shared/agencia.ts'
import type { Card, Model } from '../../shared/types.ts'
import { cardDelEstilo, elegirRotando, enZona, estadoDelPost, faltanHoy, horariosDelDia, instanteDe, MARGEN, piloto, type ClientePiloto } from './piloto.ts'
import { clienteVidApi, ErrorVidApi } from './vid-api.ts'

/** El piloto automático con un cliente falso: nunca se llama a vid-api ni se publica nada. */

const ZONA = 'America/Mexico_City'
// 7 nov 2026, 08:00 en la Ciudad de México (UTC-6, sin horario de verano).
const OCHO = Date.parse('2026-11-07T14:00:00Z')

const CARDS = [
  { id: 'video-el-diff', title: 'El Diff', cwd: '/x', description: '', skill: 'video-el-diff', etapas: [{ fase: 'guion' }] },
  { id: 'video-explicativo', title: 'Video explicativo', cwd: '/x', description: '', skill: 'video-explicativo', etapas: [{ fase: 'guion' }] },
  { id: 'nuevo-estilo', title: 'Nuevo estilo', cwd: '/x', description: '' }
] as unknown as Card[]
const MODELOS = [{ id: 'codex:gpt', label: 'GPT', efforts: [] }, { id: 'claude-sonnet-5', label: 'Sonnet', efforts: [] }] as Model[]

function perfil(contenido: Partial<ContenidoAgencia> = {}): PerfilAgencia {
  return {
    agencia: { id: 'a1', folio: 'AG-1', nombre: 'Clínica Sonrisa' },
    negocio: { giro: 'Dentista', nicho: 'dentistas', ciudad: 'Monterrey', pais: 'MX', zona_horaria: ZONA, idiomas: ['es'] },
    contenido: { ...CONTENIDO_POR_DEFECTO, activo: true, videos_por_dia: 2, ...contenido },
    brief: {
      slug: 'dentistas',
      idioma: 'es',
      nombre: 'Dentistas',
      dolores: ['Miedo al dolor'],
      momentos: [],
      kpis: [],
      preguntas: ['¿Duele una endodoncia?'],
      cumplimiento: ['No prometer resultados'],
      cta: 'Agenda tu valoración',
      ganchos: ['G1', 'G2', 'G3'],
      pilares: ['educar', 'mito vs realidad']
    },
    cuentas: [
      { id: 'ig1', plataforma: 'instagram', familia: 'instagram', nombre: 'sonrisa' },
      { id: 'tt1', plataforma: 'tiktok', familia: 'tiktok', nombre: 'sonrisa' },
      { id: 'yt1', plataforma: 'youtube', familia: 'youtube', nombre: 'Sonrisa TV' }
    ],
    redes_objetivo: ['instagram', 'tiktok', 'youtube']
  }
}

function montar(t: { after(f: () => void): void }, o: { perfil?: () => Promise<PerfilAgencia>; guardar?: ClientePiloto['guardarContenido']; ahora?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vid-piloto-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const creados: { proyecto: string; cardId: string; modelo: string; videos: { title: string; text: string }[] }[] = []
  const vivos = new Set<string>()
  const posts: unknown[] = []
  const reloj = { t: o.ahora ?? OCHO }
  let n = 0
  const cliente: ClientePiloto = {
    perfil: o.perfil ?? (async () => perfil()),
    guardarContenido: o.guardar ?? (async (c) => ({ ...CONTENIDO_POR_DEFECTO, ...c })),
    subirArchivo: async () => ({ id: 'm1', url: 'https://assets.cdn.filesafe.space/loc/media/v.mp4' }),
    crearPost: async (p) => (posts.push(p), { post: { id: 'p1', estado: p.estado, fecha: p.fecha ?? null } })
  }
  const p = piloto({
    dir,
    skills: '/skills',
    proyectosConLlave: () => ['sonrisa'],
    existe: (id) => id === 'sonrisa',
    cliente: () => cliente,
    cards: () => CARDS,
    modelos: () => MODELOS,
    hilos: {
      crear: (x) => {
        creados.push(x)
        return x.videos.map(() => {
          const id = `h${++n}`
          vivos.add(id)
          return id
        })
      },
      trabajando: (id) => vivos.has(id)
    },
    ahora: () => reloj.t
  })
  return { p, dir, creados, vivos, posts, reloj }
}

test('piloto: horas en la zona de la agencia', () => {
  assert.deepEqual(enZona(OCHO, ZONA), { fecha: '2026-11-07', hora: '08:00' })
  assert.equal(instanteDe('2026-11-07', '10:00', ZONA), Date.parse('2026-11-07T16:00:00Z'))
  // Con horario de verano (Nueva York, 1 nov 2026 ya es EST): 10:00 del 31 oct es 14:00 UTC.
  assert.equal(instanteDe('2026-10-31', '10:00', 'America/New_York'), Date.parse('2026-10-31T14:00:00Z'))
})

test('piloto: cuántos faltan hoy', () => {
  const c = { horarios: ['10:00', '19:00'], videos_por_dia: 2 }
  assert.deepEqual(faltanHoy(c, [], OCHO, ZONA).map((h) => h.hora), ['10:00', '19:00'])
  // Uno ya hecho: falta el otro.
  assert.deepEqual(faltanHoy(c, [{ fecha: '2026-11-07', hora: '10:00' }], OCHO, ZONA).map((h) => h.hora), ['19:00'])
  // A las 9:45, el de las 10:00 ya no da tiempo (MARGEN).
  assert.equal(MARGEN, 30 * 60_000)
  assert.deepEqual(faltanHoy(c, [], OCHO + 105 * 60_000, ZONA).map((h) => h.hora), ['19:00'])
  // Más videos que horarios: se rellena lejos de los que hay; menos, se toman los primeros.
  assert.equal(horariosDelDia({ horarios: ['10:00', '19:00'], videos_por_dia: 4 }).length, 4)
  assert.deepEqual(horariosDelDia({ horarios: ['10:00', '19:00'], videos_por_dia: 1 }), ['10:00'])
  assert.deepEqual(horariosDelDia({ horarios: ['10:00', '19:00'], videos_por_dia: 3 }), ['10:00', '13:00', '19:00'])
})

test('piloto: los ganchos y pilares rotan sin repetir los últimos', () => {
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], []), 'G1')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G1']), 'G2')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G1', 'G2', 'G3']), 'G1')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G2', 'G3', 'G1', 'G3']), 'G2')
  assert.equal(elegirRotando([], ['x']), '')
})

test('piloto: el estilo es una card de video que existe', () => {
  assert.equal(cardDelEstilo(CARDS, 'explicativo')?.id, 'video-explicativo')
  assert.equal(cardDelEstilo(CARDS, 'El Diff')?.id, 'video-el-diff')
  assert.equal(cardDelEstilo(CARDS, 'no-existe')?.id, 'video-explicativo')
  assert.equal(cardDelEstilo(CARDS, 'nuevo-estilo')?.id, 'video-explicativo')
})

test('piloto: la confirmación es el doble interruptor', () => {
  assert.equal(estadoDelPost({ encendido: false }, { activo: true, autopublicar: true }), null)
  assert.equal(estadoDelPost({ encendido: true }, { activo: false, autopublicar: true }), null)
  assert.equal(estadoDelPost({ encendido: true }, { activo: true, autopublicar: false }), 'draft')
  assert.equal(estadoDelPost({ encendido: true }, { activo: true, autopublicar: true }), 'scheduled')
})

test('piloto: apagado si falta un interruptor', async (t) => {
  let llamadas = 0
  let activo = false
  const { p, creados } = montar(t, { perfil: async () => (llamadas++, perfil({ activo })) })
  // Apagado aquí: ni siquiera pregunta al servidor.
  assert.equal((await p.revisarProyecto('sonrisa')).motivo, 'apagado_local')
  assert.equal(llamadas, 0)
  p.configurar('sonrisa', { encendido: true })
  assert.equal((await p.revisarProyecto('sonrisa')).motivo, 'apagado_servidor')
  activo = true
  assert.equal((await p.revisarProyecto('sonrisa')).hechos, 2)
  assert.equal(creados.length, 1)
})

test('piloto: un hilo por horario, sin duplicar ni arrancar mientras trabaja', async (t) => {
  const { p, creados, vivos, reloj } = montar(t)
  p.configurar('sonrisa', { encendido: true })
  const r = await p.revisarProyecto('sonrisa')
  assert.equal(r.hechos, 2)
  const [lote] = creados
  assert.equal(lote.cardId, 'video-explicativo')
  assert.equal(lote.modelo, 'claude-sonnet-5')
  assert.equal(lote.videos.length, 2)
  const [uno, dos] = lote.videos.map((v) => v.text)
  assert.match(uno, /Gancho .*: G1/)
  assert.match(dos, /Gancho .*: G2/)
  assert.match(uno, /no vendas de frente/)
  assert.match(uno, /Miedo al dolor/)
  assert.match(uno, /Agenda tu valoración/)
  assert.match(uno, /Formato: vertical/)
  assert.match(uno, /publicar\.mjs" --piloto [0-9a-f]{24} --proyecto sonrisa/)
  assert.match(uno, /borrador/)
  // Mientras trabajan, no se crea otro.
  assert.equal((await p.revisarProyecto('sonrisa')).motivo, 'trabajando')
  // Ya acabaron: los dos horarios de hoy están tomados.
  vivos.clear()
  assert.equal((await p.revisarProyecto('sonrisa')).motivo, 'al_dia')
  // Al día siguiente, dos más, con los ganchos que siguen.
  reloj.t += 24 * 3600_000
  assert.equal((await p.revisarProyecto('sonrisa')).hechos, 2)
  assert.match(creados[1].videos[0].text, /Gancho .*: G3/)
  const turnos = p.leer('sonrisa').turnos
  assert.equal(new Set(turnos.map((x) => `${x.fecha} ${x.hora}`)).size, 4)
  // «Hacer uno ahora» toma el siguiente libre (mañana), aunque otros trabajen.
  const ahora = await p.revisarProyecto('sonrisa', { uno: true })
  assert.equal(ahora.hechos, 1)
  assert.equal(p.leer('sonrisa').turnos.at(-1)?.fecha, '2026-11-09')
})

test('piloto: la entrega programa en todas las redes solo con el boleto y los dos interruptores', async (t) => {
  let contenido: Partial<ContenidoAgencia> = { autopublicar: true }
  const { p, dir, posts, reloj } = montar(t, { perfil: async () => perfil(contenido) })
  p.configurar('sonrisa', { encendido: true })
  await p.revisarProyecto('sonrisa')
  const [turno, otro] = p.leer('sonrisa').turnos
  const video = join(dir, 'final.mp4')
  writeFileSync(video, 'x')
  await assert.rejects(p.entregar({ ticket: 'inventado', proyecto: 'sonrisa', ruta: video, texto: 'Hola' }), /no existe/)
  const r = await p.entregar({ ticket: turno.id, proyecto: 'sonrisa', ruta: video, texto: 'Hola', titulo: 'Endodoncia sin miedo' })
  assert.equal(r.destino, 'scheduled')
  await assert.rejects(p.entregar({ ticket: turno.id, proyecto: 'sonrisa', ruta: video, texto: 'Hola' }), /ya se usó/)
  await new Promise((ok) => setTimeout(ok, 20))
  const hecho = p.entrega('sonrisa', turno.id)
  assert.equal(hecho.estado, 'programado', hecho.error ?? '')
  const post = posts[0] as { estado: string; cuentas: unknown; tipo: string; fecha: string; detalles: { tiktok: { privacyLevel: string }; youtube: { title: string; privacyLevel: string } } }
  assert.equal(post.estado, 'scheduled')
  assert.equal(post.cuentas, 'todas')
  assert.equal(post.tipo, 'reel')
  assert.equal(post.fecha, turno.instante)
  assert.equal(post.detalles.tiktok.privacyLevel, 'PUBLIC_TO_EVERYONE')
  assert.deepEqual(post.detalles.youtube, { title: 'Endodoncia sin miedo', privacyLevel: 'public' })
  // Apagado en el servidor a la hora de entregar: no se sube nada.
  contenido = { activo: false }
  reloj.t += 120_000
  await assert.rejects(p.entregar({ ticket: otro.id, proyecto: 'sonrisa', ruta: video, texto: 'Hola' }), /apagado/)
  assert.equal(posts.length, 1)
  // Sin autopublicar, queda en borrador para aprobarlo en app.kold.gold.
  contenido = { autopublicar: false, privacidad: 'privado' }
  reloj.t += 120_000
  assert.equal((await p.entregar({ ticket: otro.id, proyecto: 'sonrisa', ruta: video, texto: 'Hola' })).destino, 'draft')
  await new Promise((ok) => setTimeout(ok, 20))
  assert.equal(p.entrega('sonrisa', otro.id).estado, 'borrador')
  assert.equal((posts[1] as { estado: string; detalles: { tiktok: { privacyLevel: string } } }).detalles.tiktok.privacyLevel, 'SELF_ONLY')
})

test('piloto: con una vid-api vieja se queda apagado y lo dice', async (t) => {
  const viejo = clienteVidApi({
    llave: 'kg_live_' + 'ab12'.repeat(12),
    fetch: (async () => new Response(JSON.stringify({ ok: false, code: 'op_desconocida', message: 'Operación desconocida: perfil' }), { status: 400 })) as unknown as typeof fetch,
    esperar: async () => {}
  })
  await assert.rejects(viejo.perfil(), (e: unknown) => e instanceof ErrorVidApi && e.code === 'op_desconocida')
  const { p, creados } = montar(t, { perfil: () => viejo.perfil(), guardar: (c) => viejo.guardarContenido(c) })
  p.configurar('sonrisa', { encendido: true })
  assert.equal((await p.revisarProyecto('sonrisa')).motivo, 'backend_viejo')
  assert.equal(creados.length, 0)
  const v = await p.vista('sonrisa')
  assert.equal(v.codigo, 'backend_viejo')
  assert.equal(v.encendido, false)
  assert.match(v.aviso ?? '', /vid-api 1\.3\.0/)
  await assert.rejects(p.contenido('sonrisa', { activo: true }), /no se pudo guardar/i)
})

test('piloto: la vista enseña los horarios de hoy y de mañana; guardar_contenido valida antes', async (t) => {
  const { p } = montar(t)
  p.configurar('sonrisa', { encendido: true })
  await p.revisarProyecto('sonrisa')
  const v = await p.vista('sonrisa')
  assert.equal(v.encendido, true)
  assert.equal(v.estilo?.id, 'video-explicativo')
  assert.deepEqual(v.proximos.map((x) => `${x.fecha} ${x.hora} ${x.estado}`), ['2026-11-07 10:00 hilo', '2026-11-07 19:00 hilo', '2026-11-08 10:00 libre', '2026-11-08 19:00 libre'])
  await assert.rejects(p.contenido('sonrisa', { videos_por_dia: 9 }), /de 1 a 6/)
  await assert.rejects(p.contenido('sonrisa', { horarios: ['25:00'] }), /HH:MM/)
})

test('rutas del piloto: entregar solo con el token de los procesos locales; el piloto pide la llave propia', async (t) => {
  const { createServer } = await import('node:http')
  const { agencia } = await import('./index.ts')
  const datos = mkdtempSync(join(tmpdir(), 'vid-piloto-rutas-'))
  const antes = { llave: process.env.VID_AGENCIA_LLAVE, url: process.env.VID_API_URL }
  t.after(() => {
    rmSync(datos, { recursive: true, force: true })
    for (const [k, v] of [['VID_AGENCIA_LLAVE', antes.llave], ['VID_API_URL', antes.url]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v)
  })
  const a = agencia({
    dir: join(datos, 'agencia'),
    skills: join(datos, 'skills'),
    proyectos: { get: (id: string) => (['sonrisa', 'otro'].includes(id) ? ({ id } as never) : null), leerMemoria: () => '', rutaMemoria: () => '' },
    cliente: () => ({ perfil: async () => perfil() }) as never,
    piloto: { cards: () => CARDS, modelos: () => MODELOS, hilos: { crear: (x) => x.videos.map((_, i) => `h${i}`), trabajando: () => false }, noArrancar: true }
  })
  a.llaves.guardar('sonrisa', 'kg_live_' + 'ab12'.repeat(12))
  const servidor = createServer(async (req, res) => {
    if (!(await a.api(req, res, new URL(req.url!, 'http://x')))) res.writeHead(404).end()
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  t.after(() => servidor.close())
  const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api/agencia`
  const post = (ruta: string, cuerpo: unknown, headers: Record<string, string> = {}) => fetch(`${base}/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(cuerpo) })
  // Desde la ventana (sin cabecera), no.
  assert.equal((await post('piloto/entregar', { ticket: 'x', proyecto: 'sonrisa' })).status, 403)
  // Con la cabecera, el boleto inventado no vale.
  const r = await post('piloto/entregar', { ticket: 'x', proyecto: 'sonrisa' }, { 'x-vid-token': 't' })
  assert.equal(r.status, 400)
  assert.match((await r.json()).error, /boleto/)
  // Un proyecto sin llave propia no tiene piloto.
  const otro = await fetch(`${base}/piloto?proyecto=otro`)
  assert.equal(otro.status, 400)
  assert.match((await otro.json()).error, /llave de agencia propia/)
  // La vista: apagado hasta encender el interruptor local.
  let v = await (await fetch(`${base}/piloto?proyecto=sonrisa`)).json()
  assert.equal(v.local.encendido, false)
  assert.equal(v.encendido, false)
  v = await (await post('piloto/config', { proyecto: 'sonrisa', encendido: true })).json()
  assert.equal(v.encendido, true)
})
