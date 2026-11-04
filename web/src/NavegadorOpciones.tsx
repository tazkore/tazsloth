import { useEffect, useState } from 'react'
import type { OpcionNavegador, PreferenciaNavegador } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import { Segmento } from './Segmento'

/**
 * Opciones → Navegador (`server/navegador-sistema.ts`): con qué abre v!d sus ventanas (entrar con Google para la voz,
 * TikTok Studio, las cuentas de Ideas) y dónde navega el agente. Siempre con un perfil de v!d, nunca el tuyo.
 */
export function NavegadorOpciones() {
  const [e, setE] = useState<OpcionNavegador | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<OpcionNavegador>('/api/navegador?fresco').then(setE, (x) => setError(x.message))
  }, [])

  const cambiar = (preferencia: PreferenciaNavegador) =>
    api<OpcionNavegador>('/api/navegador', { preferencia }).then(
      (n) => (setE(n), setError('')),
      (x) => setError(x.message)
    )

  const nombre = e?.usa === 'chrome' ? 'Google Chrome' : e?.usa === 'edge' ? 'Microsoft Edge' : null
  return (
    <div className="item">
      <div className="fila">
        <span className="logo" aria-hidden>
          <Icono de="globo" />
        </span>
        <div className="fila-nombre">
          <strong>Navegador</strong>
          <span>
            {e?.chrome ? <>Chrome: <span className="mono">{e.chrome}</span></> : 'No encontré Google Chrome en esta computadora.'}
          </span>
        </div>
        {e && (nombre ? <span className="estado">Usa {nombre}</span> : <span className="estado falta">Sin navegador</span>)}
        {e && (
          <Segmento
            label="Navegador"
            valor={e.preferencia}
            onCambio={cambiar}
            opciones={[
              { id: 'chrome', texto: 'Chrome', title: 'Google Chrome instalado, con un perfil de v!d' },
              { id: 'edge', texto: 'Edge', title: 'Microsoft Edge instalado, con un perfil de v!d', disabled: !e.edge && e.preferencia !== 'edge' },
              { id: 'integrado', texto: 'Integrado', title: 'El agente navega en la ventana de v!d; lo demás, con Chrome' }
            ]}
          />
        )}
      </div>
      {e && !e.chrome && (
        <p className="small fila-extra">
          Instala Google Chrome desde{' '}
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">
            google.com/chrome
          </a>
          . Mientras, v!d usa {e.edge ? 'Microsoft Edge' : 'el navegador integrado para el agente (la voz, las redes e Ideas necesitan Chrome o Edge)'}.
        </p>
      )}
      <p className="muted small fila-extra">
        {e?.preferencia === 'integrado'
          ? 'El agente navega en la ventana de v!d, con su lista de sitios y su confirmación. La voz, las redes e Ideas abren Chrome.'
          : 'En Chrome o Edge el agente navega en su propia ventana: v!d bloquea file:, chrome: y javascript:, cancela las descargas de programas y te pregunta en la página antes de publicar, pagar o borrar; un clic que el agente haga desde un script no lo ve.'}
        {' '}Si cambias de navegador, inicia sesión una vez en él (Voz, Redes).
      </p>
      {error && <p className="small fila-extra">{error}</p>}
    </div>
  )
}
