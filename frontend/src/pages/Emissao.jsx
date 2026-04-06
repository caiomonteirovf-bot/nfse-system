import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchNfses, createNfse, deleteNfse, emitirNfseLote, consultarLoteNfse,
  emitirNfseNuvem, pdfNfseNuvemUrl, cancelarNfse, request, buscarTomadorPorDocumento,
  updateTomador, createTomador, fetchSugestoesEmissao, pollProcessando,
  fetchEmpresaByCnpj,
} from '../api'
import { formatCurrency, formatDate } from '../lib/formatters'

const MODOS = [
  { key: 'nuvem', label: 'Nuvem Fiscal', desc: 'API unificada (recomendado)' },
  { key: 'abrasf', label: 'ABRASF Direto', desc: 'Webservice municipal' },
]

const EMPTY_NOVA = {
  tomadorCpfCnpj: '', tomadorRazaoSocial: '', tomadorEmail: '', tomadorTelefone: '',
  tomadorLogradouro: '', tomadorNumero: '', tomadorComplemento: '', tomadorBairro: '',
  tomadorCidade: '', tomadorUf: '', tomadorCep: '',
  descricaoServico: '', valorServicos: '', aliquotaIss: '',
  issRetido: false,
  aliqPis: '', aliqCofins: '', aliqCsll: '', aliqIr: '', aliqInss: '',
  valorPis: '', valorCofins: '', valorCsll: '', valorIr: '', valorInss: '',
  descontoIncondicionado: '',
  dataEmissao: new Date().toISOString().slice(0, 10),
  _tomadorId: null,
}

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// Aliquotas padrao por regime tributario
const REGRAS_REGIME = {
  'LUCRO_PRESUMIDO': { pis: 0.65, cofins: 3, csll: 1, ir: 1.5, inss: 0 },
  'LUCRO_REAL': { pis: 1.65, cofins: 7.6, csll: 1, ir: 1.5, inss: 0 },
}

function detectarRegime(clienteAtivo) {
  if (!clienteAtivo) return null
  const regime = (clienteAtivo.taxRegime || clienteAtivo.regimeTributario || '').toUpperCase()
  if (regime.includes('PRESUMIDO') || regime === 'NORMAL' || regime.includes('LIVRO CAIXA') || regime.includes('LP/')) return 'LUCRO_PRESUMIDO'
  if (regime.includes('REAL')) return 'LUCRO_REAL'
  if (regime.includes('SIMPLES') || regime.includes('MEI')) return 'SIMPLES'
  if (regime.includes('PESSOA FISICA') || regime.includes('ISENTA')) return 'SIMPLES'
  return null
}

function calcularRetencoes(valor, aliquotas) {
  if (!valor || !aliquotas) return {}
  const v = parseFloat(valor) || 0
  return {
    valorPis: (v * aliquotas.pis / 100).toFixed(2),
    valorCofins: (v * aliquotas.cofins / 100).toFixed(2),
    valorCsll: (v * aliquotas.csll / 100).toFixed(2),
    valorIr: (v * aliquotas.ir / 100).toFixed(2),
    valorInss: (v * aliquotas.inss / 100).toFixed(2),
  }
}

