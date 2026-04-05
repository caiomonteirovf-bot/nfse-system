import { useEffect, useState } from 'react'
import {
  fetchPrestadorConfig, updatePrestadorConfig, uploadCertificado,
  cadastrarEmpresaNuvem, configurarNfseNuvem, consultarCnpj,
} from '../api'
import { UF_OPTIONS } from '../lib/constants'

export default function Configuracoes({ onRefresh, clienteAtivo }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [certSenha, setCertSenha] = useState('')
  const [certMessage, setCertMessage] = useState('')
  const [uploadingCert, setUploadingCert] = useState(false)
  const [nuvemAction, setNuvemAction] = useState('')
  const [nuvemMsg, setNuvemMsg] = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjMsg, setCnpjMsg] = useState('')
  const [sociosData, setSociosData] = useState(null)

  useEffect(() => {
    fetchPrestadorConfig()
      .then(data => setForm(data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  // Quando clienteAtivo muda, pre-preenche campos do Gesthub
  useEffect(() => {
    if (!clienteAtivo || !form) return
    setForm(f => ({
      ...f,
      cnpj: clienteAtivo.document || f.cnpj,
      razaoSocial: clienteAtivo.legalName || f.razaoSocial,
      nomeFantasia: clienteAtivo.tradeName || f.nomeFantasia,
      cidade: (clienteAtivo.city && clienteAtivo.city !== '--') ? clienteAtivo.city : f.cidade,
      uf: (clienteAtivo.state && clienteAtivo.state !== '--') ? clienteAtivo.state : f.uf,
      email: clienteAtivo.email || f.email,
      telefone: clienteAtivo.phone || f.telefone,
    }))
    setSociosData(null)
    setCnpjMsg('')
  }, [clienteAtivo?.id])

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleConsultarCnpj = async () => {
    const cnpj = form?.cnpj
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      setCnpjMsg('Informe um CNPJ válido com 14 dígitos.')
      return
    }
    setCnpjLoading(true)
    setCnpjMsg('')
    setSociosData(null)
    try {
      const dados = await consultarCnpj(cnpj)
      // Preenche todos os campos do form
      setForm(f => ({
        ...f,
        cnpj: dados.cnpj || f.cnpj,
        razaoSocial: dados.razaoSocial || f.razaoSocial,
        nomeFantasia: dados.nomeFantasia || f.nomeFantasia,
        logradouro: dados.logradouro || f.logradouro,
        numero: dados.numero || f.numero,
        complemento: dados.complemento || f.complemento,
        bairro: dados.bairro || f.bairro,
        cidade: dados.cidade || f.cidade,
        uf: dados.uf || f.uf,
        cep: dados.cep || f.cep,
        codigoMunicipio: dados.codigoMunicipioIbge || dados.codigoMunicipio || f.codigoMunicipio,
        email: dados.email || f.email,
        telefone: dados.telefone || f.telefone,
        codigoCnaePadrao: dados.cnaePrincipal || f.codigoCnaePadrao,
      }))
      if (dados.socios?.length) {
        setSociosData(dados.socios)
      }
      setCnpjMsg(`Dados carregados da Receita Federal. ${dados.situacao || ''}`)
    } catch (e) {
      setCnpjMsg('Erro: ' + e.message)
    } finally {
      setCnpjLoading(false)
    }
  }

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
        <header className="panel__header">
          <h3>Dados do Prestador</h3>
          <button
            className="btn btn--ghost"
            disabled={cnpjLoading}
            onClick={handleConsultarCnpj}
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {cnpjLoading ? 'Consultando...' : 'Consultar CNPJ na Receita'}
          </button>
        </header>
        <div className="panel__body module-content">
          {cnpjMsg && (
            <p style={{ marginBottom: 10, fontSize: 13, color: cnpjMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              {cnpjMsg}
            </p>
          )}
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

      {/* Sócios (se retornado da consulta CNPJ) */}
      {sociosData && sociosData.length > 0 && (
        <div className="panel">
          <header className="panel__header">
            <h3>Quadro Societario (Receita Federal)</h3>
            <span className="badge badge--neutral">{sociosData.length} socio(s)</span>
          </header>
          <div className="panel__body module-content">
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Nome</th>
                  <th style={{ padding: '6px 8px' }}>CPF/CNPJ</th>
                  <th style={{ padding: '6px 8px' }}>Qualificacao</th>
                  <th style={{ padding: '6px 8px' }}>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {sociosData.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{s.nome}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{s.cpfCnpj || '--'}</td>
                    <td style={{ padding: '6px 8px' }}>{s.qualificacao}</td>
                    <td style={{ padding: '6px 8px' }}>{s.dataEntrada || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* Certificado Digital A1 */}
      <div className="panel">
        <header className="panel__header"><h3>Certificado Digital A1</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 13 }}>Status:</span>
            {form.certificadoStatus ? (
              <span className={`badge badge--${form.certificadoStatus === 'NO_PRAZO' ? 'success' : form.certificadoStatus === 'A_VENCER' ? 'warning' : 'danger'}`}>
                {form.certificadoStatus === 'NO_PRAZO' ? 'Valido' : form.certificadoStatus === 'A_VENCER' ? 'A Vencer' : 'Vencido'}
              </span>
            ) : (
              <span className="badge badge--neutral">{form.certificadoCarregado ? 'Carregado' : 'Nao configurado'}</span>
            )}
            {form.certificadoCnpj && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>CNPJ: {form.certificadoCnpj}</span>}
            {form.certificadoValidade && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Validade: {new Date(form.certificadoValidade).toLocaleDateString('pt-BR')}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
            <label>
              Arquivo .pfx
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = () => {
                      const b64 = reader.result.split(',')[1]
                      window.__pfxBase64 = b64
                    }
                    reader.readAsDataURL(file)
                  }
                }}
              />
            </label>
            <label>
              Senha
              <input type="password" value={certSenha} onChange={e => setCertSenha(e.target.value)} placeholder="Senha do certificado" />
            </label>
            <button
              className="btn btn--solid"
              disabled={uploadingCert}
              onClick={async () => {
                const b64 = window.__pfxBase64
                if (!b64) return setCertMessage('Selecione um arquivo .pfx')
                setUploadingCert(true)
                setCertMessage('')
                try {
                  const result = await uploadCertificado(b64, certSenha)
                  if (result.ok) {
                    setCertMessage(`Certificado carregado! CNPJ: ${result.data?.cnpj || ''} - Validade: ${result.data?.validade || ''}`)
                    const updated = await fetchPrestadorConfig()
                    setForm(updated)
                  } else {
                    setCertMessage('Erro: ' + (result.error || 'Falha no upload'))
                  }
                } catch (e) {
                  setCertMessage('Erro: ' + e.message)
                } finally {
                  setUploadingCert(false)
                }
              }}
            >
              {uploadingCert ? 'Enviando...' : 'Enviar Certificado'}
            </button>
          </div>
          {certMessage && (
            <p style={{ marginTop: 8, fontSize: 13, color: certMessage.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              {certMessage}
            </p>
          )}
        </div>
      </div>

      {/* Nuvem Fiscal */}
      <div className="panel">
        <header className="panel__header">
          <h3>Nuvem Fiscal API</h3>
          {form.nuvemFiscalConfigurado
            ? <span className="badge badge--success">Configurado</span>
            : <span className="badge badge--neutral">Nao configurado</span>
          }
        </header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label>Client ID *<input value={form.nuvemFiscalClientId || ''} onChange={e => setField('nuvemFiscalClientId', e.target.value)} placeholder="Ex: QwqDuz7RmpzWGmZKv6Wo" /></label>
            <label>Client Secret *<input type="password" value={form.nuvemFiscalClientSecret || ''} onChange={e => setField('nuvemFiscalClientSecret', e.target.value)} placeholder="Secret" /></label>
            <label>
              Ambiente
              <select value={form.nuvemFiscalAmbiente || 'homologacao'} onChange={e => setField('nuvemFiscalAmbiente', e.target.value)}>
                <option value="homologacao">Homologacao (Sandbox)</option>
                <option value="producao">Producao</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn--ghost"
              disabled={!!nuvemAction || !form.nuvemFiscalClientId}
              onClick={async () => {
                setNuvemAction('cadastrando')
                setNuvemMsg('')
                try {
                  const r = await cadastrarEmpresaNuvem()
                  setNuvemMsg(r.ok ? 'Empresa cadastrada na Nuvem Fiscal!' : 'Erro: ' + (r.error || 'Falha'))
                } catch (e) { setNuvemMsg('Erro: ' + e.message) }
                finally { setNuvemAction('') }
              }}
            >{nuvemAction === 'cadastrando' ? 'Cadastrando...' : 'Cadastrar Empresa'}</button>
            <button
              className="btn btn--ghost"
              disabled={!!nuvemAction || !form.nuvemFiscalClientId}
              onClick={async () => {
                setNuvemAction('configurando')
                setNuvemMsg('')
                try {
                  const r = await configurarNfseNuvem()
                  setNuvemMsg(r.ok ? 'NFS-e configurada!' : 'Erro: ' + (r.error || 'Falha'))
                } catch (e) { setNuvemMsg('Erro: ' + e.message) }
                finally { setNuvemAction('') }
              }}
            >{nuvemAction === 'configurando' ? 'Configurando...' : 'Configurar NFS-e'}</button>
          </div>
          {nuvemMsg && (
            <p style={{ marginTop: 8, fontSize: 13, color: nuvemMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
              {nuvemMsg}
            </p>
          )}
        </div>
      </div>

      {/* NFS-e Nacional */}
      <div className="panel">
        <header className="panel__header"><h3>NFS-e Nacional (API direta)</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>URL SEFIN<input value={form.nfseNacionalUrl || ''} onChange={e => setField('nfseNacionalUrl', e.target.value)} placeholder="https://sefin.nfse.gov.br/SefinNacional" /></label>
            <label>URL ADN<input value={form.adnUrl || ''} onChange={e => setField('adnUrl', e.target.value)} placeholder="https://adn.nfse.gov.br" /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            <label>Ultimo NSU<input type="number" value={form.ultimoNsu || 0} onChange={e => setField('ultimoNsu', e.target.value)} /></label>
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
