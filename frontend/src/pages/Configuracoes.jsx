import { useEffect, useState, useCallback } from 'react'
import {
  fetchPrestadorConfig, updatePrestadorConfig,
  fetchEmpresas, createEmpresa, updateEmpresa, deleteEmpresa, fetchEmpresaByCnpj,
  cadastrarEmpresaNuvemPorId, configurarNfsePorId, uploadCertificadoPorId,
  consultarCnpj, fetchClienteByCnpj, fetchBootstrap,
} from '../api'
import { UF_OPTIONS } from '../lib/constants'

const EMPTY_EMPRESA = {
  cnpj: '', razaoSocial: '', nomeFantasia: '',
  logradouro: '', numeroEndereco: '', complemento: '', bairro: '',
  cidade: '', uf: '', cep: '', codigoMunicipio: '',
  email: '', telefone: '', inscricaoMunicipal: '',
  itemListaServico: '', codigoCnae: '', codigoTributacao: '',
  aliquotaIssPadrao: 0, optanteSimples: false, regimeEspecial: 0, incentivoFiscal: false,
  observacoes: '',
}

export default function Configuracoes({ onRefresh, clienteAtivo }) {
  // Global OAuth (PrestadorConfig)
  const [oauth, setOauth] = useState(null)
  const [oauthLoading, setOauthLoading] = useState(true)
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthMsg, setOauthMsg] = useState('')

  // Empresas list
  const [empresas, setEmpresas] = useState([])
  const [empresasLoading, setEmpresasLoading] = useState(true)

  // Selected empresa for editing
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // New empresa
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ ...EMPTY_EMPRESA })
  const [creating, setCreating] = useState(false)

  // CNPJ lookup
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjMsg, setCnpjMsg] = useState('')
  const [sociosData, setSociosData] = useState(null)

  // Cert upload
  const [certSenha, setCertSenha] = useState('')
  const [certMsg, setCertMsg] = useState('')
  const [uploadingCert, setUploadingCert] = useState(false)

  // Nuvem Fiscal actions
  const [nuvemAction, setNuvemAction] = useState('')
  const [nuvemMsg, setNuvemMsg] = useState('')

  // Load OAuth config
  useEffect(() => {
    fetchPrestadorConfig()
      .then(data => setOauth(data))
      .catch(e => console.error(e))
      .finally(() => setOauthLoading(false))
  }, [])

  // Load empresas
  const loadEmpresas = useCallback(async () => {
    setEmpresasLoading(true)
    try {
      const data = await fetchEmpresas()
      setEmpresas(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setEmpresasLoading(false)
    }
  }, [])

  useEffect(() => { loadEmpresas() }, [loadEmpresas])

  // When clienteAtivo changes, select matching empresa or auto-open new form
  // Merges: Gesthub (cadastral) + Receita Federal (email/tel/socios) + PrestadorConfig (tributacao)
  useEffect(() => {
    if (!clienteAtivo?.document) return
    const doc = clienteAtivo.document.replace(/\D/g, '')

    if (empresas.length > 0) {
      const match = empresas.find(e => e.cnpj === doc)
      if (match) {
        setSelectedId(match.id)
        setForm({ ...match })
        setShowNew(false)
        return
      }
    }

    // Empresa nao cadastrada — montar form com dados de 3 fontes
    setSelectedId(null)
    setForm(null)

    const buildForm = async () => {
      const base = { ...EMPTY_EMPRESA, cnpj: doc }

      // 1. Gesthub (fonte master — cadastral)
      try {
        const gh = await fetchClienteByCnpj(clienteAtivo.document)
        if (gh) {
          Object.assign(base, {
            razaoSocial: gh.legalName || '',
            nomeFantasia: gh.tradeName || '',
            logradouro: gh.logradouro || '',
            numeroEndereco: gh.numeroEndereco || '',
            complemento: gh.complemento || '',
            bairro: gh.bairro || '',
            cidade: gh.city || '',
            uf: gh.state || '',
            cep: gh.cep || '',
            codigoMunicipio: gh.codigoMunicipioIbge || '',
            email: gh.email || '',
            telefone: gh.phone || '',
            inscricaoMunicipal: gh.inscricaoMunicipal || '',
            codigoCnae: gh.cnaePrincipal || '',
            gesthubClientId: gh.id || null,
            optanteSimples: (gh.taxRegime || '').toUpperCase().includes('SIMPLES'),
          })
        }
      } catch { /* Gesthub indisponivel */ }

      // 2. Receita Federal (complementa email, telefone, socios, endereco faltante)
      try {
        const rf = await consultarCnpj(doc)
        if (rf) {
          if (!base.email) base.email = rf.email || ''
          if (!base.telefone) base.telefone = rf.telefone || ''
          if (!base.nomeFantasia) base.nomeFantasia = rf.nomeFantasia || ''
          if (!base.logradouro) base.logradouro = rf.logradouro || ''
          if (!base.numeroEndereco) base.numeroEndereco = rf.numero || ''
          if (!base.complemento) base.complemento = rf.complemento || ''
          if (!base.bairro) base.bairro = rf.bairro || ''
          if (!base.cidade) base.cidade = rf.cidade || ''
          if (!base.uf) base.uf = rf.uf || ''
          if (!base.cep) base.cep = rf.cep || ''
          if (!base.codigoMunicipio) base.codigoMunicipio = rf.codigoMunicipioIbge || ''
          if (!base.codigoCnae) base.codigoCnae = rf.cnaePrincipal || ''
          if (rf.optanteSimples !== undefined) base.optanteSimples = rf.optanteSimples
          if (rf.socios?.length) setSociosData(rf.socios)
        }
      } catch { /* RF indisponivel */ }

      // 3. PrestadorConfig (recupera tributacao ja configurada anteriormente)
      if (oauth) {
        if (!base.inscricaoMunicipal && oauth.inscricaoMunicipal) base.inscricaoMunicipal = oauth.inscricaoMunicipal
        if (!base.itemListaServico && oauth.itemListaServicoPadrao) base.itemListaServico = oauth.itemListaServicoPadrao
        if (!base.codigoTributacao && oauth.codigoTributacao) base.codigoTributacao = oauth.codigoTributacao
        if (!base.codigoCnae && oauth.codigoCnaePadrao) base.codigoCnae = oauth.codigoCnaePadrao
        if (!base.aliquotaIssPadrao && oauth.aliquotaIssPadrao) base.aliquotaIssPadrao = oauth.aliquotaIssPadrao
        if (oauth.optanteSimples !== undefined && !base.optanteSimples) base.optanteSimples = oauth.optanteSimples
      }

      // Fallback: dados basicos do seletor
      if (!base.razaoSocial) base.razaoSocial = clienteAtivo.legalName || ''
      if (!base.nomeFantasia) base.nomeFantasia = clienteAtivo.tradeName || ''
      if (!base.cidade) base.cidade = clienteAtivo.city || ''
      if (!base.uf) base.uf = clienteAtivo.state || ''

      setNewForm(base)
      setShowNew(true)
      setCnpjMsg('Dados pre-preenchidos (Gesthub + Receita Federal + Config anterior)')
    }

    buildForm()
  }, [clienteAtivo?.document, empresas]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectEmpresa = (emp) => {
    setSelectedId(emp.id)
    setForm({ ...emp })
    setShowNew(false)
    setCnpjMsg('')
    setSociosData(null)
    setCertMsg('')
    setNuvemMsg('')
    setMessage('')
  }

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setNewField = (key, val) => setNewForm(f => ({ ...f, [key]: val }))

  // ---- OAuth Save ----
  const handleSaveOauth = async () => {
    setOauthSaving(true)
    setOauthMsg('')
    try {
      const updated = await updatePrestadorConfig(oauth)
      setOauth(updated)
      onRefresh?.()
      setOauthMsg('Credenciais salvas!')
      setTimeout(() => setOauthMsg(''), 3000)
    } catch (e) {
      setOauthMsg('Erro: ' + e.message)
    } finally {
      setOauthSaving(false)
    }
  }

  // ---- Buscar CEP via ViaCEP ----
  const buscarCep = async (cep, setTargetForm) => {
    const clean = (cep || '').replace(/\D/g, '')
    if (clean.length !== 8) return
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
      const data = await resp.json()
      if (data.erro) return
      setTargetForm(f => ({
        ...f,
        logradouro: data.logradouro || f.logradouro,
        bairro: data.bairro || f.bairro,
        cidade: data.localidade || f.cidade,
        uf: data.uf || f.uf,
        complemento: data.complemento || f.complemento,
        codigoMunicipio: data.ibge || f.codigoMunicipio,
      }))
    } catch { /* ViaCEP indisponivel */ }
  }

  // ---- Consultar CNPJ (Gesthub primeiro, depois Receita Federal) ----
  const handleConsultarCnpj = async (targetForm, setTargetForm) => {
    const cnpj = targetForm?.cnpj
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      setCnpjMsg('Informe um CNPJ valido com 14 digitos.')
      return
    }
    setCnpjLoading(true)
    setCnpjMsg('')
    setSociosData(null)
    try {
      // 1. Buscar no Gesthub primeiro (dados completos do cliente)
      let gesthubData = null
      try {
        gesthubData = await fetchClienteByCnpj(cnpj)
      } catch { /* Gesthub indisponivel */ }

      if (gesthubData) {
        setTargetForm(f => ({
          ...f,
          cnpj: (gesthubData.document || '').replace(/\D/g, '') || f.cnpj,
          razaoSocial: gesthubData.legalName || f.razaoSocial,
          nomeFantasia: gesthubData.tradeName || f.nomeFantasia,
          logradouro: gesthubData.logradouro || f.logradouro,
          numeroEndereco: gesthubData.numeroEndereco || f.numeroEndereco,
          complemento: gesthubData.complemento || f.complemento,
          bairro: gesthubData.bairro || f.bairro,
          cidade: gesthubData.city || f.cidade,
          uf: gesthubData.state || f.uf,
          cep: gesthubData.cep || f.cep,
          codigoMunicipio: gesthubData.codigoMunicipioIbge || f.codigoMunicipio,
          email: gesthubData.email || f.email,
          telefone: gesthubData.phone || f.telefone,
          codigoCnae: gesthubData.cnaePrincipal || f.codigoCnae,
          inscricaoMunicipal: gesthubData.inscricaoMunicipal || f.inscricaoMunicipal,
          gesthubClientId: gesthubData.id || f.gesthubClientId,
        }))
        setCnpjMsg(`Dados carregados do Gesthub: ${gesthubData.legalName || ''}`)

        // 2. Complementar com Receita Federal (socios, email, telefone, dados faltantes)
        try {
          const rf = await consultarCnpj(cnpj)
          setTargetForm(f => ({
            ...f,
            email: f.email || rf.email || '',
            telefone: f.telefone || rf.telefone || '',
            nomeFantasia: f.nomeFantasia || rf.nomeFantasia || '',
            logradouro: f.logradouro || rf.logradouro || '',
            numeroEndereco: f.numeroEndereco || rf.numero || '',
            complemento: f.complemento || rf.complemento || '',
            bairro: f.bairro || rf.bairro || '',
            cidade: f.cidade || rf.cidade || '',
            uf: f.uf || rf.uf || '',
            cep: f.cep || rf.cep || '',
            codigoMunicipio: f.codigoMunicipio || rf.codigoMunicipioIbge || '',
            codigoCnae: f.codigoCnae || rf.cnaePrincipal || '',
          }))
          if (rf.socios?.length) setSociosData(rf.socios)
          setCnpjMsg(`Dados do Gesthub + Receita Federal. ${rf.situacao || ''}`)
        } catch { /* RF indisponivel, já temos os dados do Gesthub */ }
      } else {
        // Não encontrou no Gesthub — busca só na Receita Federal
        const dados = await consultarCnpj(cnpj)
        setTargetForm(f => ({
          ...f,
          cnpj: dados.cnpj || f.cnpj,
          razaoSocial: dados.razaoSocial || f.razaoSocial,
          nomeFantasia: dados.nomeFantasia || f.nomeFantasia,
          logradouro: dados.logradouro || f.logradouro,
          numeroEndereco: dados.numero || f.numeroEndereco,
          complemento: dados.complemento || f.complemento,
          bairro: dados.bairro || f.bairro,
          cidade: dados.cidade || f.cidade,
          uf: dados.uf || f.uf,
          cep: dados.cep || f.cep,
          codigoMunicipio: dados.codigoMunicipioIbge || dados.codigoMunicipio || f.codigoMunicipio,
          email: dados.email || f.email,
          telefone: dados.telefone || f.telefone,
          codigoCnae: dados.cnaePrincipal || f.codigoCnae,
        }))
        if (dados.socios?.length) setSociosData(dados.socios)
        setCnpjMsg(`Dados carregados da Receita Federal (nao encontrado no Gesthub). ${dados.situacao || ''}`)
      }
    } catch (e) {
      setCnpjMsg('Erro: ' + e.message)
    } finally {
      setCnpjLoading(false)
    }
  }

  // ---- Create Empresa ----
  const handleCreateEmpresa = async () => {
    if (!newForm.cnpj || newForm.cnpj.replace(/\D/g, '').length !== 14) {
      return setMessage('CNPJ obrigatorio (14 digitos).')
    }
    setCreating(true)
    setMessage('')
    try {
      const created = await createEmpresa(newForm)
      await loadEmpresas()
      selectEmpresa(created)
      setNewForm({ ...EMPTY_EMPRESA })
      setShowNew(false)
      setMessage('Empresa criada com sucesso!')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      setMessage('Erro: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  // ---- Update Empresa ----
  const handleSaveEmpresa = async () => {
    if (!selectedId || !form) return
    setSaving(true)
    setMessage('')
    try {
      const updated = await updateEmpresa(selectedId, form)
      setForm(updated)
      await loadEmpresas()
      onRefresh?.()
      setMessage('Configuracao salva!')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      setMessage('Erro: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ---- Delete Empresa ----
  const handleDeleteEmpresa = async () => {
    if (!selectedId) return
    if (!confirm('Excluir esta empresa? Acao irreversivel.')) return
    try {
      await deleteEmpresa(selectedId)
      setSelectedId(null)
      setForm(null)
      await loadEmpresas()
      setMessage('Empresa excluida.')
    } catch (e) {
      setMessage('Erro: ' + e.message)
    }
  }

  // ---- Nuvem Fiscal actions ----
  const handleCadastrar = async () => {
    if (!selectedId) return
    setNuvemAction('cadastrando')
    setNuvemMsg('')
    try {
      const r = await cadastrarEmpresaNuvemPorId(selectedId)
      setNuvemMsg(r.ok ? 'Empresa cadastrada na Nuvem Fiscal!' : 'Erro: ' + (r.error || 'Falha'))
      if (r.ok) {
        setForm(f => ({ ...f, nuvemFiscalCadastrada: true }))
        await loadEmpresas()
      }
    } catch (e) { setNuvemMsg('Erro: ' + e.message) }
    finally { setNuvemAction('') }
  }

  const handleConfigurarNfse = async () => {
    if (!selectedId) return
    setNuvemAction('configurando')
    setNuvemMsg('')
    try {
      const r = await configurarNfsePorId(selectedId)
      setNuvemMsg(r.ok ? 'NFS-e configurada!' : 'Erro: ' + (r.error || 'Falha'))
      if (r.ok) {
        setForm(f => ({ ...f, nuvemFiscalNfseConfig: true }))
        await loadEmpresas()
      }
    } catch (e) { setNuvemMsg('Erro: ' + e.message) }
    finally { setNuvemAction('') }
  }

  const handleUploadCert = async () => {
    if (!selectedId) return
    const b64 = window.__pfxBase64
    if (!b64) return setCertMsg('Selecione um arquivo .pfx')
    if (!certSenha) return setCertMsg('Informe a senha do certificado')
    setUploadingCert(true)
    setCertMsg('')
    try {
      const r = await uploadCertificadoPorId(selectedId, b64, certSenha)
      if (r.ok) {
        setCertMsg('Certificado enviado com sucesso!')
        await loadEmpresas()
        // Recarregar dados completos da empresa (inclui cert info)
        try {
          const { data: fresh } = await fetchEmpresaByCnpj(form.cnpj)
          if (fresh) setForm({ ...fresh })
          else setForm(f => ({ ...f, nuvemFiscalCertificado: true, certificadoCarregado: true }))
        } catch {
          setForm(f => ({ ...f, nuvemFiscalCertificado: true, certificadoCarregado: true }))
        }
      } else {
        setCertMsg('Erro: ' + (r.error || 'Falha'))
      }
    } catch (e) { setCertMsg('Erro: ' + e.message) }
    finally { setUploadingCert(false) }
  }

  // ---- Status helpers ----
  const statusBadge = (ok, labelOk, labelNo) => (
    <span className={`badge badge--${ok ? 'success' : 'neutral'}`} style={{ fontSize: 10 }}>
      {ok ? labelOk : labelNo}
    </span>
  )

  const empresaStatus = (emp) => {
    const steps = [
      emp.nuvemFiscalCadastrada,
      emp.nuvemFiscalNfseConfig,
      emp.nuvemFiscalCertificado,
    ]
    const done = steps.filter(Boolean).length
    return done === 3 ? 'success' : done > 0 ? 'warning' : 'neutral'
  }

  if (oauthLoading) return <p style={{ color: 'var(--text-muted)', padding: 24 }}>Carregando...</p>

  return (
    <>
      <div className="page-heading">
        <h1>Configuracoes</h1>
        <p>Credenciais globais e configuracao por empresa</p>
      </div>

      {/* ============================================ */}
      {/* CREDENCIAIS GLOBAIS (Nuvem Fiscal OAuth)     */}
      {/* ============================================ */}
      <div className="panel">
        <header className="panel__header">
          <h3>Nuvem Fiscal — Credenciais Globais</h3>
          {oauth?.nuvemFiscalConfigurado
            ? <span className="badge badge--success">Configurado</span>
            : <span className="badge badge--neutral">Nao configurado</span>
          }
        </header>
        <div className="panel__body module-content">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Credenciais OAuth2 da sua conta Nuvem Fiscal. Compartilhadas entre todas as empresas.
          </p>
          {oauth && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label>Client ID *<input value={oauth.nuvemFiscalClientId || ''} onChange={e => setOauth(f => ({ ...f, nuvemFiscalClientId: e.target.value }))} /></label>
                <label>Client Secret *<input type="password" value={oauth.nuvemFiscalClientSecret || ''} onChange={e => setOauth(f => ({ ...f, nuvemFiscalClientSecret: e.target.value }))} /></label>
                <label>
                  Ambiente
                  <select value={oauth.nuvemFiscalAmbiente || 'homologacao'} onChange={e => setOauth(f => ({ ...f, nuvemFiscalAmbiente: e.target.value }))}>
                    <option value="homologacao">Homologacao (Sandbox)</option>
                    <option value="producao">Producao</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <button className="btn btn--solid" onClick={handleSaveOauth} disabled={oauthSaving}>
                  {oauthSaving ? 'Salvando...' : 'Salvar Credenciais'}
                </button>
                {oauthMsg && (
                  <span style={{ fontSize: 13, color: oauthMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                    {oauthMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* LISTA DE EMPRESAS                           */}
      {/* ============================================ */}
      <div className="panel">
        <header className="panel__header">
          <h3>Empresas Cadastradas</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge--neutral">{empresas.length} empresa(s)</span>
            <button className="btn btn--solid" onClick={() => { setShowNew(true); setSelectedId(null); setForm(null); setCnpjMsg(''); setSociosData(null) }} style={{ fontSize: 12, padding: '4px 12px' }}>
              + Nova Empresa
            </button>
          </div>
        </header>
        <div className="panel__body module-content">
          {empresasLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>
          ) : empresas.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma empresa cadastrada. Adicione a primeira.</p>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Empresa</th>
                  <th style={{ padding: '8px' }}>CNPJ</th>
                  <th style={{ padding: '8px' }}>Inscr. Municipal</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Cadastrada</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>NFS-e Config</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Certificado</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(emp => (
                  <tr
                    key={emp.id}
                    onClick={() => selectEmpresa(emp)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedId === emp.id ? 'var(--surface-alt, rgba(99,102,241,.08))' : 'transparent',
                      transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (selectedId !== emp.id) e.currentTarget.style.background = 'var(--surface-alt, rgba(0,0,0,.02))' }}
                    onMouseLeave={e => { if (selectedId !== emp.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '8px', fontWeight: 500 }}>{emp.razaoSocial || emp.nomeFantasia || '--'}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}>{emp.cnpj}</td>
                    <td style={{ padding: '8px' }}>{emp.inscricaoMunicipal || '--'}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{statusBadge(emp.nuvemFiscalCadastrada, 'Sim', 'Nao')}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{statusBadge(emp.nuvemFiscalNfseConfig, 'Sim', 'Nao')}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{statusBadge(emp.nuvemFiscalCertificado || emp.certificadoCarregado, 'Sim', 'Nao')}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span className={`badge badge--${empresaStatus(emp)}`} style={{ fontSize: 10 }}>
                        {empresaStatus(emp) === 'success' ? 'Pronto' : empresaStatus(emp) === 'warning' ? 'Parcial' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* NOVA EMPRESA                                */}
      {/* ============================================ */}
      {showNew && (
        <div className="panel" style={{ borderLeft: '3px solid var(--primary, #6366f1)' }}>
          <header className="panel__header">
            <h3>Nova Empresa</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn--ghost"
                disabled={cnpjLoading}
                onClick={() => handleConsultarCnpj(newForm, setNewForm)}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                {cnpjLoading ? 'Consultando...' : 'Consultar CNPJ'}
              </button>
              <button className="btn btn--ghost" onClick={() => setShowNew(false)} style={{ fontSize: 12, padding: '4px 12px' }}>Cancelar</button>
            </div>
          </header>
          <div className="panel__body module-content">
            {cnpjMsg && (
              <p style={{ marginBottom: 10, fontSize: 13, color: cnpjMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{cnpjMsg}</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <label>CNPJ *<input value={newForm.cnpj} onChange={e => {
                const v = e.target.value
                setNewField('cnpj', v)
                if (v.replace(/\D/g, '').length === 14) {
                  // Auto-buscar ao digitar 14 digitos
                  setTimeout(() => handleConsultarCnpj({ ...newForm, cnpj: v }, setNewForm), 100)
                }
              }} placeholder="00.000.000/0000-00" /></label>
              <label>Razao Social<input value={newForm.razaoSocial} onChange={e => setNewField('razaoSocial', e.target.value)} /></label>
              <label>Nome Fantasia<input value={newForm.nomeFantasia} onChange={e => setNewField('nomeFantasia', e.target.value)} /></label>
              <label>Inscricao Municipal<input value={newForm.inscricaoMunicipal} onChange={e => setNewField('inscricaoMunicipal', e.target.value)} /></label>
              <label>Email<input value={newForm.email} onChange={e => setNewField('email', e.target.value)} /></label>
              <label>Telefone<input value={newForm.telefone} onChange={e => setNewField('telefone', e.target.value)} /></label>
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Endereco</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <label>Logradouro<input value={newForm.logradouro} onChange={e => setNewField('logradouro', e.target.value)} /></label>
              <label>Numero<input value={newForm.numeroEndereco} onChange={e => setNewField('numeroEndereco', e.target.value)} /></label>
              <label>Complemento<input value={newForm.complemento} onChange={e => setNewField('complemento', e.target.value)} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
              <label>Bairro<input value={newForm.bairro} onChange={e => setNewField('bairro', e.target.value)} /></label>
              <label>Cidade<input value={newForm.cidade} onChange={e => setNewField('cidade', e.target.value)} /></label>
              <label>
                UF
                <select value={newForm.uf} onChange={e => setNewField('uf', e.target.value)}>
                  <option value="">--</option>
                  {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </label>
              <label>CEP<input value={newForm.cep} onChange={e => {
                const v = e.target.value
                setNewField('cep', v)
                if (v.replace(/\D/g, '').length === 8) buscarCep(v, setNewForm)
              }} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
              <label>Codigo Municipio (IBGE)<input value={newForm.codigoMunicipio} onChange={e => setNewField('codigoMunicipio', e.target.value)} /></label>
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Tributacao</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <label>Item Lista Servico (cTribMun)<input value={newForm.itemListaServico} onChange={e => setNewField('itemListaServico', e.target.value)} placeholder="Ex: 901" /></label>
              <label>Codigo CNAE<input value={newForm.codigoCnae} onChange={e => setNewField('codigoCnae', e.target.value)} /></label>
              <label>Codigo Tributacao (cTribNac)<input value={newForm.codigoTributacao} onChange={e => setNewField('codigoTributacao', e.target.value)} /></label>
              <label>Aliquota ISS Padrao (%)<input type="number" step="0.01" value={newForm.aliquotaIssPadrao} onChange={e => setNewField('aliquotaIssPadrao', e.target.value)} /></label>
              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                <input type="checkbox" checked={newForm.optanteSimples} onChange={e => setNewField('optanteSimples', e.target.checked)} style={{ width: 16, height: 16 }} />
                Optante Simples Nacional
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <button className="btn btn--solid" onClick={handleCreateEmpresa} disabled={creating}>
                {creating ? 'Criando...' : 'Cadastrar Empresa'}
              </button>
              {message && (
                <span style={{ fontSize: 13, color: message.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{message}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Socios (se retornado da consulta CNPJ) */}
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

      {/* ============================================ */}
      {/* DETALHES DA EMPRESA SELECIONADA              */}
      {/* ============================================ */}
      {selectedId && form && (
        <>
          {/* Dados da Empresa */}
          <div className="panel" style={{ borderLeft: '3px solid var(--primary, #6366f1)' }}>
            <header className="panel__header">
              <h3>{form.razaoSocial || form.nomeFantasia || 'Empresa'}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn--ghost"
                  disabled={cnpjLoading}
                  onClick={() => handleConsultarCnpj(form, setForm)}
                  style={{ fontSize: 12, padding: '4px 12px' }}
                >
                  {cnpjLoading ? 'Consultando...' : 'Consultar CNPJ'}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={handleDeleteEmpresa}
                  style={{ fontSize: 12, padding: '4px 12px', color: 'var(--danger)' }}
                >
                  Excluir
                </button>
              </div>
            </header>
            <div className="panel__body module-content">
              {cnpjMsg && (
                <p style={{ marginBottom: 10, fontSize: 13, color: cnpjMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{cnpjMsg}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label>CNPJ<input value={form.cnpj || ''} disabled style={{ opacity: 0.6 }} /></label>
                <label>Razao Social<input value={form.razaoSocial || ''} onChange={e => setField('razaoSocial', e.target.value)} /></label>
                <label>Nome Fantasia<input value={form.nomeFantasia || ''} onChange={e => setField('nomeFantasia', e.target.value)} /></label>
                <label>Inscricao Municipal *<input value={form.inscricaoMunicipal || ''} onChange={e => setField('inscricaoMunicipal', e.target.value)} /></label>
                <label>Email<input value={form.email || ''} onChange={e => setField('email', e.target.value)} /></label>
                <label>Telefone<input value={form.telefone || ''} onChange={e => setField('telefone', e.target.value)} /></label>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Endereco</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <label>Logradouro<input value={form.logradouro || ''} onChange={e => setField('logradouro', e.target.value)} /></label>
                <label>Numero<input value={form.numeroEndereco || ''} onChange={e => setField('numeroEndereco', e.target.value)} /></label>
                <label>Complemento<input value={form.complemento || ''} onChange={e => setField('complemento', e.target.value)} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
                <label>Bairro<input value={form.bairro || ''} onChange={e => setField('bairro', e.target.value)} /></label>
                <label>Cidade<input value={form.cidade || ''} onChange={e => setField('cidade', e.target.value)} /></label>
                <label>
                  UF
                  <select value={form.uf || ''} onChange={e => setField('uf', e.target.value)}>
                    <option value="">--</option>
                    {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </label>
                <label>CEP<input value={form.cep || ''} onChange={e => {
                  const v = e.target.value
                  setField('cep', v)
                  if (v.replace(/\D/g, '').length === 8) buscarCep(v, setForm)
                }} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
                <label>Codigo Municipio (IBGE)<input value={form.codigoMunicipio || ''} onChange={e => setField('codigoMunicipio', e.target.value)} /></label>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Tributacao</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label>Item Lista Servico (cTribMun)<input value={form.itemListaServico || ''} onChange={e => setField('itemListaServico', e.target.value)} placeholder="Ex: 901" /></label>
                <label>Codigo CNAE<input value={form.codigoCnae || ''} onChange={e => setField('codigoCnae', e.target.value)} /></label>
                <label>Codigo Tributacao (cTribNac)<input value={form.codigoTributacao || ''} onChange={e => setField('codigoTributacao', e.target.value)} /></label>
                <label>Aliquota ISS Padrao (%)<input type="number" step="0.01" value={form.aliquotaIssPadrao || 0} onChange={e => setField('aliquotaIssPadrao', e.target.value)} /></label>
                <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                  <input type="checkbox" checked={form.optanteSimples || false} onChange={e => setField('optanteSimples', e.target.checked)} style={{ width: 16, height: 16 }} />
                  Optante Simples Nacional
                </label>
                <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                  <input type="checkbox" checked={form.incentivoFiscal || false} onChange={e => setField('incentivoFiscal', e.target.checked)} style={{ width: 16, height: 16 }} />
                  Incentivo Fiscal
                </label>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Numeracao RPS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label>Serie RPS<input value={form.serieRps || '1'} onChange={e => setField('serieRps', e.target.value)} /></label>
                <label>Ultimo RPS<input type="number" value={form.ultimoRps || 0} onChange={e => setField('ultimoRps', e.target.value)} /></label>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Observacoes</h4>
              <textarea
                value={form.observacoes || ''}
                onChange={e => setField('observacoes', e.target.value)}
                rows={2}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                placeholder="Notas internas sobre esta empresa..."
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button className="btn btn--solid" onClick={handleSaveEmpresa} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Configuracao'}
                </button>
                {message && (
                  <span style={{ fontSize: 13, color: message.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{message}</span>
                )}
              </div>
            </div>
          </div>

          {/* Certificado Digital */}
          <div className="panel">
            <header className="panel__header">
              <h3>Certificado Digital A1</h3>
              {form.certificadoCarregado || form.nuvemFiscalCertificado
                ? <span className="badge badge--success">Enviado</span>
                : <span className="badge badge--neutral">Pendente</span>
              }
            </header>
            <div className="panel__body module-content">
              {form.certificadoCnpj && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 13 }}>
                  <span>CNPJ certificado: <strong>{form.certificadoCnpj}</strong></span>
                  {form.certificadoValidade && <span>Validade: <strong>{new Date(form.certificadoValidade).toLocaleDateString('pt-BR')}</strong></span>}
                  {form.certificadoStatus && (
                    <span className={`badge badge--${form.certificadoStatus === 'NO_PRAZO' ? 'success' : form.certificadoStatus === 'A_VENCER' ? 'warning' : 'danger'}`}>
                      {form.certificadoStatus === 'NO_PRAZO' ? 'Valido' : form.certificadoStatus === 'A_VENCER' ? 'A Vencer' : 'Vencido'}
                    </span>
                  )}
                </div>
              )}
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
                        reader.onload = () => { window.__pfxBase64 = reader.result.split(',')[1] }
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                </label>
                <label>
                  Senha
                  <input type="password" value={certSenha} onChange={e => setCertSenha(e.target.value)} placeholder="Senha do certificado" />
                </label>
                <button className="btn btn--solid" disabled={uploadingCert} onClick={handleUploadCert}>
                  {uploadingCert ? 'Enviando...' : 'Enviar Certificado'}
                </button>
              </div>
              {certMsg && (
                <p style={{ marginTop: 8, fontSize: 13, color: certMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{certMsg}</p>
              )}
            </div>
          </div>

          {/* Nuvem Fiscal - Acoes */}
          <div className="panel">
            <header className="panel__header">
              <h3>Nuvem Fiscal — Configuracao</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {statusBadge(form.nuvemFiscalCadastrada, 'Cadastrada', 'Nao cadastrada')}
                {statusBadge(form.nuvemFiscalNfseConfig, 'NFS-e OK', 'NFS-e pendente')}
                {statusBadge(form.nuvemFiscalCertificado, 'Cert OK', 'Cert pendente')}
              </div>
            </header>
            <div className="panel__body module-content">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Execute os passos abaixo para habilitar a emissao de NFS-e para esta empresa.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`btn ${form.nuvemFiscalCadastrada ? 'btn--ghost' : 'btn--solid'}`}
                  disabled={!!nuvemAction || !oauth?.nuvemFiscalClientId}
                  onClick={handleCadastrar}
                  style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}
                >
                  <div style={{ fontWeight: 600 }}>{nuvemAction === 'cadastrando' ? 'Cadastrando...' : '1. Cadastrar Empresa'}</div>
                  <small style={{ opacity: 0.7 }}>Registra na API Nuvem Fiscal</small>
                </button>
                <button
                  className={`btn ${form.nuvemFiscalNfseConfig ? 'btn--ghost' : 'btn--solid'}`}
                  disabled={!!nuvemAction || !form.nuvemFiscalCadastrada}
                  onClick={handleConfigurarNfse}
                  style={{ flex: 1, textAlign: 'center', padding: '10px 12px' }}
                >
                  <div style={{ fontWeight: 600 }}>{nuvemAction === 'configurando' ? 'Configurando...' : '2. Configurar NFS-e'}</div>
                  <small style={{ opacity: 0.7 }}>Habilita emissao de notas</small>
                </button>
                <button
                  className={`btn ${form.nuvemFiscalCertificado ? 'btn--ghost' : 'btn--solid'}`}
                  disabled
                  style={{ flex: 1, textAlign: 'center', padding: '10px 12px', opacity: 0.7 }}
                >
                  <div style={{ fontWeight: 600 }}>3. Certificado A1</div>
                  <small style={{ opacity: 0.7 }}>Use o painel acima</small>
                </button>
              </div>
              {!oauth?.nuvemFiscalClientId && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                  Configure as credenciais OAuth globais acima primeiro.
                </p>
              )}
              {nuvemMsg && (
                <p style={{ marginTop: 8, fontSize: 13, color: nuvemMsg.startsWith('Erro') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{nuvemMsg}</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Empty state when no empresa selected and not creating */}
      {!selectedId && !showNew && empresas.length > 0 && (
        <div className="panel">
          <div className="panel__body" style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 14 }}>Selecione uma empresa na tabela acima para editar suas configuracoes.</p>
            {clienteAtivo && (
              <p style={{ fontSize: 13, marginTop: 8, color: 'var(--warning, #f59e0b)' }}>
                O cliente <strong>{clienteAtivo.legalName}</strong> ({clienteAtivo.document}) nao possui empresa cadastrada.
                <br />
                <button className="btn btn--solid" onClick={() => {
                  setShowNew(true)
                  setNewForm(f => ({
                    ...f,
                    cnpj: clienteAtivo.document || '',
                    razaoSocial: clienteAtivo.legalName || '',
                    nomeFantasia: clienteAtivo.tradeName || '',
                    cidade: clienteAtivo.city || '',
                    uf: clienteAtivo.state || '',
                    email: clienteAtivo.email || '',
                    telefone: clienteAtivo.phone || '',
                  }))
                }} style={{ marginTop: 8 }}>
                  Cadastrar {clienteAtivo.tradeName || clienteAtivo.legalName?.split(' ')[0]}
                </button>
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
