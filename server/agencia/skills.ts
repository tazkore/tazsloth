import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ACCIONES_SKILL, type AccionSkill, type PlanSocial, type TipoUI } from '../../shared/agencia.ts'

/**
 * Las skills de redes (`skills/social-*`, adaptadas de Instagram Skills) lanzadas desde Social Media e Ideas: una
 * llamada `query()` ligera, como la que escribe los textos de redes (`server/redes/index.ts`), con el SKILL.md, sus
 * referencias y la memoria del proyecto dentro del prompt, sin herramientas y en un solo turno. El resultado vuelve a
 * la interfaz, que lo deja editar; nada se publica desde aquí.
 */

const MAX_ARCHIVO = 40_000
const MAX_TOTAL = 140_000

function leer(ruta: string, max = MAX_ARCHIVO) {
  try {
    return readFileSync(ruta, 'utf8').slice(0, max)
  } catch {
    return ''
  }
}

/** Los .md de una carpeta (sin bajar más de un nivel). */
function mds(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile())
    .map((f) => join(dir, f))
}

export interface PeticionSkill {
  accion: AccionSkill
  /** Lo que escribió o eligió el usuario: el tema, el texto a revisar, el video… */
  entrada: string
  /** Texto de la memoria del proyecto y de la serie, si hay. */
  memoria?: string
  memoriaSerie?: string
  rutaMemoria?: string
  /** Redes elegidas en la publicación. */
  redes?: string[]
  /** Para el plan: desde qué día. */
  desde?: string
}

/** El prompt completo de una acción: la skill con sus referencias, la memoria y lo pedido. */
export function promptDeSkill(skills: string, p: PeticionSkill): string {
  const def = ACCIONES_SKILL[p.accion]
  if (!def) throw new Error('Esa acción no existe.')
  const dir = join(skills, def.skill)
  const skill = leer(join(dir, 'SKILL.md'))
  if (!skill) throw new Error(`No encuentro la skill ${def.skill}.`)
  const base = join(skills, 'social-base')
  // Las de la base que cita la skill, más las reglas de voz y las de cada red.
  const citadas = new Set(['voice-rules.md', 'redes.md', ...[...skill.matchAll(/social-base\/references\/([\w-]+\.md)/g)].map((m) => m[1])])
  const archivos = [
    ...mds(join(dir, 'references')),
    ...mds(join(dir, 'sub-skills')),
    ...[...citadas].map((f) => join(base, 'references', f)).filter(existsSync)
  ]
  let total = skill.length
  const anexos: string[] = []
  for (const a of archivos) {
    const t = leer(a)
    if (!t || total + t.length > MAX_TOTAL) continue
    total += t.length
    anexos.push(`===== ${a.slice(skills.length + 1).replaceAll('\\', '/')} =====\n${t}`)
  }
  const plan =
    p.accion === 'plan'
      ? `\n\nAl final, después de tu respuesta, agrega un bloque \`\`\`json con la semana como lista: [{"fecha":"AAAA-MM-DDTHH:MM","redes":["instagram"],"tipo":"reel|post|carrusel|story","texto":"caption completo","nota":"qué video o imagen hace falta"}]. Fechas desde ${p.desde ?? new Date().toISOString().slice(0, 10)}, en hora de México.`
      : ''
  return [
    `Eres el agente de redes de v!d by Kold.Gold y vas a seguir la skill \`${def.skill}\` (abajo, con sus referencias).`,
    `Estás en una sola respuesta dentro de la app: no hagas preguntas ni esperes aprobación. Si falta un dato, no lo inventes: déjalo como [dato que falta] y dilo en una nota corta al final. No publiques nada ni corras scripts: la persona revisa y publica en Social Media.`,
    `Escribe en español de México salvo que la memoria diga otra cosa. Sin emojis de relleno.`,
    p.redes?.length ? `Redes de esta publicación: ${p.redes.join(', ')}. Ajusta a cada una con social-base/references/redes.md.` : '',
    p.memoria ? `\n<memoria-del-proyecto ruta="${p.rutaMemoria ?? ''}">\n${p.memoria.slice(0, 12_000)}\n</memoria-del-proyecto>\nLa memoria manda sobre el perfil de voz genérico.` : '',
    p.memoriaSerie ? `\n<memoria-de-la-serie>\n${p.memoriaSerie.slice(0, 8_000)}\n</memoria-de-la-serie>` : '',
    `\n<pedido>\n${p.entrada.slice(0, 20_000)}\n</pedido>${plan}`,
    `\n===== ${def.skill}/SKILL.md =====\n${skill}`,
    ...anexos
  ]
    .filter(Boolean)
    .join('\n')
}

/** Saca el plan de la semana del bloque JSON de la respuesta. Lo que no tenga fecha o texto se descarta. */
export function planDeTexto(texto: string, serie?: string): PlanSocial[] {
  const bloque = /```json\s*([\s\S]*?)```/i.exec(texto)?.[1] ?? /\[\s*\{[\s\S]*\}\s*\]/.exec(texto)?.[0]
  if (!bloque) return []
  let lista: unknown
  try {
    lista = JSON.parse(bloque)
  } catch {
    return []
  }
  if (!Array.isArray(lista)) return []
  const tipos: TipoUI[] = ['post', 'reel', 'story', 'carrusel']
  return lista.flatMap((x, i) => {
    const o = x as Record<string, unknown>
    const fecha = typeof o.fecha === 'string' ? o.fecha : ''
    const t = typeof o.texto === 'string' ? o.texto.trim() : ''
    if (!fecha || Number.isNaN(Date.parse(fecha)) || !t) return []
    const tipo = tipos.includes(o.tipo as TipoUI) ? (o.tipo as TipoUI) : 'post'
    const redes = Array.isArray(o.redes) ? o.redes.filter((r): r is string => typeof r === 'string') : []
    return [{ id: `plan-${Date.now().toString(36)}-${i}`, fecha, redes, tipo, texto: t, ...(typeof o.nota === 'string' && o.nota ? { nota: o.nota } : {}), ...(serie ? { serie } : {}) }]
  })
}

/** Corre la skill con Claude (Agent SDK), sin herramientas y en un turno. */
export async function correrSkill(skills: string, p: PeticionSkill, opciones: { programa?: { pathToClaudeCodeExecutable?: string }; cwd: string }): Promise<string> {
  const prompt = promptDeSkill(skills, p)
  const { query } = await import('@anthropic-ai/claude-agent-sdk')
  let salida = ''
  let error = ''
  for await (const m of query({ prompt, options: { ...(opciones.programa ?? {}), model: 'sonnet', tools: [], maxTurns: 1, settingSources: [], persistSession: false, cwd: opciones.cwd } })) {
    if (m.type === 'result') {
      if (m.subtype === 'success') salida = m.result
      else error = 'Claude no terminó la respuesta.'
    }
  }
  if (!salida.trim()) throw new Error(error || 'Claude no devolvió nada. Revisa tu cuenta de Claude en Opciones → Agentes.')
  return salida.trim()
}
