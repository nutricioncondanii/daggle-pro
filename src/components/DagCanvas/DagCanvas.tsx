import { useMemo } from 'react';
import { DagGraph, NodeRole } from '../../types/dag';
import { classifyNodeRole, getRoleColor } from '../../engine/roles';
import './DagCanvas.css';

interface Props {
  graph: DagGraph;
  showRoles?: boolean;
  selectedNodes?: Set<string>;
  onNodeClick?: (nodeId: string) => void;
  height?: number;
}

const R = 32; // node radius

interface Pos { id: string; x: number; y: number }

function layout(g: DagGraph): Pos[] {
  // ── Step 1: Topological layering (Kahn's) ──
  const inDeg = new Map<string, number>();
  const fwd = new Map<string, string[]>();
  const bwd = new Map<string, string[]>();
  g.nodes.forEach(n => { inDeg.set(n.id, 0); fwd.set(n.id, []); bwd.set(n.id, []); });
  g.edges.forEach(e => {
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    fwd.get(e.source)?.push(e.target);
    bwd.get(e.target)?.push(e.source);
  });

  const layers: string[][] = [];
  let q = g.nodes.filter(n => inDeg.get(n.id) === 0).map(n => n.id);
  const assigned = new Set<string>();
  while (q.length) {
    const layer: string[] = [];
    const next: string[] = [];
    for (const n of q) {
      if (assigned.has(n)) continue;
      assigned.add(n);
      layer.push(n);
      for (const c of fwd.get(n) || []) {
        inDeg.set(c, (inDeg.get(c) || 1) - 1);
        if (inDeg.get(c) === 0) next.push(c);
      }
    }
    if (layer.length) layers.push(layer);
    q = next;
  }
  for (const n of g.nodes) {
    if (!assigned.has(n.id)) { layers.push([n.id]); assigned.add(n.id); }
  }

  const xGap = 180;
  const yGap = 150;
  const cx = 350;

  // ── Step 2: Barycenter ORDERING — sort nodes in each layer to reduce crossings ──
  // Give each node an initial "order" index within its layer
  const order = new Map<string, number>();
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) order.set(layer[i], i);
  }

  // Multiple passes: reorder each layer by the average order of connected nodes
  for (let pass = 0; pass < 6; pass++) {
    // Forward pass
    for (let li = 1; li < layers.length; li++) {
      const baryValues: { id: string; bary: number }[] = [];
      for (const node of layers[li]) {
        const pars = bwd.get(node) || [];
        if (pars.length > 0) {
          const avg = pars.reduce((s, p) => s + (order.get(p) || 0), 0) / pars.length;
          baryValues.push({ id: node, bary: avg });
        } else {
          baryValues.push({ id: node, bary: order.get(node) || 0 });
        }
      }
      baryValues.sort((a, b) => a.bary - b.bary);
      layers[li] = baryValues.map(v => v.id);
      layers[li].forEach((id, i) => order.set(id, i));
    }
    // Backward pass
    for (let li = layers.length - 2; li >= 0; li--) {
      const baryValues: { id: string; bary: number }[] = [];
      for (const node of layers[li]) {
        const chs = fwd.get(node) || [];
        if (chs.length > 0) {
          const avg = chs.reduce((s, c) => s + (order.get(c) || 0), 0) / chs.length;
          baryValues.push({ id: node, bary: avg });
        } else {
          baryValues.push({ id: node, bary: order.get(node) || 0 });
        }
      }
      baryValues.sort((a, b) => a.bary - b.bary);
      layers[li] = baryValues.map(v => v.id);
      layers[li].forEach((id, i) => order.set(id, i));
    }
  }

  // ── Step 3: Assign X positions based on the new order ──
  const posX = new Map<string, number>();
  for (const layer of layers) {
    const w = (layer.length - 1) * xGap;
    for (let i = 0; i < layer.length; i++) {
      posX.set(layer[i], cx + i * xGap - w / 2);
    }
  }

  // ── Step 4: Fine-tune X via barycenter positioning (keep the order, adjust positions) ──
  for (let pass = 0; pass < 3; pass++) {
    for (let li = 1; li < layers.length; li++) {
      for (const node of layers[li]) {
        const pars = bwd.get(node) || [];
        if (pars.length > 0) {
          const avg = pars.reduce((s, p) => s + (posX.get(p) || cx), 0) / pars.length;
          posX.set(node, avg);
        }
      }
      enforceSpacing(layers[li], posX, xGap, cx);
    }
    for (let li = layers.length - 2; li >= 0; li--) {
      for (const node of layers[li]) {
        const chs = fwd.get(node) || [];
        if (chs.length > 0) {
          const avg = chs.reduce((s, c) => s + (posX.get(c) || cx), 0) / chs.length;
          posX.set(node, avg);
        }
      }
      enforceSpacing(layers[li], posX, xGap, cx);
    }
  }

  // Build result
  const result: Pos[] = [];
  for (let li = 0; li < layers.length; li++) {
    for (const node of layers[li]) {
      result.push({ id: node, x: posX.get(node) || cx, y: 70 + li * yGap });
    }
  }
  return result;
}

