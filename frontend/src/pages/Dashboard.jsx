import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fetchNfseDashboard } from '../api'
import { formatCurrency, formatNumber } from '../lib/formatters'

const PIE_COLORS = ['#22C55E', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6']

const currentYear = new Date().getFullYear()

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-accent)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 32px rgba(99,102,241,.12)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk',monospace", fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {formatCurrency(payload[0].value)}
      </div>
    </div>
  )
}

function DeltaArrow({ value }) {
  if (value == null || value === 0) return <span style={{ color: 'var(--text-muted)' }}>--</span>
  const up = value > 0
  return (
    <span style={{ color: up ? 'var(--success)' : 'var(--danger)', fontWeight: 700, fontSize: 14 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export default function Dashboard({ clienteId, clienteDoc }) {
  const [ano, setAno] = useState(currentYear)
  const [mes, setMes] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchNfseDashboard(ano, mes || null, clienteId, clienteDoc)
      setData(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [ano, mes, clienteId, clienteDoc])

  useEffect(() => { load() }, [load])

  const kpis = data?.kpis
  const evolucao = data?.evolucaoMensal || []
  const comparativo = data?.comparativoMes
  const ranking = data?.rankingTomadores || []
  const tributaria = data?.analiseTributaria

  const emitKpis = kpis?.emitidas
  const recebKpis = kpis?.recebidas

  // Status distribution for PieChart
  const statusData = useMemo(() => {
    if (!kpis) return []
    const items = []
    if (emitKpis?.quantidade > 0) items.push({ name: 'Emitidas', value: emitKpis.quantidade })
    if (recebKpis?.quantidade > 0) items.push({ name: 'Recebidas', value: recebKpis.quantidade })
    if (kpis.notasCanceladas > 0) items.push({ name: 'Canceladas', value: kpis.notasCanceladas })
    return items
  }, [kpis, emitKpis, recebKpis])

  // Tax breakdown for BarChart
  const taxData = useMemo(() => {
    if (!tributaria) return []
    return [
      { name: 'ISS', valor: tributaria.totalIss },
      { name: 'PIS', valor: tributaria.totalPis },
      { name: 'COFINS', valor: tributaria.totalCofins },
      { name: 'INSS', valor: tributaria.totalInss },
      { name: 'IR', valor: tributaria.totalIr },
      { name: 'CSLL', valor: tributaria.totalCsll },
    ].filter(t => t.valor > 0)
  }, [tributaria])

  return (
    <>
      <div className="page-heading">
        <h1>Dashboard NFS-e</h1>
        <p>Visao geral das notas fiscais de servico</p>
      </div>

      {/* Filters */}
      <div className="filters-row" style={{ marginBottom: 4 }}>
        <label>
          Ano
          <select value={ano} onChange={e => setAno(Number(e.target.value))}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Mes
          <select value={mes} onChange={e => setMes(e.target.value)}>
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>}

      {kpis && (
        <>
          {/* Resumo Geral */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <article className="kpi-card" style={{ '--item-index': 0 }}>
              <div className="kpi-card__header"><p className="kpi-card__label">Total Notas</p></div>
              <p className="kpi-card__value">{formatNumber(kpis.totalNotas)}</p>
            </article>
            <article className="kpi-card" style={{ '--item-index': 1 }}>
              <div className="kpi-card__header"><p className="kpi-card__label">Total Impostos</p></div>
              <p className="kpi-card__value kpi-card__value--small">{formatCurrency(kpis.totalImpostos)}</p>
            </article>
            <article className="kpi-card" style={{ '--item-index': 2 }}>
              <div className="kpi-card__header"><p className="kpi-card__label">Carga Tributaria</p></div>
              <p className="kpi-card__value">{kpis.cargaTributariaMedia}%</p>
            </article>
            <article className="kpi-card" style={{ '--item-index': 3 }}>
              <div className="kpi-card__header"><p className="kpi-card__label">Canceladas</p></div>
              <p className="kpi-card__value">{formatNumber(kpis.notasCanceladas)}</p>
            </article>
          </div>

          {/* Emitidas vs Recebidas */}
          {emitKpis && recebKpis && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Emitidas */}
              <div className="panel" style={{ borderLeft: '3px solid #22C55E' }}>
                <header className="panel__header" style={{ paddingBottom: 4 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#22C55E', fontSize: 18 }}>&#9650;</span> Emitidas
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>({emitKpis.quantidade} notas)</span>
                  </h3>
                </header>
                <div className="panel__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Faturado</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: '#22C55E' }}>{formatCurrency(emitKpis.faturado)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ticket Medio</div>
                    <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(emitKpis.ticketMedio)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impostos</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(emitKpis.impostos)}</div>
                  </div>
                </div>
              </div>

              {/* Recebidas */}
              <div className="panel" style={{ borderLeft: '3px solid #3B82F6' }}>
                <header className="panel__header" style={{ paddingBottom: 4 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#3B82F6', fontSize: 18 }}>&#9660;</span> Recebidas
                    <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>({recebKpis.quantidade} notas)</span>
                  </h3>
                </header>
                <div className="panel__body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Servicos</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: '#3B82F6' }}>{formatCurrency(recebKpis.faturado)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ticket Medio</div>
                    <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(recebKpis.ticketMedio)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impostos</div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(recebKpis.impostos)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="panel-grid--two" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 12 }}>
            {/* Area Chart - Evolucao */}
            <div className="panel">
              <div className="chart-header">
                <h3 style={{ margin: 0, font: "700 15px 'Outfit', sans-serif" }}>Evolucao Mensal</h3>
                <div className="chart-header__value">{formatCurrency(kpis.totalFaturado)}</div>
              </div>
              <div className="chart-area" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucao}>
                    <defs>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="4 4" />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="totalFaturado" stroke="#6366F1" strokeWidth={2.5} fill="url(#gradFat)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart - Status */}
            <div className="panel">
              <div style={{ padding: '14px 16px 0' }}>
                <h3 style={{ margin: 0, font: "700 15px 'Outfit', sans-serif" }}>Distribuicao</h3>
              </div>
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value">
                        {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="empty-state">Sem dados</p>
                )}
              </div>
            </div>
          </div>

          {/* Ranking + Tax Analysis */}
          <div className="panel-grid--two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Ranking Tomadores */}
            <div className="panel">
              <header className="panel__header"><h3>Top 10 Tomadores</h3></header>
              <div className="panel__body">
                {ranking.length > 0 ? (
                  <div className="metric-bars">
                    {ranking.map((r, i) => {
                      const maxVal = ranking[0]?.totalFaturado || 1
                      const width = Math.max((r.totalFaturado / maxVal) * 100, 6)
                      return (
                        <div className="metric-bars__row" key={i}>
                          <p style={{ fontSize: 12, margin: 0 }}>{(r.tomadorNome || '').slice(0, 25)}</p>
                          <div className="metric-bars__track">
                            <span style={{ width: `${width}%` }} />
                          </div>
                          <p className="metric-bars__value">{formatCurrency(r.totalFaturado)}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="empty-state">Sem dados</p>
                )}
              </div>
            </div>

            {/* Analise Tributaria */}
            <div className="panel">
              <header className="panel__header"><h3>Analise Tributaria</h3></header>
              <div className="panel__body">
                {taxData.length > 0 ? (
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={taxData} layout="vertical">
                        <CartesianGrid horizontal={false} stroke="#E2E8F0" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} width={55} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="valor" fill="#6366F1" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="empty-state">Sem dados tributarios</p>
                )}
                {tributaria && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    Carga efetiva: <strong style={{ color: 'var(--text-primary)' }}>{tributaria.cargaEfetiva}%</strong>
                    {' | '}ISS retido: <strong>{formatCurrency(tributaria.totalIssRetido)}</strong>
                    {' | '}ISS devido: <strong>{formatCurrency(tributaria.issRetidoVsDevido?.devido)}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Comparativo Mes a Mes */}
          {comparativo && (
            <div className="panel">
              <header className="panel__header"><h3>Comparativo Mes a Mes</h3></header>
              <div className="panel__body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>NOTAS</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{comparativo.mesAtual.totalNotas}</div>
                    <DeltaArrow value={comparativo.variacao.notas} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>FATURADO</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(comparativo.mesAtual.totalFaturado)}</div>
                    <DeltaArrow value={comparativo.variacao.faturado} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>LIQUIDO</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{formatCurrency(comparativo.mesAtual.totalLiquido)}</div>
                    <DeltaArrow value={comparativo.variacao.liquido} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
