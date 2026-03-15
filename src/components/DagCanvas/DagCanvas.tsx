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

const R = 32;

interface Pos { id: string; x: number; y: number }
interface SimEdge { source: string; target: string }

// ─── Layout engine ──────────────────────────────────────────────────

interface LayoutResult {
  positions: Pos[];
  /** For each original edge index, the waypoints (including dummies) to route through */
  routes: Map<number, string[]>;
}

function layout(g: DagGraph): LayoutResult {
  if (g.nodes.length === 0) return { positions: [], routes: new Map() };

  // ── 1. Topological depth (Kahn's) ──
  const inDeg = new Map<string, number>();
  const fwd = new Map<string, string[]>();
  g.nodes.forEach(n => { inDeg.set(n.id, 0); fwd.set(n.id, []); });
  g.edges.forEach(e => {
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    fwd.get(e.source)?.push(e.target);
  });

  const depth = new Map<string, number>();
  let queue = g.nodes.filter(n => inDeg.get(n.id) === 0).map(n => n.id);
  const visited = new Set<string>();
  let curDepth = 0;
  while (queue.length) {
    const next: string[] = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      depth.set(id, curDepth);
      for (const c of fwd.get(id) || []) {
        inDeg.set(c, (inDeg.get(c) || 1) - 1);
        if (inDeg.get(c) === 0) next.push(c);
      }
    }
    if (next.length > 0) curDepth++;
    queue = next;
  }
  for (const n of g.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, curDepth++);
  }

  // ── 2. Create dummy nodes for edges that skip layers ──
  const allIds = new Set(g.nodes.map(n => n.id));
  const dummyIds = new Set<string>();
  const routes = new Map<number, string[]>(); // edgeIndex → [source, dummy1, dummy2, ..., target]
  const simEdges: SimEdge[] = []; // edges for force simulation (with dummies)

  g.edges.forEach((e, idx) => {
    const sd = depth.get(e.source) ?? 0;
    const td = depth.get(e.target) ?? 0;
    const span = td - sd;

    if (span <= 1) {
      // Direct edge, no dummies needed
      routes.set(idx, [e.source, e.target]);
      simEdges.push({ source: e.source, target: e.target });
    } else {
      // Insert dummy at each intermediate layer
      const chain: string[] = [e.source];
      let prev = e.source;
      for (let d = sd + 1; d < td; d++) {
        const dummyId = `__d_${idx}_${d}`;
        dummyIds.add(dummyId);
        allIds.add(dummyId);
        depth.set(dummyId, d);
        chain.push(dummyId);
        simEdges.push({ source: prev, target: dummyId });
        prev = dummyId;
      }
      chain.push(e.target);
      simEdges.push({ source: prev, target: e.target });
      routes.set(idx, chain);
    }
  });

  // ── 3. Build layer groups + barycenter pre-ordering ──
  const yGap = 150;
  const cx = 350;
  const xGap = 160;

  const byDepth = new Map<number, string[]>();
  for (const id of allIds) {
    const d = depth.get(id) || 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  // Build adjacency for sim edges (children/parents including dummies)
  const simFwd = new Map<string, string[]>();
  const simBwd = new Map<string, string[]>();
  for (const id of allIds) { simFwd.set(id, []); simBwd.set(id, []); }
  for (const e of simEdges) {
    simFwd.get(e.source)?.push(e.target);
    simBwd.get(e.target)?.push(e.source);
  }

  // PRE-ORDER: sort each layer by average X of children (barycenter), 6 passes
  // This ensures nodes start in a position where crossings are minimized
  const order = new Map<string, number>();
  const maxDepth = Math.max(...[...byDepth.keys()]);

  // Initialize order
  for (const [, ids] of byDepth) {
    ids.forEach((id, i) => order.set(id, i));
  }

  for (let pass = 0; pass < 8; pass++) {
    // Forward: sort each layer by avg order of parents
    for (let d = 1; d <= maxDepth; d++) {
      const ids = byDepth.get(d);
      if (!ids) continue;
      const scored = ids.map(id => {
        const parents = simBwd.get(id) || [];
        const avg = parents.length > 0
          ? parents.reduce((s, p) => s + (order.get(p) || 0), 0) / parents.length
          : order.get(id) || 0;
        return { id, score: avg };
      });
      scored.sort((a, b) => a.score - b.score);
      byDepth.set(d, scored.map(s => s.id));
      scored.forEach((s, i) => order.set(s.id, i));
    }
    // Backward: sort each layer by avg order of children
    for (let d = maxDepth - 1; d >= 0; d--) {
      const ids = byDepth.get(d);
      if (!ids) continue;
      const scored = ids.map(id => {
        const children = simFwd.get(id) || [];
        const avg = children.length > 0
          ? children.reduce((s, c) => s + (order.get(c) || 0), 0) / children.length
          : order.get(id) || 0;
        return { id, score: avg };
      });
      scored.sort((a, b) => a.score - b.score);
      byDepth.set(d, scored.map(s => s.id));
      scored.forEach((s, i) => order.set(s.id, i));
    }
  }

  // Assign initial X based on pre-ordered layers
  const x = new Map<string, number>();
  for (const [, ids] of byDepth) {
    const w = (ids.length - 1) * xGap;
    ids.forEach((id, i) => x.set(id, cx + i * xGap - w / 2));
  }

  // ── 4. Force simulation with temperature (simulated annealing) ──
  const allNodeIds = [...allIds];
  const totalNodes = allNodeIds.length;
  const vx = new Map<string, number>();
  allNodeIds.forEach(id => vx.set(id, 0));

  const REPULSION = 10000;
  const SPRING = 0.03;
  const DAMPING = 0.85;
  const MIN_DIST = R * 3;
  const ITERATIONS = 150;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Temperature: high at start (random jitter), decays to 0
    const temp = 8 * Math.max(0, 1 - iter / 40);

    // Node-node repulsion (horizontal)
    for (let i = 0; i < totalNodes; i++) {
      for (let j = i + 1; j < totalNodes; j++) {
        const a = allNodeIds[i], b = allNodeIds[j];
        const ax = x.get(a)!, bx = x.get(b)!;
        const ay = (depth.get(a) || 0) * yGap;
        const by = (depth.get(b) || 0) * yGap;
        const dx = bx - ax, dy = by - ay;
        const distSq = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        vx.set(a, (vx.get(a) || 0) - fx);
        vx.set(b, (vx.get(b) || 0) + fx);
      }
    }

    // Spring attraction along simulation edges
    for (const e of simEdges) {
      const dx = (x.get(e.target) || cx) - (x.get(e.source) || cx);
      const force = dx * SPRING;
      vx.set(e.source, (vx.get(e.source) || 0) + force);
      vx.set(e.target, (vx.get(e.target) || 0) - force);
    }

    // Center gravity
    for (const id of allNodeIds) {
      vx.set(id, (vx.get(id) || 0) + (cx - (x.get(id) || cx)) * 0.003);
    }

    // Temperature jitter (helps escape local minima)
    if (temp > 0.5) {
      for (const id of allNodeIds) {
        vx.set(id, (vx.get(id) || 0) + (Math.random() - 0.5) * temp);
      }
    }

    // Apply velocities
    for (const id of allNodeIds) {
      const vel = (vx.get(id) || 0) * DAMPING;
      vx.set(id, vel);
      x.set(id, (x.get(id) || cx) + vel);
    }

    // Minimum spacing per layer
    for (const [, ids] of byDepth) {
      if (ids.length < 2) continue;
      const sorted = [...ids].sort((a, b) => (x.get(a) || 0) - (x.get(b) || 0));
      for (let i = 1; i < sorted.length; i++) {
        const px = x.get(sorted[i - 1])!, cx2 = x.get(sorted[i])!;
        if (cx2 - px < MIN_DIST) {
          const push = (MIN_DIST - (cx2 - px)) / 2;
          x.set(sorted[i - 1], px - push);
          x.set(sorted[i], cx2 + push);
        }
      }
    }
  }

  // Re-center
  let minX = Infinity, maxX = -Infinity;
  for (const id of allNodeIds) {
    const nx = x.get(id)!;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
  }
  const shift = cx - (minX + maxX) / 2;
  for (const id of allNodeIds) x.set(id, x.get(id)! + shift);

  // Build positions for ALL nodes (real + dummy)
  const positions: Pos[] = allNodeIds.map(id => ({
    id,
    x: x.get(id) || cx,
    y: 70 + (depth.get(id) || 0) * yGap,
  }));

  return { positions, routes };
}

