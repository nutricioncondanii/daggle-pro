import { DagGraph } from '../types/dag';

// ─── Basic graph queries ────────────────────────────────────────────

export function parents(g: DagGraph, id: string): string[] {
  return g.edges.filter(e => e.target === id).map(e => e.source);
}

export function children(g: DagGraph, id: string): string[] {
  return g.edges.filter(e => e.source === id).map(e => e.target);
}

export function ancestors(g: DagGraph, id: string): Set<string> {
  const result = new Set<string>();
  const stack = parents(g, id);
  while (stack.length) {
    const cur = stack.pop()!;
    if (!result.has(cur)) { result.add(cur); stack.push(...parents(g, cur)); }
  }
  return result;
}

export function descendants(g: DagGraph, id: string): Set<string> {
  const result = new Set<string>();
  const stack = children(g, id);
  while (stack.length) {
    const cur = stack.pop()!;
    if (!result.has(cur)) { result.add(cur); stack.push(...children(g, cur)); }
  }
  return result;
}

export function hasDirectedPath(g: DagGraph, from: string, to: string): boolean {
  return descendants(g, from).has(to);
}

export function label(g: DagGraph, id: string): string {
  return g.nodes.find(n => n.id === id)?.label ?? id;
}

// ─── Validation ─────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDag(g: DagGraph): ValidationResult {
  const errors: string[] = [];

  // 1. No cycles (topological sort)
  if (!isAcyclic(g)) errors.push('El grafo contiene ciclos');

  // 2. No duplicate nodes
  const labels = g.nodes.map(n => n.label.toLowerCase());
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length) errors.push(`Variables duplicadas: ${[...new Set(dupes)].join(', ')}`);

  // 3. No bidirectional edges
  for (const e of g.edges) {
    if (g.edges.some(e2 => e2.source === e.target && e2.target === e.source)) {
      errors.push(`Arista bidireccional: ${label(g, e.source)} ↔ ${label(g, e.target)}`);
    }
  }

  // 4. No isolated nodes (except exposure/outcome)
  for (const n of g.nodes) {
    if (n.id === g.exposure || n.id === g.outcome) continue;
    const hasEdge = g.edges.some(e => e.source === n.id || e.target === n.id);
    if (!hasEdge) errors.push(`Variable aislada: ${n.label}`);
  }

  // 5. Exposure and outcome exist
  if (!g.nodes.some(n => n.id === g.exposure)) errors.push('Falta la exposición');
  if (!g.nodes.some(n => n.id === g.outcome)) errors.push('Falta el resultado');

  return { valid: errors.length === 0, errors };
}

export function isAcyclic(g: DagGraph): boolean {
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  g.nodes.forEach(n => { inDeg.set(n.id, 0); adj.set(n.id, []); });
  g.edges.forEach(e => {
    inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    adj.get(e.source)?.push(e.target);
  });

  const queue = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let count = 0;
  while (queue.length) {
    const n = queue.pop()!;
    count++;
    for (const c of adj.get(n) || []) {
      const d = inDeg.get(c)! - 1;
      inDeg.set(c, d);
      if (d === 0) queue.push(c);
    }
  }
  return count === g.nodes.length;
}

// ─── Path enumeration (undirected skeleton) ─────────────────────────

export function getAllPaths(g: DagGraph, from: string, to: string, maxPaths = 50): string[][] {
  const adj = new Map<string, string[]>();
  g.nodes.forEach(n => adj.set(n.id, []));
  g.edges.forEach(e => {
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  });

  const result: string[][] = [];
  const visited = new Set<string>([from]);

  function dfs(cur: string, path: string[]) {
    if (result.length >= maxPaths) return;
    if (cur === to) { result.push([...path]); return; }
    for (const nb of adj.get(cur) || []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        path.push(nb);
        dfs(nb, path);
        path.pop();
        visited.delete(nb);
      }
    }
  }

  dfs(from, [from]);
  return result;
}

// ─── Path classification helpers ────────────────────────────────────

export function isColliderOnPath(g: DagGraph, path: string[], idx: number): boolean {
  if (idx <= 0 || idx >= path.length - 1) return false;
  const prev = path[idx - 1], cur = path[idx], next = path[idx + 1];
  return (
    g.edges.some(e => e.source === prev && e.target === cur) &&
    g.edges.some(e => e.source === next && e.target === cur)
  );
}

export function isCausalPath(g: DagGraph, path: string[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (!g.edges.some(e => e.source === path[i] && e.target === path[i + 1])) return false;
  }
  return true;
}

export function isBackdoorPath(g: DagGraph, path: string[]): boolean {
  if (path.length < 2) return false;
  // Backdoor = first edge points INTO the exposure node
  return g.edges.some(e => e.source === path[1] && e.target === path[0]);
}

export function classifyPath(g: DagGraph, path: string[]): 'causal' | 'backdoor' | 'non-causal' {
  if (isCausalPath(g, path)) return 'causal';
  if (isBackdoorPath(g, path)) return 'backdoor';
  return 'non-causal';
}

export function pathToString(g: DagGraph, path: string[]): string {
  const parts: string[] = [label(g, path[0])];
  for (let i = 0; i < path.length - 1; i++) {
    const fwd = g.edges.some(e => e.source === path[i] && e.target === path[i + 1]);
    parts.push(fwd ? '→' : '←');
    parts.push(label(g, path[i + 1]));
  }
  return parts.join(' ');
}