export default function Emissao({ prestador, clienteAtivo }) {
  const [notas, setNotas] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const [protocolo, setProtocolo] = useState('')
  const [consultaResult, setConsultaResult] = useState(null)
  const [error, setError] = useState('')
  const [modo, setModo] = useState('nuvem')
  const [showNova, setShowNova] = useState(false)
  const [nova, setNova] = useState({ ...EMPTY_NOVA })
  const [novaLoading, setNovaLoading] = useState(false)
  const [tomBuscaMsg, setTomBuscaMsg] = useState('')
  const [tomBuscando, setTomBuscando] = useState(false)
  const [sugestoes, setSugestoes] = useState([])
  const [showSugestoes, setShowSugestoes] = useState(false)
  const [recentes, setRecentes] = useState([])
  const [recentesLoading, setRecentesLoading] = useState(false)
  const [empresaConfig, setEmpresaConfig] = useState(null)

  // Lookup empresa config when client changes
  useEffect(() => {
    if (!clienteAtivo?.document) { setEmpresaConfig(null); return }
    fetchEmpresaByCnpj(clienteAtivo.document)
      .then(r => setEmpresaConfig(r.ok ? r.data : null))
      .catch(() => setEmpresaConfig(null))
  }, [clienteAtivo?.document])

  const regime = detectarRegime(clienteAtivo)
  const isSimples = regime === 'SIMPLES'
  const regimeAliquotas = REGRAS_REGIME[regime] || null

  // Quando muda o cliente (regime), pre-preencher aliquotas ou limpar
  useEffect(() => {
    if (regimeAliquotas) {
      setNova(f => {
        const calc = calcularRetencoes(f.valorServicos, regimeAliquotas)
        return {
          ...f, ...calc,
          aliqPis: String(regimeAliquotas.pis), aliqCofins: String(regimeAliquotas.cofins),
          aliqCsll: String(regimeAliquotas.csll), aliqIr: String(regimeAliquotas.ir),
          aliqInss: String(regimeAliquotas.inss),
        }
      })
    } else {
      setNova(f => ({
        ...f,
        aliqPis: '', aliqCofins: '', aliqCsll: '', aliqIr: '', aliqInss: '',
        valorPis: '', valorCofins: '', valorCsll: '', valorIr: '', valorInss: '',
      }))
    }
  }, [regime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar sugestões do histórico quando abre o form ou muda o cliente
  useEffect(() => {
    if (!showNova || !clienteAtivo?.document) {
      setSugestoes([])
      return
    }
    fetchSugestoesEmissao(clienteAtivo.document)
      .then(data => setSugestoes(data || []))
      .catch(() => setSugestoes([]))
  }, [showNova, clienteAtivo?.document])

  const aplicarSugestao = (sug) => {
    setNova(f => ({
      ...f,
      descricaoServico: sug.descricao,
      valorServicos: sug.valor ? String(sug.valor) : f.valorServicos,
      aliquotaIss: sug.aliquotaIss ? String(sug.aliquotaIss) : f.aliquotaIss,
    }))
    setShowSugestoes(false)
  }

  const setNovaField = (k, v) => {
    setNova(f => {
      const next = { ...f, [k]: v ?? '' }
      // Auto-calcular retencoes quando valor muda e tem regime definido
      if (k === 'valorServicos' && regimeAliquotas) {
        const calc = calcularRetencoes(v, regimeAliquotas)
        Object.assign(next, calc)
        next.aliqPis = String(regimeAliquotas.pis)
        next.aliqCofins = String(regimeAliquotas.cofins)
        next.aliqCsll = String(regimeAliquotas.csll)
        next.aliqIr = String(regimeAliquotas.ir)
        next.aliqInss = String(regimeAliquotas.inss)
      }
      // Garantir que nenhum campo fica undefined
      for (const key of Object.keys(next)) {
        if (next[key] === undefined || next[key] === null) next[key] = ''
      }
      return next
    })
  }

  const buscarTomador = async () => {
    const doc = (nova.tomadorCpfCnpj || '').replace(/\D/g, '')
    if (doc.length < 11) return
    setTomBuscando(true)
    setTomBuscaMsg('')
    try {
      // 1. Buscar no banco local de tomadores
      const local = await buscarTomadorPorDocumento(doc)
      if (local.ok && local.data) {
        const t = local.data
        setNova(f => ({
          ...f,
          tomadorRazaoSocial: t.razaoSocial ?? '',
          tomadorEmail: t.email ?? '',
          tomadorTelefone: t.telefone ?? '',
          tomadorLogradouro: t.logradouro ?? '',
          tomadorNumero: t.numeroEndereco ?? '',
          tomadorComplemento: t.complemento ?? '',
          tomadorBairro: t.bairro ?? '',
          tomadorCidade: t.cidade ?? '',
          tomadorUf: t.uf ?? '',
          tomadorCep: t.cep ?? '',
          _tomadorId: t.id ?? null,
        }))
        const incompleto = !t.logradouro || !t.cidade || !t.uf
        setTomBuscaMsg(incompleto
          ? 'Tomador encontrado — complete os dados de endereco abaixo'
          : 'Dados carregados do cadastro de tomadores')
        setTomBuscando(false)
        return
      }
      // 2. Se CNPJ (14 digitos), consultar Receita Federal
      if (doc.length === 14) {
        const resp = await request(`/cnpj/${doc}`)
        if (resp.ok && resp.data) {
          const d = resp.data
          setNova(f => ({
            ...f,
            tomadorRazaoSocial: d.razaoSocial ?? '',
            tomadorEmail: d.email ?? '',
            tomadorTelefone: d.telefone ?? '',
            tomadorLogradouro: d.logradouro ?? '',
            tomadorNumero: d.numero ?? '',
            tomadorComplemento: d.complemento ?? '',
            tomadorBairro: d.bairro ?? '',
            tomadorCidade: d.cidade ?? '',
            tomadorUf: d.uf ?? '',
            tomadorCep: d.cep ?? '',
            _tomadorId: null,
          }))
          setTomBuscaMsg('Dados carregados da Receita Federal')
        } else {
          setTomBuscaMsg('CNPJ nao encontrado na Receita Federal')
        }
      } else {
        setTomBuscaMsg('CPF nao encontrado no cadastro — preencha manualmente')
      }
    } catch {
      setTomBuscaMsg('Erro na busca')
    }
    setTomBuscando(false)
  }

  const salvarTomador = async () => {
    const doc = (nova.tomadorCpfCnpj || '').replace(/\D/g, '')
    if (!doc || !nova.tomadorRazaoSocial) return
    const payload = {
      cpfCnpj: doc,
      razaoSocial: nova.tomadorRazaoSocial,
      email: nova.tomadorEmail,
      telefone: nova.tomadorTelefone,
      logradouro: nova.tomadorLogradouro,
      numeroEndereco: nova.tomadorNumero,
      complemento: nova.tomadorComplemento,
      bairro: nova.tomadorBairro,
      cidade: nova.tomadorCidade,
      uf: nova.tomadorUf,
      cep: nova.tomadorCep,
    }
    try {
      if (nova._tomadorId) {
        await updateTomador(nova._tomadorId, payload)
      } else {
        await createTomador(payload)
      }
    } catch (err) {
      // Silencioso — tomador será salvo/vinculado no backend durante emissão
    }
  }

  const buscarCep = async (cep) => {
    const cepLimpo = (cep || '').replace(/\D/g, '')
    if (cepLimpo.length !== 8) return
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const data = await resp.json()
      if (data.erro) return
      setNova(f => ({
        ...f,
        tomadorLogradouro: data.logradouro || f.tomadorLogradouro,
        tomadorBairro: data.bairro || f.tomadorBairro,
        tomadorCidade: data.localidade || f.tomadorCidade,
        tomadorUf: data.uf || f.tomadorUf,
        tomadorComplemento: data.complemento || f.tomadorComplemento,
      }))
    } catch { /* ViaCEP indisponível */ }
  }

  const handleCriarEEmitir = async () => {
    if (!clienteAtivo?.document) {
      return alert('Selecione o prestador (cliente) no seletor acima antes de emitir.')
    }
    if (!nova.tomadorCpfCnpj || !nova.valorServicos || !nova.descricaoServico) {
      return alert('Preencha CNPJ/CPF, valor e descricao do servico.')
    }
    setNovaLoading(true)
    try {
      // 1. Salvar/atualizar tomador no cadastro
      await salvarTomador()
      // 2. Criar nota como PENDENTE
      const nfse = await createNfse({
        numero: `PEND-${Date.now()}`,
        serie: '1',
        tomadorCpfCnpj: nova.tomadorCpfCnpj.replace(/\D/g, ''),
        tomadorRazaoSocial: nova.tomadorRazaoSocial,
        tomadorEmail: nova.tomadorEmail,
        descricaoServico: nova.descricaoServico,
        valorServicos: parseFloat(nova.valorServicos) || 0,
        aliquotaIss: parseFloat(nova.aliquotaIss) || 0,
        issRetido: nova.issRetido,
        valorPis: parseFloat(nova.valorPis) || 0,
        valorCofins: parseFloat(nova.valorCofins) || 0,
        valorCsll: parseFloat(nova.valorCsll) || 0,
        valorIr: parseFloat(nova.valorIr) || 0,
        valorInss: parseFloat(nova.valorInss) || 0,
        descontoIncondicionado: parseFloat(nova.descontoIncondicionado) || 0,
        dataEmissao: nova.dataEmissao,
        status: 'PENDENTE',
      })
      // 3. Emitir imediatamente via Nuvem Fiscal (com CNPJ do prestador)
      const result = await emitirNfseNuvem([nfse.id], clienteAtivo.document)
      setResultado({ ...result, modo: 'nuvem' })
      setNova({ ...EMPTY_NOVA })
      setShowNova(false)
      load()
      loadRecentes()
    } catch (e) {
      setError('Erro ao emitir: ' + e.message)
    }
    setNovaLoading(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const filters = { status: 'PENDENTE' }
      if (clienteAtivo?.id) filters.clienteId = clienteAtivo.id
      if (clienteAtivo?.document) filters.clienteDoc = clienteAtivo.document
      const data = await fetchNfses(filters)
      setNotas(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [clienteAtivo?.id, clienteAtivo?.document])

  const loadRecentes = useCallback(async () => {
    if (!clienteAtivo?.document) { setRecentes([]); return }
    setRecentesLoading(true)
    try {
      const data = await fetchNfses({
        clienteId: clienteAtivo.id,
        clienteDoc: clienteAtivo.document,
      })
      // Mostrar últimas 10 não-pendentes
      setRecentes((data || []).filter(n => n.status !== 'PENDENTE').slice(0, 10))
    } catch (e) {
      console.error(e)
    } finally {
      setRecentesLoading(false)
    }
  }, [clienteAtivo?.id, clienteAtivo?.document])

  useEffect(() => { load(); loadRecentes() }, [load, loadRecentes])

  // Auto-poll PROCESSANDO notes every 10s
  const pollRef = useRef(null)
  const hasProcessando = recentes.some(n => n.status === 'PROCESSANDO') ||
    notas.some(n => n.status === 'PROCESSANDO')

  useEffect(() => {
    if (!hasProcessando) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    const doPoll = async () => {
      try {
        const res = await pollProcessando()
        if (res?.data?.atualizadas > 0) {
          load()
          loadRecentes()
        }
      } catch { /* silent */ }
    }
    pollRef.current = setInterval(doPoll, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasProcessando, load, loadRecentes])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === notas.length) setSelected(new Set())
    else setSelected(new Set(notas.map(n => n.id)))
  }

  const nuvemOk = prestador?.nuvemFiscalConfigurado || prestador?.nuvemFiscalClientId
  const empresaPronta = empresaConfig && empresaConfig.nuvemFiscalCadastrada && empresaConfig.nuvemFiscalCertificado
  const abrasfOk = prestador?.cnpj && prestador?.webserviceUrl
  const configOk = modo === 'nuvem' ? (nuvemOk && empresaPronta) : abrasfOk

  const handleEmitir = async () => {
    if (selected.size === 0) return alert('Selecione ao menos uma NFS-e.')
    setEnviando(true)
    setError('')
    setResultado(null)
    try {
      const ids = [...selected]
      let data
      if (modo === 'nuvem') {
        data = await emitirNfseNuvem(ids, clienteAtivo?.document)
      } else {
        data = await emitirNfseLote(ids)
      }
      setResultado({ ...data, modo })
      if (data.protocolo) setProtocolo(data.protocolo)
      load()
      loadRecentes()
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

  return (
    <>
      <div className="page-heading">
        <h1>Emissao de NFS-e</h1>
        <p>Selecione notas pendentes e emita via Nuvem Fiscal ou ABRASF</p>
      </div>

      {/* Modo de emissao */}
      <div className="panel">
        <header className="panel__header"><h3>Modo de Emissao</h3></header>
        <div className="panel__body">
          <div style={{ display: 'flex', gap: 12 }}>
            {MODOS.map(m => (
              <button
                key={m.key}
                className={`btn ${modo === m.key ? 'btn--solid' : 'btn--ghost'}`}
                onClick={() => { setModo(m.key); setResultado(null); setError('') }}
                style={{ flex: 1, textAlign: 'center', padding: '12px 16px' }}
              >
                <strong>{m.label}</strong>
                <br />
                <small style={{ opacity: 0.7 }}>{m.desc}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Config Status */}
      <div className="panel">
        <header className="panel__header">
          <h3>{modo === 'nuvem' ? 'Prestador / Nuvem Fiscal' : 'Configuracao ABRASF'}</h3>
        </header>
        <div className="panel__body">
          {modo === 'nuvem' ? (
            !nuvemOk ? (
              <p style={{ color: 'var(--danger)', fontSize: 13 }}>
                Configure as credenciais da Nuvem Fiscal em Configuracoes antes de emitir.
              </p>
            ) : !clienteAtivo?.document ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 13 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Prestador</div>
                  <span style={{ color: 'var(--warning, #f59e0b)' }}>Selecione um cliente no seletor acima</span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>API</div>
                  <span className="badge badge--success">Configurado</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Prestador</div>
                  <strong>{clienteAtivo.name || clienteAtivo.legalName || '--'}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>CNPJ</div>
                  <strong>{clienteAtivo.document}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Inscr. Municipal</div>
                  <strong>{empresaConfig?.inscricaoMunicipal || '--'}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Ambiente</div>
                  <span className={`badge badge--${prestador?.nuvemFiscalAmbiente === 'producao' ? 'success' : 'warning'}`}>
                    {(prestador?.nuvemFiscalAmbiente || 'homologacao').toUpperCase()}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Empresa</div>
                  {!empresaConfig ? (
                    <span className="badge badge--danger">Nao cadastrada</span>
                  ) : empresaPronta ? (
                    <span className="badge badge--success">Pronta</span>
                  ) : (
                    <span className="badge badge--warning">Config. incompleta</span>
                  )}
                </div>
              </div>
            )
          ) : (
            abrasfOk ? (
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
            )
          )}
        </div>
      </div>

      {/* Nova NFS-e - Emissao Rapida */}
      <div className="panel" style={{ borderLeft: '3px solid #22C55E' }}>
        <header className="panel__header">
          <h3>Nova NFS-e {clienteAtivo ? `— ${clienteAtivo.name || clienteAtivo.legalName || ''}` : ''}</h3>
          <button className="btn btn--solid" onClick={() => setShowNova(!showNova)}>
            {showNova ? 'Fechar' : '+ Emitir Nota'}
          </button>
        </header>
        {showNova && !clienteAtivo?.document && (
          <div className="panel__body">
            <p style={{ color: 'var(--warning, #f59e0b)', fontSize: 14, margin: 0 }}>
              Selecione o prestador (empresa que emite a nota) no seletor de clientes acima para continuar.
            </p>
          </div>
        )}
        {showNova && clienteAtivo?.document && (
          <div className="panel__body">
            {/* Tomador */}
            <div style={{ background: 'var(--surface-alt, #f8fafc)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--primary, #6366f1)', letterSpacing: '0.3px' }}>TOMADOR</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 10 }}>
                <label>
                  CNPJ/CPF *
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={nova.tomadorCpfCnpj} onChange={e => setNovaField('tomadorCpfCnpj', e.target.value)} placeholder="Digite o CNPJ ou CPF" style={{ flex: 1 }} />
                    <button className="btn btn--tiny" onClick={buscarTomador} disabled={tomBuscando} type="button" style={{ whiteSpace: 'nowrap' }}>{tomBuscando ? '...' : 'Buscar'}</button>
                  </div>
                  {tomBuscaMsg && <small style={{ color: tomBuscaMsg.includes('complete') ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)', marginTop: 3, display: 'block', fontSize: 11 }}>{tomBuscaMsg}</small>}
                </label>
                <label>Razao Social<input value={nova.tomadorRazaoSocial} onChange={e => setNovaField('tomadorRazaoSocial', e.target.value)} /></label>
                <label>Email<input value={nova.tomadorEmail} onChange={e => setNovaField('tomadorEmail', e.target.value)} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', gap: 10, marginTop: 8 }}>
                <label>Telefone<input value={nova.tomadorTelefone} onChange={e => setNovaField('tomadorTelefone', e.target.value)} /></label>
                <label>
                  CEP
                  <input value={nova.tomadorCep} onChange={e => {
                    const v = e.target.value
                    setNovaField('tomadorCep', v)
                    if (v.replace(/\D/g, '').length === 8) buscarCep(v)
                  }} placeholder="00000-000" />
                </label>
                <label>Logradouro<input value={nova.tomadorLogradouro} onChange={e => setNovaField('tomadorLogradouro', e.target.value)} placeholder="Rua, Av..." /></label>
                <label>Numero<input value={nova.tomadorNumero} onChange={e => setNovaField('tomadorNumero', e.target.value)} /></label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: 10, marginTop: 8 }}>
                <label>Complemento<input value={nova.tomadorComplemento} onChange={e => setNovaField('tomadorComplemento', e.target.value)} /></label>
                <label>Bairro<input value={nova.tomadorBairro} onChange={e => setNovaField('tomadorBairro', e.target.value)} /></label>
                <label>Cidade<input value={nova.tomadorCidade} onChange={e => setNovaField('tomadorCidade', e.target.value)} /></label>
                <label>UF
                  <select value={nova.tomadorUf} onChange={e => setNovaField('tomadorUf', e.target.value)}>
                    <option value="">--</option>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {/* Servico */}
            <div style={{ background: 'var(--surface-alt, #f8fafc)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--primary, #6366f1)', letterSpacing: '0.3px' }}>SERVICO</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label>Valor do Servico *<input type="number" step="0.01" value={nova.valorServicos} onChange={e => setNovaField('valorServicos', e.target.value)} style={{ fontWeight: 600, fontSize: 14 }} /></label>
                <label>Desconto Incondicionado<input type="number" step="0.01" value={nova.descontoIncondicionado} onChange={e => setNovaField('descontoIncondicionado', e.target.value)} placeholder="0.00" /></label>
                <label>Data Emissao<input type="date" value={nova.dataEmissao} onChange={e => setNovaField('dataEmissao', e.target.value)} /></label>
              <label style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Descricao do Servico *
                  {sugestoes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSugestoes(!showSugestoes)}
                      style={{
                        background: 'var(--accent, #6366f1)', color: '#fff', border: 'none',
                        borderRadius: 4, padding: '1px 8px', fontSize: 10, cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      {showSugestoes ? 'Fechar' : `${sugestoes.length} anterior(es)`}
                    </button>
                  )}
                </span>
                <textarea value={nova.descricaoServico} onChange={e => setNovaField('descricaoServico', e.target.value)} placeholder={sugestoes.length > 0 ? sugestoes[0].descricao : 'Descreva o servico prestado'} rows={3} style={{ resize: 'vertical', minHeight: 60, fontFamily: 'inherit', fontSize: 13 }} />
                {showSugestoes && sugestoes.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: 2,
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                      Ultimas notas deste cliente
                    </div>
                    {sugestoes.map((sug, i) => (
                      <div
                        key={i}
                        onClick={() => aplicarSugestao(sug)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                          borderBottom: i < sugestoes.length - 1 ? '1px solid var(--border, #e2e8f0)' : 'none',
                          transition: 'background .1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-alt, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>{sug.descricao}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          <span>R$ {Number(sug.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          {sug.aliquotaIss > 0 && <span>ISS: {sug.aliquotaIss}%</span>}
                          {sug.tomador && <span>p/ {sug.tomador.substring(0, 25)}</span>}
                          {sug.data && <span>{sug.data.substring(8, 10)}/{sug.data.substring(5, 7)}/{sug.data.substring(0, 4)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </label>
              </div>
            </div>

            {/* Tributacao Municipal */}
            <div style={{ background: 'var(--surface-alt, #f8fafc)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--primary, #6366f1)', letterSpacing: '0.3px' }}>TRIBUTACAO MUNICIPAL (ISS)</h4>
            {clienteAtivo && (
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                {clienteAtivo.cnaePrincipal && <span>CNAE: <strong>{clienteAtivo.cnaePrincipal}</strong></span>}
                {clienteAtivo.codigoTributacao && <span>cTribNac: <strong>{clienteAtivo.codigoTributacao}</strong></span>}
                {clienteAtivo.itemListaServico && <span>cTribMun: <strong>{clienteAtivo.itemListaServico}</strong></span>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <label>Aliquota ISS (%)<input type="number" step="0.01" value={nova.aliquotaIss} onChange={e => setNovaField('aliquotaIss', e.target.value)} placeholder="Ex: 5.00" /></label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex', paddingTop: 18 }}>
                <input type="checkbox" checked={nova.issRetido} onChange={e => setNovaField('issRetido', e.target.checked)} style={{ width: 16, height: 16 }} />
                ISS Retido pelo Tomador
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 20 }}>
                BC: {formatCurrency((parseFloat(nova.valorServicos) || 0) - (parseFloat(nova.descontoIncondicionado) || 0))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 20 }}>
                ISS: {formatCurrency(((parseFloat(nova.valorServicos) || 0) - (parseFloat(nova.descontoIncondicionado) || 0)) * (parseFloat(nova.aliquotaIss) || 0) / 100)}
              </div>
            </div>

            </div>

            {/* Tributacao Federal */}
            {!regime && (
              <div style={{ padding: '10px 14px', background: 'var(--surface-alt, #f8fafc)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Selecione um cliente para definir o regime tributario e calcular retencoes federais.
              </div>
            )}

            {isSimples && (
              <div style={{ padding: '10px 14px', background: 'var(--surface-alt, #f8fafc)', borderRadius: 8, fontSize: 12, color: 'var(--success, #22c55e)', marginBottom: 16, fontWeight: 500 }}>
                Simples Nacional — tributos federais apurados via DAS. Retencoes nao aplicaveis.
              </div>
            )}

            {regime && !isSimples && (
              <>
                <h4 style={{ margin: '16px 0 4px', fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                  Tributacao Federal (Retencoes)
                  <span className="badge badge--info" style={{ marginLeft: 8, fontSize: 10 }}>{regime.replace('_', ' ')}</span>
                </h4>
                {regimeAliquotas && (
                  <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                    Aliquotas pre-preenchidas conforme regime. Revise antes de emitir.
                  </small>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                  <label>
                    PIS (%)
                    <input type="number" step="0.01" value={nova.aliqPis} onChange={e => {
                      const aliq = parseFloat(e.target.value) || 0
                      setNova(f => ({ ...f, aliqPis: e.target.value, valorPis: ((parseFloat(f.valorServicos) || 0) * aliq / 100).toFixed(2) }))
                    }} placeholder="0.65" />
                    <small style={{ color: 'var(--text-muted)' }}>R$ {nova.valorPis || '0.00'}</small>
                  </label>
                  <label>
                    COFINS (%)
                    <input type="number" step="0.01" value={nova.aliqCofins} onChange={e => {
                      const aliq = parseFloat(e.target.value) || 0
                      setNova(f => ({ ...f, aliqCofins: e.target.value, valorCofins: ((parseFloat(f.valorServicos) || 0) * aliq / 100).toFixed(2) }))
                    }} placeholder="3.00" />
                    <small style={{ color: 'var(--text-muted)' }}>R$ {nova.valorCofins || '0.00'}</small>
                  </label>
                  <label>
                    CSLL (%)
                    <input type="number" step="0.01" value={nova.aliqCsll} onChange={e => {
                      const aliq = parseFloat(e.target.value) || 0
                      setNova(f => ({ ...f, aliqCsll: e.target.value, valorCsll: ((parseFloat(f.valorServicos) || 0) * aliq / 100).toFixed(2) }))
                    }} placeholder="1.00" />
                    <small style={{ color: 'var(--text-muted)' }}>R$ {nova.valorCsll || '0.00'}</small>
                  </label>
                  <label>
                    IR (%)
                    <input type="number" step="0.01" value={nova.aliqIr} onChange={e => {
                      const aliq = parseFloat(e.target.value) || 0
                      setNova(f => ({ ...f, aliqIr: e.target.value, valorIr: ((parseFloat(f.valorServicos) || 0) * aliq / 100).toFixed(2) }))
                    }} placeholder="1.50" />
                    <small style={{ color: 'var(--text-muted)' }}>R$ {nova.valorIr || '0.00'}</small>
                  </label>
                  <label>
                    INSS (%)
                    <input type="number" step="0.01" value={nova.aliqInss} onChange={e => {
                      const aliq = parseFloat(e.target.value) || 0
                      setNova(f => ({ ...f, aliqInss: e.target.value, valorInss: ((parseFloat(f.valorServicos) || 0) * aliq / 100).toFixed(2) }))
                    }} placeholder="0.00" />
                    <small style={{ color: 'var(--text-muted)' }}>R$ {nova.valorInss || '0.00'}</small>
                  </label>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                  <span>Total Retencoes: <strong>{formatCurrency(
                    (parseFloat(nova.valorPis) || 0) + (parseFloat(nova.valorCofins) || 0) +
                    (parseFloat(nova.valorCsll) || 0) + (parseFloat(nova.valorIr) || 0) + (parseFloat(nova.valorInss) || 0)
                  )}</strong></span>
                  <span>Liquido: <strong>{formatCurrency(
                    (parseFloat(nova.valorServicos) || 0) - (parseFloat(nova.descontoIncondicionado) || 0) -
                    (parseFloat(nova.valorPis) || 0) - (parseFloat(nova.valorCofins) || 0) -
                    (parseFloat(nova.valorCsll) || 0) - (parseFloat(nova.valorIr) || 0) - (parseFloat(nova.valorInss) || 0) -
                    (nova.issRetido ? ((parseFloat(nova.valorServicos) || 0) - (parseFloat(nova.descontoIncondicionado) || 0)) * (parseFloat(nova.aliquotaIss) || 0) / 100 : 0)
                  )}</strong></span>
                </div>
              </>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn--solid" onClick={handleCriarEEmitir} disabled={novaLoading || !configOk}>
                {novaLoading ? 'Emitindo...' : 'Criar e Emitir via Nuvem Fiscal'}
              </button>
              {!configOk && <small style={{ color: 'var(--danger)', alignSelf: 'center' }}>
                {!nuvemOk ? 'Configure as credenciais Nuvem Fiscal em Configuracoes' :
                 !empresaConfig ? 'Cadastre esta empresa em Configuracoes primeiro' :
                 'Complete a configuracao da empresa (cadastrar + certificado) em Configuracoes'}
              </small>}
            </div>
          </div>
        )}
      </div>

      {/* Notas Pendentes */}
      <div className="panel">
        <header className="panel__header">
          <h3>Notas Pendentes ({notas.length})</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--ghost" onClick={load} disabled={loading}>
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button className="btn btn--solid" onClick={handleEmitir} disabled={enviando || selected.size === 0 || !configOk}>
              {enviando ? 'Emitindo...' : `Emitir ${selected.size > 0 ? `(${selected.size})` : ''}`}
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
                <th>ISS</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Carregando...</p></td></tr>
              ) : notas.length === 0 ? (
                <tr><td colSpan={7}><p className="empty-state">Nenhuma nota pendente para emissao</p></td></tr>
              ) : notas.map(n => (
                <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => toggleSelect(n.id)}>
                  <td><input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleSelect(n.id)} /></td>
                  <td><strong>{n.numero?.startsWith('PEND-') || n.numero === 'AUTO' ? 'Aguardando...' : n.numero}</strong><br/><small>Serie {n.serie}</small></td>
                  <td>{n.tomadorNome || n.tomadorRazaoSocial || '--'}<br/><small>{n.tomadorCpfCnpj}</small></td>
                  <td>{formatCurrency(n.valorServicos)}</td>
                  <td>{formatCurrency(n.valorIss)}<br/><small>{n.aliquotaIss ? `${n.aliquotaIss}%` : ''}</small></td>
                  <td>{formatDate(n.dataEmissao)}</td>
                  <td><span className="badge badge--warning">{n.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Emitidas Recentes */}
      {recentes.length > 0 && (
        <div className="panel">
          <header className="panel__header">
            <h3>Emitidas Recentes ({recentes.length})</h3>
            <button className="btn btn--ghost btn--tiny" onClick={loadRecentes} disabled={recentesLoading}>
              {recentesLoading ? '...' : 'Atualizar'}
            </button>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Tomador</th>
                  <th>Valor</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {recentes.map(n => (
                  <tr key={n.id}>
                    <td><strong>{n.numero?.startsWith('PEND-') || n.numero === 'AUTO' ? 'Aguardando...' : n.numero}</strong><br/><small>Serie {n.serie}</small></td>
                    <td>{n.tomadorNome || n.tomadorRazaoSocial || '--'}<br/><small>{n.tomadorCpfCnpj}</small></td>
                    <td>{formatCurrency(n.valorServicos)}</td>
                    <td>{formatDate(n.dataEmissao)}</td>
                    <td>
                      <span className={`badge badge--${n.status === 'EMITIDA' ? 'success' : n.status === 'CANCELADA' ? 'danger' : n.status === 'PROCESSANDO' ? 'info' : 'neutral'}`}>
                        {n.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {n.protocolo && !n.protocolo.startsWith('PEND') && (
                          <a href={pdfNfseNuvemUrl(n.protocolo)} target="_blank" rel="noopener noreferrer" className="btn btn--tiny">PDF</a>
                        )}
                        {(n.status === 'ERRO' || n.status === 'PENDENTE' || n.status === 'PROCESSANDO') && (
                          <button className="btn btn--tiny btn--danger" onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Excluir NFS-e ${n.numero?.startsWith('PEND-') ? '(pendente)' : n.numero}?`)) return
                            await deleteNfse(n.id)
                            loadRecentes()
                            load()
                          }}>Excluir</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="panel" style={{ borderLeft: '3px solid var(--danger, #ef4444)' }}>
          <div className="panel__body" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>!</span>
            <span style={{ fontSize: 13, color: 'var(--danger, #ef4444)', fontWeight: 500 }}>{error}</span>
            <button className="btn btn--tiny" onClick={() => setError('')} style={{ marginLeft: 'auto' }}>Fechar</button>
          </div>
        </div>
      )}

      {/* Resultado Emissao */}
      {resultado && (
        <div className="panel">
          <header className="panel__header">
            <h3>Resultado da Emissao</h3>
            <span className={`badge badge--${resultado.modo === 'nuvem' ? 'info' : 'neutral'}`}>
              {resultado.modo === 'nuvem' ? 'Nuvem Fiscal' : 'ABRASF'}
            </span>
          </header>
          <div className="panel__body">
            {resultado.data ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nota</th>
                        <th>Status</th>
                        <th>Detalhes</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.data.map((r, i) => (
                        <tr key={i}>
                          <td><strong>{r.numero || r.id}</strong></td>
                          <td>
                            <span className={`badge badge--${r.ok ? 'success' : 'danger'}`}>
                              {r.ok ? 'Emitida' : 'Erro'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, maxWidth: 500 }}>
                            {r.ok
                              ? (r.chaveAcesso ? `Chave: ${r.chaveAcesso.substring(0, 20)}...` : r.nuvemFiscalId || 'OK')
                              : (
                                <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', color: 'var(--danger, #ef4444)', fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' }}>
                                  {(() => {
                                    try {
                                      const err = r.error || ''
                                      const match = err.match(/message["']?\s*:\s*["']([^"']+)["']/)
                                      const msgMatch = err.match(/Validation failed:\s*(.+?)(?:\s*\{|$)/)
                                      if (msgMatch) return msgMatch[1].trim()
                                      if (match) return match[1]
                                      return err.length > 200 ? err.substring(0, 200) + '...' : err
                                    } catch { return r.error }
                                  })()}
                                </div>
                              )
                            }
                          </td>
                          <td>
                            {r.ok && r.nuvemFiscalId && (
                              <a
                                href={pdfNfseNuvemUrl(r.nuvemFiscalId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn--tiny"
                              >
                                PDF
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  {resultado.data.filter(r => r.ok).length} de {resultado.data.length} emitida(s) com sucesso
                </div>
              </>
            ) : resultado.protocolo ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PROTOCOLO</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{resultado.protocolo || '--'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>STATUS</div>
                  <span className={`badge badge--${resultado.sucesso ? 'success' : 'danger'}`}>
                    {resultado.sucesso ? 'Enviado' : 'Erro'}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>NOTAS</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{resultado.quantidade || '--'}</div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {resultado.mensagem || resultado.error || 'Processamento concluido.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Consultar Lote ABRASF */}
      {modo === 'abrasf' && (
        <div className="panel">
          <header className="panel__header"><h3>Consultar Lote ABRASF</h3></header>
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
      )}
    </>
  )
}
