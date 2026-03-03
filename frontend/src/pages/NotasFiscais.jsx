import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchNfses, createNfse, updateNfse, deleteNfse, cancelarNfse } from '../api'
import { NFSE_STATUS_OPTIONS, NFSE_STATUS_TONE } from '../lib/constants'
import { formatCurrency, formatDate } from '../lib/formatters'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const EMPTY_FORM = {
  numero: '', serie: '1', tomadorId: '', tomadorCpfCnpj: '', tomadorRazaoSocial: '',
  tomadorEmail: '', descricaoServico: '', itemListaServico: '', codigoCnae: '',
  valorServicos: '', aliquotaIss: '', issRetido: false, valorDeducoes: '',
  descontoIncondicionado: '', dataEmissao: new Date().toISOString().slice(0, 10),
  status: 'EMITIDA', observacoes: '',
}

export default function NotasFiscais({ tomadores = [], onRefresh }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filtroAno, setFiltroAno] = useState(currentYear)
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = { ano: filtroAno }
      if (filtroMes) filters.mes = filtroMes
      if (filtroBusca) filters.search = filtroBusca
      if (filtroStatus) filters.status = filtroStatus
      const data = await fetchNfses(filters)
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filtroAno, filtroMes, filtroBusca, filtroStatus])

  useEffect(() => { load() }, [load])

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

  const handleCancelar = async (id) => {
    if (!confirm('Cancelar NFS-e?')) return
    try {
      await cancelarNfse(id)
      load()
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      // Auto-fill tomador data when selecting
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

  return (
    <>
      <div className="page-heading">
        <h1>Notas Fiscais</h1>
        <p>Gerenciamento de NFS-e</p>
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
          <button className="btn btn--solid" onClick={() => { resetForm(); setShowForm(true) }}>+ Nova NFS-e</button>
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
                Tomador
                <select value={form.tomadorId} onChange={e => setField('tomadorId', e.target.value)}>
                  <option value="">-- Selecione --</option>
                  {tomadores.map(t => <option key={t.id} value={t.id}>{t.razaoSocial} ({t.cpfCnpj})</option>)}
                </select>
              </label>
              <label>CNPJ/CPF Tomador<input value={form.tomadorCpfCnpj} onChange={e => setField('tomadorCpfCnpj', e.target.value)} /></label>
              <label>Razao Social Tomador<input value={form.tomadorRazaoSocial} onChange={e => setField('tomadorRazaoSocial', e.target.value)} /></label>
              <label>Email Tomador<input value={form.tomadorEmail} onChange={e => setField('tomadorEmail', e.target.value)} /></label>
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
                <th>Tomador</th>
                <th>Valor</th>
                <th>ISS</th>
                <th>Liquido</th>
                <th>Data</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr><td colSpan={8}><p className="empty-state">Nenhuma NFS-e encontrada</p></td></tr>
              ) : items.map(n => (
                <tr key={n.id}>
                  <td><strong>{n.numero}</strong><small>Serie {n.serie}</small></td>
                  <td>{n.tomadorNome || n.tomadorRazaoSocial || '--'}<br/><small>{n.tomadorCpfCnpj}</small></td>
                  <td>{formatCurrency(n.valorServicos)}</td>
                  <td>{formatCurrency(n.valorIss)}<small>{n.aliquotaIss}%</small></td>
                  <td>{formatCurrency(n.valorLiquido)}</td>
                  <td>{formatDate(n.dataEmissao)}</td>
                  <td>
                    <span className={`badge badge--${NFSE_STATUS_TONE[n.status] || 'neutral'}`}>{n.status}</span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn btn--tiny" onClick={() => openEdit(n)}>Editar</button>
                      {n.status !== 'CANCELADA' && (
                        <button className="btn btn--tiny btn--danger" onClick={() => handleCancelar(n.id)}>Cancelar</button>
                      )}
                      <button className="btn btn--tiny btn--danger" onClick={() => handleDelete(n.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
