import { useCallback, useEffect, useState } from 'react'
import { fetchNfses, emitirNfseLote, consultarLoteNfse } from '../api'
import { formatCurrency, formatDate } from '../lib/formatters'

export default function Emissao({ prestador }) {
  const [notas, setNotas] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [protocolo, setProtocolo] = useState('')
  const [consultaResult, setConsultaResult] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNfses({ status: 'PENDENTE' })
      setNotas(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === notas.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(notas.map(n => n.id)))
    }
  }

  const handleEnviarLote = async () => {
    if (selected.size === 0) return alert('Selecione ao menos uma NFS-e.')
    setEnviando(true)
    setError('')
    setResultado(null)
    try {
      const data = await emitirNfseLote([...selected])
      setResultado(data)
      if (data.protocolo) setProtocolo(data.protocolo)
      load()
      setSelected(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const handleConsultar = async () => {
    if (!protocolo.trim()) return alert('Informe o protocolo.')
    setConsultando(true)
    setConsultaResult(null)
    try {
      const data = await consultarLoteNfse(protocolo.trim())
      setConsultaResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setConsultando(false)
    }
  }

  const configOk = prestador?.cnpj && prestador?.webserviceUrl

  return (
    <>
      <div className="page-heading">
        <h1>Emissao ABRASF</h1>
        <p>Envio de lote de RPS para o webservice da prefeitura</p>
      </div>

      {/* Config Status */}
      <div className="panel">
        <header className="panel__header"><h3>Configuracao do Prestador</h3></header>
        <div className="panel__body">
          {configOk ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>CNPJ</div>
                <strong>{prestador.cnpj}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Inscricao Municipal</div>
                <strong>{prestador.inscricaoMunicipal || '--'}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Ambiente</div>
                <span className={`badge badge--${prestador.ambiente === 'PRODUCAO' ? 'success' : 'warning'}`}>
                  {prestador.ambiente || 'HOMOLOGACAO'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Webservice</div>
                <small style={{ wordBreak: 'break-all' }}>{prestador.webserviceUrl}</small>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>
              Configure os dados do prestador e webservice ABRASF em Configuracoes antes de emitir.
            </p>
          )}
        </div>
      </div>

      {/* Notas Pendentes */}
      <div className="panel">
        <header className="panel__header">
          <h3>Notas Pendentes ({notas.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--solid" onClick={handleEnviarLote} disabled={enviando || selected.size === 0 || !configOk}>
              {enviando ? 'Enviando...' : `Enviar Lote (${selected.size})`}
            </button>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={notas.length > 0 && selected.size === notas.length} onChange={toggleAll} />
                </th>
                <th>Numero</th>
                <th>Tomador</th>
                <th>Valor</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Carregando...</p></td></tr>
              ) : notas.length === 0 ? (
                <tr><td colSpan={6}><p className="empty-state">Nenhuma nota pendente para emissao</p></td></tr>
              ) : notas.map(n => (
                <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => toggleSelect(n.id)}>
                  <td><input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleSelect(n.id)} /></td>
                  <td><strong>{n.numero}</strong><small>Serie {n.serie}</small></td>
                  <td>{n.tomadorNome || n.tomadorRazaoSocial || '--'}<br/><small>{n.tomadorCpfCnpj}</small></td>
                  <td>{formatCurrency(n.valorServicos)}</td>
                  <td>{formatDate(n.dataEmissao)}</td>
                  <td><span className="badge badge--warning">{n.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {/* Resultado Envio */}
      {resultado && (
        <div className="panel">
          <header className="panel__header"><h3>Resultado do Envio</h3></header>
          <div className="panel__body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PROTOCOLO</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{resultado.protocolo || '--'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>STATUS</div>
                <span className={`badge badge--${resultado.sucesso ? 'success' : 'danger'}`}>
                  {resultado.sucesso ? 'Enviado' : 'Erro'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>NOTAS</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{resultado.quantidade || selected.size}</div>
              </div>
            </div>
            {resultado.mensagem && (
              <p style={{ marginTop: 12, fontSize: 12, color: resultado.sucesso ? 'var(--text-muted)' : 'var(--danger)' }}>
                {resultado.mensagem}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Consultar Lote */}
      <div className="panel">
        <header className="panel__header"><h3>Consultar Lote</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              Protocolo
              <input value={protocolo} onChange={e => setProtocolo(e.target.value)} placeholder="Numero do protocolo" />
            </label>
            <button className="btn btn--solid" onClick={handleConsultar} disabled={consultando || !protocolo.trim()}>
              {consultando ? 'Consultando...' : 'Consultar'}
            </button>
          </div>

          {consultaResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SITUACAO</div>
                  <strong>{consultaResult.situacao || '--'}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PROTOCOLO</div>
                  <strong>{consultaResult.protocolo}</strong>
                </div>
              </div>
              {consultaResult.mensagem && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>{consultaResult.mensagem}</p>
              )}
              {consultaResult.notas?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Notas processadas:</p>
                  <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 16 }}>
                    {consultaResult.notas.map((n, i) => (
                      <li key={i}>NFS-e {n.numero} - {n.sucesso ? 'OK' : `Erro: ${n.mensagem}`}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