// ─── Edge rendering ─────────────────────────────────────────────────

function buildRoutedEdge(waypoints: Pos[]): string {
  if (waypoints.length < 2) return '';

  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];

  if (waypoints.length === 2) {
    // Direct edge — straight line
    const dx = last.x - first.x, dy = last.y - first.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return '';
    const ux = dx / len, uy = dy / len;
    return `M${first.x + ux * (R + 2)},${first.y + uy * (R + 2)} L${last.x - ux * (R + 10)},${last.y - uy * (R + 10)}`;
  }

  // Multi-segment through dummies — polyline
  const parts: string[] = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const s = waypoints[i];
    const t = waypoints[i + 1];
    const dx = t.x - s.x, dy = t.y - s.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len, uy = dy / len;

    // First segment: start from circle edge
    // Last segment: end at circle edge (with arrow space)
    // Middle segments: point-to-point through dummies
    const startPad = i === 0 ? R + 2 : 0;
    const endPad = i === waypoints.length - 2 ? R + 10 : 0;

    const x1 = s.x + ux * startPad;
    const y1 = s.y + uy * startPad;
    const x2 = t.x - ux * endPad;
    const y2 = t.y - uy * endPad;

    if (i === 0) {
      parts.push(`M${x1},${y1}`);
    }
    parts.push(`L${x2},${y2}`);
  }

  return parts.join(' ');
}

