import { create } from 'zustand';
import { backend, type AppData, type Layout, type Project, type Template, type ShellStatus } from '../backend';
import type { Theme } from '../theme/types';
import { NOCTURNE } from '../theme/nocturne';
import { newTab } from '../lib/layout';

export type DialogState =
  | null
  | { kind: 'project'; project?: Project; path?: string }
  | { kind: 'template'; template?: Template }
  | { kind: 'settings'; tab?: 'general' | 'shortcuts' };

export interface PaneState {
  status: ShellStatus;
  claudeRunning: boolean;
  booting: boolean; // Claude boot overlay visible
  switching: boolean; // project switch in progress
}

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  run?(): void;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  resolve(ok: boolean): void;
}

interface State {
  data: AppData | null;
  missing: Record<string, boolean>; // project id → path no longer exists
  layout: Layout;
  panes: Record<string, PaneState>;
  sidebarCollapsed: boolean;
  promptsOpen: boolean;
  themeMenuOpen: boolean;
  dialog: DialogState;
  introKey: number | null; // non-null while the intro plays; bump to replay
  user: { username: string; home: string; ffmpeg: boolean };
  themes: Theme[]; // saved themes; the built-in Nocturne (or its saved override) is always first
  draft: Theme | null; // theme being edited: applied live while the editor is open
  idle: boolean; // no input for 60 s (animated media pauses)
  toast: string | null;
  confirm: ConfirmState | null;
  contextMenu: { x: number; y: number; items: MenuItem[] } | null;
  switcherOpen: boolean; // ⌘P project quick-switch
  cheatsheetOpen: boolean; // ⌘/ overlay
  recording: boolean; // shortcuts editor is capturing a combo: global shortcuts pause
  flash: { pane: string; at: number } | null; // brief border flash on a pane

  update(fn: (draft: AppData) => void): void;
  setLayout(fn: (l: Layout) => Layout): void;
  setPane(id: string, patch: Partial<PaneState>): void;
  set(partial: Partial<State>): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { data, layout } = useStore.getState();
    if (data) backend.saveData({ ...data, layout }).catch(console.error);
  }, 300);
}

const firstTab = newTab();
export const emptyPane = (): PaneState => ({
  status: { fg: 'zsh', cwd: null, shell: 'zsh' },
  claudeRunning: false,
  booting: false,
  switching: false,
});

export const useStore = create<State>((set, get) => ({
  data: null,
  missing: {},
  layout: { tabs: [firstTab], activeTab: firstTab.id },
  panes: {},
  sidebarCollapsed: false,
  promptsOpen: false,
  themeMenuOpen: false,
  dialog: null,
  introKey: null,
  user: { username: '', home: '', ffmpeg: false },
  themes: [NOCTURNE],
  draft: null,
  idle: false,
  toast: null,
  confirm: null,
  contextMenu: null,
  switcherOpen: false,
  cheatsheetOpen: false,
  recording: false,
  flash: null,

  update(fn) {
    const current = get().data;
    if (!current) return;
    const next = structuredClone(current);
    fn(next);
    set({ data: next });
    scheduleSave();
  },
  setLayout(fn) {
    set({ layout: fn(get().layout) });
    if (get().data) scheduleSave();
  },
  setPane(id, patch) {
    set((s) => ({ panes: { ...s.panes, [id]: { ...(s.panes[id] ?? emptyPane()), ...patch } } }));
  },
  set: (partial) => set(partial),
}));

export const newId = () => crypto.randomUUID().slice(0, 8);

export async function refreshMissing() {
  const projects = useStore.getState().data?.projects ?? [];
  if (!projects.length) return useStore.setState({ missing: {} });
  const exists = await backend.pathsExist(projects.map((p) => p.path));
  useStore.setState({ missing: Object.fromEntries(projects.map((p, i) => [p.id, !exists[i]])) });
}

/** Active theme: the editor draft if open, else the selected saved theme. */
export const selectTheme = (s: State): Theme =>
  s.draft ?? s.themes.find((t) => t.id === s.data?.settings.themeId) ?? s.themes[0] ?? NOCTURNE;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string) {
  clearTimeout(toastTimer);
  useStore.setState({ toast: message });
  toastTimer = setTimeout(() => useStore.setState({ toast: null }), 3200);
}

export function confirmDialog(title: string, message: string, confirmLabel = 'Close'): Promise<boolean> {
  return new Promise((resolve) =>
    useStore.setState({
      confirm: {
        title, message, confirmLabel,
        resolve: (ok) => {
          useStore.setState({ confirm: null });
          resolve(ok);
        },
      },
    }),
  );
}
