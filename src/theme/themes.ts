// Theme library: the built-in Nocturne (or the user's saved edits of it) plus custom themes.
import { backend } from '../backend';
import { useStore, toast, confirmDialog } from '../state/store';
import { NOCTURNE, blankTheme } from './nocturne';
import { deriveTerminal, deriveTokens } from './derive';
import type { Theme } from './types';

const st = () => useStore.getState();

/** Fills fields a saved/imported theme may lack (older versions, hand edits). */
function normalize(t: Theme): Theme {
  const base = structuredClone(NOCTURNE);
  const colors = { ...base.colors, ...t.colors };
  colors.tokens = { ...deriveTokens(colors.accent, colors.base), ...(t.colors?.tokens ?? {}) };
  colors.terminal = { ...deriveTerminal(colors.tokens), ...(t.colors?.terminal ?? {}) };
  return {
    ...base,
    ...t,
    version: 1,
    builtin: t.id === 'nocturne',
    colors,
    media: t.media ?? {},
    intro: { ...base.intro, ...(t.intro ?? {}), glow: { ...base.intro.glow, ...(t.intro?.glow ?? {}) } },
  };
}

export async function loadThemes() {
  const saved = (await backend.listThemes().catch(() => [] as Theme[])).map(normalize);
  const override = saved.find((t) => t.id === 'nocturne');
  const custom = saved.filter((t) => t.id !== 'nocturne').sort((a, b) => a.name.localeCompare(b.name));
  useStore.setState({ themes: [override ?? NOCTURNE, ...custom] });
}

export const activeThemeId = () => st().data?.settings.themeId ?? 'nocturne';

/** Switches theme and replays the intro (spec: intro plays when a theme is applied). */
export function applyTheme(id: string) {
  st().update((d) => void (d.settings.themeId = id));
  useStore.setState({ themeMenuOpen: false, introKey: Date.now() });
}

const newThemeId = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'theme'}-${crypto.randomUUID().slice(0, 6)}`;

export async function createTheme(from?: Theme) {
  const name = from ? `${from.name} copy` : 'Untitled theme';
  const id = newThemeId(name);
  const theme: Theme = from ? { ...structuredClone(from), id, name, builtin: false } : blankTheme(id, name);
  // Media files belong to a theme folder: a copy can't reference another theme's uploads,
  // so built-in paths are kept and uploaded files are dropped from the copy.
  if (from && !from.builtin) {
    for (const [slot, m] of Object.entries(theme.media)) if (m && !m.file.startsWith('/')) delete theme.media[slot as keyof Theme['media']];
    if (theme.intro.font === 'custom') theme.intro = { ...theme.intro, font: 'Michroma', customFont: undefined };
  }
  await backend.saveTheme(theme);
  await loadThemes();
  return theme;
}

export async function saveTheme(theme: Theme) {
  await backend.saveTheme(theme);
  await loadThemes();
}

export async function deleteTheme(theme: Theme) {
  if (theme.id === 'nocturne') return resetNocturne();
  if (!(await confirmDialog(`Delete “${theme.name}”?`, 'Its media files are deleted too. This cannot be undone.', 'Delete'))) return;
  await backend.deleteTheme(theme.id);
  if (activeThemeId() === theme.id) st().update((d) => void (d.settings.themeId = 'nocturne'));
  await loadThemes();
}

export async function resetNocturne() {
  if (!(await confirmDialog('Reset Nocturne?', 'Your edits to the built-in theme are discarded.', 'Reset'))) return;
  await backend.deleteTheme('nocturne');
  await loadThemes();
}

export async function exportTheme(theme: Theme) {
  try {
    // An unedited built-in theme has no folder; its media are app assets, so export it from memory.
    const json = await backend.exportTheme(theme.id).catch(() => JSON.stringify({ ultronTheme: 1, theme, files: {} }));
    if (await backend.saveFile(`${theme.name.replace(/[^\w.-]+/g, '_')}.ultron-theme.json`, json)) toast(`Exported “${theme.name}”`);
  } catch (err) {
    toast(`Export failed: ${(err as Error).message}`);
  }
}

export function importTheme() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const theme = await backend.importTheme(await file.text());
      await loadThemes();
      toast(`Imported “${theme.name}”`);
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`);
    }
  };
  input.click();
}

// ---------- editor ----------

export function openEditor(theme: Theme) {
  useStore.setState({ draft: structuredClone(theme), themeMenuOpen: false });
}

export function updateDraft(fn: (t: Theme) => void) {
  const d = st().draft;
  if (!d) return;
  const next = structuredClone(d);
  fn(next);
  useStore.setState({ draft: next });
}

export async function commitDraft() {
  const d = st().draft;
  if (!d) return;
  await saveTheme(d);
  useStore.setState({ draft: null });
  toast(`Saved “${d.name}”`);
}

export const discardDraft = () => useStore.setState({ draft: null });
