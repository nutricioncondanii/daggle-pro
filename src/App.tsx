import { useState, useCallback, useMemo } from 'react';
import DagCanvas from './components/DagCanvas/DagCanvas';
import { DagGraph } from './types/dag';
import { generateRandomDag } from './engine/generator';
import { findMinimalAdjustmentSets } from './engine/adjustment';
import { analyzeAllPaths } from './engine/dseparation';
import { pathToString, classifyPath, label } from './engine/dag';
import './App.css';

const DIFF_INFO = {
  1: { label: 'Fácil', desc: '1 confusor, adjustment set simple', color: '#4ade80' },
  2: { label: 'Medio', desc: '2+ backdoor paths, colliders posibles', color: '#fbbf24' },
  3: { label: 'Difícil', desc: 'M-bias, trampas de collider, sets complejos', color: '#f87171' },
} as const;

function App() {
  const [numNodes, setNumNodes] = useState(5);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [customNames, setCustomNames] = useState('');

  const [dag, setDag] = useState<DagGraph | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  const generate = useCallback(() => {
    const raw = customNames.trim();
    const names = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const n = names && names.length >= 3 ? names.length : numNodes;
    setDag(generateRandomDag(n, difficulty, names));
    setSelected(new Set());
    setSubmitted(false);
    setCorrect(false);
    setShowExplain(false);
  }, [numNodes, difficulty, customNames]);

  const toggle = useCallback((id: string) => {
    if (submitted || !dag) return;
    if (id === dag.exposure || id === dag.outcome) return;
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }, [submitted, dag]);

  const correctSets = useMemo(() => dag ? findMinimalAdjustmentSets(dag) : [], [dag]);

  const submit = useCallback(() => {
    if (!dag) return;
    const sel = [...selected].sort();
    const ok = correctSets.some(set => {
      const s = [...set].sort();
      return s.length === sel.length && s.every((v, i) => v === sel[i]);
    });
    setCorrect(ok);
    setSubmitted(true);
    setScore(p => ({ ok: p.ok + (ok ? 1 : 0), total: p.total + 1 }));
  }, [dag, selected, correctSets]);

  const reveal = useCallback(() => {
    setSubmitted(true);
    setCorrect(false);
    setScore(p => ({ ...p, total: p.total + 1 }));
  }, []);

  const paths = useMemo(() => {
    if (!dag || !showExplain) return null;
    return analyzeAllPaths(dag, selected);
  }, [dag, showExplain, selected]);

  // ─── Setup screen ─────────────────────────────────────────────
  if (!dag) {
    return (
      <div className="container">
        <div className="setup">
          <h1 className="title">DAGgle <span className="badge">PRO</span></h1>
          <p className="sub">Practica conjuntos de ajuste en DAGs causales</p>

          {score.total > 0 && (
            <p className="score-line">{score.ok}/{score.total} correctas</p>
          )}

          {/* Difficulty selector */}
          <div className="field">
            <label>Dificultad</label>
            <div className="diff-buttons">
              {([1, 2, 3] as const).map(d => (
                <button
                  key={d}
                  className={`diff-btn ${difficulty === d ? 'active' : ''}`}
                  style={{ '--dc': DIFF_INFO[d].color } as React.CSSProperties}
                  onClick={() => setDifficulty(d)}
                >
                  <span className="diff-label">{DIFF_INFO[d].label}</span>
                  <span className="diff-desc">{DIFF_INFO[d].desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Variables</label>
            <div className="range-row">
              <input type="range" min={3} max={10} value={numNodes}
                onChange={e => setNumNodes(+e.target.value)} />
              <span className="range-num">{numNodes}</span>
            </div>
          </div>

          <div className="field">
            <label>Nombres <small>(opcional, separados por coma)</small></label>
            <input type="text" value={customNames} onChange={e => setCustomNames(e.target.value)}
              placeholder="Ej: Edad, Fumar, Cáncer, Ejercicio, Dieta" />
          </div>

          <button className="btn-main" onClick={generate}>Generar DAG</button>

          <div className="info-box">
            <h3>Como jugar</h3>
            <ol>
              <li>Se genera un DAG con <b>exposicion</b> (azul) y <b>resultado</b> (rojo)</li>
              <li>Selecciona las variables para el <b>conjunto de ajuste minimo</b></li>
              <li>El conjunto puede ser vacio (no selecciones nada)</li>
              <li>Verifica y aprende de la explicacion</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // ─── Game screen ──────────────────────────────────────────────
  const selectable = dag.nodes.filter(n => n.id !== dag.exposure && n.id !== dag.outcome);
  const expLabel = label(dag, dag.exposure);
  const outLabel = label(dag, dag.outcome);
  const di = DIFF_INFO[difficulty];

  return (
    <div className="container">
      <div className="game">
        <div className="game-top">
          <button className="btn-back" onClick={() => setDag(null)}>&larr;</button>
          <h2>
            <span className="c-blue">{expLabel}</span>
            {' \u2192 '}
            <span className="c-red">{outLabel}</span>
          </h2>
          <div className="game-top-right">
            <span className="diff-pill" style={{ color: di.color, borderColor: di.color }}>
              {di.label}
            </span>
            <span className="score-pill">{score.ok}/{score.total}</span>
          </div>
        </div>

        <p className="prompt">Selecciona el conjunto de ajuste minimo suficiente.</p>

        <DagCanvas
          graph={dag}
          selectedNodes={selected}
          onNodeClick={toggle}
          showRoles={submitted && showExplain}
          height={420}
        />

        {/* Checkboxes */}
        <div className="checks-box">
          <span className="checks-title">Ajustar por:</span>
          <div className="checks">
            {selectable.map(n => (
              <label key={n.id} className={`chk ${selected.has(n.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={selected.has(n.id)}
                  onChange={() => toggle(n.id)} disabled={submitted} />
                {n.label}
              </label>
            ))}
          </div>
          <div className="set-display">
            {'{ '}
            {selected.size === 0
              ? 'vacio'
              : [...selected].map(id => label(dag, id)).join(', ')}
            {' }'}
          </div>
        </div>

        {!submitted ? (
          <div className="actions">
            <button className="btn-main" onClick={submit}>Verificar</button>
            <button className="btn-sec" onClick={reveal}>Ver respuesta</button>
          </div>
        ) : (
          <div className="result-area">
            <div className={`result-msg ${correct ? 'ok' : 'bad'}`}>
              {correct ? 'Correcto!' : 'Incorrecto'}
            </div>

            <div className="answer-line">
              <b>Conjunto(s) valido(s):</b>
              {correctSets.map((set, i) => (
                <code key={i}>
                  {'{ '}{set.length === 0 ? 'vacio' : set.map(id => label(dag, id)).join(', ')}{' }'}
                </code>
              ))}
            </div>

            <button className="btn-link" onClick={() => setShowExplain(!showExplain)}>
              {showExplain ? '\u25B2 Ocultar explicacion' : '\u25BC Ver explicacion'}
            </button>

            {showExplain && paths && (
              <div className="explain">
                <h4>Caminos entre {expLabel} y {outLabel}</h4>
                {paths.map((p, i) => {
                  const type = classifyPath(dag, p.path);
                  return (
                    <div key={i} className={`path ${p.blocked ? 'blocked' : 'open'}`}>
                      <span className="ptag">{type === 'causal' ? 'Causal' : 'No-causal'}</span>
                      <span className="ptext">{pathToString(dag, p.path)}</span>
                      <span className="pstatus">{p.blocked ? '\u2713 Bloqueado' : '\u2717 Abierto'}</span>
                      {p.reason && <span className="preason">{p.reason}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="actions">
              <button className="btn-main" onClick={generate}>Nuevo DAG</button>
              <button className="btn-sec" onClick={() => setDag(null)}>Configurar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
