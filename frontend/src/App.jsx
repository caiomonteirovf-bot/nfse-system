import { useCallback, useEffect, useState } from 'react'
import { SIDEBAR_ITEMS } from './lib/constants'
import { fetchBootstrap } from './api'
import Dashboard from './pages/Dashboard'
import NotasFiscais from './pages/NotasFiscais'
import Tomadores from './pages/Tomadores'
import Importar from './pages/Importar'
import Emissao from './pages/Emissao'
import Configuracoes from './pages/Configuracoes'
import XmlHistorico from './pages/XmlHistorico'
import Captura from './pages/Captura'
import './App.css'

const PAGE_LABELS = {
  dashboard: 'Dashboard',
  notas: 'Notas Fiscais',
  tomadores: 'Tomadores',
  captura: 'Captura NFS-e',
  importar: 'Importar',
  emissao: 'Emissao ABRASF',
  xml: 'Historico XML',
  config: 'Configuracoes',
}

const ICONS = {
  chart: <><polyline points="15 8 12 8 10 14 6 2 4 8 1 8"/></>,
  file: <><path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z"/><polyline points="9 2 9 6 13 6"/></>,
  users: <><path d="M11 14v-1.5A2.5 2.5 0 0 0 8.5 10h-4A2.5 2.5 0 0 0 2 12.5V14"/><circle cx="6.5" cy="5.5" r="2.5"/><path d="M14 14v-1.3a2.5 2.5 0 0 0-1.9-2.4M11 2.3a2.5 2.5 0 0 1 0 4.8"/></>,
  download: <><path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3"/><polyline points="4 7 8 11 12 7"/><line x1="8" y1="3" x2="8" y2="11"/></>,
  upload: <><path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3"/><polyline points="8 2 12 6 8 6"/><line x1="8" y1="2" x2="8" y2="10"/></>,
  send: <><line x1="14" y1="2" x2="7" y2="9"/><polygon points="14 2 9 14 7 9 2 7 14 2"/></>,
  code: <><polyline points="4 6 1 8 4 10"/><polyline points="12 6 15 8 12 10"/><line x1="10" y1="3" x2="6" y2="13"/></>,
  settings: <><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.06 1.06M11.94 11.94L13 13M3 13l1.06-1.06M11.94 4.06L13 3"/></>,
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [tomadores, setTomadores] = useState([])
  const [prestador, setPrestador] = useState(null)

  const loadBootstrap = useCallback(async () => {
    try {
      const payload = await fetchBootstrap()
      setTomadores(payload.data?.tomadores || [])
      setPrestador(payload.data?.prestador || null)
    } catch (err) {
      console.error('Erro bootstrap:', err)
    }
  }, [])

  useEffect(() => { loadBootstrap() }, [loadBootstrap])

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />
      case 'notas': return <NotasFiscais tomadores={tomadores} onRefresh={loadBootstrap} />
      case 'tomadores': return <Tomadores onRefresh={loadBootstrap} />
      case 'importar': return <Importar />
      case 'captura': return <Captura />
      case 'emissao': return <Emissao prestador={prestador} />
      case 'config': return <Configuracoes onRefresh={loadBootstrap} />
      case 'xml': return <XmlHistorico />
      default: return <Dashboard />
    }
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar__workspace">
          <div className="sidebar__workspace-inner">
            <div className="sidebar__logo">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 2z"/>
                <polyline points="9 2 9 6 13 6"/>
                <line x1="5" y1="9" x2="11" y2="9"/>
                <line x1="5" y1="11.5" x2="9" y2="11.5"/>
              </svg>
            </div>
            <div className="sidebar__brand">
              <div className="sidebar__brand-name">NFS-e System</div>
              <div className="sidebar__brand-sub">Notas Fiscais de Servico</div>
            </div>
          </div>
        </div>

        <nav className="sidebar__nav">
          {SIDEBAR_ITEMS.map(group => (
            <div key={group.group}>
              <div className="sidebar__nav-label">{group.group}</div>
              <div className="module-nav">
                {group.items.map(item => (
                  <button
                    key={item.id}
                    className={`module-nav__button${activePage === item.id ? ' is-active' : ''}`}
                    onClick={() => setActivePage(item.id)}
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      {ICONS[item.icon]}
                    </svg>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar__user">
          <div className="sidebar__user-inner">
            <div className="sidebar__avatar">NF</div>
            <div>
              <div className="sidebar__user-name">NFS-e System</div>
              <div className="sidebar__user-role">v1.0</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Workspace */}
      <main className="workspace">
        <header className="topbar">
          <div className="topbar__breadcrumb">
            <span className="topbar__breadcrumb-root">NFS-e</span>
            <span className="topbar__breadcrumb-sep">/</span>
            <span className="topbar__breadcrumb-current">{PAGE_LABELS[activePage] || 'Dashboard'}</span>
          </div>
          <div className="topbar__live">
            <span className="topbar__dot">
              <span className="topbar__dot-core" />
              <span className="topbar__dot-pulse" />
            </span>
            Online
          </div>
        </header>

        <div className="workspace-content">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
