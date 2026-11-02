#!/usr/bin/env node
// Publica con vid-api de Kold.Gold desde una skill social-*: sube la media a la biblioteca de GHL (subir_media) y crea
// la publicación (crear_post) SIEMPRE en borrador. Programar o publicar de verdad solo se hace en v!d → Social Media,
// donde una persona confirma. Nunca imprime la llave.
//
//   node publicar.mjs --texto "…" | --texto-archivo caption.txt
//                     --medio <archivo o https://…> [--medio …]
//                     [--tipo post|reel|story] [--cuentas id,id] [--redes instagram,tiktok]
//                     [--titulo "título de YouTube"] [--privacidad-tiktok SELF_ONLY]
//                     [--proyecto <id> | --memoria <ruta de MemoriaProyecto>] [--probar]
//
// La llave: VID_AGENCIA_LLAVE y VID_API_URL (las del proyecto activo, que pone v!d), o la del proyecto que se pida,
// preguntada al servidor local de v!d (VID_URL + VID_TOKEN, ruta /api/agencia/entorno).
import { openAsBlob, readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'

const URL_POR_DEFECTO = 'https://udzsxmgyedojtirjpepc.supabase.co/functions/v1/vid-api'
const TIPOS = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

function argumentos(argv) {
  const a = { medio: [] }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const nombre = k.slice(2)
    if (nombre === 'probar') a.probar = true
    else if (nombre === 'medio') a.medio.push(argv[++i])
    else a[nombre] = argv[++i]
  }
  return a
}

const fallar = (m) => {
  console.error(`publicar: ${m}`)
  process.exit(1)
}

async function llaveDe(a) {
  let proyecto = a.proyecto
  if (!proyecto && a.memoria) proyecto = /[\\/]proyectos[\\/]([\w-]+)[\\/](?:series[\\/][\w-]+[\\/])?MEMORIA\.md$/i.exec(a.memoria)?.[1]
  if (proyecto && process.env.VID_URL && process.env.VID_TOKEN) {
    const r = await fetch(`${process.env.VID_URL}/api/agencia/entorno?proyecto=${encodeURIComponent(proyecto)}`, { headers: { 'x-vid-token': process.env.VID_TOKEN } })
    if (r.ok) {
      const d = await r.json()
      return { url: d.url, llave: d.llave }
    }
  }
  if (process.env.VID_AGENCIA_LLAVE) return { url: process.env.VID_API_URL || URL_POR_DEFECTO, llave: process.env.VID_AGENCIA_LLAVE }
  return undefined
}

async function op(cfg, cuerpo, esForm = false, intento = 1) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'x-vid-key': cfg.llave, ...(esForm ? {} : { 'content-type': 'application/json' }) },
    body: esForm ? cuerpo : JSON.stringify(cuerpo)
  })
  const texto = await r.text()
  let d = null
  try {
    d = JSON.parse(texto)
  } catch {}
  if (r.status === 429 && intento < 3) {
    const s = Number(r.headers.get('retry-after'))
    await new Promise((ok) => setTimeout(ok, Number.isFinite(s) && s > 0 ? Math.min(s, 30) * 1000 : 2000 * intento))
    return op(cfg, cuerpo, esForm, intento + 1)
  }
  if (!r.ok || d?.ok === false) throw new Error(String(d?.message ?? `vid-api respondió HTTP ${r.status}`).split(cfg.llave).join('[llave]'))
  return d
}

const a = argumentos(process.argv.slice(2))
const texto = a['texto-archivo'] ? readFileSync(a['texto-archivo'], 'utf8').trim() : (a.texto ?? '').trim()
if (!texto) fallar('falta --texto o --texto-archivo')
if (!a.medio.length) fallar('falta al menos un --medio (archivo o URL https)')
const cfg = await llaveDe(a)
if (!cfg) fallar('no hay llave de agencia: pégala en v!d → Opciones → Agencia. Mientras, entrega el texto para copiar.')

const estado = await op(cfg, { op: 'estado' })
const videos = a.medio.filter((m) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(m))
const tipo = a.tipo ?? (a.medio.length === 1 && videos.length === 1 ? 'reel' : 'post')
const redes = a.redes ? a.redes.split(',').map((r) => r.trim().toLowerCase()) : undefined
let cuentas = a.cuentas
  ? a.cuentas.split(',').map((c) => c.trim()).filter(Boolean)
  : (estado.cuentas ?? []).filter((c) => (!redes || redes.includes(c.plataforma)) && (c.plataforma !== 'tiktok' && c.plataforma !== 'youtube' ? true : videos.length > 0)).map((c) => c.id)
if (!cuentas.length) fallar('no hay cuentas conectadas que acepten esa media (revisa --redes o --cuentas)')
const conYoutube = (estado.cuentas ?? []).some((c) => cuentas.includes(c.id) && c.plataforma === 'youtube')
if (conYoutube && !a.titulo) fallar('YouTube necesita --titulo (100 caracteres como máximo)')

if (a.probar) {
  console.log(JSON.stringify({ probar: true, estado: 'draft', tipo, cuentas, medios: a.medio.map((m) => (/^https:/.test(m) ? m : basename(m))), texto: texto.slice(0, 200) }, null, 2))
  process.exit(0)
}

const media = []
for (const m of a.medio) {
  if (/^https:\/\//i.test(m)) {
    const r = await op(cfg, { op: 'subir_media', url: m })
    media.push(r.media.url)
    continue
  }
  const t = TIPOS[extname(m).toLowerCase()]
  if (!t) fallar(`no sé subir ${basename(m)} (video MP4/MOV/WEBM o imagen JPG/PNG/WEBP/GIF)`)
  const tam = statSync(m).size
  if (tam > (t.startsWith('video/') ? 500 : 25) * 1024 * 1024) fallar(`${basename(m)} pasa del límite (video 500 MB, imagen 25 MB)`)
  const form = new FormData()
  form.set('op', 'subir_media')
  form.set('nombre', basename(m))
  form.set('file', await openAsBlob(m, { type: t }), basename(m))
  const r = await op(cfg, form, true)
  media.push(r.media.url)
  console.error(`publicar: subido ${basename(m)}`)
}

const detalles = {}
if (a.titulo) detalles.youtube = { title: a.titulo.slice(0, 100), privacyLevel: 'private' }
if (a['privacidad-tiktok']) detalles.tiktok = { privacyLevel: a['privacidad-tiktok'] }
// Siempre borrador: la persona programa o publica desde v!d con el botón Confirmar.
const post = await op(cfg, { op: 'crear_post', estado: 'draft', cuentas, tipo, texto, media, ...(Object.keys(detalles).length ? { detalles } : {}) })
console.log(JSON.stringify({ ok: true, borrador: post.post, advertencias: post.advertencias ?? [], siguiente: 'Revísalo y prográmalo en v!d → Social Media.' }, null, 2))
