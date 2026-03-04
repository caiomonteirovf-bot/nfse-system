import { useCallback, useEffect, useState } from 'react'
import { executarCaptura, fetchCapturaHistorico, fetchCapturaStatus } from '../api'

const STATUS_TONE = {
  SUCESSO: 'success',
  ERRO: 'danger',
  EM_ANDAMENTO: 'warning',
}

const CERT_TONE = {
  NO_PRAZO: 'success',
  A_VENCER: 'warning',
  VENCIDO: 'danger',
}

const CERT_LABEL = {
  NO_PRAZO: 'Valido',
  A_VENCER: 'A Vencer',
  VENCIDO: 'Vencido',
}

export default function Captura() {
  const [status, setStatus] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusData, histData] = await Promise.all([
        fetchCapturaStatus(),
        fetchCapturaHistorico(),
      ])
      setStatus(statusData)
      setHistorico(histData || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleCapturar = async () => {
    setCapturing(true)
    setMessage('')
    try {
      const result = await executarCaptura()
      if (result.ok) {
        const d = result.data
        setMessage(`Captura concluida: ${d?.totalNovas || 0} novas de ${d?.totalCapturadas || 0} processadas.`)
      } else {
        setMessage(`Erro: ${result.error}`)
      }
      loadData()
    } catch (e) {
      setMessage('Erro: ' + e.message)
    } finally {
      setCapturing(false)
    }
  }

  const ultima = status?.ultimaCaptura
  const certStatus = status?.certificadoStatus || ''

  return (
    <>
      <div className="page-heading">
        <h1>Captura de NFS-e</h1>
        <p>Captura automatica via API Nacional (ADN)</p>
      </div>

      {/* Status Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <article className="kpi-card" style={{ '--item-index': 0 }}>
          <div className="kpi-card__header"><p className="kpi-card__label">Certificado Digital</p></div>
          <p className="kpi-card__value">
            {certStatus ? (
              <span className={`badge badge--${CERT_TONE[certStatus] || 'neutral'}`}>
                {CERT_LABEL[certStatus] || certStatus}
              </span>
            ) : (
              <span className="badge badge--neutral">Nao configurado</span>
            )}
          </p>
        </article>

        <article className="kpi-card" style={{ '--item-index': 1 }}>
          <div className="kpi-card__header"><p className="kpi-card__label">Ultimo NSU</p></div>
          <p className="kpi-card__value">{ultima?.ultimoNsu || 0}</p>
        </article>

        <article className="kpi-card" style={{ '--item-index': 2 }}>
          <div className="kpi-card__header"><p className="kpi-card__label">Ultima Captura</p></div>
          <p className="kpi-card__value kpi-card__value--small">
            {ultima?.createdAt ? new Date(ultima.createdAt).toLocaleString('pt-BR') : '--'}
          </p>
        </article>

        <article className="kpi-card" style={{ '--item-index': 3 }}>
          <div className="kpi-card__header"><p className="kpi-card__label">Status</p></div>
          <p className="kpi-card__value">
            {ultima ? (
              <span className={`badge badge--${STATUS_TONE[ultima.status] || 'neutral'}`}>
                {ultima.status}
              </span>
            ) : '--'}
          </p>
        </article>
      </div>

      {/* Action */}
      <div className="panel">
        <header className="panel__header">
          <h3>Captura Manual</h3>
        </header>
        <div className="panel__body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="btn btn--solid"
            onClick={handleCapturar}
            disabled={capturing || !certStatus}
          >
            {capturing ? 'Capturando...' : 'Capturar Agora'}
          </button>
          {!certStatus && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Configure o certificado digital em Configuracoes antes de capturar.
            </span>
          )}
          {message && (
            <span style={{ fontSize: 13, color: message.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Historico */}
      <div className="panel">
        <header className="panel__header">
          <h3>Historico de Capturas</h3>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Capturadas</th>
                <th>Novas</th>
                <th>Ultimo NSU</th>
                <th>Status</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {historico.length === 0 && !loading ? (
                <tr><td colSpan={6}><p className="empty-state">Nenhuma captura realizada</p></td></tr>
              ) : historico.map(c => (
                <tr key={c.id}>
                  <td>{c.createdAt ? new Date(c.createdAt).toLocaleString('pt-BR') : '--'}</td>
                  <td>{c.totalCapturadas}</td>
                  <td><strong>{c.totalNovas}</strong></td>
                  <td>{c.ultimoNsu}</td>
                  <td>
                    <span className={`badge badge--${STATUS_TONE[c.status] || 'neutral'}`}>{c.status}</span>
                  </td>
                  <td><small>{c.mensagem}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
