const API_BASE = import.meta.env.VITE_API_URL || '/api'

export async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    },
    ...options
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || `Erro HTTP ${response.status}`
    throw new Error(message)
  }

  return payload
}

// --- Bootstrap ---
export async function fetchBootstrap() {
  const payload = await request('/bootstrap')
  return payload
}

// --- Tomadores ---
export async function fetchTomadores(filters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.ativo !== undefined && filters.ativo !== null) params.set('ativo', filters.ativo)
  const response = await request(`/tomadores?${params}`)
  return response.data
}

export async function createTomador(payload) {
  const response = await request('/tomadores', { method: 'POST', body: JSON.stringify(payload) })
  return response.data
}

export async function updateTomador(id, payload) {
  const response = await request(`/tomadores/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  return response.data
}

export async function deleteTomador(id) {
  await request(`/tomadores/${id}`, { method: 'DELETE' })
}

export async function buscarTomadorPorDocumento(documento) {
  const doc = documento.replace(/\D/g, '')
  const response = await fetch(`${API_BASE}/tomadores/por-documento/${doc}`)
  const payload = await response.json()
  return payload
}

// --- NFS-e ---
export async function fetchNfses(filters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.ano) params.set('ano', filters.ano)
  if (filters.mes) params.set('mes', filters.mes)
  if (filters.tomadorId) params.set('tomador_id', filters.tomadorId)
  if (filters.clienteId) params.set('cliente_id', filters.clienteId)
  if (filters.clienteDoc) params.set('cliente_doc', filters.clienteDoc)
  const response = await request(`/nfses?${params}`)
  return response.data
}

export async function fetchNfseDashboard(ano, mes, clienteId, clienteDoc) {
  const params = new URLSearchParams({ ano })
  if (mes) params.set('mes', mes)
  if (clienteId) params.set('cliente_id', clienteId)
  if (clienteDoc) params.set('cliente_doc', clienteDoc)
  const response = await request(`/nfses/dashboard?${params}`)
  return response.data
}

export async function fetchSugestoesEmissao(clienteDoc) {
  const doc = (clienteDoc || '').replace(/\D/g, '')
  if (!doc) return []
  const response = await request(`/nfses/sugestoes/${doc}`)
  return response.data
}

export async function createNfse(payload) {
  const response = await request('/nfses', { method: 'POST', body: JSON.stringify(payload) })
  return response.data
}

export async function updateNfse(id, payload) {
  const response = await request(`/nfses/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  return response.data
}

export async function deleteNfse(id) {
  await request(`/nfses/${id}`, { method: 'DELETE' })
}

export async function importNfses(file, ano, mes) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await request(`/nfses/import?ano=${ano}&mes=${mes}`, { method: 'POST', body: formData })
  return response.data
}

// --- Emissao ABRASF ---
export async function emitirNfseLote(ids) {
  const response = await request('/emissao/enviar-lote', { method: 'POST', body: JSON.stringify({ ids }) })
  return response
}

export async function consultarLoteNfse(protocolo) {
  const response = await request(`/emissao/consultar-lote/${protocolo}`)
  return response
}

