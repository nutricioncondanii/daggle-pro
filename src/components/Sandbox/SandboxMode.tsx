import { useState, useCallback, useMemo } from 'react';
import DagCanvas from '../DagCanvas/DagCanvas';
import { DagGraph, DagNode, DagEdge } from '../../types/dag';
import { findMinimalAdjustmentSets, explainAdjustmentSet } from '../../engine/adjustment';
import { isDSeparated, analyzeAllPaths } from '../../engine/dseparation';
import { classifyAllNodes, getRoleDescription, getRoleColor } from '../../engine/roles';
import { pathToString, classifyPath } from '../../engine/dag';
import './SandboxMode.css';

const defaultDag: DagGraph = {
  nodes: [
    { id: 'n0', label: 'X' },
    { id: 'n1', label: 'Z' },
    { id: 'n2', label: 'Y' },
  ],
  edges: [
    { source: 'n0', target: 'n2' },
    { source: 'n1', target: 'n0' },
    { source: 'n1', target: 'n2' },
  ],
  exposure: 'n0',
  outcome: 'n2',
};

export default function SandboxMode() {
  const [dag, setDag] = useState<DagGraph>(defaultDag);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const [conditioned, setConditioned] = useState<Set<string>>(new Set());
  const [nodeCounter, setNodeCounter] = useState(3);

  const addNode = useCallback(() => {
    if (!newNodeLabel.trim()) return;
    const id = `n${nodeCounter}`;
    setDag(prev => ({
      ...prev,
      nodes: [...prev.nodes, { id, label: newNodeLabel.trim() }],
    }));
    setNodeCounter(prev => prev + 1);
    setNewNodeLabel('');
  }, [newNodeLabel, nodeCounter]);

  const removeNode = useCallback((nodeId: string) => {
    if (nodeId === dag.exposure || nodeId === dag.outcome) return;
    setDag(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
    }));
    setConditioned(prev => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, [dag]);

  const addEdge = useCallback(() => {
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget) return;
    if (dag.edges.some(e => e.source === edgeSource && e.target === edgeTarget)) return;
    setDag(prev => ({
      ...prev,
      edges: [...prev.edges, { source: edgeSource, target: edgeTarget }],
    }));
    setEdgeSource('');
    setEdgeTarget('');
  }, [edgeSource, edgeTarget, dag.edges]);

  const removeEdge = useCallback((idx: number) => {
    setDag(prev => ({
      ...prev,
      edges: prev.edges.filter((_, i) => i !== idx),
    }));
  }, []);

  const setExposure = useCallback((nodeId: string) => {
    setDag(prev => ({ ...prev, exposure: nodeId }));
  }, []);

  const setOutcome = useCallback((nodeId: string) => {
    setDag(prev => ({ ...prev, outcome: nodeId }));
  }, []);

  const toggleConditioned = useCallback((nodeId: string) => {
    if (nodeId === dag.exposure || nodeId === dag.outcome) return;
    setConditioned(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, [dag]);

  const roles = useMemo(() => classifyAllNodes(dag), [dag]);
  const adjSets = useMemo(() => {
    try { return findMinimalAdjustmentSets(dag); } catch { return []; }
  }, [dag]);
  const dSep = useMemo(() => {
    try { return isDSeparated(dag, dag.exposure, dag.outcome, conditioned); } catch { return false; }
  }, [dag, conditioned]);
  const pathAnalysis = useMemo(() => {
    try { return analyzeAllPaths(dag, conditioned); } catch { return []; }
  }, [dag, conditioned]);
  const adjustExplanation = useMemo(() => {
    try { return explainAdjustmentSet(dag, conditioned); } catch { return null; }
  }, [dag, conditioned]);

  return (
    <div className="sandbox-mode">
      <div className="sandbox-main">
        <div className="sandbox-canvas">
          <DagCanvas
            graph={dag}
            showRoles={true}
            conditionedNodes={conditioned}
            onNodeClick={toggleConditioned}
            interactive={true}
            height={400}
          />
          <div className="sandbox-hint">
            Haz clic en un nodo para condicionar/descondicionar
          </div>
        </div>

        <div className="sandbox-panel">
          <div className="panel-section">
            <h3>Nodos</h3>
            <div className="add-node-form">
              <input
                type="text"
                value={newNodeLabel}
                onChange={e => setNewNodeLabel(e.target.value)}
                placeholder="Nombre del nodo"
                onKeyDown={e => e.key === 'Enter' && addNode()}
              />
              <button className="btn btn-sm btn-primary" onClick={addNode}>+</button>
            </div>
            <div className="node-list">
              {dag.nodes.map(node => (
                <div key={node.id} className="node-item">
                  <span className="node-color" style={{ background: getRoleColor(roles.get(node.id)!) }} />
                  <span className="node-name">{node.label}</span>
                  <span className="node-role-text">{getRoleDescription(roles.get(node.id)!).split(' (')[0]}</span>
                  <div className="node-actions">
                    <button
                      className={`btn-icon ${dag.exposure === node.id ? 'active-e' : ''}`}
                      onClick={() => setExposure(node.id)}
                      title="Marcar como exposición"
                    >E</button>
                    <button
                      className={`btn-icon ${dag.outcome === node.id ? 'active-o' : ''}`}
                      onClick={() => setOutcome(node.id)}
                      title="Marcar como resultado"
                    >O</button>
                    <button
                      className="btn-icon delete"
                      onClick={() => removeNode(node.id)}
                      title="Eliminar"
                      disabled={node.id === dag.exposure || node.id === dag.outcome}
                    >×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <h3>Aristas</h3>
            <div className="add-edge-form">
              <select value={edgeSource} onChange={e => setEdgeSource(e.target.value)}>
                <option value="">De...</option>
                {dag.nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
              <span className="arrow-icon">→</span>
              <select value={edgeTarget} onChange={e => setEdgeTarget(e.target.value)}>
                <option value="">A...</option>
                {dag.nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
              <button className="btn btn-sm btn-primary" onClick={addEdge}>+</button>
            </div>
            <div className="edge-list">
              {dag.edges.map((edge, idx) => (
                <div key={idx} className="edge-item">
                  <span>{dag.nodes.find(n => n.id === edge.source)?.label}</span>
                  <span className="arrow-icon">→</span>
                  <span>{dag.nodes.find(n => n.id === edge.target)?.label}</span>
                  <button className="btn-icon delete" onClick={() => removeEdge(idx)}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sandbox-analysis">
        <div className="analysis-card">
          <h3>d-Separación</h3>
          <div className={`dsep-result ${dSep ? 'separated' : 'connected'}`}>
            {dag.nodes.find(n => n.id === dag.exposure)?.label} y{' '}
            {dag.nodes.find(n => n.id === dag.outcome)?.label} son{' '}
            <strong>{dSep ? 'd-separados' : 'd-conectados'}</strong>
            {conditioned.size > 0 && (
              <> dado {`{ ${[...conditioned].map(id => dag.nodes.find(n => n.id === id)?.label).join(', ')} }`}</>
            )}
          </div>
        </div>

        <div className="analysis-card">
          <h3>Conjuntos de ajuste mínimos</h3>
          {adjSets.length === 0 ? (
            <div className="no-sets">No se encontraron conjuntos válidos</div>
          ) : (
            <div className="adj-sets">
              {adjSets.map((set, i) => (
                <div key={i} className="adj-set">
                  {set.length === 0
                    ? '{ } (vacío)'
                    : `{ ${set.map(id => dag.nodes.find(n => n.id === id)?.label).join(', ')} }`
                  }
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analysis-card">
          <h3>Análisis de caminos</h3>
          {pathAnalysis.map((p, i) => {
            const pathStr = pathToString(dag, p.path);
            const type = classifyPath(dag, p.path);
            return (
              <div key={i} className={`path-item ${p.blocked ? 'blocked' : 'open'}`}>
                <span className="path-type">
                  {type === 'causal' ? '🟢' : type === 'backdoor' ? '🔴' : '🟡'}
                </span>
                <span className="path-str">{pathStr}</span>
                <span className="path-status">
                  {p.blocked ? '✓ Bloqueado' : '✗ Abierto'}
                </span>
              </div>
            );
          })}
          {pathAnalysis.length === 0 && (
            <div className="no-paths">No hay caminos entre exposición y resultado</div>
          )}
        </div>

        {adjustExplanation && (
          <div className="analysis-card">
            <h3>Tu conjunto condicionado es {adjustExplanation.valid ? 'válido ✓' : 'inválido ✗'}</h3>
            {adjustExplanation.explanations.map((exp, i) => (
              <div key={i} className="explanation-line">{exp}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
