import { useState } from 'react'
import { importNfses } from '../api'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

export default function Importar() {
  const [file, setFile] = useState(null)
  const [ano, setAno] = useState(currentYear)
  const [mes, setMes] = useState(currentMonth)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleImport = async () => {
    if (!file) return alert('Selecione um arquivo.')
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await importNfses(file, ano, mes)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>Importar NFS-e</h1>
        <p>Importacao de notas fiscais via planilha Excel</p>
      </div>

      <div className="panel">
        <header className="panel__header"><h3>Upload de Planilha</h3></header>
        <div className="panel__body module-content">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            <label>
              Ano *
              <select value={ano} onChange={e => setAno(Number(e.target.value))}>
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              Mes *
              <select value={mes} onChange={e => setMes(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{String(i + 1).padStart(2, '0')}</option>
                ))}
              </select>
            </label>
            <label>
              Arquivo (Excel ou XML)
              <input type="file" accept=".xlsx,.xls,.xml" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <button className="btn btn--solid" onClick={handleImport} disabled={loading || !file}>
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      {result && (
        <div className="panel">
          <header className="panel__header"><h3>Resultado da Importacao</h3></header>
          <div className="panel__body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)', fontFamily: "'Space Grotesk',sans-serif" }}>{result.criadas}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Criadas</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Space Grotesk',sans-serif" }}>{result.atualizadas}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Atualizadas</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: result.erros > 0 ? 'var(--danger)' : 'var(--text-muted)', fontFamily: "'Space Grotesk',sans-serif" }}>{result.erros}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Erros</div>
              </div>
            </div>
            {result.errosLista?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>Detalhes dos erros:</p>
                <ul style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 16 }}>
                  {result.errosLista.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Format Documentation */}
      <div className="panel">
        <header className="panel__header"><h3>Formato Esperado</h3></header>
        <div className="panel__body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
            A planilha Excel deve conter as seguintes colunas (nomes flexiveis):
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Coluna</th><th>Obrigatoria</th><th>Descricao</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>Numero</strong></td><td>Sim</td><td>Numero da NFS-e</td></tr>
                <tr><td><strong>Serie</strong></td><td>Nao</td><td>Serie (padrao: 1)</td></tr>
                <tr><td><strong>Valor / ValorServicos</strong></td><td>Sim</td><td>Valor dos servicos</td></tr>
                <tr><td><strong>Cliente / Tomador</strong></td><td>Nao</td><td>Nome do tomador</td></tr>
                <tr><td><strong>CNPJ / CpfCnpj</strong></td><td>Nao</td><td>CNPJ/CPF do tomador</td></tr>
                <tr><td><strong>Data / DataEmissao</strong></td><td>Nao</td><td>Data de emissao (YYYY-MM-DD)</td></tr>
                <tr><td><strong>Aliquota</strong></td><td>Nao</td><td>Aliquota ISS (%)</td></tr>
                <tr><td><strong>ISS / ValorIss</strong></td><td>Nao</td><td>Valor ISS</td></tr>
                <tr><td><strong>Status</strong></td><td>Nao</td><td>Status (EMITIDA, CANCELADA, etc.)</td></tr>
                <tr><td><strong>Descricao</strong></td><td>Nao</td><td>Descricao do servico</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
