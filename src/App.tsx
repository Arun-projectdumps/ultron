import { useEffect, useState } from 'react';
import { backend } from './backend';
import { useStore, refreshMissing, selectTheme } from './state/store';
import { currentPane, exitClaudeInPane, noteOutput, openFolder, refreshStatus, runOrFocusClaude } from './lib/shell';
import { focusPane, setTerminalHooks } from './lib/terminals';
import { matchShortcut, setKeymapOverrides, type ActionId } from './lib/shortcuts';
import { addTab, closePane, cyclePane, cycleTab, goTab, restoreLayout, setActivePane, split } from './lib/tabs';
import { loadThemes } from './theme/themes';
import { useApplyTheme } from './theme/apply';
import { Background } from './components/Background';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { StatusBar } from './components/StatusBar';
import { Dialogs } from './components/Dialogs';
import { Intro } from './components/Intro';
import { ThemeEditor } from './components/ThemeEditor';
import { ContextMenu } from './components/ContextMenu';
import { ConfirmHost, Toast } from './components/Overlays';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { CheatSheet } from './components/CheatSheet';
import styles from './App.module.css';

type IdePhase = 'hidden' | 'entering' | 'shown';

setTerminalHooks({
  onOutput: noteOutput,
  onFocus: setActivePane,
  onExit: (id) => useStore.getState().setPane(id, { claudeRunning: false, booting: false }),
});

export function App() {
  const loaded = useStore((s) => s.data !== null);
  const introKey = useStore((s) => s.introKey);
  const editing = useStore((s) => s.draft !== null);
  const [ide, setIde] = useState<IdePhase>('hidden');
  const [flash, setFlash] = useState(false);

  useApplyTheme();

  // Boot: data, user, themes, saved tabs; then decide on the intro. Shells spawn underneath meanwhile.
  useEffect(() => {
    Promise.all([backend.loadData(), backend.userInfo(), loadThemes()])
      .then(([data, user]) => {
        restoreLayout(data.layout);
        useStore.setState({ data, user });
        const play = selectTheme(useStore.getState()).intro.playOnLaunch;
        useStore.setState({ introKey: play ? Date.now() : null });
        if (!play) setIde('shown');
        refreshMissing().catch(() => {});
      })
      .catch((err) => console.error(err));
  }, []);

  // Replays (theme applied, Preview intro, dev button) restart the IDE reveal too.
  useEffect(() => {
    if (introKey !== null) setIde('hidden');
  }, [introKey]);

  useGlobalShortcuts();
  useActivity();

  return (
    <>
      <Background />
      <div className={`${styles.ide} ${ide === 'shown' ? '' : styles[ide]} ${flash ? 'ide-flash' : ''}`}>
        <TopBar />
        <div className={styles.main}>
          <Sidebar />
          {loaded && <Workspace />}
          {editing && <ThemeEditor />}
        </div>
        <StatusBar />
      </div>
      {loaded && <Dialogs />}
      <ConfirmHost />
      <ContextMenu />
      {loaded && <ProjectSwitcher />}
      <CheatSheet />
      <Toast />
      {!loaded && <div className={styles.blackout} />}
      {loaded && introKey !== null && (
        <Intro
          key={introKey}
          onExitStart={() => {
            setIde('entering');
            setFlash(true);
            setTimeout(() => setFlash(false), 800);
          }}
          onDone={() => {
            useStore.setState({ introKey: null });
            setIde('shown');
            focusPane(currentPane());
          }}
        />
      )}
    </>
  );
}

function useGlobalShortcuts() {
  // Keep the active keymap in sync with saved overrides.
  const overrides = useStore((s) => s.data?.settings.shortcuts);
  useEffect(() => setKeymapOverrides(overrides), [overrides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.introKey !== null || s.recording) return; // intro skips itself; the recorder owns keys
      if (e.key === 'Escape' && (s.promptsOpen || s.themeMenuOpen || s.switcherOpen || s.cheatsheetOpen)) {
        e.preventDefault();
        s.set({ promptsOpen: false, themeMenuOpen: false, switcherOpen: false, cheatsheetOpen: false });
        focusPane(currentPane());
        return;
      }
      const action = matchShortcut(e);
      if (!action) return; // everything else (⌃C, ⌃D, Esc, ⇧↵, arrows, Tab…) reaches the terminal untouched
      // In a text field (not the terminal), only ⌘ shortcuts apply: ⌥/⌃ combos stay with the field.
      const target = e.target as Element | null;
      const inField = !!target?.closest?.('input, textarea, select') && !target.closest('.xterm');
      if (inField && !e.metaKey) return;
      if (s.dialog || s.confirm) return; // dialogs handle their own keys (e.g. ⌘↵ saves a template)
      e.preventDefault();
      e.stopPropagation();
      runAction(action);
    };
    // Capture phase so xterm's textarea doesn't swallow app shortcuts.
    window.addEventListener('keydown', onKey, true);

    const onFocus = () => {
      refreshStatus().catch(() => {});
      refreshMissing().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}

const closeMenus = { promptsOpen: false, themeMenuOpen: false, switcherOpen: false, cheatsheetOpen: false };

export function runAction(action: ActionId) {
  const s = useStore.getState();
  const tab = /^tab(\d)$/.exec(action);
  if (tab) return goTab(Number(tab[1]) - 1);
  switch (action) {
    case 'claude': s.set(closeMenus); return void runOrFocusClaude();
    case 'exitClaude': s.set(closeMenus); return void exitClaudeInPane();
    case 'prompts': {
      const open = !s.promptsOpen;
      s.set({ ...closeMenus, promptsOpen: open });
      if (!open) focusPane(currentPane());
      return;
    }
    case 'projects': {
      const open = !s.switcherOpen;
      s.set({ ...closeMenus, switcherOpen: open });
      if (!open) focusPane(currentPane());
      return;
    }
    case 'cheatsheet': return s.set({ ...closeMenus, cheatsheetOpen: !s.cheatsheetOpen });
    case 'openFolder': s.set(closeMenus); return void (!s.panes[currentPane()]?.switching && openFolder());
    case 'sidebar': return s.set({ sidebarCollapsed: !s.sidebarCollapsed });
    case 'settings': return s.set({ ...closeMenus, dialog: { kind: 'settings' } });
    case 'newTab': return addTab();
    case 'close': return void closePane();
    case 'splitRight': return split('row');
    case 'splitDown': return split('column');
    case 'nextTab': return cycleTab(1);
    case 'prevTab': return cycleTab(-1);
    case 'lastTab': return goTab('last');
    case 'focusLeft': return cyclePane(-1);
    case 'focusRight': return cyclePane(1);
  }
}

/** Window hidden → pause CSS animations; no input for 60 s → `idle` (animated media pauses). */
function useActivity() {
  useEffect(() => {
    const sync = () => {
      if (document.hidden) document.documentElement.setAttribute('data-hidden', '');
      else document.documentElement.removeAttribute('data-hidden');
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const active = () => {
      const now = performance.now();
      if (now - last < 1000) return; // throttle: mousemove fires constantly
      last = now;
      if (useStore.getState().idle) useStore.setState({ idle: false });
      clearTimeout(timer);
      timer = setTimeout(() => useStore.setState({ idle: true }), 60_000);
    };
    active();
    const events = ['keydown', 'mousemove', 'mousedown', 'wheel'] as const;
    events.forEach((ev) => window.addEventListener(ev, active, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, active, { capture: true }));
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
}
