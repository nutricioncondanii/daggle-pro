export interface DagNode {
  id: string;
  label: string;
}

export interface DagEdge {
  source: string;
  target: string;
}

export interface DagGraph {
  nodes: DagNode[];
  edges: DagEdge[];
  exposure: string;
  outcome: string;
}

export type NodeRole =
  | 'exposure'
  | 'outcome'
  | 'confounder'
  | 'mediator'
  | 'collider'
  | 'ancestor'
  | 'descendant'
  | 'other';
