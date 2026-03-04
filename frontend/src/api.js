const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
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

// --- NFS-e ---
export async function fetchNfses(filters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.ano) params.set('ano', filters.ano)
  if (filters.mes) params.set('mes', filters.mes)
  if (filters.tomadorId) params.set('tomador_id', filters.tomadorId)
  const response = await request(`/nfses?${params}`)
  return response.data
}

export async function fetchNfseDashboard(ano, mes) {
  const params = new URLSearchParams({ ano })
  if (mes) params.set('mes', mes)
  const response = await request(`/nfses/dashboard?${params}`)
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
