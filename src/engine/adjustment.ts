import { DagGraph } from '../types/dag';
import { descendants, getAllPaths, isCausalPath, label } from './dag';
import { isPathBlocked } from './dseparation';

/**
 * Check if Z is a valid adjustment set (backdoor criterion):
 *  1. No node in Z is a descendant of exposure
 *  2. Z blocks every non-causal path between exposure and outcome
 *  3. Z does not block ALL causal paths
 */
export function isValidAdjustmentSet(g: DagGraph, Z: Set<string>): boolean {
  const descX = descendants(g, g.exposure);

  // Rule 1: no descendant of exposure
  for (const z of Z) {
    if (descX.has(z)) return false;
  }

  const paths = getAllPaths(g, g.exposure, g.outcome);
  const causal = paths.filter(p => isCausalPath(g, p));
  const nonCausal = paths.filter(p => !isCausalPath(g, p));

  // Rule 2: all non-causal paths must be blocked
  for (const p of nonCausal) {
    if (!isPathBlocked(g, p, Z)) return false;
  }

  // Rule 3: at least one causal path must remain open (if any exist)
  if (causal.length > 0 && causal.every(p => isPathBlocked(g, p, Z))) return false;

  return true;
}

/**
 * Find all minimal sufficient adjustment sets.
 * Uses power-set enumeration (safe for DAGs up to ~12 candidate nodes).
 */
export function findMinimalAdjustmentSets(g: DagGraph): string[][] {
  const descX = descendants(g, g.exposure);
  const forbidden = new Set([g.exposure, g.outcome, ...descX]);

  const candidates = g.nodes
    .map(n => n.id)
    .filter(id => !forbidden.has(id));

  // Cap to avoid exponential blowup
  const cap = Math.min(candidates.length, 12);
  const search = candidates.slice(0, cap);

  const valid: string[][] = [];
  const total = 1 << search.length;

  for (let mask = 0; mask < total; mask++) {
    const subset: string[] = [];
    for (let i = 0; i < search.length; i++) {
      if (mask & (1 << i)) subset.push(search[i]);
    }
    if (isValidAdjustmentSet(g, new Set(subset))) {
      valid.push(subset);
    }
  }

  return filterMinimal(valid);
}

function filterMinimal(sets: string[][]): string[][] {
  const sorted = [...sets].sort((a, b) => a.length - b.length);
  const minimal: string[][] = [];
  for (const set of sorted) {
    const s = new Set(set);
    const isSuperset = minimal.some(m => m.every(x => s.has(x)));
    if (!isSuperset) minimal.push(set);
  }
  return minimal;
}

/**
 * Explain why an adjustment set is or isn't valid (Spanish).
 */
export function explainAdjustmentSet(
  g: DagGraph,
  Z: Set<string>,
): { valid: boolean; lines: string[] } {
  const lines: string[] = [];
  let valid = true;

  // Check descendants
  const descX = descendants(g, g.exposure);
  for (const z of Z) {
    if (descX.has(z)) {
      lines.push(`✗ "${label(g, z)}" es descendiente de la exposición — viola el criterio backdoor`);
      valid = false;
    }
  }

  // Check paths
  const paths = getAllPaths(g, g.exposure, g.outcome);
  for (const path of paths) {
    const causal = isCausalPath(g, path);
    const blocked = isPathBlocked(g, path, Z);
    const names = path.map(id => label(g, id)).join(' — ');

    if (causal) {
      lines.push(`${blocked ? '⚠ Camino causal BLOQUEADO' : '✓ Camino causal abierto'}: ${names}`);
      if (blocked) valid = false;
    } else {
      lines.push(`${blocked ? '✓ Camino no-causal bloqueado' : '✗ Camino no-causal ABIERTO'}: ${names}`);
      if (!blocked) valid = false;
    }
  }

  return { valid, lines };
}
