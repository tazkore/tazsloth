import { useEffect, useState } from 'react'
import { nombrePlataforma, type ConfigAgencia, type CuentaSocial, type EstadoAgencia } from '../../shared/agencia'
import { cssDeColor, type Proyecto } from '../../shared/proyectos'
import { api } from './api'
import { Logo } from './Logos'
import { useProyectos, vivos } from './Proyectos'
import './SocialMedia.css'

/**
 * Opciones → Agencia (v!d Fase 4): la «Llave de agencia v!d» de cada proyecto y una por defecto para los que no
 * tienen la suya, con la URL de vid-api. Se guardan cifradas en el servidor (`server/agencia/llaves.ts`): aquí solo se
 * ve su máscara. «Probar conexión» llama a `estado` y enseña la agencia, la subcuenta y las redes conectadas.
 */
export function AgenciaOpciones() {
  const proyectos = vivos(useProyectos())
  const [config, setConfig] = useState<ConfigAgencia | null>(null)
  const [error, setError] = useState('')
  const leer = () => api<ConfigAgencia>('/api/agencia/config').then(setConfig, (e) => setError(e.message))
  useEffect(() => void leer(), [])
  return (
    <section className="grupo agencia-grupo">
      <div className="grupo-titulo">
        <h2>Agencia</h2>
      </div>
      <div className="panel">
        {error && <p className="bad small">{error}</p>}
        {config && (
          <>
            <FilaLlave titulo="Llave por defecto" detalle="Para los proyectos que no tienen la suya" config={config} onCambio={setConfig} />
            {proyectos.map((p) => (
              <FilaLlave key={p.id} proyecto={p} titulo={p.nombre} detalle={config.activo === p.id ? 'Proyecto activo: su llave es la que usan los agentes' : undefined} config={config} onCambio={setConfig} />
            ))}
          </>
        )}
      </div>
      <p className="grupo-nota">
        Cada agencia (y Kold Gold) emite su llave en kold.gold → ficha de la agencia → «v!d — Llave API» y la pega aquí. Se guarda cifrada en esta
        computadora; ni la ventana ni los registros la ven. Los agentes la reciben como VID_AGENCIA_LLAVE (la del proyecto activo) para publicar en
        borrador.
      </p>
    </section>
  )
}

function FilaLlave({ proyecto, titulo, detalle, config, onCambio }: { proyecto?: Proyecto; titulo: string; detalle?: string; config: ConfigAgencia; onCambio(c: ConfigAgencia): void }) {
  const propia = proyecto ? config.proyectos[proyecto.id] : config.defecto
  const [abierta, setAbierta] = useState(false)
  const [llave, setLlave] = useState('')
  const [url, setUrl] = useState(propia?.url ?? config.urlPorDefecto)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [prueba, setPrueba] = useState<(EstadoAgencia & { desde?: string }) | null>(null)
  const usa = propia?.tieneLlave ? 'propia' : proyecto && config.defecto.tieneLlave ? 'defecto' : 'ninguna'

  async function guardar(quitar = false) {
    setOcupado(true)
    setError('')
    try {
      const c = await api<ConfigAgencia>('/api/agencia/llave', { proyecto: proyecto?.id ?? null, llave: quitar ? null : llave.trim() || undefined, url: url.trim() })
      onCambio(c)
      setLlave('')
      setPrueba(null)
      if (!quitar) setAbierta(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    setOcupado(true)
    setError('')
    setPrueba(null)
    try {
      setPrueba(await api('/api/agencia/probar', { proyecto: proyecto?.id ?? null }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="item">
      <div className="fila">
        <span className="logo agencia-punto" style={{ background: proyecto ? cssDeColor(proyecto.color) : undefined }} aria-hidden>
          {(proyecto?.nombre ?? 'D')[0].toUpperCase()}
        </span>
        <div className="fila-nombre">
          <strong>{titulo}</strong>
          <span>
            {usa === 'propia' ? `Llave ${propia?.mascara}` : usa === 'defecto' ? 'Usa la llave por defecto' : 'Sin llave'}
            {detalle ? ` · ${detalle}` : ''}
          </span>
        </div>
        {usa !== 'ninguna' && (
          <button className="ghost small" disabled={ocupado} onClick={probar}>
            {ocupado && !abierta ? 'Probando…' : 'Probar conexión'}
          </button>
        )}
        <button className={propia?.tieneLlave ? 'ghost small' : 'primary small'} onClick={() => setAbierta(!abierta)}>
          {abierta ? 'Cerrar' : propia?.tieneLlave ? 'Cambiar' : 'Pegar llave'}
        </button>
      </div>
      {abierta && (
        <form className="fila-extra" onSubmit={(e) => (e.preventDefault(), guardar())}>
          <div className="opcion-fila">
            <input type="password" autoFocus autoComplete="off" spellCheck={false} placeholder="Llave de agencia v!d (kg_live_…)" value={llave} onChange={(e) => setLlave(e.target.value)} />
            <button className="primary" disabled={ocupado || (!llave.trim() && !propia?.tieneLlave)}>
              Guardar
            </button>
            {propia?.tieneLlave && (
              <button type="button" className="ghost" disabled={ocupado} onClick={() => guardar(true)}>
                Quitar
              </button>
            )}
          </div>
          <label className="agencia-url">
            <span className="muted small">URL de vid-api</span>
            <input type="url" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        </form>
      )}
      {error && <p className="bad small fila-extra">{error}</p>}
      {prueba && (
        <div className="fila-extra">
          <ResultadoPrueba e={prueba} />
        </div>
      )}
    </div>
  )
}

function ResultadoPrueba({ e }: { e: EstadoAgencia & { desde?: string } }) {
  return (
    <div className="agencia-prueba">
      <p className="small">
        <span className="ok-texto">Conectado</span> · {e.agencia.nombre}
        {e.agencia.folio ? ` (${e.agencia.folio})` : ''} · subcuenta {e.locationId}
        {e.desde === 'defecto' ? ' · con la llave por defecto' : ''}
      </p>
      <CuentasPorRed cuentas={e.cuentas} />
    </div>
  )
}

/** Las cuentas conectadas, agrupadas por red, con el logo de cada una. */
export function CuentasPorRed({ cuentas }: { cuentas: CuentaSocial[] }) {
  if (!cuentas.length) return <p className="muted small">No hay redes conectadas en la subcuenta de GHL.</p>
  const redes = [...new Set(cuentas.map((c) => c.plataforma))]
  return (
    <div className="redes-conectadas">
      {redes.map((r) => {
        const de = cuentas.filter((c) => c.plataforma === r)
        return (
          <div key={r} className="red-conectada" title={de.map((c) => c.nombre).join('\n')}>
            <Logo de={r} nombre={nombrePlataforma(r)} chico />
            <span className="small">
              {nombrePlataforma(r)} <span className="muted">{de.length}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
