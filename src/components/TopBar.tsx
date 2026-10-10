import { useStore } from '../state/store';
import { tildify } from '../lib/paths';
import { currentPane } from '../lib/shell';
import { hint } from '../lib/shortcuts';
import { Emblem } from './Emblem';
import { PromptMenu } from './PromptMenu';
import { ThemeMenu } from './ThemeMenu';
import { IconChevron, IconPalette, IconReplay, IconSearch } from './Icons';
import styles from './TopBar.module.css';

export function TopBar() {
  const cwd = useStore((s) => s.panes[currentPane()]?.status.cwd);
  const home = useStore((s) => s.user.home);
  const promptsOpen = useStore((s) => s.promptsOpen);
  const themeOpen = useStore((s) => s.themeMenuOpen);
  const set = useStore((s) => s.set);

  return (
    <header className={styles.bar} data-tauri-drag-region>
      <div className={styles.brand} data-tauri-drag-region>
        <Emblem size={18} glow />
        <span className={`chrome-text ${styles.wordmark}`} aria-label="Ultron">
          <span className="ex">Ultron</span>
          <span className="face">Ultron</span>
        </span>
      </div>
      <div className={styles.path} title={cwd ?? ''} data-tauri-drag-region>
        <span dir="ltr" data-tauri-drag-region>{cwd ? tildify(cwd, home) : ''}</span>
      </div>
      <div className={styles.right}>
        {import.meta.env.DEV && (
          <button className="btn btn-ghost" onClick={() => set({ introKey: Date.now() })} title="Replay intro (dev)">
            <IconReplay /> Replay intro
          </button>
        )}
        <div className={styles.anchor}>
          <button
            className={`btn ${themeOpen ? styles.active : ''}`}
            onClick={() => set({ themeMenuOpen: !themeOpen, promptsOpen: false })}
            aria-expanded={themeOpen}
          >
            <IconPalette /> Theme
          </button>
          {themeOpen && <ThemeMenu />}
        </div>
        <div className={styles.anchor}>
          <button
            className={`btn ${promptsOpen ? styles.active : ''}`}
            onClick={() => set({ promptsOpen: !promptsOpen, themeMenuOpen: false })}
            aria-expanded={promptsOpen}
            aria-haspopup="dialog"
          >
            <IconSearch /> Prompts <span className="kbd">{hint('prompts')}</span> <IconChevron />
          </button>
          {promptsOpen && <PromptMenu />}
        </div>
      </div>
    </header>
  );
}
