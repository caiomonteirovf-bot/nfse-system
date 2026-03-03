import { useEffect, useState } from 'react'
import { fetchPrestadorConfig, updatePrestadorConfig } from '../api'
import { UF_OPTIONS } from '../lib/constants'

export default function Configuracoes({ onRefresh }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchPrestadorConfig()
      .then(data => setForm(data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      const updated = await updatePrestadorConfig(form)
      setForm(updated)
      onRefresh?.()
      setMessage('Configuracoes salvas com sucesso!')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      setMessage('Erro: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', padding: 24 }}>Carregando...</p>
  if (!form) return <p style={{ color: 'var(--danger)', padding: 24 }}>Erro ao carregar configuracoes.</p>

  return (
    <>
      <div className="page-heading">
        <h1>Configuracoes</h1>
        <p>Dados do prestador e configuracao ABRASF</p>
      </div>

      {/* Dados do Prestador */}
      <div className="panel">
        <header className="panel__header"><h3>Dados do Prestador</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <label>CNPJ *<input value={form.cnpj || ''} onChange={e => setField('cnpj', e.target.value)} /></label>
            <label>Inscricao Municipal<input value={form.inscricaoMunicipal || ''} onChange={e => setField('inscricaoMunicipal', e.target.value)} /></label>
            <label>Razao Social<input value={form.razaoSocial || ''} onChange={e => setField('razaoSocial', e.target.value)} /></label>
            <label>Nome Fantasia<input value={form.nomeFantasia || ''} onChange={e => setField('nomeFantasia', e.target.value)} /></label>
            <label>Email<input type="email" value={form.email || ''} onChange={e => setField('email', e.target.value)} /></label>
            <label>Telefone<input value={form.telefone || ''} onChange={e => setField('telefone', e.target.value)} /></label>
          </div>
        </div>
      </div>

      {/* Endereco */}
      <div className="panel">
        <header className="panel__header"><h3>Endereco</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <label>Logradouro<input value={form.logradouro || ''} onChange={e => setField('logradouro', e.target.value)} /></label>
            <label>Numero<input value={form.numero || ''} onChange={e => setField('numero', e.target.value)} /></label>
            <label>Complemento<input value={form.complemento || ''} onChange={e => setField('complemento', e.target.value)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            <label>Bairro<input value={form.bairro || ''} onChange={e => setField('bairro', e.target.value)} /></label>
            <label>Cidade<input value={form.cidade || ''} onChange={e => setField('cidade', e.target.value)} /></label>
            <label>
              UF
              <select value={form.uf || ''} onChange={e => setField('uf', e.target.value)}>
                <option value="">--</option>
                {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </label>
            <label>CEP<input value={form.cep || ''} onChange={e => setField('cep', e.target.value)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            <label>Codigo Municipio (IBGE)<input value={form.codigoMunicipio || ''} onChange={e => setField('codigoMunicipio', e.target.value)} /></label>
          </div>
        </div>
      </div>

      {/* ABRASF Config */}
      <div className="panel">
        <header className="panel__header"><h3>Configuracao ABRASF</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <label>URL Webservice<input value={form.webserviceUrl || ''} onChange={e => setField('webserviceUrl', e.target.value)} placeholder="https://nfse.prefeitura.gov.br/webservice" /></label>
            <label>
              Ambiente
              <select value={form.ambiente || 'HOMOLOGACAO'} onChange={e => setField('ambiente', e.target.value)}>
                <option value="HOMOLOGACAO">Homologacao</option>
                <option value="PRODUCAO">Producao</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10 }}>
            <label>Caminho Certificado Digital<input value={form.certificadoPath || ''} onChange={e => setField('certificadoPath', e.target.value)} placeholder="/caminho/certificado.pfx" /></label>
            <label>Senha Certificado<input type="password" value={form.certificadoSenha || ''} onChange={e => setField('certificadoSenha', e.target.value)} /></label>
          </div>
        </div>
      </div>

      {/* Defaults Servico */}
      <div className="panel">
        <header className="panel__header"><h3>Defaults de Servico</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <label>Item Lista Servico<input value={form.itemListaServicoPadrao || ''} onChange={e => setField('itemListaServicoPadrao', e.target.value)} placeholder="01.01" /></label>
            <label>Codigo CNAE<input value={form.codigoCnaePadrao || ''} onChange={e => setField('codigoCnaePadrao', e.target.value)} /></label>
            <label>Aliquota ISS Padrao (%)<input type="number" step="0.01" value={form.aliquotaIssPadrao || ''} onChange={e => setField('aliquotaIssPadrao', e.target.value)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            <label>
              Natureza Operacao
              <select value={form.naturezaOperacao || '1'} onChange={e => setField('naturezaOperacao', e.target.value)}>
                <option value="1">1 - Tributacao no municipio</option>
                <option value="2">2 - Tributacao fora do municipio</option>
                <option value="3">3 - Isencao</option>
                <option value="4">4 - Imune</option>
                <option value="5">5 - Exigibilidade suspensa por decisao judicial</option>
                <option value="6">6 - Exigibilidade suspensa por procedimento adm</option>
              </select>
            </label>
            <label>Serie RPS<input value={form.serieRps || '1'} onChange={e => setField('serieRps', e.target.value)} /></label>
            <label>Ultimo Numero RPS<input type="number" value={form.ultimoRps || '0'} onChange={e => setField('ultimoRps', e.target.value)} /></label>
          </div>
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <button className="btn btn--solid" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configuracoes'}
        </button>
        {message && (
          <span style={{ fontSize: 13, color: message.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
            {message}
          </span>
        )}
      </div>
    </>
  )
}
