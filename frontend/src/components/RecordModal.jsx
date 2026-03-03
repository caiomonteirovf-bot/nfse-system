import { useMemo, useState } from 'react'
import { toNumber, toText, normalizeText } from '../lib/formatters'

function getInitialValues(fields, currentRecord) {
  const values = {}
  for (const field of fields) {
    const fromRecord = currentRecord?.[field.key]
    if (field.type === 'checkbox') {
      values[field.key] = fromRecord ? 'true' : ''
      continue
    }
    if (fromRecord !== undefined && fromRecord !== null) {
      values[field.key] = String(fromRecord)
      continue
    }
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue
      continue
    }
    values[field.key] = ''
  }
  return values
}

function sanitizeValues(fields, values) {
  const output = {}
  for (const field of fields) {
    if (field.hidden) {
      output[field.key] = toText(values[field.key])
      continue
    }
    const value = values[field.key]
    if (field.type === 'number') {
      output[field.key] = toNumber(value)
      continue
    }
    if (field.type === 'checkbox') {
      output[field.key] = value === 'true' || value === true
      continue
    }
    output[field.key] = toText(value)
  }
  return output
}

export default function RecordModal({
  isOpen,
  title,
  fields,
  record,
  submitLabel,
  busy,
  onClose,
  onSubmit,
}) {
  const [values, setValues] = useState(() => getInitialValues(fields, record))
  const [error, setError] = useState('')

  const requiredFields = useMemo(() => fields.filter((field) => field.required), [fields])

  if (!isOpen) return null

  const handleChange = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    for (const field of requiredFields) {
      if (!toText(values[field.key])) {
        setError(`Preencha o campo: ${field.label}`)
        return
      }
    }
    setError('')
    await onSubmit(sanitizeValues(fields, values))
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card" onSubmit={handleSubmit}>
        <header className="modal-card__header">
          <h3>{title}</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </header>

        <div className="modal-card__body">
          {fields.filter(f => !f.hidden).map((field) => (
            <label key={field.key} style={field.type === 'checkbox' ? { flexDirection: 'row', alignItems: 'center', gap: 8 } : undefined}>
              {field.type === 'checkbox' ? (
                <>
                  <input
                    type="checkbox"
                    checked={values[field.key] === 'true' || values[field.key] === true}
                    onChange={(event) => handleChange(field.key, event.target.checked ? 'true' : '')}
                    style={{ width: 16, height: 16 }}
                  />
                  {field.label}
                </>
              ) : field.type === 'select' ? (
                <>
                  {field.label}
                  {field.required ? <span className="required">*</span> : null}
                  <select
                    value={values[field.key] ?? ''}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                  >
                    <option value="">-- Selecione --</option>
                    {(field.options || []).map((opt) => {
                      const val = typeof opt === 'string' ? opt : opt.value
                      const label = typeof opt === 'string' ? opt : opt.label
                      return <option key={val} value={val}>{label}</option>
                    })}
                  </select>
                </>
              ) : (
                <>
                  {field.label}
                  {field.required ? <span className="required">*</span> : null}
                  {field.type === 'textarea' ? (
                    <textarea
                      value={values[field.key] ?? ''}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      rows={3}
                    />
                  ) : (
                    <input
                      type={field.type || 'text'}
                      value={values[field.key] ?? ''}
                      onChange={(event) => handleChange(field.key, event.target.value)}
                      step={field.type === 'number' ? '0.01' : undefined}
                    />
                  )}
                </>
              )}
            </label>
          ))}
        </div>

        <footer className="modal-card__footer">
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn--solid" disabled={busy}>
            {busy ? 'Salvando...' : submitLabel}
          </button>
        </footer>
      </form>
    </div>
  )
}
