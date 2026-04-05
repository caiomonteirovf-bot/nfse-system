import { useEffect, useState } from 'react'
import { consultarDocumento, buscarMunicipios } from '../api'
import { UF_OPTIONS } from '../lib/constants'

function sanitize(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export default function TomadorModal({ isOpen, record, busy, onClose, onSubmit }) {
  const [values, setValues] = useState({})
  const [error, setError] = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjStatus, setCnpjStatus] = useState('') // '', 'found', 'not_found', 'error'
  const [municipios, setMunicipios] = useState([])
  const [municipioSearch, setMunicipioSearch] = useState('')
  const [showMunicipioList, setShowMunicipioList] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setValues({
        cpfCnpj: sanitize(record?.cpfCnpj),
        razaoSocial: sanitize(record?.razaoSocial),
        nomeFantasia: sanitize(record?.nomeFantasia),
        email: sanitize(record?.email),
        telefone: sanitize(record?.telefone),
        inscricaoMunicipal: sanitize(record?.inscricaoMunicipal),
        logradouro: sanitize(record?.logradouro),
        numeroEndereco: sanitize(record?.numeroEndereco),
        complemento: sanitize(record?.complemento),
        bairro: sanitize(record?.bairro),
        cidade: sanitize(record?.cidade),
        uf: sanitize(record?.uf),
        cep: sanitize(record?.cep),
        codigoMunicipio: sanitize(record?.codigoMunicipio),
        observacoes: sanitize(record?.observacoes),
      })
      setError('')
      setCnpjStatus('')
      setMunicipios([])
      setMunicipioSearch('')
    }
  }, [isOpen, record])

  // Carregar municípios quando UF muda
  useEffect(() => {
    if (values.uf && values.uf.length === 2) {
      buscarMunicipios(values.uf).then(setMunicipios).catch(() => setMunicipios([]))
    } else {
      setMunicipios([])
    }
  }, [values.uf])

  if (!isOpen) return null

  const set = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleCnpjBlur = async () => {
    const doc = (values.cpfCnpj || '').replace(/\D/g, '')
    if (doc.length !== 14) {
      setCnpjStatus('')
      return
    }
    setCnpjLoading(true)
    setCnpjStatus('')
    try {
      const dados = await consultarDocumento(doc)
      if (dados) {
        // Auto-fill campos se estiverem vazios ou se é registro novo
        const isNew = !record
        const fill = (key, val) => {
          if (val && (isNew || !values[key])) set(key, val)
        }
        fill('razaoSocial', dados.razaoSocial)
        fill('nomeFantasia', dados.nomeFantasia)
        fill('email', dados.email)
        fill('telefone', dados.telefone)
        fill('logradouro', dados.logradouro)
        fill('numeroEndereco', dados.numero)
        fill('complemento', dados.complemento)
        fill('bairro', dados.bairro)
        fill('cidade', dados.cidade)
        fill('uf', dados.uf)
        fill('cep', dados.cep)
        fill('codigoMunicipio', dados.codigoMunicipioIbge || dados.codigoMunicipio)

        // Atualiza todos de uma vez para novos registros
        if (isNew) {
          setValues(prev => ({
            ...prev,
            razaoSocial: dados.razaoSocial || prev.razaoSocial,
            nomeFantasia: dados.nomeFantasia || prev.nomeFantasia,
            email: dados.email || prev.email,
            telefone: dados.telefone || prev.telefone,
            logradouro: dados.logradouro || prev.logradouro,
            numeroEndereco: dados.numero || prev.numeroEndereco,
            complemento: dados.complemento || prev.complemento,
            bairro: dados.bairro || prev.bairro,
            cidade: dados.cidade || prev.cidade,
            uf: dados.uf || prev.uf,
            cep: dados.cep || prev.cep,
            codigoMunicipio: dados.codigoMunicipioIbge || dados.codigoMunicipio || prev.codigoMunicipio,
          }))
        }
        setCnpjStatus('found')
      }
    } catch (e) {
      console.error('Erro ao consultar CNPJ:', e)
      setCnpjStatus('error')
    } finally {
      setCnpjLoading(false)
    }
  }

  const filteredMunicipios = municipioSearch
    ? municipios.filter(m => m.label.toLowerCase().includes(municipioSearch.toLowerCase()))
    : municipios

  const handleMunicipioSelect = (m) => {
    set('codigoMunicipio', m.value)
    setMunicipioSearch(m.label)
    setShowMunicipioList(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!values.cpfCnpj?.replace(/\D/g, '')) {
      setError('Preencha o campo: CNPJ/CPF')
      return
    }
    if (!values.razaoSocial?.trim()) {
      setError('Preencha o campo: Razao Social')
      return
    }
    setError('')
    await onSubmit(values)
  }

  const isEditing = !!record

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <header className="modal-card__header">
          <h3>{isEditing ? 'Editar Tomador' : 'Novo Tomador'}</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </header>

        <div className="modal-card__body">
          {/* CNPJ/CPF com auto-fill */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              CNPJ/CPF <span className="required">*</span>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={values.cpfCnpj || ''}
                  onChange={e => set('cpfCnpj', e.target.value)}
                  onBlur={handleCnpjBlur}
                  placeholder="Digite o CNPJ e saia do campo para buscar"
                  style={cnpjStatus === 'found' ? { borderColor: '#22c55e' } : cnpjStatus === 'error' ? { borderColor: '#ef4444' } : {}}
                />
                {cnpjLoading && (
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#6366f1' }}>
                    Buscando...
                  </span>
                )}
              </div>
              {cnpjStatus === 'found' && <small style={{ color: '#22c55e' }}>Dados preenchidos da Receita Federal</small>}
              {cnpjStatus === 'error' && <small style={{ color: '#ef4444' }}>CNPJ nao encontrado na Receita</small>}
            </label>
            <label>
              Razao Social <span className="required">*</span>
              <input type="text" value={values.razaoSocial || ''} onChange={e => set('razaoSocial', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              Nome Fantasia
              <input type="text" value={values.nomeFantasia || ''} onChange={e => set('nomeFantasia', e.target.value)} />
            </label>
            <label>
              E-mail
              <input type="text" value={values.email || ''} onChange={e => set('email', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              Telefone
              <input type="text" value={values.telefone || ''} onChange={e => set('telefone', e.target.value)} />
            </label>
            <label>
              Inscricao Municipal
              <input type="text" value={values.inscricaoMunicipal || ''} onChange={e => set('inscricaoMunicipal', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <label>
              Logradouro
              <input type="text" value={values.logradouro || ''} onChange={e => set('logradouro', e.target.value)} />
            </label>
            <label>
              Numero
              <input type="text" value={values.numeroEndereco || ''} onChange={e => set('numeroEndereco', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              Complemento
              <input type="text" value={values.complemento || ''} onChange={e => set('complemento', e.target.value)} />
            </label>
            <label>
              Bairro
              <input type="text" value={values.bairro || ''} onChange={e => set('bairro', e.target.value)} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              Cidade
              <input type="text" value={values.cidade || ''} onChange={e => set('cidade', e.target.value)} />
            </label>
            <label>
              UF
              <select value={values.uf || ''} onChange={e => set('uf', e.target.value)}>
                <option value="">-- Selecione --</option>
                {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label>
              CEP
              <input type="text" value={values.cep || ''} onChange={e => set('cep', e.target.value)} />
            </label>
            <label>
              Codigo Municipio (IBGE)
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={showMunicipioList ? municipioSearch : (values.codigoMunicipio || '')}
                  onChange={e => {
                    if (!showMunicipioList) {
                      set('codigoMunicipio', e.target.value)
                    } else {
                      setMunicipioSearch(e.target.value)
                    }
                  }}
                  onFocus={() => {
                    if (municipios.length > 0) {
                      setShowMunicipioList(true)
                      setMunicipioSearch('')
                    }
                  }}
                  placeholder={municipios.length > 0 ? 'Digite para buscar o municipio...' : (values.uf ? 'Carregando...' : 'Selecione a UF primeiro')}
                />
                {showMunicipioList && filteredMunicipios.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 200,
                    overflowY: 'auto', background: 'white', border: '1px solid #d1d5db', borderRadius: 6,
                    zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    {filteredMunicipios.slice(0, 50).map(m => (
                      <div
                        key={m.value}
                        onClick={() => handleMunicipioSelect(m)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid #f3f4f6',
                        }}
                        onMouseEnter={e => e.target.style.background = '#f0f0ff'}
                        onMouseLeave={e => e.target.style.background = 'white'}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {values.codigoMunicipio && !showMunicipioList && (
                <small style={{ color: '#6366f1' }}>Codigo: {values.codigoMunicipio}</small>
              )}
            </label>
          </div>

          <label>
            Observacoes
            <textarea value={values.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={3} />
          </label>
        </div>

        <footer className="modal-card__footer">
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn--solid" disabled={busy}>
            {busy ? 'Salvando...' : (isEditing ? 'Salvar' : 'Criar')}
          </button>
        </footer>
      </form>
    </div>
  )
}