// ─── Component ──────────────────────────────────────────────────────

export default function DagCanvas({ graph, showRoles, selectedNodes, onNodeClick, height = 420 }: Props) {
  const { positions, routes } = useMemo(() => layout(graph), [graph]);

  const posMap = useMemo(() => {
    const m = new Map<string, Pos>();
    positions.forEach(p => m.set(p.id, p));
    return m;
  }, [positions]);

  // Only real nodes (filter out dummies)
  const realPositions = useMemo(
    () => positions.filter(p => !p.id.startsWith('__d_')),
    [positions]
  );

  const vb = useMemo(() => {
    const padX = 120, padY = 60;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of realPositions) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    if (!isFinite(x0)) return '0 0 600 400';
    return `${x0 - padX} ${y0 - padY} ${x1 - x0 + padX * 2} ${y1 - y0 + padY * 2}`;
  }, [realPositions]);

  return (
    <div className="dag-canvas" style={{ height }}>
      <svg viewBox={vb} className="dag-svg">
        <defs>
          <marker id="ah" markerWidth="14" markerHeight="10" refX="12" refY="5"
            orient="auto" markerUnits="userSpaceOnUse">
            <polygon points="0 0, 14 5, 0 10" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Edges — routed through dummy waypoints */}
        {graph.edges.map((e, i) => {
          const route = routes.get(i);
          if (!route) return null;
          const waypoints = route.map(id => posMap.get(id)).filter(Boolean) as Pos[];
          const d = buildRoutedEdge(waypoints);
          if (!d) return null;
          return <path key={`e${i}`} d={d} fill="none"
            stroke="#94a3b8" strokeWidth={2.5} markerEnd="url(#ah)" />;
        })}

        {/* Nodes (only real, not dummies) */}
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
          if (showRoles && !isExp && !isOut && !isSel) stroke = getRoleColor(role);

          return (
            <g key={node.id} onClick={() => clickable && onNodeClick!(node.id)}
              className={clickable ? 'dag-node-click' : undefined}>

              {isSel && <circle cx={p.x} cy={p.y} r={R + 6} fill="none"
                stroke="#22d3ee" strokeWidth={1.5} opacity={0.35} />}
              {clickable && <circle cx={p.x} cy={p.y} r={R + 3} fill="none"
                stroke="transparent" strokeWidth={2} className="hover-ring" />}

              <circle cx={p.x} cy={p.y} r={R} fill={fill} stroke={stroke} strokeWidth={sw} />

              <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle"
                fill="#e2e8f0" fontSize="14" fontWeight="600"
                fontFamily="Inter, system-ui, sans-serif" pointerEvents="none">
                {node.label}
              </text>

              {isExp && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8} width={72} height={16}
                    rx={4} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={1} />
                  <text x={p.x + R + 42} y={p.y} dy="0.3em" textAnchor="middle"
                    fill="#93c5fd" fontSize="9" fontWeight="700" letterSpacing="0.5">
                    EXPOSICI&#211;N</text>
                </g>
              )}
              {isOut && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8} width={64} height={16}
                    rx={4} fill="#450a0a" stroke="#ef4444" strokeWidth={1} />
                  <text x={p.x + R + 38} y={p.y} dy="0.3em" textAnchor="middle"
                    fill="#fca5a5" fontSize="9" fontWeight="700" letterSpacing="0.5">
                    RESULTADO</text>
                </g>
              )}

              {showRoles && !isExp && !isOut && ROLE_LABELS[role] && (
                <g pointerEvents="none">
                  <rect x={p.x + R + 6} y={p.y - 8}
                    width={ROLE_LABELS[role].length * 6.5 + 12} height={16}
                    rx={4} fill="#0f172a" stroke={getRoleColor(role)} strokeWidth={1} opacity={0.9} />
                  <text x={p.x + R + 12} y={p.y} dy="0.3em" textAnchor="start"
                    fill={getRoleColor(role)} fontSize="9" fontWeight="600" letterSpacing="0.3">
                    {ROLE_LABELS[role]}</text>
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
