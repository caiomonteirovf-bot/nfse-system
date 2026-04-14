import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchFaturamento, upsertFaturamento, deleteFaturamento, importarNfsesFaturamento,
  fetchFolha, upsertFolha, deleteFolha,
  calcularFatorR, fetchFatorRHistorico,
} from '../api'

const BRL = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const FMT_MONTH = (iso) => {
  if (!iso) return '—'
  const [y, m] = iso.split('-')
  return `${m}/${y}`
}
const THIS_MONTH = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function FatorR({ clienteAtivo }) {
  const [tab, setTab] = useState('resumo')
  const cnpj = (clienteAtivo?.document || '').replace(/\D/g, '')
  const clienteId = clienteAtivo?.id

  if (!clienteAtivo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Fator R</h3>
        <p>Selecione um cliente no menu lateral para iniciar.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Fator R</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
            Pipeline: Faturamento → Folha → Cálculo do Fator R
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
          <strong style={{ color: 'var(--text-primary)' }}>
            {clienteAtivo.tradeName || clienteAtivo.legalName}
          </strong>
          <div>{clienteAtivo.document}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          ['resumo', 'Resumo & Cálculo'],
          ['faturamento', 'Faturamento Mensal'],
          ['folha', 'Folha Mensal'],
          ['historico', 'Histórico'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: '10px 16px',
              background: tab === k ? 'var(--bg-raised)' : 'transparent',
              color: tab === k ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === k ? 600 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumo' && <TabResumo cnpj={cnpj} clienteId={clienteId} />}
      {tab === 'faturamento' && <TabFaturamento cnpj={cnpj} clienteId={clienteId} />}
      {tab === 'folha' && <TabFolha cnpj={cnpj} clienteId={clienteId} />}
      {tab === 'historico' && <TabHistorico cnpj={cnpj} clienteId={clienteId} />}
    </div>
  )
}

// ── RESUMO & CÁLCULO ──────────────────────────────────────
function TabResumo({ cnpj, clienteId }) {
  const [competencia, setCompetencia] = useState(THIS_MONTH())
  const [anexoAtual, setAnexoAtual] = useState('V')
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function calcular() {
    setLoading(true); setErro(''); setResultado(null)
    try {
      const d = await calcularFatorR({ cnpj, competencia, clienteGesthubId: clienteId, anexoAtual })
      setResultado(d)
    } catch (e) { setErro(e.message) }
    setLoading(false)
  }

  const acima = resultado && resultado.fatorR >= 0.28

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end', marginBottom: 20 }}>
        <Field label="Competência (YYYY-MM)">
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Anexo atual">
          <select value={anexoAtual} onChange={e => setAnexoAtual(e.target.value)} style={inputStyle}>
            <option value="III">Anexo III</option>
            <option value="V">Anexo V</option>
          </select>
        </Field>
        <div />
        <button onClick={calcular} disabled={loading || !cnpj} style={primaryBtn}>
          {loading ? 'Calculando...' : 'Calcular Fator R'}
        </button>
      </div>

      {erro && <div style={errorStyle}>{erro}</div>}

      {resultado && (
        <div>
          <div style={{
            padding: 20,
            borderRadius: 10,
            background: acima ? 'rgba(34,197,94,0.08)' : 'rgba(251,146,60,0.08)',
            border: `1px solid ${acima ? 'rgba(34,197,94,0.3)' : 'rgba(251,146,60,0.3)'}`,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Fator R</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: acima ? '#22c55e' : '#fb923c', lineHeight: 1 }}>
                  {resultado.fatorRPct}%
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-muted)' }}>
                  Threshold: 28% → {acima ? '✓ Anexo III (menor alíquota)' : '⚠ Anexo V (maior alíquota)'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cobertura dados</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{resultado.cobertura}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <KPICard label="Receita 12M" value={BRL(resultado.receita12m)} />
            <KPICard label="Folha 12M" value={BRL(resultado.folha12m)} />
            <KPICard
              label="Pró-labore ideal/mês"
              value={BRL(resultado.proLaboreIdealMensal)}
              hint={resultado.proLaboreIdealMensal > 0 ? 'Para atingir 28%' : 'Já atingido'}
            />
            <KPICard
              label="Economia anual estimada"
              value={BRL(resultado.economiaAnualEstimada)}
              hint={resultado.economiaAnualEstimada > 0 ? 'Se migrar V → III' : '—'}
            />
          </div>

          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-raised)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Período analisado: <strong>{FMT_MONTH(resultado.rangeInicio)}</strong> até <strong>{FMT_MONTH(resultado.rangeFim)}</strong>
            {' — '}
            salvo no histórico automaticamente.
          </div>
        </div>
      )}
    </div>
  )
}