export async function cancelarNfse(id, motivo) {
  const response = await request(`/emissao/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) })
  return response
}

// --- Emissao Nuvem Fiscal ---
export async function emitirNfseNuvem(ids, prestadorCnpj) {
  const body = { ids }
  if (prestadorCnpj) body.prestador_cnpj = prestadorCnpj.replace(/\D/g, '')
  const response = await request('/emissao/nuvem-fiscal/emitir', { method: 'POST', body: JSON.stringify(body) })
  return response
}

export async function consultarNfseNuvem(nuvemId) {
  const response = await request(`/emissao/nuvem-fiscal/consultar/${nuvemId}`)
  return response
}

export async function statusNfseNuvem(nuvemId) {
  const response = await request(`/emissao/nuvem-fiscal/status/${nuvemId}`)
  return response
}

export function pdfNfseNuvemUrl(nuvemId) {
  return `${API_BASE}/emissao/nuvem-fiscal/pdf/${nuvemId}`
}

export async function pollProcessando() {
  const response = await request('/emissao/nuvem-fiscal/poll-processando', { method: 'POST' })
  return response
}

export async function cancelarNfseNuvem(nuvemId, motivo) {
  const response = await request(`/emissao/nuvem-fiscal/cancelar/${nuvemId}`, {
    method: 'POST', body: JSON.stringify({ motivo })
  })
  return response
}

export async function cadastrarEmpresaNuvem() {
  const response = await request('/emissao/nuvem-fiscal/empresa/cadastrar', { method: 'POST' })
  return response
}

export async function configurarNfseNuvem() {
  const response = await request('/emissao/nuvem-fiscal/empresa/configurar-nfse', { method: 'POST' })
  return response
}

export async function uploadCertificadoNuvem(certificadoBase64, senha) {
  const response = await request('/emissao/nuvem-fiscal/empresa/certificado', {
    method: 'POST', body: JSON.stringify({ certificado: certificadoBase64, senha })
  })
  return response
}

// --- Prestador Config ---
export async function fetchPrestadorConfig() {
  const response = await request('/prestador')
  return response.data
}

export async function updatePrestadorConfig(payload) {
  const response = await request('/prestador', { method: 'PUT', body: JSON.stringify(payload) })
  return response.data
}

// --- Captura NFS-e Nacional ---
export async function executarCaptura() {
  const response = await request('/captura/executar', { method: 'POST' })
  return response
}

export async function fetchCapturaHistorico(limit = 20) {
  const response = await request(`/captura/historico?limit=${limit}`)
  return response.data
}

export async function fetchCapturaStatus() {
  const response = await request('/captura/status')
  return response.data
}

export async function uploadCertificado(pfxBase64, senha) {
  const response = await request('/captura/certificado/upload', {
    method: 'POST',
    body: JSON.stringify({ pfxBase64, senha }),
  })
  return response
}

// --- Empresas (config emissão por CNPJ) ---
export async function fetchEmpresas() {
  const response = await request('/empresas')
  return response.data
}

export async function fetchEmpresaByCnpj(cnpj) {
  const clean = cnpj.replace(/\D/g, '')
  const response = await request(`/empresas/cnpj/${clean}`)
  return response
}

export async function createEmpresa(payload) {
  const response = await request('/empresas', { method: 'POST', body: JSON.stringify(payload) })
  return response.data
}

export async function updateEmpresa(id, payload) {
  const response = await request(`/empresas/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  return response.data
}

export async function deleteEmpresa(id) {
  const response = await request(`/empresas/${id}`, { method: 'DELETE' })
  return response
}

export async function cadastrarEmpresaNuvemPorId(empresaId) {
  return request(`/empresas/${empresaId}/nuvem-fiscal/cadastrar`, { method: 'POST' })
}

export async function configurarNfsePorId(empresaId) {
  return request(`/empresas/${empresaId}/nuvem-fiscal/configurar-nfse`, { method: 'POST' })
}

export async function uploadCertificadoPorId(empresaId, certificadoBase64, senha) {
  return request(`/empresas/${empresaId}/nuvem-fiscal/certificado`, {
    method: 'POST', body: JSON.stringify({ certificado: certificadoBase64, senha })
  })
}

// --- Clientes (Gesthub) ---
export async function fetchClientes(search = '') {
  const params = search ? `?search=${encodeURIComponent(search)}` : ''
  const response = await request(`/clientes${params}`)
  return response.data
}

export async function fetchClienteByCnpj(cnpj) {
  const response = await request(`/clientes/${encodeURIComponent(cnpj)}`)
  return response.data
}

// --- Consulta CNPJ (Receita Federal + Gesthub) ---
export async function consultarCnpj(cnpj) {
  const clean = cnpj.replace(/\D/g, '')
  const response = await request(`/cnpj/${clean}`)
  return response.data
}

// --- Consulta CPF/CNPJ para auto-fill de tomador ---
export async function consultarDocumento(documento) {
  const clean = documento.replace(/\D/g, '')
  if (clean.length === 14) {
    return consultarCnpj(clean)
  }
  return null // CPF não tem API pública gratuita
}

// --- Busca municípios IBGE ---
export async function buscarMunicipios(uf) {
  const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
  if (!response.ok) return []
  const data = await response.json()
  return data.map(m => ({ value: String(m.id), label: `${m.nome} (${m.id})` }))
}

// --- XML Logs ---
export async function fetchXmlLogs(filters = {}) {
  const params = new URLSearchParams()
  if (filters.nfseId) params.set('nfse_id', filters.nfseId)
  if (filters.tipo) params.set('tipo', filters.tipo)
  if (filters.limit) params.set('limit', filters.limit)
  if (filters.offset) params.set('offset', filters.offset)
  const response = await request(`/xml-logs?${params}`)
  return response.data
}

export async function fetchXmlLogDetail(id) {
  const response = await request(`/xml-logs/${id}`)
  return response.data
}

// --- Fator R ---
export async function fetchFaturamento(filters = {}) {
  const p = new URLSearchParams()
  if (filters.cnpj) p.set('cnpj', filters.cnpj)
  if (filters.clienteId) p.set('cliente_id', filters.clienteId)
  if (filters.ano) p.set('ano', filters.ano)
  const r = await request(`/fator-r/faturamento?${p}`)
  return r.data
}
export async function upsertFaturamento(payload) {
  const r = await request('/fator-r/faturamento', { method: 'POST', body: JSON.stringify(payload) })
  return r.data
}
export async function deleteFaturamento(id) {
  await request(`/fator-r/faturamento/${id}`, { method: 'DELETE' })
}
export async function importarNfsesFaturamento(payload) {
  const r = await request('/fator-r/faturamento/importar-nfses', { method: 'POST', body: JSON.stringify(payload) })
  return r.data
}
export async function fetchFolha(filters = {}) {
  const p = new URLSearchParams()
  if (filters.cnpj) p.set('cnpj', filters.cnpj)
  if (filters.clienteId) p.set('cliente_id', filters.clienteId)
  if (filters.ano) p.set('ano', filters.ano)
  const r = await request(`/fator-r/folha?${p}`)
  return r.data
}
export async function upsertFolha(payload) {
  const r = await request('/fator-r/folha', { method: 'POST', body: JSON.stringify(payload) })
  return r.data
}
export async function deleteFolha(id) {
  await request(`/fator-r/folha/${id}`, { method: 'DELETE' })
}
export async function calcularFatorR(payload) {
  const r = await request('/fator-r/calcular', { method: 'POST', body: JSON.stringify(payload) })
  return r.data
}
export async function fetchFatorRHistorico(filters = {}) {
  const p = new URLSearchParams()
  if (filters.cnpj) p.set('cnpj', filters.cnpj)
  if (filters.clienteId) p.set('cliente_id', filters.clienteId)
  const r = await request(`/fator-r/historico?${p}`)
  return r.data
}
export async function fetchFatorRResumo() {
  const r = await request('/fator-r/resumo')
  return r.data
}
