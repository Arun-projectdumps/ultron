// One xterm per pane, owned here rather than by React: splitting a pane moves it in the
// component tree, and re-creating the terminal would lose its scrollback. Panes attach the
// persistent host element into whatever container currently renders them.
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { backend, IS_TAURI } from '../backend';
import type { TerminalColors } from '../theme/types';
import { isAppShortcut } from './shortcuts';

interface PaneTerm {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  opened: boolean;
  spawned: boolean;
  exited: boolean;
  cwd?: string;
  lastSize: string;
  dispose(): void;
}

interface Hooks {
  onOutput(paneId: string): void;
  onFocus(paneId: string): void;
  onExit(paneId: string): void;
}

declare global {
  interface Window { __ultronTerms?: Map<string, PaneTerm> }
}
const terms: Map<string, PaneTerm> = (window.__ultronTerms ??= new Map());
let hooks: Hooks = { onOutput() {}, onFocus() {}, onExit() {} };
let theme: ITheme = {};

export const setTerminalHooks = (h: Hooks) => void (hooks = h);

// Idle caret parking. WebKit (the native app's engine) animates the caret of a focused editable
// field even when it's invisible, and xterm keeps a hidden textarea focused for input, so an idle
// window would repaint forever (~2% CPU; measured 0.0% with nothing focused). After 2 s without
// input or output the textarea is blurred ("parked"). The blur/focus events this causes are
// swallowed so xterm never sees them: no hollow cursor, no focus reports sent to Claude. The next
// keydown refocuses it and is handed to xterm's own keydown handler, so no keystroke is lost.
const IDLE_MS = 2000;
let parked: { paneId: string; ta: HTMLTextAreaElement } | null = null;
let parkedAway = false; // the app was deactivated while parked
let swallow = false; // our own blur()/focus() calls are in progress
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const paneOfTextarea = (el: Element) => [...terms].find(([, t]) => t.term.textarea === el)?.[0];

function park() {
  const el = document.activeElement;
  if (parked || !document.hasFocus() || !(el instanceof HTMLTextAreaElement)) return;
  const paneId = paneOfTextarea(el);
  if (!paneId) return;
  parked = { paneId, ta: el };
  swallow = true;
  el.blur();
  swallow = false;
}

function unpark(): string | null {
  if (!parked) return null;
  const { paneId, ta } = parked;
  parked = null;
  parkedAway = false;
  if (!ta.isConnected) return null;
  swallow = true;
  ta.focus({ preventScroll: true });
  swallow = false;
  return paneId;
}

const schedulePark = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(park, IDLE_MS);
};

// Swallow the textarea focus/blur events our parking causes (capture on window runs before xterm's).
const swallowOwn = (e: FocusEvent) => {
  if (swallow && e.target instanceof HTMLTextAreaElement) e.stopImmediatePropagation();
};
window.addEventListener('blur', swallowOwn, true);
window.addEventListener('focus', swallowOwn, true);

window.addEventListener('keydown', (e) => {
  if (parked && (document.activeElement === document.body || document.activeElement === null)) {
    const paneId = unpark();
    // The textarea missed this keydown; give it to xterm exactly as if it had received it.
    const core = paneId ? (terms.get(paneId)?.term as unknown as { _core?: { _keyDown?(ev: KeyboardEvent): unknown } })?._core : null;
    core?._keyDown?.(e);
  }
  schedulePark();
}, true);
for (const ev of ['mousedown', 'paste', 'compositionstart'] as const) window.addEventListener(ev, schedulePark, true);
window.addEventListener('focusin', (e) => {
  if (!swallow && parked && e.target !== parked.ta) parked = null; // the user focused something else
  schedulePark();
}, true);

// App deactivated/reactivated while parked: send the focus reports xterm would have sent.
window.addEventListener('blur', (e) => {
  if (e.target !== window || !parked) return;
  parkedAway = true;
  if (terms.get(parked.paneId)?.term.modes.sendFocusMode) backend.write(parked.paneId, '\x1b[O');
});
window.addEventListener('focus', (e) => {
  if (e.target !== window || !parked || !parkedAway) return;
  const paneId = unpark();
  if (paneId && terms.get(paneId)?.term.modes.sendFocusMode) backend.write(paneId, '\x1b[I');
  schedulePark();
});

/** Output on a parked pane refocuses it (output repaints anyway), so the cursor renders as focused. */
function onPaneOutput(paneId: string) {
  if (parked?.paneId === paneId) unpark();
  schedulePark();
}

export function toXtermTheme(c: TerminalColors): ITheme {
  const { foreground, cursor, selection, ...ansi } = c;
  return { ...ansi, background: 'rgba(0,0,0,0)', foreground, cursor, cursorAccent: '#000000', selectionBackground: selection };
}

export function setTerminalTheme(c: TerminalColors) {
  theme = toXtermTheme(c);
  terms.forEach((t) => (t.term.options.theme = theme));
}

