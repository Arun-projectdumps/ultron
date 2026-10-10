// Configurable keymap. Combos are strings like "Meta+Shift+KeyE" (modifiers in Ctrl, Alt, Shift,
// Meta order + KeyboardEvent.code). Matching uses e.code because ⌥ turns letters into symbols on macOS.
// Defaults: tab/split shortcuts use ⌘ natively; in a browser ⌘T/⌘W/⌘1… are reserved, so ⌥ instead.
import { IS_TAURI } from '../backend';

export const ACTIONS = [
  { id: 'claude', label: 'Run Claude in active pane', group: 'Claude' },
  { id: 'exitClaude', label: 'Send /exit to Claude', group: 'Claude' },
  { id: 'prompts', label: 'Prompt templates', group: 'Claude' },
  { id: 'projects', label: 'Quick-switch projects', group: 'Navigation' },
  { id: 'openFolder', label: 'Open folder', group: 'Navigation' },
  { id: 'sidebar', label: 'Toggle sidebar', group: 'Navigation' },
  { id: 'settings', label: 'Settings', group: 'Navigation' },
  { id: 'cheatsheet', label: 'Shortcuts cheat sheet', group: 'Navigation' },
  { id: 'newTab', label: 'New tab', group: 'Tabs & panes' },
  { id: 'close', label: 'Close pane / tab', group: 'Tabs & panes' },
  { id: 'splitRight', label: 'Split right', group: 'Tabs & panes' },
  { id: 'splitDown', label: 'Split down', group: 'Tabs & panes' },
  { id: 'nextTab', label: 'Next tab', group: 'Tabs & panes' },
  { id: 'prevTab', label: 'Previous tab', group: 'Tabs & panes' },
  { id: 'focusLeft', label: 'Previous pane', group: 'Tabs & panes' },
  { id: 'focusRight', label: 'Next pane', group: 'Tabs & panes' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `tab${n}`, label: `Go to tab ${n}`, group: 'Tabs & panes' })),
  { id: 'lastTab', label: 'Go to last tab', group: 'Tabs & panes' },
] as const;
export type ActionId = (typeof ACTIONS)[number]['id'];
export type Keymap = Record<ActionId, string[]>;

const MOD = IS_TAURI ? 'Meta' : 'Alt';
export const TAB_MOD_LABEL = IS_TAURI ? '⌘' : '⌥';

export const DEFAULT_KEYMAP: Keymap = {
  claude: ['Meta+Enter'],
  exitClaude: ['Shift+Meta+KeyE'],
  prompts: ['Meta+KeyK'],
  projects: ['Meta+KeyP'],
  openFolder: ['Meta+KeyO'],
  sidebar: ['Meta+KeyB'],
  settings: ['Meta+Comma'],
  cheatsheet: ['Meta+Slash'],
  newTab: [`${MOD}+KeyT`],
  close: [`${MOD}+KeyW`],
  splitRight: [`${MOD}+KeyD`],
  splitDown: [`${MOD === 'Alt' ? 'Alt+Shift' : 'Shift+Meta'}+KeyD`],
  nextTab: ['Ctrl+Tab', 'Shift+Meta+BracketRight'],
  prevTab: ['Ctrl+Shift+Tab', 'Shift+Meta+BracketLeft'],
  focusLeft: ['Alt+Meta+ArrowLeft'],
  focusRight: ['Alt+Meta+ArrowRight'],
  tab1: [`${MOD}+Digit1`], tab2: [`${MOD}+Digit2`], tab3: [`${MOD}+Digit3`], tab4: [`${MOD}+Digit4`],
  tab5: [`${MOD}+Digit5`], tab6: [`${MOD}+Digit6`], tab7: [`${MOD}+Digit7`], tab8: [`${MOD}+Digit8`],
  lastTab: [`${MOD}+Digit9`],
};

// ---------- combos ----------

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;

export function comboFromEvent(e: KeyboardEvent): string | null {
  if (!e.code || MODIFIER_CODES.test(e.code)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mods, e.code].join('+');
}

