// Everything the UI does to a shell goes through here. Actions target the ACTIVE pane by default.
import { backend } from '../backend';
import { useStore, newId, emptyPane, toast } from '../state/store';
import { activePaneId, findPane, setPaneCwd, tabOfPane } from './layout';
import { focusPane, getTerm, restart, setTermCwd } from './terminals';
import { basename, shellQuote } from './paths';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isClaude = (fg: string) => fg === 'claude';
export const currentPane = () => activePaneId(useStore.getState().layout)!;
const pane = (id: string) => useStore.getState().panes[id] ?? emptyPane();

// ---------- status (foreground process + cwd) ----------

export async function refreshStatus(paneId = currentPane()) {
  if (!paneId) return;
  const status = await backend.status(paneId);
  const s = useStore.getState();
  if (!tabOfPane(s.layout, paneId)) return; // closed meanwhile
  const running = isClaude(status.fg);
  s.setPane(paneId, { status, claudeRunning: running, ...(pane(paneId).claudeRunning && !running ? { booting: false } : {}) });
  if (status.cwd) {
    setTermCwd(paneId, status.cwd);
    const tab = tabOfPane(s.layout, paneId)!;
    if (findPane(tab.root, paneId)?.cwd !== status.cwd) {
      s.setLayout((l) => ({ ...l, tabs: l.tabs.map((t) => (t.id === tab.id ? { ...t, root: setPaneCwd(t.root, paneId, status.cwd!) } : t)) }));
    }
  }
}

// Ask the OS after a pane's output settles (250 ms quiet, at most every 2 s while busy).
// Event-driven: an idle pane costs nothing.
const timers = new Map<string, { quiet?: ReturnType<typeof setTimeout>; max?: ReturnType<typeof setTimeout> }>();
export function noteOutput(paneId: string) {
  const t = timers.get(paneId) ?? {};
  timers.set(paneId, t);
  const fire = () => {
    clearTimeout(t.quiet);
    clearTimeout(t.max);
    t.max = undefined;
    refreshStatus(paneId).catch(() => {});
  };
  clearTimeout(t.quiet);
  t.quiet = setTimeout(fire, 250);
  t.max ??= setTimeout(fire, 2000);
}
export function forgetPane(paneId: string) {
  const t = timers.get(paneId);
  if (t) { clearTimeout(t.quiet); clearTimeout(t.max); }
  timers.delete(paneId);
  useStore.setState((s) => {
    const panes = { ...s.panes };
    delete panes[paneId];
    return { panes };
  });
}

// ---------- commands ----------

export function runCommand(cmd: string, paneId = currentPane()) {
  backend.write(paneId, cmd + '\r');
  focusPane(paneId);
}

/** Pastes without pressing Enter; xterm adds bracketed-paste markers when the app enabled them. */
export function pasteText(text: string, paneId = currentPane()) {
  const term = getTerm(paneId);
  if (term) term.paste(text);
  else backend.write(paneId, '\x1b[200~' + text + '\x1b[201~');
  focusPane(paneId);
}

/** Boot overlay: from send until output is quiet 400 ms after the first output, or 6 s. */
function showBootOverlay(paneId: string) {
  const { setPane } = useStore.getState();
  setPane(paneId, { booting: true });
  const started = performance.now();
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const done = () => {
    off();
    clearTimeout(quiet);
    clearTimeout(hard);
    useStore.getState().setPane(paneId, { booting: false });
  };
  const off = backend.onData(paneId, () => {
    clearTimeout(quiet);
    // The shell echoes our command instantly; give Claude a moment to actually start drawing.
    quiet = setTimeout(done, Math.max(400, 700 - (performance.now() - started)));
  });
  const hard = setTimeout(done, 6000);
}

export function launchClaude(paneId = currentPane()) {
  const { data } = useStore.getState();
  showBootOverlay(paneId);
  runCommand(data?.settings.claudeCommand?.trim() || 'claude', paneId);
}

