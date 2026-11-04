import './Marca.css'

/** La dirección del servicio detrás de v!d. Se abre en el navegador de fuera (Electron manda lo externo al predeterminado). */
export const URL_AGENTES = 'https://agentes.kold.gold'

/** El logo de marca «v!d by Kold.Gold», grande y centrado en el inicio, sin acaparar: ver `.marca-centro` en Marca.css. */
export function MarcaCentro() {
  return (
    <div className="marca-centro">
      <img src="/wordmark.svg" alt="v!d by Kold.Gold" draggable={false} />
    </div>
  )
}

/** El pie discreto de la esquina de abajo: «un servicio de agentes.kold.gold». */
export function PieMarca() {
  return (
    <div className="marca-pie" onClick={(e) => e.stopPropagation()}>
      un servicio de{' '}
      <a href={URL_AGENTES} target="_blank" rel="noopener noreferrer">
        agentes.kold.gold
      </a>
    </div>
  )
}