const KEY_LABELS: Record<string, string> = {
  Enter: '↵', Tab: '⇥', Escape: 'Esc', Space: 'Space', Backspace: '⌫', Delete: '⌦',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`',
};
const MOD_SYMBOLS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

export function formatCombo(combo: string): string {
  if (!combo) return '';
  const parts = combo.split('+');
  const code = parts.pop()!;
  const key = KEY_LABELS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  return parts.map((m) => MOD_SYMBOLS[m] ?? m).join('') + key;
}

// ---------- validation ----------

/** Keys the shell and Claude Code need: these can never become app shortcuts. */
export function protectedReason(combo: string): string | null {
  const parts = combo.split('+');
  const code = parts.pop()!;
  const mods = new Set(parts);
  const onlyShift = mods.size === 0 || (mods.size === 1 && mods.has('Shift'));
  if (onlyShift && code === 'Enter' && mods.has('Shift')) return '⇧↵ inserts a newline in Claude without sending.';
  if (onlyShift && (code === 'Tab' || code === 'Escape' || code.startsWith('Arrow'))) return 'The terminal and Claude need this key.';
  if (onlyShift) return 'Plain keys are typed into the terminal.';
  if (mods.has('Ctrl') && !mods.has('Meta') && code !== 'Tab') return '⌃ combinations are control keys the shell and Claude use (⌃C, ⌃D, ⌃R…).';
  if (['Escape', 'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(code) && !mods.has('Meta') && !mods.has('Ctrl'))
    return 'The terminal needs this key (⌥-arrows jump words, ⌥⌫ deletes words).';
  return null;
}

/** Combos the browser (Safari/Chrome) or macOS grab before the page can see them. */
const SYSTEM_RESERVED = ['Meta+KeyQ', 'Meta+KeyH', 'Alt+Meta+KeyH', 'Meta+KeyM', 'Meta+Tab', 'Meta+Space'];
const BROWSER_RESERVED = [
  'Meta+KeyT', 'Meta+KeyW', 'Meta+KeyN', 'Shift+Meta+KeyN', 'Shift+Meta+KeyT', 'Meta+KeyL', 'Meta+KeyR',
  'Meta+Comma', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Shift+Meta+BracketLeft', 'Shift+Meta+BracketRight',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Meta+Digit${n}`),
];
export function reservedReason(combo: string): string | null {
  if (SYSTEM_RESERVED.includes(combo)) return 'macOS reserves this.';
  if (!IS_TAURI && BROWSER_RESERVED.includes(combo)) return 'Safari/Chrome reserve this on localhost; it works in the native app.';
  return null;
}

/** ⌥+letter types a special character in the terminal (⌥T = †); allowed, but worth a note. */
export function altNote(combo: string): string | null {
  const parts = combo.split('+');
  const code = parts.pop()!;
  return parts.includes('Alt') && !parts.includes('Meta') && /^(Key|Digit)/.test(code) ? `${formatCombo(combo)} can't type its special character in the terminal.` : null;
}

// ---------- active keymap ----------

let keymap: Keymap = DEFAULT_KEYMAP;
let lookup = new Map<string, ActionId>();

function rebuild() {
  lookup = new Map();
  for (const a of ACTIONS) for (const c of keymap[a.id] ?? []) if (!protectedReason(c) && !lookup.has(c)) lookup.set(c, a.id);
}
rebuild();

/** Saved overrides (data.json settings.shortcuts) on top of the defaults. Pure. */
export function resolveKeymap(overrides: Partial<Record<string, string[]>> | undefined): Keymap {
  const map = { ...DEFAULT_KEYMAP };
  for (const [id, combos] of Object.entries(overrides ?? {})) {
    if (id in DEFAULT_KEYMAP && Array.isArray(combos)) map[id as ActionId] = combos;
  }
  return map;
}

export function setKeymapOverrides(overrides: Partial<Record<string, string[]>> | undefined) {
  keymap = resolveKeymap(overrides);
  rebuild();
}

export const getKeymap = () => keymap;
export const hint = (id: ActionId) => formatCombo(keymap[id]?.[0] ?? '');

export function matchShortcut(e: KeyboardEvent): ActionId | null {
  if (e.type !== 'keydown') return null;
  const combo = comboFromEvent(e);
  return combo ? (lookup.get(combo) ?? null) : null;
}

export const isAppShortcut = (e: KeyboardEvent) => matchShortcut(e) !== null;

/** combo → actions that share it (length > 1 = conflict). */
export function conflictsOf(map: Keymap): Map<string, ActionId[]> {
  const m = new Map<string, ActionId[]>();
  for (const a of ACTIONS) for (const c of map[a.id] ?? []) m.set(c, [...(m.get(c) ?? []), a.id]);
  return m;
}
