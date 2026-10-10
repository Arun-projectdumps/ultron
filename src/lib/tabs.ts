// Tab and split actions (all mutate the layout in the store and keep ptys in sync).
import { useStore, confirmDialog, toast } from '../state/store';
import type { Layout, Tab } from '../backend';
import { activeTab, allPanes, cloneTree, newTab, panesOf, removePane, splitPane, tabOfPane, findPane } from './layout';
import { destroy, focusPane } from './terminals';
import { forgetPane } from './shell';
import { basename } from './paths';

const MAX_PANES = 10;
const st = () => useStore.getState();
const layout = () => st().layout;

const canAdd = (n = 1) => {
  if (allPanes(layout()).length + n <= MAX_PANES) return true;
  toast(`Up to ${MAX_PANES} terminals at once. Close one first.`);
  return false;
};

const claudeIn = (paneIds: string[]) => paneIds.filter((id) => st().panes[id]?.claudeRunning).length;

async function okToClose(paneIds: string[], what: string) {
  const n = claudeIn(paneIds);
  if (!n) return true;
  return confirmDialog(
    `Close ${what}?`,
    n === 1 ? 'Claude is running there. Closing ends that session.' : `Claude is running in ${n} terminals. Closing ends those sessions.`,
  );
}

function dropPanes(ids: string[]) {
  ids.forEach((id) => {
    destroy(id);
    forgetPane(id);
  });
}

function focusActive() {
  requestAnimationFrame(() => focusPane(activeTab(layout())?.activePane));
}

export const cwdOfPane = (paneId: string) => {
  const s = st();
  return s.panes[paneId]?.status.cwd ?? (tabOfPane(s.layout, paneId) && findPane(tabOfPane(s.layout, paneId)!.root, paneId)?.cwd) ?? undefined;
};

export function tabTitle(tab: Tab): { title: string; claude: boolean } {
  const s = st();
  const claude = panesOf(tab.root).some((id) => s.panes[id]?.claudeRunning);
  if (tab.title) return { title: tab.title, claude };
  const cwd = cwdOfPane(tab.activePane);
  const folder = !cwd ? 'zsh' : cwd === s.user.home ? '~' : basename(cwd);
  return { title: s.panes[tab.activePane]?.claudeRunning ? `claude · ${folder}` : folder, claude };
}

export function selectTab(id: string) {
  st().setLayout((l) => ({ ...l, activeTab: id }));
  focusActive();
}

export function setActivePane(paneId: string) {
  const tab = tabOfPane(layout(), paneId);
  if (!tab || (layout().activeTab === tab.id && tab.activePane === paneId)) return;
  st().setLayout((l) => ({ activeTab: tab.id, tabs: l.tabs.map((t) => (t.id === tab.id ? { ...t, activePane: paneId } : t)) }));
}

export function addTab(cwd?: string, index?: number) {
  if (!canAdd()) return;
  const tab = newTab(cwd);
  st().setLayout((l) => {
    const tabs = [...l.tabs];
    tabs.splice(index ?? tabs.length, 0, tab);
    return { tabs, activeTab: tab.id };
  });
  focusActive();
}

export function duplicateTab(id: string) {
  const i = layout().tabs.findIndex((t) => t.id === id);
  const tab = layout().tabs[i];
  if (!tab || !canAdd(panesOf(tab.root).length)) return;
  const root = cloneTree({ ...tab.root, ...(tab.root.type === 'pane' ? { cwd: cwdOfPane(tab.root.id) } : {}) });
  const copy: Tab = { id: `t${crypto.randomUUID().slice(0, 8)}`, title: tab.title, root, activePane: panesOf(root)[0] };
  st().setLayout((l) => {
    const tabs = [...l.tabs];
    tabs.splice(i + 1, 0, copy);
    return { tabs, activeTab: copy.id };
  });
  focusActive();
}

export function split(dir: 'row' | 'column', paneId?: string) {
  const tab = paneId ? tabOfPane(layout(), paneId) : activeTab(layout());
  if (!tab || !canAdd()) return;
  const target = paneId ?? tab.activePane;
  const { tab: next } = splitPane(tab, target, dir, cwdOfPane(target));
  st().setLayout((l) => ({ activeTab: tab.id, tabs: l.tabs.map((t) => (t.id === tab.id ? next : t)) }));
  focusActive();
}

