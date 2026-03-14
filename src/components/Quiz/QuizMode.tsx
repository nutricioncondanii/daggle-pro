import { useState, useCallback, useMemo, useEffect } from 'react';
import DagCanvas from '../DagCanvas/DagCanvas';
import { DagGraph } from '../../types/dag';
import { findMinimalAdjustmentSets, explainAdjustmentSet } from '../../engine/adjustment';
import { generateDagForLevel } from '../../engine/generator';
import { analyzeAllPaths } from '../../engine/dseparation';
import { pathToString, classifyPath } from '../../engine/dag';
import { GameState } from '../../types/dag';
import './QuizMode.css';

interface QuizModeProps {
  gameState: GameState;
  onAnswer: (correct: boolean) => void;
}

type QuizType = 'adjustment_set' | 'identify_blocked' | 'd_separation';

export default function QuizMode({ gameState, onAnswer }: QuizModeProps) {
  const [dag, setDag] = useState<DagGraph>(() => generateDagForLevel(gameState.level));
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizType] = useState<QuizType>('adjustment_set');

  const correctSets = useMemo(() => findMinimalAdjustmentSets(dag), [dag]);

  const toggleNode = useCallback((nodeId: string) => {
    if (submitted) return;
    if (nodeId === dag.exposure || nodeId === dag.outcome) return;

    setSelectedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, [submitted, dag]);

  const handleSubmit = useCallback(() => {
    const selected = [...selectedNodes].sort();
    const correct = correctSets.some(
      set => {
        const sorted = [...set].sort();
        return sorted.length === selected.length &&
          sorted.every((v, i) => v === selected[i]);
      }
    );
    setIsCorrect(correct);
    setSubmitted(true);
    onAnswer(correct);
  }, [selectedNodes, correctSets, onAnswer]);

  const handleNext = useCallback(() => {
    setDag(generateDagForLevel(gameState.level));
    setSelectedNodes(new Set());
    setSubmitted(false);
    setIsCorrect(false);
    setShowExplanation(false);
  }, [gameState.level]);

  const explanation = useMemo(() => {
    if (!submitted) return null;
    return explainAdjustmentSet(dag, selectedNodes);
  }, [submitted, dag, selectedNodes]);

  const pathAnalysis = useMemo(() => {
    if (!showExplanation) return null;
    return analyzeAllPaths(dag, selectedNodes);
  }, [showExplanation, dag, selectedNodes]);

  const selectableNodes = useMemo(() => {
    return dag.nodes
      .filter(n => n.id !== dag.exposure && n.id !== dag.outcome);
  }, [dag]);

  const exposureLabel = dag.nodes.find(n => n.id === dag.exposure)?.label || '';
  const outcomeLabel = dag.nodes.find(n => n.id === dag.outcome)?.label || '';

  return (
    <div className="quiz-mode">
      <div className="quiz-header">
        <div className="quiz-level">Nivel {gameState.level}</div>
        <div className="quiz-prompt">
          Selecciona el <strong>conjunto de ajuste mínimo</strong> para estimar el efecto causal
          de <span className="exposure-text">{exposureLabel}</span> sobre{' '}
          <span className="outcome-text">{outcomeLabel}</span>
        </div>
        <div className="quiz-hint">
          Haz clic en los nodos para seleccionarlos/deseleccionarlos. El conjunto puede ser vacío.
        </div>
      </div>

      <DagCanvas
        graph={dag}
        selectedNodes={selectedNodes}
        onNodeClick={toggleNode}
        showRoles={submitted && showExplanation}
        conditionedNodes={submitted ? selectedNodes : undefined}
        height={350}
      />

      <div className="quiz-controls">
        <div className="selected-set">
          <span className="set-label">Tu conjunto de ajuste:</span>
          <span className="set-value">
            {selectedNodes.size === 0
              ? '{ } (vacío)'
              : `{ ${[...selectedNodes].map(id => dag.nodes.find(n => n.id === id)?.label).join(', ')} }`
            }
          </span>
        </div>

        {!submitted ? (
          <div className="quiz-buttons">
            <button className="btn btn-secondary" onClick={() => setSelectedNodes(new Set())}>
              Limpiar
            </button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              Verificar
            </button>
          </div>
        ) : (
          <div className="quiz-result">
            <div className={`result-banner ${isCorrect ? 'correct' : 'incorrect'}`}>
              {isCorrect ? '¡Correcto!' : 'Incorrecto'}
              {isCorrect && gameState.streak > 1 && (
                <span className="streak-bonus"> Racha x{gameState.streak}! +{10 * gameState.streak} pts</span>
              )}
            </div>

            {!isCorrect && (
              <div className="correct-answer">
                <strong>Respuesta(s) correcta(s):</strong>{' '}
                {correctSets.map((set, i) => (
                  <span key={i} className="correct-set">
                    {set.length === 0
                      ? '{ } (vacío)'
                      : `{ ${set.map(id => dag.nodes.find(n => n.id === id)?.label).join(', ')} }`
                    }
                    {i < correctSets.length - 1 ? ' ó ' : ''}
                  </span>
                ))}
              </div>
            )}

            <button
              className="btn btn-ghost"
              onClick={() => setShowExplanation(!showExplanation)}
            >
              {showExplanation ? 'Ocultar explicación' : 'Ver explicación detallada'}
            </button>

            {showExplanation && explanation && (
              <div className="explanation-panel">
                <h4>Análisis de caminos</h4>
                {pathAnalysis && pathAnalysis.map((p, i) => {
                  const pathStr = pathToString(dag, p.path);
                  const type = classifyPath(dag, p.path);
                  return (
                    <div key={i} className={`path-item ${p.blocked ? 'blocked' : 'open'}`}>
                      <span className="path-type">
                        {type === 'causal' ? '🟢 Causal' : type === 'backdoor' ? '🔴 Backdoor' : '🟡 Otro'}
                      </span>
                      <span className="path-str">{pathStr}</span>
                      <span className="path-status">
                        {p.blocked ? '✓ Bloqueado' : '✗ Abierto'}
                      </span>
                      {p.reason && <div className="path-reason">{p.reason}</div>}
                    </div>
                  );
                })}
                <h4>Verificación del conjunto</h4>
                {explanation.explanations.map((exp, i) => (
                  <div key={i} className="explanation-line">{exp}</div>
                ))}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleNext}>
              Siguiente ejercicio →
            </button>
          </div>
        )}
      </div>

      <div className="node-selector">
        <div className="node-selector-label">Variables disponibles:</div>
        <div className="node-chips">
          {selectableNodes.map(node => (
            <button
              key={node.id}
              className={`node-chip ${selectedNodes.has(node.id) ? 'selected' : ''}`}
              onClick={() => toggleNode(node.id)}
              disabled={submitted}
            >
              {node.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
