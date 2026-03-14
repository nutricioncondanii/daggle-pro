import { DagGraph, NodeRole } from '../types/dag';
import { parents, ancestors, descendants } from './dag';

export function classifyNodeRole(g: DagGraph, nodeId: string): NodeRole {
  if (nodeId === g.exposure) return 'exposure';
  if (nodeId === g.outcome) return 'outcome';

  const ancX = ancestors(g, g.exposure);
  const ancY = ancestors(g, g.outcome);
  const descX = descendants(g, g.exposure);

  // Confounder: ancestor of both exposure and outcome
  if (ancX.has(nodeId) && ancY.has(nodeId)) return 'confounder';

  // Mediator: descendant of exposure AND ancestor of outcome
  if (descX.has(nodeId) && ancY.has(nodeId)) return 'mediator';

  // Collider: has ≥2 parents from different sides
  const p = parents(g, nodeId);
  if (p.length >= 2) {
    const fromExposureSide = p.some(pid =>
      pid === g.exposure || descX.has(pid) || ancX.has(pid)
    );
    const fromOutcomeSide = p.some(pid =>
      pid === g.outcome || ancY.has(pid)
    );
    if (fromExposureSide && fromOutcomeSide) return 'collider';
  }

  if (ancX.has(nodeId) || ancY.has(nodeId)) return 'ancestor';
  if (descX.has(nodeId)) return 'descendant';

  return 'other';
}

export function getRoleColor(role: NodeRole): string {
  const colors: Record<NodeRole, string> = {
    exposure: '#3b82f6',
    outcome: '#ef4444',
    confounder: '#f59e0b',
    mediator: '#8b5cf6',
    collider: '#10b981',
    ancestor: '#6b7280',
    descendant: '#6b7280',
    other: '#9ca3af',
  };
  return colors[role];
}