/** Push apart overlapping nodes while preserving their ORDER, then re-center */
function enforceSpacing(layer: string[], posX: Map<string, number>, gap: number, cx: number) {
  if (layer.length <= 1) return;
  // Layer is already in the correct order from Step 2 — don't re-sort by X!
  // Just ensure minimum gap between consecutive nodes
  for (let i = 1; i < layer.length; i++) {
    const prev = posX.get(layer[i - 1]) || 0;
    const curr = posX.get(layer[i]) || 0;
    if (curr - prev < gap) {
      posX.set(layer[i], prev + gap);
    }
  }
  // Re-center
  const first = posX.get(layer[0]) || 0;
  const last = posX.get(layer[layer.length - 1]) || 0;
  const shift = cx - (first + last) / 2;
  for (const n of layer) posX.set(n, (posX.get(n) || 0) + shift);
}

/** Distance from point (px,py) to the line segment (x1,y1)-(x2,y2) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/** Which side of the line (x1,y1)→(x2,y2) is point (px,py)? >0 = left, <0 = right */
function sideOf(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
}

/**
 * Build edge paths. Simple straight lines from circle edge to circle edge,
 * but if the line passes too close to an intermediate node, curve around it.
 */
function buildEdgePaths(
  edges: { source: string; target: string }[],
  posMap: Map<string, Pos>,
  allNodes: { id: string }[],
): string[] {
  const AVOID_RADIUS = R + 18; // how far to stay from intermediate nodes

  return edges.map(e => {
    const src = posMap.get(e.source);
    const tgt = posMap.get(e.target);
    if (!src || !tgt) return '';

    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return '';
    const ux = dx / len, uy = dy / len;

    // Start and end on circle edges
    const x1 = src.x + ux * (R + 2);
    const y1 = src.y + uy * (R + 2);
    const x2 = tgt.x - ux * (R + 10);
    const y2 = tgt.y - uy * (R + 10);

    // Check if the straight line passes too close to any intermediate node
    let worstNode: Pos | null = null;
    let worstDist = Infinity;

    for (const n of allNodes) {
      if (n.id === e.source || n.id === e.target) continue;
      const np = posMap.get(n.id);
      if (!np) continue;
      const d = distToSegment(np.x, np.y, x1, y1, x2, y2);
      if (d < AVOID_RADIUS && d < worstDist) {
        worstDist = d;
        worstNode = np;
      }
    }

    if (!worstNode) {
      // No collision — straight line
      return `M${x1},${y1} L${x2},${y2}`;
    }

    // Curve around the obstructing node
    // Put the control point on the opposite side of the obstructing node
    const side = sideOf(worstNode.x, worstNode.y, x1, y1, x2, y2);
    const curveDir = side > 0 ? -1 : 1; // curve away from the node

    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    // Perpendicular offset: enough to clear the node
    const offset = AVOID_RADIUS + 20;
    const cpx = mx + (-uy) * curveDir * offset;
    const cpy = my + ux * curveDir * offset;

    return `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;
  });
}

export default function DagCanvas({ graph, showRoles, selectedNodes, onNodeClick, height = 420 }: Props) {
  const positions = useMemo(() => layout(graph), [graph]);
  const posMap = useMemo(() => {
    const m = new Map<string, Pos>();
    positions.forEach(p => m.set(p.id, p));
    return m;
  }, [positions]);

  const vb = useMemo(() => {
    const padX = 120; // extra horizontal for side labels
    const padY = 60;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of positions) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (!isFinite(x0)) return '0 0 600 400';
    return `${x0 - padX} ${y0 - padY} ${x1 - x0 + padX * 2} ${y1 - y0 + padY * 2}`;
  }, [positions]);

  return (
    <div className="dag-canvas" style={{ height }}>
      <svg viewBox={vb} className="dag-svg">
        <defs>
          <marker id="ah" markerWidth="14" markerHeight="10" refX="12" refY="5"
            orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 14 5, 0 10" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges */}
        {(() => {
          const paths = buildEdgePaths(graph.edges, posMap, graph.nodes);
          return graph.edges.map((e, i) => {
            if (!paths[i]) return null;
            return <path key={i} d={paths[i]} fill="none"
              stroke="#94a3b8" strokeWidth={2.5} markerEnd="url(#ah)" />;
          });
        })()}

        {/* Nodes */}
        {graph.nodes.map(node => {
          const p = posMap.get(node.id);
          if (!p) return null;
          const isExp = node.id === graph.exposure;
          const isOut = node.id === graph.outcome;
          const isSel = selectedNodes?.has(node.id);
          const role = classifyNodeRole(graph, node.id);
          const clickable = !!onNodeClick && !isExp && !isOut;

          let fill = '#1e293b';
          let stroke = '#64748b';
          let sw = 2.5;

          if (isExp) { fill = '#172554'; stroke = '#3b82f6'; sw = 3.5; }
          else if (isOut) { fill = '#450a0a'; stroke = '#ef4444'; sw = 3.5; }

          if (isSel) { fill = '#164e63'; stroke = '#22d3ee'; sw = 3.5; }

          if (showRoles && !isExp && !isOut && !isSel) {
            stroke = getRoleColor(role);
          }

          return (
            <g key={node.id} onClick={() => clickable && onNodeClick!(node.id)}
              className={clickable ? 'dag-node-click' : undefined}>

              {/* Glow for selected */}
              {isSel && <circle cx={p.x} cy={p.y} r={R + 6} fill="none"
                stroke="#22d3ee" strokeWidth={1.5} opacity={0.35} />}

              {/* Hover ring for clickable */}
              {clickable && <circle cx={p.x} cy={p.y} r={R + 3} fill="none"
                stroke="transparent" strokeWidth={2} className="hover-ring" />}

              <circle cx={p.x} cy={p.y} r={R} fill={fill} stroke={stroke} strokeWidth={sw} />

              <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle"
                fill="#e2e8f0" fontSize="14" fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif" pointerEvents="none">
                {node.label}
              </text>

              {/* Exposure / Outcome tag — to the right of the circle */}
              {isExp && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8} width={72} height={16}
                    rx={4} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1} />
                  <text x={p.x + R + 42} y={p.y} dy="0.3em" textAnchor="middle"
                    fill="#93c5fd" fontSize="9" fontWeight="700" letterSpacing="0.5">
                    EXPOSICI&#211;N
                  </text>
                </g>
              )}
              {isOut && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8} width={64} height={16}
                    rx={4} fill="#450a0a" stroke="#ef4444" strokeWidth={1} />
                  <text x={p.x + R + 38} y={p.y} dy="0.3em" textAnchor="middle"
                    fill="#fca5a5" fontSize="9" fontWeight="700" letterSpacing="0.5">
                    RESULTADO
                  </text>
                </g>
              )}

              {/* Role labels — to the right of the circle */}
              {showRoles && !isExp && !isOut && ROLE_LABELS[role] && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8}
                    width={ROLE_LABELS[role].length * 6.5 + 12} height={16}
                    rx={4} fill="#0f172a" stroke={getRoleColor(role)} strokeWidth={1} opacity={0.9} />
                  <text x={p.x + R + 12} y={p.y} dy="0.3em" textAnchor="start"
                    fill={getRoleColor(role)} fontSize="9" fontWeight="600" letterSpacing="0.3">
                    {ROLE_LABELS[role]}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ROLE_LABELS: Record<NodeRole, string> = {
  exposure: '', outcome: '',
  confounder: 'CONFUSOR', mediator: 'MEDIADOR', collider: 'COLISIONADOR',
  ancestor: 'ANCESTRO', descendant: 'DESCENDIENTE', other: '',
};
