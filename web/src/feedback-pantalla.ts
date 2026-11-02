/**
 * Dónde estaba la persona antes de abrir «Feedback»: el panel es una pantalla más, así que lo que se incluye como
 * «pantalla actual» y «hilo actual» es lo que miraba antes. Sale del hash (`#/s/<id>`, `#/opciones`…), que es como App
 * sabe en qué vista está.
 */

export interface Donde {
  /** El nombre de la pantalla, en palabras de la interfaz. */
  pantalla: string
  /** El hilo que se miraba, si era uno. */
  hiloId?: string
}

/** La pantalla y el hilo que dice un hash. */
export function dondeEstaba(hash: string): Donde {
  const [, tipo, id] = hash.split('/')
  switch (tipo) {
    case 's':
      return { pantalla: 'Hilo', ...(id ? { hiloId: id } : {}) }
    case 'd':
      return { pantalla: 'Borrador de un hilo nuevo' }
    case 'opciones':
      return { pantalla: 'Opciones' }
    case 'ideas':
      return { pantalla: 'Ideas' }
    case 'mis-videos':
      return { pantalla: 'Mis videos' }
    case 'modelos-3d':
      return { pantalla: 'Modelos 3D' }
    case 'new':
      return { pantalla: id ? `Hilo nuevo (${id})` : 'Hilo nuevo' }
    default:
      return { pantalla: 'Inicio' }
  }
}

let previo: Donde = { pantalla: 'Inicio' }
if (typeof location !== 'undefined' && typeof addEventListener === 'function') {
  if (!location.hash.startsWith('#/feedback')) previo = dondeEstaba(location.hash)
  addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#/feedback')) previo = dondeEstaba(location.hash)
  })
}

/** Lo último que se miraba que no fue «Feedback». */
export const dondeEstabaAntes = () => previo
