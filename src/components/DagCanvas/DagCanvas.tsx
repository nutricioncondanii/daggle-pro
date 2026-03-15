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

// ─── Force-directed layout with fixed Y layers ─────────────────────

function layout(g: DagGraph): Pos[] {
  const n = g.nodes.length;
  if (n === 0) return [];

  // Step 1: Topological layering for Y (Kahn's)
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
    if (next.length > 0 || queue.some(id => !visited.has(id))) curDepth++;
    queue = next;
  }
  // Assign remaining nodes
  for (const node of g.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, curDepth++);
  }

  const yGap = 150;

  // Step 2: Initial X — spread nodes at each depth evenly
  const byDepth = new Map<number, string[]>();
  for (const node of g.nodes) {
    const d = depth.get(node.id) || 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(node.id);
  }

  const cx = 350;
  const xGap = 160;
  const x = new Map<string, number>();
  for (const [, nodes] of byDepth) {
    const w = (nodes.length - 1) * xGap;
    nodes.forEach((id, i) => x.set(id, cx + i * xGap - w / 2));
  }

  // Step 3: Force simulation (X only, Y is fixed)
  const vx = new Map<string, number>();
  g.nodes.forEach(n => vx.set(n.id, 0));

  const REPULSION = 8000;
  const SPRING = 0.04;
  const DAMPING = 0.85;
  const MIN_DIST = R * 3;

  for (let iter = 0; iter < 120; iter++) {
    // Repulsion: every pair pushes apart horizontally
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = g.nodes[i].id, b = g.nodes[j].id;
        const ax = x.get(a)!, bx = x.get(b)!;
        const ay = (depth.get(a) || 0) * yGap;
        const by = (depth.get(b) || 0) * yGap;
        const dx = bx - ax;
        const dy = by - ay;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 1;

        // Only apply horizontal repulsion
        const force = REPULSION / (distSq || 1);
        const fx = (dx / dist) * force;

        vx.set(a, (vx.get(a) || 0) - fx);
        vx.set(b, (vx.get(b) || 0) + fx);
      }
    }

    // Spring attraction along edges
    for (const e of g.edges) {
      const sx = x.get(e.source)!, tx = x.get(e.target)!;
      const dx = tx - sx;
      const force = dx * SPRING;
      vx.set(e.source, (vx.get(e.source) || 0) + force);
      vx.set(e.target, (vx.get(e.target) || 0) - force);
    }

    // Center gravity (weak pull toward cx)
    for (const node of g.nodes) {
      const nx = x.get(node.id)!;
      vx.set(node.id, (vx.get(node.id) || 0) + (cx - nx) * 0.002);
    }

    // Apply velocities with damping
    for (const node of g.nodes) {
      const vel = (vx.get(node.id) || 0) * DAMPING;
      vx.set(node.id, vel);
      x.set(node.id, (x.get(node.id) || cx) + vel);
    }

    // Enforce minimum horizontal spacing between nodes at same depth
    for (const [, nodes] of byDepth) {
      if (nodes.length < 2) continue;
      const sorted = [...nodes].sort((a, b) => (x.get(a) || 0) - (x.get(b) || 0));
      for (let i = 1; i < sorted.length; i++) {
        const prevX = x.get(sorted[i - 1])!;
        const curX = x.get(sorted[i])!;
        if (curX - prevX < MIN_DIST) {
          const push = (MIN_DIST - (curX - prevX)) / 2;
          x.set(sorted[i - 1], prevX - push);
          x.set(sorted[i], curX + push);
        }
      }
    }
  }

  // Step 4: Re-center everything
  let minX = Infinity, maxX = -Infinity;
  for (const node of g.nodes) {
    const nx = x.get(node.id)!;
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
  }
  const shift = cx - (minX + maxX) / 2;
  for (const node of g.nodes) x.set(node.id, x.get(node.id)! + shift);

  // Build positions
  return g.nodes.map(node => ({
    id: node.id,
    x: x.get(node.id) || cx,
    y: 70 + (depth.get(node.id) || 0) * yGap,
  }));
}

// ─── Simple straight-line edges ─────────────────────────────────────

function edgeLine(src: Pos, tgt: Pos): string {
  const dx = tgt.x - src.x, dy = tgt.y - src.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return '';
  const ux = dx / len, uy = dy / len;
  const x1 = src.x + ux * (R + 2);
  const y1 = src.y + uy * (R + 2);
  const x2 = tgt.x - ux * (R + 10);
  const y2 = tgt.y - uy * (R + 10);
  return `M${x1},${y1} L${x2},${y2}`;
}

// ─── Component ──────────────────────────────────────────────────────

export default function DagCanvas({ graph, showRoles, selectedNodes, onNodeClick, height = 420 }: Props) {
  const positions = useMemo(() => layout(graph), [graph]);
  const posMap = useMemo(() => {
    const m = new Map<string, Pos>();
    positions.forEach(p => m.set(p.id, p));
    return m;
  }, [positions]);

  const vb = useMemo(() => {
    const padX = 120, padY = 60;
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

        {/* Edges — simple straight lines */}
        {graph.edges.map((e, i) => {
          const s = posMap.get(e.source), t = posMap.get(e.target);
          if (!s || !t) return null;
          const d = edgeLine(s, t);
          if (!d) return null;
          return <path key={i} d={d} fill="none"
            stroke="#94a3b8" strokeWidth={2.5} markerEnd="url(#ah)" />;
        })}

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
