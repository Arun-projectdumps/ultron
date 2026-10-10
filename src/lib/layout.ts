// Pure operations on the tab/split tree. Splits are binary; nesting gives any arrangement.
import type { Layout, PaneNode, Tab } from '../backend';

export const uid = (p: string) => `${p}${crypto.randomUUID().slice(0, 8)}`;

export function panesOf(node: PaneNode): string[] {
  return node.type === 'pane' ? [node.id] : [...panesOf(node.a), ...panesOf(node.b)];
}
export const allPanes = (layout: Layout) => layout.tabs.flatMap((t) => panesOf(t.root));

export function findPane(node: PaneNode, id: string): Extract<PaneNode, { type: 'pane' }> | null {
  if (node.type === 'pane') return node.id === id ? node : null;
  return findPane(node.a, id) ?? findPane(node.b, id);
}

export const tabOfPane = (layout: Layout, paneId: string) => layout.tabs.find((t) => findPane(t.root, paneId));
export const activeTab = (layout: Layout) => layout.tabs.find((t) => t.id === layout.activeTab) ?? layout.tabs[0];
export const activePaneId = (layout: Layout) => activeTab(layout)?.activePane;

export function newTab(cwd?: string): Tab {
  const pane = uid('p');
  return { id: uid('t'), root: { type: 'pane', id: pane, cwd }, activePane: pane };
}

function mapNode(node: PaneNode, fn: (n: PaneNode) => PaneNode | null): PaneNode | null {
  const r = fn(node);
  if (r !== node || node.type === 'pane') return r;
  const a = mapNode(node.a, fn);
  const b = mapNode(node.b, fn);
  if (!a) return b; // a pane was removed: its sibling takes the split's place
  if (!b) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Replaces pane `id` with a split of [it, new pane]. Returns the new pane id. */
export function splitPane(tab: Tab, id: string, dir: 'row' | 'column', cwd?: string): { tab: Tab; newPane: string } {
  const newPane = uid('p');
  const root = mapNode(tab.root, (n) =>
    n.type === 'pane' && n.id === id
      ? { type: 'split', id: uid('s'), dir, ratio: 0.5, a: n, b: { type: 'pane', id: newPane, cwd } }
      : n,
  )!;
  return { tab: { ...tab, root, activePane: newPane }, newPane };
}

/** Removes a pane; returns null if it was the tab's last pane. */
export function removePane(tab: Tab, id: string): Tab | null {
  const order = panesOf(tab.root);
  const root = mapNode(tab.root, (n) => (n.type === 'pane' && n.id === id ? null : n));
  if (!root) return null;
  const remaining = panesOf(root);
  const idx = Math.max(0, order.indexOf(id) - 1);
  const activePane = tab.activePane === id ? remaining[Math.min(idx, remaining.length - 1)] : tab.activePane;
  return { ...tab, root, activePane };
}

export function setRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  return mapNode(node, (n) => (n.type === 'split' && n.id === splitId ? { ...n, ratio } : n))!;
}

export function setPaneCwd(node: PaneNode, paneId: string, cwd: string): PaneNode {
  return mapNode(node, (n) => (n.type === 'pane' && n.id === paneId ? { ...n, cwd } : n))!;
}

/** Fresh ids for every pane (Duplicate Tab), keeping folders. */
export function cloneTree(node: PaneNode): PaneNode {
  return node.type === 'pane'
    ? { type: 'pane', id: uid('p'), cwd: node.cwd }
    : { ...node, id: uid('s'), a: cloneTree(node.a), b: cloneTree(node.b) };
}