function create(paneId: string, cwd?: string): PaneTerm {
  const term = new Terminal({
    allowTransparency: true,
    theme,
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
    fontSize: 13.5,
    lineHeight: 1.25,
    fontWeight: '400',
    fontWeightBold: '700',
    cursorBlink: false, // a blinking cursor repaints forever; keeps idle CPU near zero
    scrollback: 10000,
    macOptionClickForcesSelection: true,
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement('div');
  host.className = 'pane-host';

  const pt: PaneTerm = {
    term, fit, host, cwd, opened: false, spawned: false, exited: false, lastSize: '',
    dispose() {
      offData();
      offExit();
      term.dispose();
      host.remove();
    },
  };

  term.attachCustomKeyEventHandler((e) => {
    // Shift+Enter → ESC CR, which Claude Code reads as "newline without sending".
    if (e.type === 'keydown' && e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      backend.write(paneId, '\x1b\r');
      return false;
    }
    return !isAppShortcut(e); // app shortcuts are handled globally
  });

  const offData = backend.onData(paneId, (chunk) => {
    term.write(chunk);
    onPaneOutput(paneId);
    hooks.onOutput(paneId);
  });
  const offExit = backend.onExit(paneId, (code) => {
    pt.exited = true;
    term.write(`\r\n\x1b[2m[shell exited with code ${code} — press any key to restart]\x1b[0m\r\n`);
    hooks.onExit(paneId);
  });
  term.onData((d) => {
    if (pt.exited) {
      pt.exited = false;
      restart(paneId);
      return;
    }
    backend.write(paneId, d);
  });
  terms.set(paneId, pt);
  return pt;
}

/** Mounts the pane's terminal into `container`, creating/spawning it on first use. */
export function attach(paneId: string, container: HTMLElement, cwd?: string): () => void {
  const pt = terms.get(paneId) ?? create(paneId, cwd);
  container.appendChild(pt.host);
  let disposed = false;

  const sync = () => {
    if (disposed || !pt.opened || !pt.host.clientWidth || !pt.host.clientHeight) return;
    pt.fit.fit();
    const size = `${pt.term.cols}x${pt.term.rows}`;
    if (size !== pt.lastSize) {
      pt.lastSize = size;
      backend.resize(paneId, pt.term.cols, pt.term.rows);
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(sync, 50);
  });

  // Measure with the real font, or cell sizes are wrong.
  document.fonts.load('13.5px "JetBrains Mono"').catch(() => {}).finally(() => {
    if (disposed) return;
    if (!pt.opened) {
      pt.term.open(pt.host);
      pt.opened = true;
      // Native app (WebKit): xterm's DOM renderer. Measured idle footprint there: 135 MB total with DOM
      // vs 216 MB with WebGL (its Retina canvas buffers + glyph atlas), against a 150 MB budget.
      // The browser prototype keeps WebGL.
      if (!IS_TAURI) try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose()); // falls back to the DOM renderer
        pt.term.loadAddon(webgl);
      } catch { /* no WebGL: DOM renderer */ }
      const ta = pt.term.textarea;
      ta?.addEventListener('focus', () => hooks.onFocus(paneId));
      // xterm disables spellcheck/autocorrect; also stop macOS inline predictions from querying it.
      ta?.setAttribute('writingsuggestions', 'false');
      ta?.setAttribute('autocomplete', 'off');
    }
    pt.fit.fit();
    pt.lastSize = `${pt.term.cols}x${pt.term.rows}`;
    if (!pt.spawned) {
      pt.spawned = true;
      backend.spawnShell(paneId, pt.term.cols, pt.term.rows, pt.cwd);
    } else {
      backend.resize(paneId, pt.term.cols, pt.term.rows);
      pt.term.refresh(0, pt.term.rows - 1);
    }
    ro.observe(pt.host);
  });

  return () => {
    disposed = true;
    clearTimeout(timer);
    ro.disconnect();
    if (pt.host.parentElement === container) container.removeChild(pt.host); // keeps the terminal alive
  };
}

export const getTerm = (paneId: string) => terms.get(paneId)?.term ?? null;
export const focusPane = (paneId: string | undefined) => paneId && terms.get(paneId)?.term.focus();

export async function restart(paneId: string) {
  const pt = terms.get(paneId);
  if (!pt) return;
  pt.exited = false;
  pt.term.reset();
  await backend.spawnShell(paneId, pt.term.cols, pt.term.rows, pt.cwd);
  pt.term.focus();
}

/** Kills the pty and frees the terminal. */
export function destroy(paneId: string) {
  backend.kill(paneId);
  terms.get(paneId)?.dispose();
  terms.delete(paneId);
}

export const liveTerminalIds = () => [...terms.keys()];

/** Remembered so a restarted shell (or next launch) starts in the same folder. */
export function setTermCwd(paneId: string, cwd: string) {
  const pt = terms.get(paneId);
  if (pt) pt.cwd = cwd;
}
