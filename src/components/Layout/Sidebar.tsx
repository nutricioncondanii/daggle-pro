import { GameState } from '../../types/dag';
import { achievements } from '../../levels/achievements';
import './Sidebar.css';

type Mode = 'tutorial' | 'quiz' | 'sandbox';

interface SidebarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  gameState: GameState;
  newAchievement: string | null;
  onReset: () => void;
}

export default function Sidebar({ mode, onModeChange, gameState, newAchievement, onReset }: SidebarProps) {
  const accuracy = gameState.questionsAnswered > 0
    ? Math.round((gameState.questionsCorrect / gameState.questionsAnswered) * 100)
    : 0;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">
          <span className="logo-dag">DAG</span>
          <span className="logo-gle">gle</span>
          <span className="logo-pro">PRO</span>
        </h1>
        <p className="tagline">Domina la inferencia causal</p>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${mode === 'tutorial' ? 'active' : ''}`}
          onClick={() => onModeChange('tutorial')}
        >
          <span className="nav-icon">📖</span>
          <span className="nav-label">Tutorial</span>
          <span className="nav-desc">Aprende los conceptos</span>
        </button>
        <button
          className={`nav-item ${mode === 'quiz' ? 'active' : ''}`}
          onClick={() => onModeChange('quiz')}
        >
          <span className="nav-icon">🎯</span>
          <span className="nav-label">Practicar</span>
          <span className="nav-desc">Ejercicios aleatorios</span>
        </button>
        <button
          className={`nav-item ${mode === 'sandbox' ? 'active' : ''}`}
          onClick={() => onModeChange('sandbox')}
        >
          <span className="nav-icon">🔬</span>
          <span className="nav-label">Sandbox</span>
          <span className="nav-desc">Explora libremente</span>
        </button>
      </nav>

      <div className="sidebar-stats">
        <h3>Estadísticas</h3>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-value">{gameState.score}</div>
            <div className="stat-label">Puntos</div>
          </div>
          <div className="stat">
            <div className="stat-value">{gameState.level}</div>
            <div className="stat-label">Nivel</div>
          </div>
          <div className="stat">
            <div className="stat-value">{gameState.streak}</div>
            <div className="stat-label">Racha</div>
          </div>
          <div className="stat">
            <div className="stat-value">{accuracy}%</div>
            <div className="stat-label">Precisión</div>
          </div>
        </div>
        <div className="stat-detail">
          {gameState.questionsCorrect}/{gameState.questionsAnswered} correctas
          · Mejor racha: {gameState.bestStreak}
        </div>
      </div>

      <div className="sidebar-achievements">
        <h3>Logros ({gameState.achievements.length}/{achievements.length})</h3>
        <div className="achievement-list">
          {achievements.map(a => {
            const unlocked = gameState.achievements.includes(a.id);
            const isNew = newAchievement === a.id;
            return (
              <div
                key={a.id}
                className={`achievement ${unlocked ? 'unlocked' : ''} ${isNew ? 'new' : ''}`}
                title={a.description}
              >
                <span className="achievement-icon">{unlocked ? a.icon : '🔒'}</span>
                <div className="achievement-info">
                  <div className="achievement-name">{a.name}</div>
                  <div className="achievement-desc">{a.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn btn-ghost btn-sm reset-btn" onClick={onReset}>
        Reiniciar progreso
      </button>
    </aside>
  );
}
