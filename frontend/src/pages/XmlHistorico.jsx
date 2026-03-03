import { useCallback, useEffect, useState } from 'react'
import { fetchXmlLogs, fetchXmlLogDetail } from '../api'
import { OPERACAO_TIPOS } from '../lib/constants'

function formatDateTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function XmlHistorico() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchXmlLogs({ tipo: filtroTipo || undefined, limit: 100 })
      setLogs(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filtroTipo])

  useEffect(() => { load() }, [load])

  const openDetail = async (id) => {
    if (detail?.id === id) { setDetail(null); return }
    setLoadingDetail(true)
    try {
      const data = await fetchXmlLogDetail(id)
      setDetail(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDetail(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Historico XML</h1>
        <p>Log de comunicacao com webservice ABRASF</p>
      </div>

      <div className="filters-row">
        <label>
          Tipo Operacao
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            {OPERACAO_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn--ghost" onClick={load}>Atualizar</button>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>NFS-e</th>
                <th>Protocolo</th>
                <th>Status</th>
                <th>Mensagem</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading ? (
                <tr><td colSpan={7}><p className="empty-state">Nenhum log encontrado</p></td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td><small>{formatDateTime(log.createdAt)}</small></td>
                  <td>
                    <span className="badge badge--neutral" style={{ fontSize: 10 }}>
                      {log.tipoOperacao}
                    </span>
                  </td>
                  <td>{log.nfseId ? `#${log.nfseId}` : '--'}</td>
                  <td><small>{log.protocolo || '--'}</small></td>
                  <td>
                    <span className={`badge badge--${log.sucesso ? 'success' : 'danger'}`}>
                      {log.sucesso ? 'OK' : 'Erro'}
                    </span>
                    {log.httpStatus && <small style={{ marginLeft: 4 }}>({log.httpStatus})</small>}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <small>{log.mensagem || '--'}</small>
                  </td>
                  <td>
                    <button className="btn btn--tiny" onClick={() => openDetail(log.id)}>
                      {detail?.id === log.id ? 'Fechar' : 'Ver XML'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* XML Detail */}
      {loadingDetail && <p style={{ color: 'var(--text-muted)' }}>Carregando XML...</p>}

      {detail && (
        <div className="panel">
          <header className="panel__header">
            <h3>XML - {detail.tipoOperacao} #{detail.id}</h3>
            <button className="btn btn--ghost btn--tiny" onClick={() => setDetail(null)}>Fechar</button>
          </header>
          <div className="panel__body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>XML ENVIO</p>
                <pre style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 12, fontSize: 11, overflow: 'auto',
                  maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                }}>
                  {detail.xmlEnvio || '(vazio)'}
                </pre>
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>XML RETORNO</p>
                <pre style={{
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: 12, fontSize: 11, overflow: 'auto',
                  maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                }}>
                  {detail.xmlRetorno || '(vazio)'}
                </pre>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              HTTP Status: <strong>{detail.httpStatus || '--'}</strong>
              {' | '}Protocolo: <strong>{detail.protocolo || '--'}</strong>
              {' | '}Data: <strong>{formatDateTime(detail.createdAt)}</strong>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
