import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
  CalendarRange,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import './interactions.css';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const columns = [
  { id: 'backlog', title: 'A fazer', tint: 'mint' },
  { id: 'in-progress', title: 'Em andamento', tint: 'blue' },
  { id: 'done', title: 'Concluído', tint: 'peach' },
] as const;

type ColumnId = (typeof columns)[number]['id'];
type PersonName = 'Alice' | 'Bruno';
type Card = {
  id: string;
  title: string;
  description: string;
  assignee: PersonName;
  column: ColumnId;
};
type Board = { id: string; name: string; version: number; cards: Card[] };
type Session = { accessToken: string; user: { id: string; name: PersonName } };
type WorkspaceSection = 'overview' | 'project' | 'updates';
type ProjectView = 'board' | 'list' | 'timeline';
type ActivityItem = { id: string; text: string; time: string };

function App() {
  const [identity, setIdentity] = useState<PersonName>('Alice');
  const [session, setSession] = useState<Session | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [connected, setConnected] = useState(false);
  const [busyCard, setBusyCard] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('project');
  const [projectView, setProjectView] = useState<ProjectView>('board');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardDescription, setNewCardDescription] = useState('');
  const [newCardColumn, setNewCardColumn] = useState<ColumnId>('backlog');
  const [creatingCard, setCreatingCard] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let socket: Socket | undefined;
    let active = true;

    async function connect() {
      setSession(null);
      setBoard(null);
      setConnected(false);
      try {
        const login = await fetch(`${API_URL}/api/auth/demo-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: identity }),
        });
        if (!login.ok) throw new Error('Não foi possível iniciar a sessão.');
        const newSession = (await login.json()) as Session;
        const response = await fetch(`${API_URL}/api/boards/demo`, {
          headers: { Authorization: `Bearer ${newSession.accessToken}` },
        });
        if (!response.ok) throw new Error('Não foi possível carregar o quadro.');
        const initialBoard = (await response.json()) as Board;
        if (!active) return;
        setSession(newSession);
        setBoard(initialBoard);

        socket = io(`${API_URL}/collaboration`, {
          auth: { token: newSession.accessToken },
          transports: ['websocket'],
        });
        socket.on('connect', () => {
          setConnected(true);
          socket?.emit('board:join', { boardId: 'demo' });
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));
        socket.on('board:updated', (update: { board: Board; change: { actor: string; cardId: string; action?: string } }) => {
          setBoard(update.board);
          const card = update.board.cards.find((item) => item.id === update.change.cardId);
          const activityText = update.change.action === 'created'
            ? `${update.change.actor} criou “${card?.title ?? 'uma tarefa'}”`
            : `${update.change.actor} moveu “${card?.title ?? 'uma tarefa'}”`;
          setActivities((current) => [{ id: `${Date.now()}-${update.change.cardId}`, text: activityText, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }, ...current].slice(0, 30));
          setNotice(activityText);
          window.setTimeout(() => setNotice(''), 2600);
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Falha ao conectar à API.');
      }
    }

    void connect();
    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [identity]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setNewCardOpen(false);
        setSessionMenuOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredCards = (board?.cards ?? []).filter((card) => {
    const searchable = `${card.title} ${card.description} ${card.assignee}`.toLowerCase();
    return searchable.includes(searchQuery.trim().toLowerCase());
  });

  async function moveCard(card: Card) {
    if (!board || !session) return;
    const nextColumn = columns[(columns.findIndex((column) => column.id === card.column) + 1) % columns.length];
    setBusyCard(card.id);
    try {
      const response = await fetch(`${API_URL}/api/boards/demo/cards/${card.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ column: nextColumn.id, expectedVersion: board.version }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setBoard(payload.board as Board);
        setNotice('Quadro atualizado por outra sessão. Estado sincronizado.');
      } else if (!response.ok) {
        throw new Error('Não foi possível mover o cartão.');
      } else {
        setBoard(payload.board as Board);
        setNotice(`Cartão movido para ${nextColumn.title}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Falha ao mover cartão.');
    } finally {
      setBusyCard(null);
      window.setTimeout(() => setNotice(''), 2600);
    }
  }

  async function createCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !newCardTitle.trim()) return;
    setCreatingCard(true);
    try {
      const response = await fetch(`${API_URL}/api/boards/demo/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
        body: JSON.stringify({ title: newCardTitle.trim(), description: newCardDescription.trim(), column: newCardColumn }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Não foi possível criar a tarefa.');
      setBoard(payload.board as Board);
      setNewCardTitle('');
      setNewCardDescription('');
      setNewCardColumn('backlog');
      setNewCardOpen(false);
      setWorkspaceSection('project');
      setProjectView('board');
      setNotice('Tarefa criada e sincronizada com o quadro.');
      window.setTimeout(() => setNotice(''), 2600);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Falha ao criar tarefa.');
    } finally {
      setCreatingCard(false);
    }
  }

  function switchIdentity(name: PersonName) {
    setIdentity(name);
    setSessionMenuOpen(false);
  }

  function openNewCard(column: ColumnId = 'backlog') {
    setNewCardColumn(column);
    setNewCardOpen(true);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Command size={18} strokeWidth={2.4} /></div>
          <span>syncspace</span>
          <button className="icon-button workspace-menu" aria-label="Menu do workspace"><ChevronDown size={15} /></button>
        </div>
        <button className="search-field" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Buscar qualquer coisa</span><kbd>⌘ K</kbd></button>
        <div className="side-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Navegação do workspace">
          <button className={`nav-item ${workspaceSection === 'overview' ? 'active' : ''}`} onClick={() => setWorkspaceSection('overview')}><Activity size={17} /> Visão geral</button>
          <button className={`nav-item ${workspaceSection === 'project' ? 'active' : ''}`} onClick={() => setWorkspaceSection('project')}><LayoutGrid size={17} /> Projetos <span className="nav-count">1</span></button>
          <button className={`nav-item ${workspaceSection === 'updates' ? 'active' : ''}`} onClick={() => setWorkspaceSection('updates')}><Sparkles size={17} /> Atualizações {activities.length > 0 && <span className="nav-count">{activities.length}</span>}</button>
        </nav>
        <div className="side-section-heading"><span>SEUS PROJETOS</span><button className="icon-button" aria-label="Adicionar projeto"><Plus size={16} /></button></div>
          <button className="project-item selected" onClick={() => setWorkspaceSection('project')}><span className="project-glyph glyph-coral">S</span><span>SyncSpace launch</span><MoreHorizontal size={16} /></button>
          <button className="project-item" onClick={() => setNotice('Este projeto de exemplo ainda não foi criado.')}><span className="project-glyph glyph-yellow">N</span><span>Northstar mobile</span></button>
          <button className="project-item" onClick={() => setNotice('Este projeto de exemplo ainda não foi criado.')}><span className="project-glyph glyph-blue">W</span><span>Website refresh</span></button>
        <div className="sidebar-bottom">
          <button className="nav-item"><CircleHelp size={17} /> Central de ajuda</button>
          <button className="profile-row" onClick={() => setSessionMenuOpen((open) => !open)}>
            <span className={`avatar avatar-${identity.toLowerCase()}`}>{identity === 'Alice' ? 'A' : 'B'}</span>
            <span className="profile-copy"><strong>{identityCosta(identity)}</strong><small>Product team</small></span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Projetos</span><span className="crumb-divider">/</span><span>SyncSpace launch</span></div>
          <div className="top-actions">
            <span className={`connection-pill ${connected ? 'online' : ''}`}><i />{connected ? 'Ao vivo' : 'Conectando'}</span>
            <button className="icon-button top-icon" aria-label="Configurações"><Settings2 size={17} /></button>
            <div className="avatar-stack" aria-label="Membros ativos"><span className="avatar avatar-alice">A</span><span className="avatar avatar-bruno">B</span><span className="avatar-add">+2</span></div>
            <div className="session-menu-anchor">
              <button className="share-button" onClick={() => setSessionMenuOpen((open) => !open)}>Trocar sessão <ChevronDown size={14} /></button>
              {sessionMenuOpen && <div className="session-menu" role="menu"><span>Entrar como</span>{(['Alice', 'Bruno'] as const).map((name) => <button key={name} role="menuitem" className={identity === name ? 'current' : ''} onClick={() => switchIdentity(name)}><span className={`avatar avatar-${name.toLowerCase()}`}>{name[0]}</span>{identityCosta(name)}{identity === name && <Check size={14} />}</button>)}</div>}
            </div>
          </div>
        </header>

        <section className="board-content">
          {workspaceSection === 'overview' ? <section className="workspace-page">
            <div className="project-overline"><span className="overline-dot" /> WORKSPACE</div>
            <div className="page-heading"><div><h1>Visão geral</h1><p>Resumo do trabalho do seu time.</p></div><button className="primary-button" onClick={() => setNewCardOpen(true)}><Plus size={16} /> Novo cartão</button></div>
            <div className="overview-stats"><article><span>Tarefas no projeto</span><strong>{board?.cards.length ?? 0}</strong><small>SyncSpace launch</small></article><article><span>Em andamento</span><strong>{board?.cards.filter((card) => card.column === 'in-progress').length ?? 0}</strong><small>Ativas agora</small></article><article><span>Concluídas</span><strong>{board?.cards.filter((card) => card.column === 'done').length ?? 0}</strong><small>Neste quadro</small></article></div>
            <section className="overview-project"><div className="section-title"><div><span className="project-glyph glyph-coral">S</span><div><h2>SyncSpace launch</h2><p>{board?.cards.length ?? 0} tarefas · versão {board?.version ?? '—'}</p></div></div><button className="outline-button" onClick={() => setWorkspaceSection('project')}>Abrir quadro <ArrowRight size={14} /></button></div><div className="overview-progress">{columns.map((column) => <div key={column.id}><span>{column.title}</span><strong>{board?.cards.filter((card) => card.column === column.id).length ?? 0}</strong><i className={column.tint} /></div>)}</div></section>
            <section className="activity-panel"><div className="section-title"><div><h2>Atividade recente</h2><p>Atualizações recebidas em tempo real</p></div><button className="text-button" onClick={() => setWorkspaceSection('updates')}>Ver tudo <ArrowRight size={14} /></button></div>{activities.length === 0 ? <p className="empty-state">As alterações do quadro aparecerão aqui.</p> : activities.slice(0, 4).map((item) => <div className="activity-row" key={item.id}><span className="activity-mark"><Activity size={14} /></span><span>{item.text}</span><time>{item.time}</time></div>)}</section>
          </section> : workspaceSection === 'updates' ? <section className="workspace-page">
            <div className="project-overline"><span className="overline-dot" /> WORKSPACE</div><div className="page-heading"><div><h1>Atualizações</h1><p>Movimentações recentes do SyncSpace launch.</p></div><button className="outline-button" onClick={() => setWorkspaceSection('project')}><LayoutGrid size={15} /> Voltar ao quadro</button></div>
            <section className="activity-panel updates-panel"><div className="section-title"><div><h2>Atividade do projeto</h2><p>Eventos recebidos pela conexão em tempo real</p></div><span className={`connection-pill ${connected ? 'online' : ''}`}><i />{connected ? 'Ao vivo' : 'Reconectando'}</span></div>{activities.length === 0 ? <p className="empty-state">Nenhuma atualização ainda. Mova ou crie uma tarefa para gerar atividade.</p> : activities.map((item) => <div className="activity-row" key={item.id}><span className="activity-mark"><Activity size={14} /></span><span>{item.text}</span><time>{item.time}</time></div>)}</section>
          </section> : <>
          <div className="project-overline"><span className="overline-dot" /> SPRINT 04 <span className="overline-line" /> 12–26 JUN</div>
          <div className="title-row">
            <div><h1>SyncSpace launch</h1><p>Da primeira ideia ao primeiro espaço compartilhado.</p></div>
            <div className="title-actions"><button className="outline-button" onClick={() => setWorkspaceSection('updates')}><Activity size={15} /> Atividade</button><button className="primary-button" onClick={() => setNewCardOpen(true)}><Plus size={16} /> Novo cartão</button></div>
          </div>

          <div className="board-toolbar">
            <div className="view-tabs"><button className={`view-tab ${projectView === 'board' ? 'active' : ''}`} onClick={() => setProjectView('board')}><LayoutGrid size={14} /> Quadro</button><button className={`view-tab ${projectView === 'list' ? 'active' : ''}`} onClick={() => setProjectView('list')}><List size={14} /> Lista</button><button className={`view-tab ${projectView === 'timeline' ? 'active' : ''}`} onClick={() => setProjectView('timeline')}><CalendarRange size={14} /> Cronograma</button></div>
            <div className="board-tools"><button className="tool-button" onClick={() => setSearchOpen(true)}><Search size={15} /> Filtrar</button><button className="tool-button" onClick={() => setProjectView(projectView === 'board' ? 'list' : 'board')}><Settings2 size={15} /> {projectView === 'board' ? 'Agrupar: status' : 'Agrupar: quadro'}</button><button className="tool-icon" aria-label="Mais opções" onClick={() => setNotice(`Versão atual do quadro: ${board?.version ?? '—'}`)}><MoreHorizontal size={18} /></button></div>
          </div>

          <div className="board-meta"><span>{filteredCards.length} tarefas</span>{searchQuery && <button className="clear-filter" onClick={() => setSearchQuery('')}>Busca: “{searchQuery}” <X size={12} /></button>}<span className="meta-separator">·</span><span>Atualizado em tempo real</span><span className="meta-spacer" /><span className="sync-label">{connected ? <><Wifi size={14} /> sincronizado</> : <><WifiOff size={14} /> reconectando</>}</span></div>

          {notice && <div className="toast" role="status"><Check size={15} />{notice}</div>}

          {projectView === 'board' && <div className="board-grid">
            {columns.map((column) => {
              const cards = filteredCards.filter((card) => card.column === column.id);
              return <section className="board-column" key={column.id}>
                <div className="column-heading">
                  <div className={`column-marker ${column.tint}`} />
                  <h2>{column.title}</h2><span className="column-count">{cards.length}</span>
                  <button className="icon-button column-menu" aria-label={`Opções: ${column.title}`}><MoreHorizontal size={17} /></button>
                </div>
                <div className="card-list">
                  {cards.map((card, index) => <article className={`task-card task-${index % 3}`} key={card.id}>
                    <div className="card-topline"><span className={`priority priority-${card.id === 'card-2' ? 'high' : 'normal'}`}><i />{card.id === 'card-2' ? 'Alta' : 'Normal'}</span><button className="icon-button card-menu" aria-label={`Opções: ${card.title}`}><MoreHorizontal size={16} /></button></div>
                    <h3>{card.title}</h3><p>{card.description}</p>
                    <div className="card-footer"><span className={`avatar avatar-${card.assignee.toLowerCase()}`}>{card.assignee[0]}</span><span className="assignee-name">{card.assignee}</span><span className="card-spacer" /><span className="card-date">{card.id === 'card-3' ? 'Concluído' : '26 jun'}</span><button className="move-button" disabled={busyCard === card.id} onClick={() => void moveCard(card)} aria-label={`Avançar ${card.title}`} title="Mover para a próxima etapa"><ArrowRight size={15} /></button></div>
                  </article>)}
                  <button className="add-card" onClick={() => openNewCard(column.id)}><Plus size={15} /> Adicionar tarefa</button>
                </div>
              </section>;
            })}
          </div>}
          {projectView === 'list' && <div className="list-view"><div className="list-header"><span>Tarefa</span><span>Responsável</span><span>Status</span><span>Ação</span></div>{filteredCards.map((card) => <div className="list-row" key={card.id}><div><strong>{card.title}</strong><small>{card.description}</small></div><span className="list-person"><i className={`avatar avatar-${card.assignee.toLowerCase()}`}>{card.assignee[0]}</i>{card.assignee}</span><span className="status-label"><i className={`column-marker ${columns.find((column) => column.id === card.column)?.tint}`} />{columns.find((column) => column.id === card.column)?.title}</span><button className="move-button" onClick={() => void moveCard(card)} aria-label={`Avançar ${card.title}`}><ArrowRight size={15} /></button></div>)}<button className="add-card list-add" onClick={() => openNewCard()}><Plus size={15} /> Adicionar tarefa</button></div>}
          {projectView === 'timeline' && <div className="timeline-view">{filteredCards.map((card) => <div className="timeline-row" key={card.id}><div className="timeline-task"><strong>{card.title}</strong><small>{card.assignee}</small></div><div className="timeline-track">{columns.map((column) => <button key={column.id} aria-label={`${card.title}: ${column.title}`} title={column.title} className={`timeline-stage ${column.id === card.column ? `selected ${column.tint}` : ''}`} onClick={() => session && board && column.id !== card.column && void (async () => { const response = await fetch(`${API_URL}/api/boards/demo/cards/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ column: column.id, expectedVersion: board.version }) }); const payload = await response.json(); if (response.ok) setBoard(payload.board as Board); else if (payload.board) setBoard(payload.board as Board); })()}><i /></button>)}</div><span className="timeline-status">{columns.find((column) => column.id === card.column)?.title}</span></div>)}</div>}
          {projectView !== 'board' && <button className="add-card view-add" onClick={() => openNewCard()}><Plus size={15} /> Adicionar tarefa</button>}
          <footer className="board-footer"><span className="footer-live"><i /> {connected ? `${identity} está online` : 'Estabelecendo conexão'}</span><span>Versão do quadro {board?.version ?? '—'}</span></footer>
          </>}
        </section>
      </main>
      {searchOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="Buscar no SyncSpace"><div className="search-dialog-input"><Search size={18} /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar tarefas, descrições ou responsáveis..." /><button className="icon-button" aria-label="Fechar busca" onClick={() => setSearchOpen(false)}><X size={17} /></button></div><div className="search-results-label">{searchQuery ? `${filteredCards.length} resultados` : 'TAREFAS DO PROJETO'}</div><div className="search-results">{filteredCards.length === 0 ? <p className="empty-state">Nenhuma tarefa encontrada.</p> : filteredCards.map((card) => <button key={card.id} className="search-result" onClick={() => { setSearchOpen(false); setWorkspaceSection('project'); setProjectView('board'); }}><span className={`column-marker ${columns.find((column) => column.id === card.column)?.tint}`} /><span><strong>{card.title}</strong><small>{card.description}</small></span><kbd>{columns.find((column) => column.id === card.column)?.title}</kbd></button>)}</div><div className="search-dialog-footer"><span>Pesquise por título, descrição ou responsável</span><button onClick={() => setSearchQuery('')}>Limpar busca</button></div></section></div>}
      {newCardOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewCardOpen(false); }}><form className="task-dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onSubmit={(event) => void createCard(event)}><div className="dialog-heading"><div><span className="project-overline"><span className="overline-dot" /> SYNCSPACE LAUNCH</span><h2 id="new-task-title">Nova tarefa</h2></div><button type="button" className="icon-button" aria-label="Fechar formulário" onClick={() => setNewCardOpen(false)}><X size={18} /></button></div><label>Título<input autoFocus required maxLength={100} value={newCardTitle} onChange={(event) => setNewCardTitle(event.target.value)} placeholder="Ex.: Revisar fluxo de onboarding" /></label><label>Descrição<textarea maxLength={500} value={newCardDescription} onChange={(event) => setNewCardDescription(event.target.value)} placeholder="O que precisa ser feito?" rows={3} /></label><div className="form-row"><label>Status<select value={newCardColumn} onChange={(event) => setNewCardColumn(event.target.value as ColumnId)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label><div className="assigned-to"><span>Responsável</span><div><i className={`avatar avatar-${identity.toLowerCase()}`}>{identity[0]}</i>{identityCosta(identity)}</div></div></div><div className="dialog-actions"><button type="button" className="outline-button" onClick={() => setNewCardOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={creatingCard || !newCardTitle.trim()}>{creatingCard ? 'Criando...' : <><Plus size={15} /> Criar tarefa</>}</button></div></form></div>}
      <div className="identity-switcher" role="group" aria-label="Identidade de demonstração">
        <span>Visualizando como</span>
        <button className={identity === 'Alice' ? 'identity-choice selected' : 'identity-choice'} onClick={() => switchIdentity('Alice')}><span className="avatar avatar-alice">A</span>Alice</button>
        <button className={identity === 'Bruno' ? 'identity-choice selected' : 'identity-choice'} onClick={() => switchIdentity('Bruno')}><span className="avatar avatar-bruno">B</span>Bruno</button>
      </div>
    </div>
  );
}

function identityCosta(name: PersonName) {
  return name === 'Alice' ? 'Alice Costa' : 'Bruno Lima';
}

export default App;