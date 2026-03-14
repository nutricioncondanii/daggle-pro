import { DagGraph, DagEdge } from '../types/dag';
import { isAcyclic, hasDirectedPath, validateDag, getAllPaths, isCausalPath } from './dag';
import { findMinimalAdjustmentSets } from './adjustment';

const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// ─── Templates ──────────────────────────────────────────────────────
// Each template is [edges, exposure_idx, outcome_idx, minNodes]
// Node indices are relative and will be PERMUTED for variety.

type Tpl = { e: [number, number][]; x: number; y: number; n: number };

const EASY: Tpl[] = [
  // C → X → Y, C → Y
  { e: [[2,0],[2,1],[0,1]], x:0, y:1, n:3 },
  // C → X, C → Z → Y, X → Y
  { e: [[2,0],[0,1],[2,3],[3,1]], x:0, y:1, n:4 },
  // W → C → X, C → Y, X → Y
  { e: [[3,2],[2,0],[2,1],[0,1]], x:0, y:1, n:4 },
  // C → X, C → Y, X → Y, D → Y (D is noise)
  { e: [[2,0],[2,1],[0,1],[3,1]], x:0, y:1, n:4 },
  // C → X → Y, C → Y, D → X (D is noise)
  { e: [[2,0],[0,1],[2,1],[3,0]], x:0, y:1, n:4 },
];

const MEDIUM: Tpl[] = [
  // Two confounders
  { e: [[2,0],[2,1],[3,0],[3,1],[0,1]], x:0, y:1, n:4 },
  // Confounding + mediator
  { e: [[2,0],[0,3],[3,1],[2,1]], x:0, y:1, n:4 },
  // Collider trap: X→M→Y, X→C←Y
  { e: [[0,2],[2,1],[0,3],[1,3]], x:0, y:1, n:4 },
  // Chain confounding: C1 → C2, C2 → X, C1 → Y, X → Y
  { e: [[2,3],[3,0],[2,1],[0,1]], x:0, y:1, n:4 },
  // Diamond: C→A, C→B, A→Y, B→Y, X→Y, C→X
  { e: [[2,3],[2,4],[3,1],[4,1],[0,1],[2,0]], x:0, y:1, n:5 },
  // Confounder + descendant collider: C→X, C→Y, X→Y, X→D←Y
  { e: [[2,0],[2,1],[0,1],[0,3],[1,3]], x:0, y:1, n:4 },
  // Instrument: I→X→Y, C→X, C→Y
  { e: [[3,0],[0,1],[2,0],[2,1]], x:0, y:1, n:4 },
];

const HARD: Tpl[] = [
  // M-bias: U1→X, U1→Z, U2→Z, U2→Y, X→Y  (Z collider trap)
  { e: [[2,0],[2,3],[4,3],[4,1],[0,1]], x:0, y:1, n:5 },
  // Butterfly: W→C1, W→C2, C1→X, C1→Y, C2→X, C2→Y, X→Y
  { e: [[4,2],[4,3],[2,0],[2,1],[3,0],[3,1],[0,1]], x:0, y:1, n:5 },
  // 3 independent confounders: C1→X,C1→Y, C2→X,C2→Y, C3→X,C3→Y, X→Y
  { e: [[2,0],[2,1],[3,0],[3,1],[4,0],[4,1],[0,1]], x:0, y:1, n:5 },
  // Confounder chain + collider: W→C, C→X, C→Y, X→Y, X→K←Y
  { e: [[4,2],[2,0],[2,1],[0,1],[0,3],[1,3]], x:0, y:1, n:5 },
  // Two-level confounding: W→C1, W→C2, C1→X, C2→Y, C1→C2, X→Y
  { e: [[4,2],[4,3],[2,0],[3,1],[2,3],[0,1]], x:0, y:1, n:5 },
  // M-bias + direct confounder: U1→X,U1→Z,U2→Z,U2→Y, C→X,C→Y, X→Y
  { e: [[2,0],[2,3],[4,3],[4,1],[5,0],[5,1],[0,1]], x:0, y:1, n:6 },
  // Butterfly + mediator: W→C1,W→C2,C1→X,C1→Y,C2→X,C2→Y,X→M→Y
  { e: [[4,2],[4,3],[2,0],[2,1],[3,0],[3,1],[0,5],[5,1]], x:0, y:1, n:6 },
  // 3 confounders + collider trap: C1→X,C1→Y,C2→X,C2→Y,C3→X,C3→Y,X→Y,X→K←Y
  { e: [[2,0],[2,1],[3,0],[3,1],[4,0],[4,1],[0,1],[0,5],[1,5]], x:0, y:1, n:6 },
  // Diamond with extra path: A→X,A→B,B→Y,C→X,C→Y,X→Y
  { e: [[2,0],[2,3],[3,1],[4,0],[4,1],[0,1]], x:0, y:1, n:5 },
  // Nested confounding: W→A,A→B,B→X,W→Y,A→Y,X→Y
  { e: [[4,2],[2,3],[3,0],[4,1],[2,1],[0,1]], x:0, y:1, n:5 },
];

// ─── Helpers ────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Create a random permutation of node indices to vary the structure */
function randomPermutation(size: number): number[] {
  const arr = Array.from({ length: size }, (_, i) => i);
  return shuffle(arr);
}

// ─── Main generator ─────────────────────────────────────────────────