export function setRatioAction(tabId: string, next: Tab['root']) {
  st().setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, root: next } : t)) }));
}

/** Removes tabs, always keeping at least one (a fresh one replaces the last). */
function removeTabs(ids: Set<string>) {
  const doomed = layout().tabs.filter((t) => ids.has(t.id));
  dropPanes(doomed.flatMap((t) => panesOf(t.root)));
  st().setLayout((l) => {
    const oldIndex = l.tabs.findIndex((t) => t.id === l.activeTab);
    let tabs = l.tabs.filter((t) => !ids.has(t.id));
    if (!tabs.length) tabs = [newTab()];
    const activeTab = tabs.some((t) => t.id === l.activeTab) ? l.activeTab : tabs[Math.min(Math.max(0, oldIndex - 1), tabs.length - 1)].id;
    return { tabs, activeTab };
  });
  focusActive();
}

export async function closeTab(id: string) {
  const tab = layout().tabs.find((t) => t.id === id);
  if (!tab || !(await okToClose(panesOf(tab.root), 'tab'))) return;
  removeTabs(new Set([id]));
}

export async function closePane(paneId = activeTab(layout())?.activePane) {
  if (!paneId) return;
  const tab = tabOfPane(layout(), paneId);
  if (!tab || !(await okToClose([paneId], 'terminal'))) return;
  const next = removePane(tab, paneId);
  if (!next) return removeTabs(new Set([tab.id]));
  dropPanes([paneId]);
  st().setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === tab.id ? next : t)) }));
  focusActive();
}

async function closeMany(tabs: Tab[], what: string) {
  if (!tabs.length || !(await okToClose(tabs.flatMap((t) => panesOf(t.root)), what))) return;
  removeTabs(new Set(tabs.map((t) => t.id)));
}

export const closeOthers = (id: string) => closeMany(layout().tabs.filter((t) => t.id !== id), 'other tabs');
export const closeAll = () => closeMany(layout().tabs, 'all tabs');
export function closeSide(id: string, side: 'left' | 'right') {
  const i = layout().tabs.findIndex((t) => t.id === id);
  const tabs = side === 'left' ? layout().tabs.slice(0, i) : layout().tabs.slice(i + 1);
  return closeMany(tabs, `tabs to the ${side}`);
}

export function moveTab(id: string, to: number) {
  st().setLayout((l) => {
    const tabs = [...l.tabs];
    const from = tabs.findIndex((t) => t.id === id);
    if (from < 0) return l;
    const [t] = tabs.splice(from, 1);
    tabs.splice(Math.max(0, Math.min(tabs.length, to)), 0, t);
    return { ...l, tabs };
  });
}

export function renameTab(id: string, title: string) {
  st().setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || undefined } : t)) }));
}

export function cycleTab(delta: number) {
  const l = layout();
  const i = l.tabs.findIndex((t) => t.id === l.activeTab);
  selectTab(l.tabs[(i + delta + l.tabs.length) % l.tabs.length].id);
}

export function goTab(index: number | 'last') {
  const tabs = layout().tabs;
  const t = index === 'last' ? tabs[tabs.length - 1] : tabs[index];
  if (t) selectTab(t.id);
}

/** ⌘⌥←/→: previous/next pane in reading order within the tab. */
export function cyclePane(delta: number) {
  const tab = activeTab(layout());
  if (!tab) return;
  const ids = panesOf(tab.root);
  const next = ids[(ids.indexOf(tab.activePane) + delta + ids.length) % ids.length];
  setActivePane(next);
  focusPane(next);
}

export function restoreLayout(saved: Layout | undefined) {
  if (!saved) return;
  const valid = saved.tabs.filter((t) => t.root && panesOf(t.root).length);
  if (!valid.length) return;
  const capped: Tab[] = [];
  let count = 0;
  for (const t of valid) {
    const n = panesOf(t.root).length;
    if (count + n > MAX_PANES) break;
    count += n;
    capped.push({ ...t, activePane: panesOf(t.root).includes(t.activePane) ? t.activePane : panesOf(t.root)[0] });
  }
  useStore.setState({
    layout: { tabs: capped, activeTab: capped.some((t) => t.id === saved.activeTab) ? saved.activeTab : capped[0].id },
  });
}
