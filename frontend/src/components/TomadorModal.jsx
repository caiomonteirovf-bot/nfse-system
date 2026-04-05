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
  const [cnpjStatus, setCnpjStatus] = useState('')
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
    setMunicipioSearch('')
    setShowMunicipioList(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!values.cpfCnpj?.replace(/\D/g, '')) return setError('Preencha o campo: CNPJ/CPF')
    if (!values.razaoSocial?.trim()) return setError('Preencha o campo: Razao Social')
    setError('')
    await onSubmit(values)
  }

  const isEditing = !!record

  // Estilos inline para não conflitar com o CSS global do modal-card__body
  const row = { display: 'grid', gap: 12, marginBottom: 12 }
  const row2 = { ...row, gridTemplateColumns: '1fr 1fr' }
  const row21 = { ...row, gridTemplateColumns: '2fr 1fr' }
  const lbl = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b7280)' }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={handleSubmit} style={{ maxWidth: 640 }}>
        <header className="modal-card__header">
          <h3>{isEditing ? 'Editar Tomador' : 'Novo Tomador'}</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>Fechar</button>
        </header>

        {/* Override: display block em vez do grid 2-col do CSS global */}
        <div className="modal-card__body" style={{ display: 'block', padding: '16px 20px' }}>

          {/* CNPJ + Razão Social */}
          <div style={row2}>
            <label style={lbl}>
              CNPJ/CPF <span className="required">*</span>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={values.cpfCnpj || ''}
                  onChange={e => set('cpfCnpj', e.target.value)}
                  onBlur={handleCnpjBlur}
                  placeholder="Digite o CNPJ e clique fora"
                  style={cnpjStatus === 'found' ? { borderColor: '#22c55e' } : cnpjStatus === 'error' ? { borderColor: '#ef4444' } : {}}
                />
                {cnpjLoading && (
                  <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#6366f1' }}>
                    Buscando...
                  </span>
                )}
              </div>
              {cnpjStatus === 'found' && <small style={{ color: '#22c55e', fontWeight: 400 }}>Dados preenchidos da Receita Federal</small>}
              {cnpjStatus === 'error' && <small style={{ color: '#ef4444', fontWeight: 400 }}>CNPJ nao encontrado na Receita</small>}
            </label>
            <label style={lbl}>
              Razao Social <span className="required">*</span>
              <input type="text" value={values.razaoSocial || ''} onChange={e => set('razaoSocial', e.target.value)} />
            </label>
          </div>

          {/* Nome Fantasia + E-mail */}
          <div style={row2}>
            <label style={lbl}>
              Nome Fantasia
              <input type="text" value={values.nomeFantasia || ''} onChange={e => set('nomeFantasia', e.target.value)} />
            </label>
            <label style={lbl}>
              E-mail
              <input type="email" value={values.email || ''} onChange={e => set('email', e.target.value)} />
            </label>
          </div>

          {/* Telefone + Inscrição Municipal */}
          <div style={row2}>
            <label style={lbl}>
              Telefone
              <input type="text" value={values.telefone || ''} onChange={e => set('telefone', e.target.value)} />
            </label>
            <label style={lbl}>
              Inscricao Municipal
              <input type="text" value={values.inscricaoMunicipal || ''} onChange={e => set('inscricaoMunicipal', e.target.value)} />
            </label>
          </div>

          {/* Logradouro + Número */}
          <div style={row21}>
            <label style={lbl}>
              Logradouro
              <input type="text" value={values.logradouro || ''} onChange={e => set('logradouro', e.target.value)} />
            </label>
            <label style={lbl}>
              Numero
              <input type="text" value={values.numeroEndereco || ''} onChange={e => set('numeroEndereco', e.target.value)} />
            </label>
          </div>

          {/* Complemento + Bairro */}
          <div style={row2}>
            <label style={lbl}>
              Complemento
              <input type="text" value={values.complemento || ''} onChange={e => set('complemento', e.target.value)} />
            </label>
            <label style={lbl}>
              Bairro
              <input type="text" value={values.bairro || ''} onChange={e => set('bairro', e.target.value)} />
            </label>
          </div>

          {/* Cidade + UF */}
          <div style={row2}>
            <label style={lbl}>
              Cidade
              <input type="text" value={values.cidade || ''} onChange={e => set('cidade', e.target.value)} />
            </label>
            <label style={lbl}>
              UF
              <select value={values.uf || ''} onChange={e => set('uf', e.target.value)}>
                <option value="">-- Selecione --</option>
                {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
          </div>

          {/* CEP + IBGE */}
          <div style={row2}>
            <label style={lbl}>
              CEP
              <input type="text" value={values.cep || ''} onChange={e => set('cep', e.target.value)} />
            </label>
            <label style={lbl}>
              Codigo Municipio (IBGE)
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={showMunicipioList ? municipioSearch : (values.codigoMunicipio || '')}
                  onChange={e => {
                    if (showMunicipioList) {
                      setMunicipioSearch(e.target.value)
                    } else {
                      set('codigoMunicipio', e.target.value)
                    }
                  }}
                  onFocus={() => {
                    if (municipios.length > 0) {
                      setShowMunicipioList(true)
                      setMunicipioSearch('')
                    }
                  }}
                  onBlur={() => setTimeout(() => setShowMunicipioList(false), 200)}
                  placeholder={municipios.length > 0 ? 'Buscar municipio...' : (values.uf ? 'Carregando...' : 'Selecione a UF')}
                />
                {showMunicipioList && filteredMunicipios.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 180,
                    overflowY: 'auto', background: 'white', border: '1px solid var(--border, #d1d5db)',
                    borderRadius: 6, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                  }}>
                    {filteredMunicipios.slice(0, 30).map(m => (
                      <div
                        key={m.value}
                        onMouseDown={() => handleMunicipioSelect(m)}
                        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}
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
                <small style={{ color: '#6366f1', fontWeight: 400 }}>Codigo: {values.codigoMunicipio}</small>
              )}
            </label>
          </div>

          {/* Observações */}
          <div style={{ ...row, gridTemplateColumns: '1fr' }}>
            <label style={lbl}>
              Observacoes
              <textarea value={values.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={3} />
            </label>
          </div>
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
