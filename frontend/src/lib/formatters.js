const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2
})

const NUMBER_FORMATTER = new Intl.NumberFormat('pt-BR')

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function toText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text.length ? text : fallback
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const clean = value.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(value || 0)
}

export function formatNumber(value) {
  return NUMBER_FORMATTER.format(value || 0)
}

export function formatDate(value) {
  if (!value) return '--'
  // Datas "YYYY-MM-DD" são interpretadas como UTC pelo JS, causando -1 dia em BRT.
  // Adiciona T12:00 para evitar o problema de timezone.
  const raw = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value + 'T12:00:00'
    : value
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return toText(value, '--')
  return date.toLocaleDateString('pt-BR')
}

export function matchSearch(search, values) {
  if (!search) return true
  const haystack = values.map((value) => toText(value)).join(' ').trim()
  return normalizeText(haystack).includes(search)
}