// ── FATURAMENTO ──────────────────────────────────────────
function TabFaturamento({ cnpj, clienteId }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    try {
      setItems(await fetchFaturamento({ cnpj }))
    } catch (e) { setErro(e.message) }
  }, [cnpj])

  useEffect(() => { load() }, [load])

  async function importar() {
    if (!confirm('Importar faturamento a partir das NFS-e emitidas?')) return
    try {
      const r = await importarNfsesFaturamento({ cnpj, clienteGesthubId: clienteId })
      alert(`Importado: ${r.criados} criado(s), ${r.atualizados} atualizado(s).`)
      load()
    } catch (e) { alert(e.message) }
  }

  async function remove(id) {
    if (!confirm('Remover este registro?')) return
    await deleteFaturamento(id); load()
  }

  const total12m = useMemo(() => items.slice(0, 12).reduce((s, i) => s + (i.faturamentoBruto || 0), 0), [items])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> mês(es) registrado(s)
          {items.length > 0 && <> — Soma 12 últimos: <strong style={{ color: 'var(--primary)' }}>{BRL(total12m)}</strong></>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={importar} style={secondaryBtn}>Importar de NFS-e</button>
          <button onClick={() => { setEditing(null); setShowForm(true) }} style={primaryBtn}>+ Adicionar</button>
        </div>
      </div>

      {erro && <div style={errorStyle}>{erro}</div>}

      {showForm && (
        <FaturamentoForm
          cnpj={cnpj} clienteId={clienteId} initial={editing}
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Competência</th>
            <th style={{ ...th, textAlign: 'right' }}>Faturamento</th>
            <th style={{ ...th, textAlign: 'right' }}>Notas</th>
            <th style={th}>Fonte</th>
            <th style={th}>Obs</th>
            <th style={{ ...th, width: 160 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td style={td}>{FMT_MONTH(i.competencia)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{BRL(i.faturamentoBruto)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{i.qtdNotas}</td>
              <td style={td}><Tag text={i.fonte} /></td>
              <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>{i.observacoes}</td>
              <td style={td}>
                <button onClick={() => { setEditing(i); setShowForm(true) }} style={linkBtn}>Editar</button>
                <button onClick={() => remove(i.id)} style={{ ...linkBtn, color: '#ef4444' }}>Remover</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
              Nenhum faturamento registrado. Adicione manualmente ou importe das NFS-e.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function FaturamentoForm({ cnpj, clienteId, initial, onCancel, onSaved }) {
  const [form, setForm] = useState({
    competencia: initial?.competencia?.slice(0, 7) || THIS_MONTH(),
    faturamentoBruto: initial?.faturamentoBruto || '',
    qtdNotas: initial?.qtdNotas || '',
    observacoes: initial?.observacoes || '',
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await upsertFaturamento({ ...form, cnpj, clienteGesthubId: clienteId, fonte: 'manual' })
      onSaved()
    } catch (e) { alert(e.message); setSaving(false) }
  }
  return (
    <div style={formBoxStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Field label="Competência"><input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })} style={inputStyle} /></Field>
        <Field label="Faturamento bruto"><input type="number" step="0.01" value={form.faturamentoBruto} onChange={e => setForm({ ...form, faturamentoBruto: e.target.value })} style={inputStyle} /></Field>
        <Field label="Qtd notas"><input type="number" value={form.qtdNotas} onChange={e => setForm({ ...form, qtdNotas: e.target.value })} style={inputStyle} /></Field>
      </div>
      <Field label="Observações"><input type="text" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={secondaryBtn}>Cancelar</button>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  )
}

// ── FOLHA ────────────────────────────────────────────────
function TabFolha({ cnpj, clienteId }) {
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [erro, setErro] = useState('')

  const load = useCallback(async () => {
    try { setItems(await fetchFolha({ cnpj })) } catch (e) { setErro(e.message) }
  }, [cnpj])
  useEffect(() => { load() }, [load])

  async function remove(id) {
    if (!confirm('Remover?')) return
    await deleteFolha(id); load()
  }

  const total12m = useMemo(() => items.slice(0, 12).reduce((s, i) => s + (i.total || 0), 0), [items])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong> mês(es)
          {items.length > 0 && <> — Soma 12 últimos: <strong style={{ color: 'var(--primary)' }}>{BRL(total12m)}</strong></>}
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }} style={primaryBtn}>+ Adicionar</button>
      </div>

      {erro && <div style={errorStyle}>{erro}</div>}

      {showForm && (
        <FolhaForm
          cnpj={cnpj} clienteId={clienteId} initial={editing}
          onCancel={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={th}>Comp.</th>
            <th style={{ ...th, textAlign: 'right' }}>Pró-labore</th>
            <th style={{ ...th, textAlign: 'right' }}>Salários</th>
            <th style={{ ...th, textAlign: 'right' }}>INSS</th>
            <th style={{ ...th, textAlign: 'right' }}>13º</th>
            <th style={{ ...th, textAlign: 'right' }}>Férias</th>
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
            <th style={th}>Fonte</th>
            <th style={{ ...th, width: 160 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td style={td}>{FMT_MONTH(i.competencia)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.proLabore)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.salarios)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.inssPatronal)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.decimoTerceiro)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.ferias)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{BRL(i.total)}</td>
              <td style={td}><Tag text={i.fonte} /></td>
              <td style={td}>
                <button onClick={() => { setEditing(i); setShowForm(true) }} style={linkBtn}>Editar</button>
                <button onClick={() => remove(i.id)} style={{ ...linkBtn, color: '#ef4444' }}>Remover</button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
              Nenhuma folha registrada. Adicione manualmente (futuro: importar eSocial).
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function FolhaForm({ cnpj, clienteId, initial, onCancel, onSaved }) {
  const [form, setForm] = useState({
    competencia: initial?.competencia?.slice(0, 7) || THIS_MONTH(),
    proLabore: initial?.proLabore || '',
    salarios: initial?.salarios || '',
    inssPatronal: initial?.inssPatronal || '',
    decimoTerceiro: initial?.decimoTerceiro || '',
    ferias: initial?.ferias || '',
    observacoes: initial?.observacoes || '',
  })
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await upsertFolha({ ...form, cnpj, clienteGesthubId: clienteId, fonte: 'manual' })
      onSaved()
    } catch (e) { alert(e.message); setSaving(false) }
  }
  const total = ['proLabore', 'salarios', 'inssPatronal', 'decimoTerceiro', 'ferias'].reduce((s, k) => s + Number(form[k] || 0), 0)
  return (
    <div style={formBoxStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Field label="Competência"><input type="month" value={form.competencia} onChange={e => setForm({ ...form, competencia: e.target.value })} style={inputStyle} /></Field>
        <Field label="Pró-labore"><input type="number" step="0.01" value={form.proLabore} onChange={e => setForm({ ...form, proLabore: e.target.value })} style={inputStyle} /></Field>
        <Field label="Salários"><input type="number" step="0.01" value={form.salarios} onChange={e => setForm({ ...form, salarios: e.target.value })} style={inputStyle} /></Field>
        <Field label="INSS patronal"><input type="number" step="0.01" value={form.inssPatronal} onChange={e => setForm({ ...form, inssPatronal: e.target.value })} style={inputStyle} /></Field>
        <Field label="13º"><input type="number" step="0.01" value={form.decimoTerceiro} onChange={e => setForm({ ...form, decimoTerceiro: e.target.value })} style={inputStyle} /></Field>
        <Field label="Férias"><input type="number" step="0.01" value={form.ferias} onChange={e => setForm({ ...form, ferias: e.target.value })} style={inputStyle} /></Field>
      </div>
      <Field label="Observações"><input type="text" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--primary)' }}>{BRL(total)}</strong></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={secondaryBtn}>Cancelar</button>
          <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── HISTÓRICO ────────────────────────────────────────────
function TabHistorico({ cnpj, clienteId }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    fetchFatorRHistorico({ cnpj }).then(setItems).catch(() => {})
  }, [cnpj])

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={th}>Competência</th>
          <th style={{ ...th, textAlign: 'right' }}>Fator R</th>
          <th style={{ ...th, textAlign: 'right' }}>Receita 12M</th>
          <th style={{ ...th, textAlign: 'right' }}>Folha 12M</th>
          <th style={th}>Anexo ideal</th>
          <th style={{ ...th, textAlign: 'right' }}>Pró-labore ideal</th>
          <th style={{ ...th, textAlign: 'right' }}>Economia anual</th>
          <th style={th}>Cobertura</th>
          <th style={th}>Calculado em</th>
        </tr>
      </thead>
      <tbody>
        {items.map(i => {
          const ok = i.fatorR >= 0.28
          return (
            <tr key={i.id}>
              <td style={td}>{FMT_MONTH(i.competencia)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: ok ? '#22c55e' : '#fb923c' }}>{i.fatorRPct}%</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.receita12m)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.folha12m)}</td>
              <td style={td}><Tag text={i.anexoIdeal} tone={ok ? 'success' : 'warning'} /></td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.proLaboreIdeal)}</td>
              <td style={{ ...td, textAlign: 'right' }}>{BRL(i.economiaAnualEstimada)}</td>
              <td style={td}>{i.mesesComDados}/12</td>
              <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{i.calculadoEm?.slice(0, 16).replace('T', ' ')}</td>
            </tr>
          )
        })}
        {items.length === 0 && (
          <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
            Nenhum cálculo ainda. Rode o cálculo na aba "Resumo".
          </td></tr>
        )}
      </tbody>
    </table>
  )
}

