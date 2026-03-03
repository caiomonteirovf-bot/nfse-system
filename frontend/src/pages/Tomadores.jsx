import { useCallback, useEffect, useState } from 'react'
import { fetchTomadores, createTomador, updateTomador, deleteTomador } from '../api'
import { TOMADOR_FORM_FIELDS } from '../lib/constants'
import RecordModal from '../components/RecordModal'

export default function Tomadores({ onRefresh }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTomadores({ search: search || undefined })
      setItems(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load() }, [load])

  const openNew = () => { setEditRecord(null); setModalOpen(true) }
  const openEdit = (t) => { setEditRecord(t); setModalOpen(true) }

  const handleSubmit = async (values) => {
    setBusy(true)
    try {
      if (editRecord) {
        await updateTomador(editRecord.id, values)
      } else {
        await createTomador(values)
      }
      setModalOpen(false)
      setEditRecord(null)
      load()
      onRefresh?.()
    } catch (e) {
      alert('Erro: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Excluir tomador?')) return
    try {
      await deleteTomador(id)
      load()
      onRefresh?.()
    } catch (e) {
      alert('Erro: ' + e.message)
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Tomadores</h1>
        <p>Gestao de tomadores de servico</p>
      </div>

      <div className="filters-row">
        <label>
          Buscar
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, CNPJ, email..." />
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn--solid" onClick={openNew}>+ Novo Tomador</button>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CNPJ/CPF</th>
                <th>Razao Social</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Cidade/UF</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading ? (
                <tr><td colSpan={7}><p className="empty-state">Nenhum tomador encontrado</p></td></tr>
              ) : items.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.cpfCnpj}</strong></td>
                  <td>{t.razaoSocial}<br/><small>{t.nomeFantasia}</small></td>
                  <td>{t.email || '--'}</td>
                  <td>{t.telefone || '--'}</td>
                  <td>{t.cidade ? `${t.cidade}/${t.uf}` : '--'}</td>
                  <td>
                    <span className={`badge badge--${t.ativo ? 'success' : 'danger'}`}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn btn--tiny" onClick={() => openEdit(t)}>Editar</button>
                      <button className="btn btn--tiny btn--danger" onClick={() => handleDelete(t.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RecordModal
        isOpen={modalOpen}
        title={editRecord ? 'Editar Tomador' : 'Novo Tomador'}
        fields={TOMADOR_FORM_FIELDS}
        record={editRecord}
        submitLabel={editRecord ? 'Salvar' : 'Criar'}
        busy={busy}
        onClose={() => { setModalOpen(false); setEditRecord(null) }}
        onSubmit={handleSubmit}
      />
    </>
  )
}
