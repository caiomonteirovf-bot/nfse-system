import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchNfses, createNfse, updateNfse, deleteNfse, cancelarNfse, request, pdfNfseNuvemUrl, pollProcessando } from '../api'
import { NFSE_STATUS_OPTIONS, NFSE_STATUS_TONE, NFSE_ORIGEM_TONE } from '../lib/constants'
import { formatCurrency, formatDate } from '../lib/formatters'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

function cleanDoc(doc) {
  return (doc || '').replace(/\D/g, '')
}

function buildTabs(clienteDoc) {
  const doc = cleanDoc(clienteDoc)
  if (!doc) {
    // Sem cliente selecionado: nao tem como determinar emitida/recebida sem CNPJ de referencia
    return [
      { id: 'todas', label: 'Todas' },
    ]
  }
  // Com cliente selecionado: usa CNPJ para determinar papel
  return [
    { id: 'todas', label: 'Todas' },
    { id: 'emitidas', label: 'Emitidas', filter: n => cleanDoc(n.prestadorCnpj) === doc },
    { id: 'recebidas', label: 'Recebidas', filter: n => cleanDoc(n.tomadorCpfCnpj) === doc },
  ]
}

const EMPTY_FORM = {
  numero: '', serie: '1', tomadorId: '', tomadorCpfCnpj: '', tomadorRazaoSocial: '',
  tomadorEmail: '', descricaoServico: '', itemListaServico: '', codigoCnae: '',
  valorServicos: '', aliquotaIss: '', issRetido: false, valorDeducoes: '',
  descontoIncondicionado: '', dataEmissao: new Date().toISOString().slice(0, 10),
  status: 'EMITIDA', observacoes: '',
}