export function flashPane(paneId = currentPane()) {
  useStore.setState({ flash: { pane: paneId, at: Date.now() } });
  focusPane(paneId);
}

/** ⌘↵: start Claude in the active pane, or, if it's already running there, focus and flash it. */
export async function runOrFocusClaude(paneId = currentPane()) {
  const p = pane(paneId);
  if (p.switching || p.booting) return flashPane(paneId);
  if (p.claudeRunning || isClaude(await backend.foregroundProcess(paneId))) return flashPane(paneId);
  launchClaude(paneId);
}

/** ⌘⇧E: send /exit to Claude in the active pane (no cd, no relaunch). */
export async function exitClaudeInPane(paneId = currentPane()) {
  if (pane(paneId).switching) return;
  if (!isClaude(await backend.foregroundProcess(paneId))) {
    toast("Claude isn't running in this pane.");
    return focusPane(paneId);
  }
  useStore.getState().setPane(paneId, { switching: true });
  try {
    await exitClaude(paneId);
  } finally {
    useStore.getState().setPane(paneId, { switching: false });
    focusPane(paneId);
    setTimeout(() => refreshStatus(paneId).catch(() => {}), 300);
  }
}

/** Exits Claude in a pane and waits for the shell prompt. */
async function exitClaude(paneId: string) {
  // Ctrl-C first: clears a half-typed/pasted prompt (or cancels a running turn). Without it,
  // "/exit" would be appended to that text and Enter would submit it as a prompt.
  backend.write(paneId, '\x03');
  await sleep(200);
  backend.write(paneId, '/exit');
  await sleep(80); // separate Enter so Claude doesn't treat it as part of a paste
  backend.write(paneId, '\r');
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    await sleep(150);
    if (!isClaude(await backend.foregroundProcess(paneId))) return;
  }
  backend.write(paneId, '\x03');
  await sleep(150);
  backend.write(paneId, '\x03');
  for (let i = 0; i < 10; i++) {
    await sleep(150);
    if (!isClaude(await backend.foregroundProcess(paneId))) return;
  }
}

/** cd into a folder (and optionally start Claude), exiting a running Claude first. */
async function switchTo(path: string, opts: { launch: boolean }, paneId = currentPane()) {
  if (pane(paneId).switching) return;
  useStore.getState().setPane(paneId, { switching: true });
  try {
    if (isClaude(await backend.foregroundProcess(paneId))) {
      await exitClaude(paneId);
      await sleep(120); // let zsh redraw its prompt
    }
    runCommand(`cd ${shellQuote(path)}`, paneId);
    if (opts.launch) launchClaude(paneId);
  } finally {
    useStore.getState().setPane(paneId, { switching: false });
    setTimeout(() => refreshStatus(paneId).catch(() => {}), 300);
  }
}

export async function openProject(id: string) {
  const { data, update } = useStore.getState();
  const project = data?.projects.find((p) => p.id === id);
  if (!project) return;
  update((d) => {
    const p = d.projects.find((x) => x.id === id);
    if (p) p.lastOpened = Date.now();
  });
  await switchTo(project.path, { launch: true });
}

export async function openFolder() {
  const paneId = currentPane();
  const path = await backend.pickFolder();
  focusPane(paneId);
  if (!path) return;
  // Inside Claude a bare `cd` would be typed into the prompt, so restart Claude there instead.
  const inClaude = isClaude(await backend.foregroundProcess(paneId));
  await switchTo(path, { launch: inClaude }, paneId);
}

export async function addProjectFromPicker() {
  const path = await backend.pickFolder();
  if (!path) return focusPane(currentPane());
  useStore.setState({ dialog: { kind: 'project', path } });
}

export function addProject(name: string, path: string) {
  useStore.getState().update((d) => {
    d.projects.push({ id: newId(), name: name.trim() || basename(path), path });
  });
}

export async function restartShell(paneId = currentPane()) {
  useStore.getState().setPane(paneId, { booting: false, claudeRunning: false });
  await restart(paneId);
  setTimeout(() => refreshStatus(paneId).catch(() => {}), 500);
}