export function generateRandomDag(
  numNodes: number,
  difficulty: 1 | 2 | 3 = 2,
  names?: string[],
): DagGraph {
  const n = Math.max(3, Math.min(12, numNodes));
  const nodeNames = names && names.length >= n ? names.slice(0, n) : DEFAULT_NAMES.slice(0, n);

  const templates = difficulty === 1 ? EASY : difficulty === 2 ? MEDIUM : HARD;

  // Try template-based (with permuted node assignments)
  for (let attempt = 0; attempt < 60; attempt++) {
    const dag = tryTemplate(n, nodeNames, templates, difficulty);
    if (dag) return dag;
  }

  // Fallback: purely random
  for (let attempt = 0; attempt < 80; attempt++) {
    const dag = tryRandom(n, nodeNames, difficulty);
    if (dag) return dag;
  }

  return buildFallback(nodeNames);
}

function tryTemplate(
  n: number,
  names: string[],
  templates: Tpl[],
  difficulty: 1 | 2 | 3,
): DagGraph | null {
  const tpl = pick(templates);
  if (tpl.n > n) return null;

  // Permute node indices so the same template produces different topologies
  const perm = randomPermutation(n);

  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: names[perm[i]] ?? names[i],
  }));

  const edges: DagEdge[] = [];
  const edgeSet = new Set<string>();

  function addEdge(from: number, to: number) {
    const s = perm[from], t = perm[to];
    const key = `${s}->${t}`;
    if (!edgeSet.has(key) && s !== t) {
      edgeSet.add(key);
      edges.push({ source: `n${s}`, target: `n${t}` });
    }
  }

  // Template edges
  for (const [s, t] of tpl.e) {
    if (s < n && t < n) addEdge(s, t);
  }

  // Extra nodes: connect them as confounders or ancestors
  for (let i = tpl.n; i < n; i++) {
    const role = Math.random();
    if (role < 0.35) {
      // Extra confounder: causes exposure and outcome
      addEdge(i, tpl.x);
      addEdge(i, tpl.y);
    } else if (role < 0.6) {
      // Ancestor of a random template node
      const target = Math.floor(Math.random() * tpl.n);
      addEdge(i, target);
    } else {
      // Random connection to 1-2 nodes
      const targets = shuffle(Array.from({ length: n }, (_, j) => j).filter(j => j !== i)).slice(0, 2);
      for (const t of targets) {
        // Ensure we keep DAG property: pick direction based on perm order
        if (perm[i] < perm[t]) addEdge(i, t);
        else addEdge(t, i);
      }
    }
  }

  const exposure = `n${perm[tpl.x]}`;
  const outcome = `n${perm[tpl.y]}`;
  const dag: DagGraph = { nodes, edges, exposure, outcome };

  // Validate
  if (!isAcyclic(dag)) return null;
  const v = validateDag(dag);
  if (!v.valid) return null;
  if (!hasDirectedPath(dag, exposure, outcome)) return null;

  try {
    const adjSets = findMinimalAdjustmentSets(dag);
    if (adjSets.length === 0) return null;

    const hasNonEmpty = adjSets.some(s => s.length > 0);

    // Difficulty filters
    if (difficulty === 1) {
      // Must have a simple 1-variable adjustment set
      if (!adjSets.some(s => s.length === 1)) return null;
    } else if (difficulty === 2) {
      // Must have confounding (non-empty set needed)
      if (!hasNonEmpty) return null;
    } else {
      // Hard: needs 3+ backdoor paths OR adjustment set of 2+ OR collider trap (empty valid)
      const paths = getAllPaths(dag, exposure, outcome);
      const backdoors = paths.filter(p => !isCausalPath(dag, p)).length;
      const smallest = Math.min(...adjSets.map(s => s.length));
      const hasEmptySet = adjSets.some(s => s.length === 0);

      // Accept if: many backdoors, complex set, or tricky (empty set = collider-only)
      const isHard = backdoors >= 3 || smallest >= 2 || (hasEmptySet && hasNonEmpty);
      if (!isHard) return null;
    }

    return dag;
  } catch {
    return null;
  }
}

function tryRandom(n: number, names: string[], difficulty: 1 | 2 | 3): DagGraph | null {
  const nodes = names.map((label, i) => ({ id: `n${i}`, label }));
  const density = n <= 4 ? 0.5 : n <= 6 ? 0.4 : 0.3;

  const edges: DagEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.random() < density) {
        edges.push({ source: `n${i}`, target: `n${j}` });
      }
    }
  }

  if (edges.length < 3) return null;

  // Pick random exposure/outcome (not the same)
  const ids = shuffle(Array.from({ length: n }, (_, i) => i));
  const exposure = `n${ids[0]}`;
  const outcome = `n${ids[1]}`;
  const dag: DagGraph = { nodes, edges, exposure, outcome };

  if (!hasDirectedPath(dag, exposure, outcome)) return null;

  try {
    const adjSets = findMinimalAdjustmentSets(dag);
    if (adjSets.length === 0) return null;
    if (!adjSets.some(s => s.length > 0)) return null;

    if (difficulty === 1 && !adjSets.some(s => s.length === 1)) return null;
    if (difficulty === 3) {
      const paths = getAllPaths(dag, exposure, outcome);
      const backdoors = paths.filter(p => !isCausalPath(dag, p)).length;
      const smallest = Math.min(...adjSets.map(s => s.length));
      if (backdoors < 3 && smallest < 2) return null;
    }

    return dag;
  } catch {
    return null;
  }
}

function buildFallback(names: string[]): DagGraph {
  const n = names.length;
  const nodes = names.map((label, i) => ({ id: `n${i}`, label }));
  const edges: DagEdge[] = [{ source: 'n0', target: `n${n - 1}` }];

  if (n >= 3) {
    edges.push({ source: 'n1', target: 'n0' });
    edges.push({ source: 'n1', target: `n${n - 1}` });
  }
  for (let i = 2; i < n - 1; i++) {
    edges.push({ source: `n${i}`, target: 'n0' });
    edges.push({ source: `n${i}`, target: `n${n - 1}` });
  }

  return { nodes, edges, exposure: 'n0', outcome: `n${n - 1}` };
}