export default function NotasFiscais({ tomadores = [], onRefresh, clienteAtivo, onNavigate }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtroAno, setFiltroAno] = useState(currentYear)
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [detailItem, setDetailItem] = useState(null)
  const [activeTab, setActiveTab] = useState('todas')
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelPortalInfo, setCancelPortalInfo] = useState(null) // {chaveAcesso, linkConsulta, portalUrl, message}

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = { ano: filtroAno }
      if (filtroMes) filters.mes = filtroMes
      if (filtroBusca) filters.search = filtroBusca
      if (filtroStatus) filters.status = filtroStatus
      if (clienteAtivo?.id) filters.clienteId = clienteAtivo.id
      if (clienteAtivo?.document) filters.clienteDoc = clienteAtivo.document
      const data = await fetchNfses(filters)
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filtroAno, filtroMes, filtroBusca, filtroStatus, clienteAtivo])

  useEffect(() => { load() }, [load])

  // Auto-poll PROCESSANDO notes every 10s
  const pollRef = useRef(null)
  const hasProcessando = items.some(n => n.status === 'PROCESSANDO')

  useEffect(() => {
    if (!hasProcessando) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const doPoll = async () => {
      try {
        const res = await pollProcessando()
        if (res?.data?.atualizadas > 0) load()
      } catch { /* silent */ }
    }
    pollRef.current = setInterval(doPoll, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasProcessando, load])

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditId(null); setShowForm(false) }

  const openEdit = (n) => {
    setForm({
      numero: n.numero || '',
      serie: n.serie || '1',
      tomadorId: n.tomadorId ? String(n.tomadorId) : '',
      tomadorCpfCnpj: n.tomadorCpfCnpj || '',
      tomadorRazaoSocial: n.tomadorRazaoSocial || '',
      tomadorEmail: n.tomadorEmail || '',
      descricaoServico: n.descricaoServico || '',
      itemListaServico: n.itemListaServico || '',
      codigoCnae: n.codigoCnae || '',
      valorServicos: n.valorServicos || '',
      aliquotaIss: n.aliquotaIss || '',
      issRetido: n.issRetido || false,
      valorDeducoes: n.valorDeducoes || '',
      descontoIncondicionado: n.descontoIncondicionado || '',
      dataEmissao: n.dataEmissao || '',
      status: n.status || 'EMITIDA',
      observacoes: n.observacoes || '',
    })
    setEditId(n.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.numero) return alert('Numero obrigatorio.')
    if (!form.valorServicos) return alert('Valor dos servicos obrigatorio.')
    try {
      const payload = {
        ...form,
        tomadorId: form.tomadorId ? parseInt(form.tomadorId) : null,
        valorServicos: parseFloat(form.valorServicos) || 0,
        aliquotaIss: parseFloat(form.aliquotaIss) || 0,
        valorDeducoes: parseFloat(form.valorDeducoes) || 0,
        descontoIncondicionado: parseFloat(form.descontoIncondicionado) || 0,
      }
      if (editId) {
        await updateNfse(editId, payload)
      } else {
        await createNfse(payload)
      }
      resetForm()
      load()
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir NFS-e?')) return
    try {
      await deleteNfse(id)
      load()
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  const handleCancelar = async (forceLocal = false) => {
    if (!cancelModal) return
    if (!cancelMotivo.trim()) { alert('Informe o motivo do cancelamento.'); return }
    setCancelLoading(true)
    try {
      // Usar fetch direto (não request()) porque a resposta pode ter ok:false com canForceLocal
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const raw = await fetch(`${API_BASE}/emissao/${cancelModal}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: cancelMotivo.trim(), forceLocal }),
      })
      const resp = await raw.json()

      if (resp.canForceLocal && !forceLocal) {
        // API não suporta — mostrar info do portal para cancelamento manual
        setCancelPortalInfo({
          chaveAcesso: resp.chaveAcesso || '',
          linkConsulta: resp.linkConsulta || '',
          portalUrl: resp.portalUrl || 'https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas',
          message: resp.message || 'Cancelamento via API indisponivel.',
        })
        setCancelLoading(false)
        return
      }

      if (!raw.ok || !resp.ok) {
        throw new Error(resp.error || resp.detail || `Erro HTTP ${raw.status}`)
      }

      setCancelModal(null)
      setCancelMotivo('')
      setCancelPortalInfo(null)
      load()
    } catch (e) {
      alert('Erro: ' + (e.message || 'Erro ao cancelar'))
    } finally {
      setCancelLoading(false)
    }
  }

  const handleCancelarLocal = async () => {
    setCancelPortalInfo(null)
    setCancelLoading(true)
    try {
      await request(`/emissao/${cancelModal}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: cancelMotivo.trim(), forceLocal: true }),
      })
      setCancelModal(null)
      setCancelMotivo('')
      load()
    } catch (e) {
      alert('Erro: ' + (e.message || 'Erro ao cancelar localmente'))
    } finally {
      setCancelLoading(false)
    }
  }

  const tabs = useMemo(() => buildTabs(clienteAtivo?.document), [clienteAtivo?.document])

  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab)) setActiveTab('todas')
  }, [tabs])

  const filteredItems = useMemo(() => {
    const tab = tabs.find(t => t.id === activeTab)
    return tab?.filter ? items.filter(tab.filter) : items
  }, [items, activeTab, tabs])

  const tabCounts = useMemo(() => {
    const counts = { todas: items.length }
    if (tabs[1]?.filter) counts.emitidas = items.filter(tabs[1].filter).length
    if (tabs[2]?.filter) counts.recebidas = items.filter(tabs[2].filter).length
    return counts
  }, [items, tabs])

  const [tomadorLoading, setTomadorLoading] = useState(false)
  const [tomadorMsg, setTomadorMsg] = useState('')

  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'tomadorId' && val) {
        const tom = tomadores.find(t => String(t.id) === String(val))
        if (tom) {
          next.tomadorCpfCnpj = tom.cpfCnpj || ''
          next.tomadorRazaoSocial = tom.razaoSocial || ''
          next.tomadorEmail = tom.email || ''
        }
      }
      return next
    })
  }

  const buscarTomadorPorDoc = async () => {
    const doc = (form.tomadorCpfCnpj || '').replace(/\D/g, '')
    if (doc.length < 11) return
    setTomadorLoading(true)
    setTomadorMsg('')
    try {
      // Busca nos tomadores existentes
      const existing = tomadores.find(t => (t.cpfCnpj || '').replace(/\D/g, '') === doc)
      if (existing) {
        setField('tomadorId', existing.id)
        setField('tomadorRazaoSocial', existing.razaoSocial || '')
        setField('tomadorEmail', existing.email || '')
        setTomadorMsg('Tomador encontrado no sistema')
        setTomadorLoading(false)
        return
      }
      // Se CNPJ (14 dígitos), busca na Receita Federal
      if (doc.length === 14) {
        const resp = await request(`/cnpj/${doc}`)
        if (resp.ok && resp.data) {
          setForm(f => ({ ...f, tomadorRazaoSocial: resp.data.legalName || '', tomadorEmail: resp.data.email || '' }))
          setTomadorMsg('Dados carregados da Receita Federal')
        } else {
          setTomadorMsg('CNPJ nao encontrado na Receita')
        }
      } else {
        setTomadorMsg('CPF - preencha o nome manualmente')
      }
    } catch {
      setTomadorMsg('Erro na busca')
    }
    setTomadorLoading(false)
  }

  return (
    <>
      <div className="page-heading">
        <h1>Notas Fiscais</h1>
        <p>Gerenciamento de NFS-e</p>
      </div>

      <div className="tabs-row" style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border, #e5e7eb)', marginBottom: 16 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`btn btn--ghost${activeTab === tab.id ? ' tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              borderRadius: '8px 8px 0 0',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent, #6366F1)' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--accent, #6366F1)' : 'var(--text-muted)',
              padding: '8px 16px',
              fontSize: 13,
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: 6, fontSize: 11, background: activeTab === tab.id ? 'var(--accent, #6366F1)' : 'var(--bg-panel, #f3f4f6)',
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              borderRadius: 10, padding: '1px 7px', fontWeight: 600,
            }}>
              {tabCounts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="filters-row">
        <label>
          Buscar
          <input type="text" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Numero, tomador..." />
        </label>
        <label>
          Status
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {NFSE_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label>
          Ano
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>
          Mes
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>)}
          </select>
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn--solid" onClick={() => onNavigate ? onNavigate('emissao') : setShowForm(true)}>+ Emitir NFS-e</button>
        </div>
      </div>

      {/* Inline Form */}
      {showForm && (
        <div className="panel">
          <header className="panel__header">
            <h3>{editId ? 'Editar NFS-e' : 'Nova NFS-e'}</h3>
            <button className="btn btn--ghost btn--tiny" onClick={resetForm}>Fechar</button>
          </header>
          <div className="panel__body module-content">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <label>Numero *<input value={form.numero} onChange={e => setField('numero', e.target.value)} /></label>
              <label>Serie<input value={form.serie} onChange={e => setField('serie', e.target.value)} /></label>
              <label>
                CNPJ/CPF Tomador *
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={form.tomadorCpfCnpj} onChange={e => setField('tomadorCpfCnpj', e.target.value)} placeholder="Digite o CNPJ ou CPF" style={{ flex: 1 }} />
                  <button className="btn btn--tiny" onClick={buscarTomadorPorDoc} disabled={tomadorLoading} type="button">{tomadorLoading ? '...' : 'Buscar'}</button>
                </div>
                {tomadorMsg && <small style={{ color: 'var(--text-muted)', marginTop: 2 }}>{tomadorMsg}</small>}
              </label>
              <label>Razao Social Tomador<input value={form.tomadorRazaoSocial} onChange={e => setField('tomadorRazaoSocial', e.target.value)} /></label>
              <label>Email Tomador<input value={form.tomadorEmail} onChange={e => setField('tomadorEmail', e.target.value)} /></label>
              <label style={{ display: 'none' }}><input value={form.tomadorId} readOnly /></label>
              <label>Valor Servicos *<input type="number" step="0.01" value={form.valorServicos} onChange={e => setField('valorServicos', e.target.value)} /></label>
              <label>Aliquota ISS (%)<input type="number" step="0.01" value={form.aliquotaIss} onChange={e => setField('aliquotaIss', e.target.value)} /></label>
              <label>Data Emissao<input type="date" value={form.dataEmissao} onChange={e => setField('dataEmissao', e.target.value)} /></label>
              <label>
                Status
                <select value={form.status} onChange={e => setField('status', e.target.value)}>
                  {NFSE_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label>Descricao<input value={form.descricaoServico} onChange={e => setField('descricaoServico', e.target.value)} /></label>
              <label>Observacoes<input value={form.observacoes} onChange={e => setField('observacoes', e.target.value)} /></label>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn--solid" onClick={handleSave}>{editId ? 'Salvar' : 'Criar NFS-e'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>{activeTab === 'emitidas' ? 'Tomador' : activeTab === 'recebidas' ? 'Prestador' : 'Contraparte'}</th>
                <th>Valor</th>
                <th>ISS</th>
                <th>Liquido</th>
                <th>Data</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && !loading ? (
                <tr><td colSpan={9}><p className="empty-state">Nenhuma NFS-e encontrada</p></td></tr>
              ) : filteredItems.map(n => (
                <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => setDetailItem(n)}>
                  <td><strong>{n.numero}</strong><small>Serie {n.serie}</small></td>
                  <td>
                    {(() => {
                      const doc = cleanDoc(clienteAtivo?.document)
                      const isEmitida = doc && cleanDoc(n.prestadorCnpj) === doc
                      const showTomador = activeTab === 'emitidas' || (activeTab === 'todas' && isEmitida)
                      return showTomador
                        ? <>{n.tomadorNome || n.tomadorRazaoSocial || '--'}<br/><small>{n.tomadorCpfCnpj}</small></>
                        : <>{n.prestadorRazaoSocial || '--'}<br/><small>{n.prestadorCnpj}</small></>
                    })()}
                  </td>
                  <td>{formatCurrency(n.valorServicos)}</td>
                  <td>{formatCurrency(n.valorIss)}<small>{n.aliquotaIss}%</small></td>
                  <td>{formatCurrency(n.valorLiquido)}</td>
                  <td>{formatDate(n.dataEmissao)}</td>
                  <td>
                    <span className={`badge badge--${NFSE_ORIGEM_TONE[n.origem] || 'neutral'}`}>{n.origem || 'MANUAL'}</span>
                  </td>
                  <td>
                    <span className={`badge badge--${NFSE_STATUS_TONE[n.status] || 'neutral'}`}>{n.status}</span>
                  </td>
                  <td>
                    <div className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn btn--tiny" onClick={() => setDetailItem(n)}>Ver</button>
                      <button className="btn btn--tiny" onClick={() => openEdit(n)}>Editar</button>
                      {n.protocolo && n.protocolo.startsWith('nfs') && (
                        <a className="btn btn--tiny" href={pdfNfseNuvemUrl(n.protocolo)} target="_blank" rel="noopener noreferrer">PDF</a>
                      )}
                      {n.status !== 'CANCELADA' && n.status !== 'PENDENTE' && n.status !== 'ERRO' && (
                        <button className="btn btn--tiny btn--danger" onClick={() => { setCancelModal(n.id); setCancelMotivo('') }}>Cancelar</button>
                      )}
                      {(n.status === 'PENDENTE' || n.status === 'RASCUNHO' || n.status === 'ERRO') && (
                        <button className="btn btn--tiny btn--danger" onClick={() => handleDelete(n.id)}>Excluir</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Detail Modal */}
      {detailItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDetailItem(null)}>
          <div className="modal-card" style={{ maxWidth: 720, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <header className="modal-card__header">
              <h3>NFS-e {detailItem.numero} (Serie {detailItem.serie})</h3>
              <button className="btn btn--ghost" onClick={() => setDetailItem(null)}>Fechar</button>
            </header>
            <div className="modal-card__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Status */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span className={`badge badge--${NFSE_STATUS_TONE[detailItem.status] || 'neutral'}`} style={{ fontSize: 14, padding: '4px 12px' }}>{detailItem.status}</span>
                <span className={`badge badge--${NFSE_ORIGEM_TONE[detailItem.origem] || 'neutral'}`}>{detailItem.origem || 'MANUAL'}</span>
                {detailItem.chaveAcesso && <small style={{ color: 'var(--text-muted)' }}>Chave: {detailItem.chaveAcesso}</small>}
              </div>

              {/* Identificacao */}
              <DetailSection title="Identificacao">
                <DetailRow label="Numero" value={detailItem.numero} />
                <DetailRow label="Serie" value={detailItem.serie} />
                <DetailRow label="Cod. Verificacao" value={detailItem.codigoVerificacao} />
                <DetailRow label="Chave Acesso" value={detailItem.chaveAcesso} />
                <DetailRow label="Protocolo" value={detailItem.protocolo} />
                <DetailRow label="NSU" value={detailItem.nsu} />
              </DetailSection>

              {/* Prestador */}
              <DetailSection title="Prestador">
                <DetailRow label="CNPJ" value={detailItem.prestadorCnpj} />
                <DetailRow label="Razao Social" value={detailItem.prestadorRazaoSocial} />
                <DetailRow label="Inscr. Municipal" value={detailItem.prestadorInscricaoMunicipal} />
              </DetailSection>

              {/* Tomador */}
              <DetailSection title="Tomador">
                <DetailRow label="CPF/CNPJ" value={detailItem.tomadorCpfCnpj} />
                <DetailRow label="Razao Social" value={detailItem.tomadorNome || detailItem.tomadorRazaoSocial} />
                <DetailRow label="Email" value={detailItem.tomadorEmail} />
              </DetailSection>

              {/* Servico */}
              <DetailSection title="Servico" full>
                <DetailRow label="Descricao" value={detailItem.descricaoServico} />
                <DetailRow label="Item Lista" value={detailItem.itemListaServico} />
                <DetailRow label="CNAE" value={detailItem.codigoCnae} />
                <DetailRow label="Cod. Trib. Municipio" value={detailItem.codigoTributacaoMunicipio} />
              </DetailSection>

              {/* Valores */}
              <DetailSection title="Valores">
                <DetailRow label="Valor Servicos" value={formatCurrency(detailItem.valorServicos)} />
                <DetailRow label="Deducoes" value={formatCurrency(detailItem.valorDeducoes)} />
                <DetailRow label="Desc. Incond." value={formatCurrency(detailItem.descontoIncondicionado)} />
                <DetailRow label="Base Calculo" value={formatCurrency(detailItem.baseCalculo)} />
                <DetailRow label="Valor Liquido" value={formatCurrency(detailItem.valorLiquido)} bold />
              </DetailSection>

              {/* Tributos */}
              <DetailSection title="Tributos">
                <DetailRow label="Aliquota ISS" value={`${detailItem.aliquotaIss || 0}%`} />
                <DetailRow label="ISS" value={formatCurrency(detailItem.valorIss)} />
                <DetailRow label="ISS Retido" value={detailItem.issRetido ? 'Sim' : 'Nao'} />
                <DetailRow label="PIS" value={formatCurrency(detailItem.valorPis)} />
                <DetailRow label="COFINS" value={formatCurrency(detailItem.valorCofins)} />
                <DetailRow label="INSS" value={formatCurrency(detailItem.valorInss)} />
                <DetailRow label="IR" value={formatCurrency(detailItem.valorIr)} />
                <DetailRow label="CSLL" value={formatCurrency(detailItem.valorCsll)} />
              </DetailSection>

              {/* Datas */}
              <DetailSection title="Datas e RPS">
                <DetailRow label="Data Emissao" value={formatDate(detailItem.dataEmissao)} />
                <DetailRow label="Competencia" value={formatDate(detailItem.competencia)} />
                <DetailRow label="RPS Numero" value={detailItem.rpsNumero} />
                <DetailRow label="RPS Serie" value={detailItem.rpsSerie} />
                <DetailRow label="Criado em" value={detailItem.createdAt ? new Date(detailItem.createdAt).toLocaleString('pt-BR') : ''} />
                <DetailRow label="Atualizado em" value={detailItem.updatedAt ? new Date(detailItem.updatedAt).toLocaleString('pt-BR') : ''} />
              </DetailSection>

              {/* Observacoes */}
              {detailItem.observacoes && (
                <DetailSection title="Observacoes" full>
                  <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{detailItem.observacoes}</p>
                </DetailSection>
              )}

              {/* Mensagem retorno */}
              {detailItem.mensagemRetorno && (
                <DetailSection title="Mensagem Retorno" full>
                  <p style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap', color: 'var(--danger)' }}>{detailItem.mensagemRetorno}</p>
                </DetailSection>
              )}
            </div>

            <footer className="modal-card__footer" style={{ display: 'flex', gap: 8 }}>
              {detailItem.protocolo && detailItem.protocolo.startsWith('nfs') && (
                <a href={pdfNfseNuvemUrl(detailItem.protocolo)} target="_blank" rel="noopener" className="btn btn--solid">PDF</a>
              )}
              <button className="btn btn--solid" onClick={() => { setDetailItem(null); openEdit(detailItem) }}>Editar</button>
              {detailItem.status !== 'CANCELADA' && detailItem.status !== 'PENDENTE' && (
                <button className="btn btn--danger" onClick={() => { setDetailItem(null); setCancelModal(detailItem.id); setCancelMotivo('') }}>Cancelar</button>
              )}
              <button className="btn btn--ghost" onClick={() => setDetailItem(null)}>Fechar</button>
            </footer>
          </div>
        </div>
      )}
      {/* Cancel Modal */}
      {cancelModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => { setCancelModal(null); setCancelPortalInfo(null) }}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <header className="modal-card__header">
              <h3>Cancelar NFS-e</h3>
              <button className="btn btn--ghost" onClick={() => { setCancelModal(null); setCancelPortalInfo(null) }}>X</button>
            </header>
            <div className="modal-card__body">
              {!cancelPortalInfo ? (
                <>
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    Esta acao tentara cancelar a NFS-e na prefeitura via API. Se nao for possivel, voce podera cancelar manualmente no portal ou apenas marcar como cancelada no sistema.
                  </div>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>Motivo do cancelamento *</label>
                  <textarea
                    value={cancelMotivo}
                    onChange={e => setCancelMotivo(e.target.value)}
                    placeholder="Ex: Erro nos dados do tomador, valor incorreto, nota duplicada..."
                    rows={3}
                    style={{ width: '100%', resize: 'vertical' }}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                    <strong>Cancelamento via API indisponivel</strong><br />
                    {cancelPortalInfo.message}
                  </div>
                  <p style={{ fontSize: 13, marginBottom: 12 }}>Voce tem duas opcoes:</p>
                  <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <strong style={{ fontSize: 13 }}>Opcao 1: Cancelar no Portal NFS-e</strong>
                    <p style={{ fontSize: 12, margin: '6px 0', color: 'var(--text-secondary, #666)' }}>
                      Acesse o portal, localize a nota e cancele manualmente. Depois, marque como cancelada aqui.
                    </p>
                    {cancelPortalInfo.chaveAcesso && (
                      <div style={{ fontSize: 12, margin: '8px 0' }}>
                        <span style={{ fontWeight: 600 }}>Chave de Acesso: </span>
                        <code style={{ background: 'var(--bg-tertiary, #e9ecef)', padding: '2px 6px', borderRadius: 4, fontSize: 11, wordBreak: 'break-all' }}>
                          {cancelPortalInfo.chaveAcesso}
                        </code>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 11, padding: '2px 6px', marginLeft: 4 }}
                          onClick={() => { navigator.clipboard.writeText(cancelPortalInfo.chaveAcesso); alert('Chave copiada!') }}
                        >Copiar</button>
                      </div>
                    )}
                    <a
                      href={cancelPortalInfo.portalUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="btn btn--solid"
                      style={{ fontSize: 12, padding: '6px 12px', marginTop: 4 }}
                    >Abrir Portal NFS-e</a>
                  </div>
                  <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: 12 }}>
                    <strong style={{ fontSize: 13 }}>Opcao 2: Cancelar apenas no sistema</strong>
                    <p style={{ fontSize: 12, margin: '6px 0', color: 'var(--text-secondary, #666)' }}>
                      Marca a nota como CANCELADA no sistema, sem alterar o status na prefeitura. Use apos cancelar manualmente no portal.
                    </p>
                  </div>
                </>
              )}
            </div>
            <footer className="modal-card__footer" style={{ display: 'flex', gap: 8 }}>
              {!cancelPortalInfo ? (
                <>
                  <button className="btn btn--danger" onClick={() => handleCancelar()} disabled={cancelLoading || !cancelMotivo.trim()}>
                    {cancelLoading ? 'Cancelando...' : 'Cancelar NFS-e'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => { setCancelModal(null); setCancelPortalInfo(null) }}>Voltar</button>
                </>
              ) : (
                <>
                  <button className="btn btn--danger" onClick={handleCancelarLocal} disabled={cancelLoading}>
                    {cancelLoading ? 'Cancelando...' : 'Marcar como Cancelada'}
                  </button>
                  <button className="btn btn--ghost" onClick={() => { setCancelModal(null); setCancelPortalInfo(null) }}>Fechar</button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

function DetailSection({ title, children, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, background: 'var(--bg-panel)', borderRadius: 6, padding: '10px 14px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>{title}</h4>
      {children}
    </div>
  )
}

function DetailRow({ label, value, bold }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400, fontFamily: bold ? "'Space Grotesk',sans-serif" : 'inherit' }}>{value}</span>
    </div>
  )
}