// ── UI helpers ───────────────────────────────────────────
const Field = ({ label, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
    {label}{children}
  </label>
)

const KPICard = ({ label, value, hint }) => (
  <div style={{ padding: 14, background: 'var(--bg-raised)', borderRadius: 8, border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
  </div>
)

const Tag = ({ text, tone }) => {
  const colors = {
    success: { bg: 'rgba(34,197,94,0.12)', fg: '#16a34a' },
    warning: { bg: 'rgba(251,146,60,0.12)', fg: '#ea580c' },
    default: { bg: 'var(--bg-raised)', fg: 'var(--text-muted)' },
  }
  const c = colors[tone] || colors.default
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.fg, textTransform: 'uppercase', letterSpacing: 0.3,
    }}>{text || '—'}</span>
  )
}

const inputStyle = {
  padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-raised)', color: 'var(--text-primary)', fontSize: 13,
  width: '100%',
}
const primaryBtn = {
  padding: '8px 16px', borderRadius: 6, background: 'var(--primary)', color: '#fff',
  border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const secondaryBtn = {
  padding: '8px 16px', borderRadius: 6, background: 'var(--bg-raised)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
}
const linkBtn = {
  background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer',
  fontSize: 12, padding: '4px 8px',
}
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const th = { padding: '10px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }
const td = { padding: '10px 8px', borderBottom: '1px solid var(--border)' }
const formBoxStyle = { padding: 16, background: 'var(--bg-raised)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }
const errorStyle = { padding: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, marginBottom: 12, fontSize: 13 }
