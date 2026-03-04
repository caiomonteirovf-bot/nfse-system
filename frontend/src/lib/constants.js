export const NFSE_STATUS_OPTIONS = [
  { value: 'EMITIDA', label: 'Emitida' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'PROCESSANDO', label: 'Processando' },
  { value: 'ERRO', label: 'Erro' },
]

export const NFSE_STATUS_TONE = {
  EMITIDA: 'success',
  PENDENTE: 'warning',
  CANCELADA: 'danger',
  PROCESSANDO: 'info',
  ERRO: 'danger',
}

export const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const TOMADOR_FORM_FIELDS = [
  { key: 'cpfCnpj', label: 'CNPJ/CPF', required: true },
  { key: 'razaoSocial', label: 'Razao Social', required: true },
  { key: 'nomeFantasia', label: 'Nome Fantasia' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'inscricaoMunicipal', label: 'Inscricao Municipal' },
  { key: 'logradouro', label: 'Logradouro' },
  { key: 'numeroEndereco', label: 'Numero' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'uf', label: 'UF', type: 'select', options: UF_OPTIONS },
  { key: 'cep', label: 'CEP' },
  { key: 'codigoMunicipio', label: 'Codigo Municipio (IBGE)' },
  { key: 'observacoes', label: 'Observacoes', type: 'textarea' },
]

export const NFSE_ORIGEM_OPTIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'IMPORTADA', label: 'Importada' },
  { value: 'CAPTURADA', label: 'Capturada' },
  { value: 'EMITIDA', label: 'Emitida' },
]

export const NFSE_ORIGEM_TONE = {
  MANUAL: 'neutral',
  IMPORTADA: 'info',
  CAPTURADA: 'success',
  EMITIDA: 'warning',
}

export const SIDEBAR_ITEMS = [
  { group: 'PRINCIPAL', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'chart' },
    { id: 'notas', label: 'Notas Fiscais', icon: 'file' },
    { id: 'tomadores', label: 'Tomadores', icon: 'users' },
  ]},
  { group: 'OPERACAO', items: [
    { id: 'captura', label: 'Captura NFS-e', icon: 'download' },
    { id: 'importar', label: 'Importar', icon: 'upload' },
    { id: 'emissao', label: 'Emissao ABRASF', icon: 'send' },
    { id: 'xml', label: 'Historico XML', icon: 'code' },
  ]},
  { group: 'SISTEMA', items: [
    { id: 'config', label: 'Configuracoes', icon: 'settings' },
  ]},
]

export const OPERACAO_TIPOS = [
  { value: 'ENVIAR_LOTE', label: 'Enviar Lote' },
  { value: 'CONSULTAR_LOTE', label: 'Consultar Lote' },
  { value: 'CANCELAR', label: 'Cancelar' },
]
