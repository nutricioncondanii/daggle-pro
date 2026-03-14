import { DagGraph } from '../types/dag';
import { getAllPaths, isColliderOnPath, descendants, label } from './dag';

/**
 * Check if a path is blocked by conditioning set Z.
 *
 * A path is blocked if ANY intermediate node satisfies:
 *   - Non-collider (chain/fork) AND is in Z  → blocks
 *   - Collider AND neither it nor any descendant is in Z → blocks
 */
export function isPathBlocked(g: DagGraph, path: string[], Z: Set<string>): boolean {
  for (let i = 1; i < path.length - 1; i++) {
    const node = path[i];
    const collider = isColliderOnPath(g, path, i);

    if (collider) {
      // Collider blocks UNLESS it or a descendant is conditioned on
      const desc = descendants(g, node);
      const opened = Z.has(node) || [...desc].some(d => Z.has(d));
      if (!opened) return true; // blocked by un-opened collider
    } else {
      // Non-collider blocks IF conditioned on
      if (Z.has(node)) return true;
    }
  }
  return false; // nothing blocks this path
}

/**
 * d-separation: X ⊥ Y | Z  iff  every path between X and Y is blocked by Z
 */
export function isDSeparated(g: DagGraph, x: string, y: string, Z: Set<string>): boolean {
  const paths = getAllPaths(g, x, y);
  return paths.every(p => isPathBlocked(g, p, Z));
}

export interface PathAnalysis {
  path: string[];
  blocked: boolean;
  reason?: string;
}

export function analyzeAllPaths(g: DagGraph, Z: Set<string>): PathAnalysis[] {
  const paths = getAllPaths(g, g.exposure, g.outcome);

  return paths.map(path => {
    for (let i = 1; i < path.length - 1; i++) {
      const node = path[i];
      const collider = isColliderOnPath(g, path, i);

      if (collider) {
        const desc = descendants(g, node);
        const opened = Z.has(node) || [...desc].some(d => Z.has(d));
        if (!opened) {
          return {
            path,
            blocked: true,
            reason: `Colisionador "${label(g, node)}" no está condicionado`,
          };
        }
      } else {
        if (Z.has(node)) {
          return {
            path,
            blocked: true,
            reason: `No-colisionador "${label(g, node)}" está condicionado`,
          };
        }
      }
    }
    return { path, blocked: false };
  });
}
