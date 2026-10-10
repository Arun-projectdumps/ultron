import { useStore } from '../state/store';
import { tildify } from '../lib/paths';
import { currentPane, restartShell } from '../lib/shell';
import { IconPower } from './Icons';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const pane = useStore((s) => s.panes[currentPane()]);
  const tabCount = useStore((s) => s.layout.tabs.length);
  const running = !!pane?.claudeRunning;
  const switching = !!pane?.switching;
  const { cwd, shell, fg } = pane?.status ?? { cwd: null, shell: 'zsh', fg: 'zsh' };
  const home = useStore((s) => s.user.home);

  const state = switching ? 'switching…' : running ? 'claude running' : fg && fg !== shell ? `${fg} running` : 'idle';

  return (
    <footer className={styles.bar}>
      {/* key restarts the 3× pulse whenever Claude starts */}
      <span key={String(running)} className={`${styles.dot} ${running ? styles.running : ''}`} />
      <span className={running ? styles.stateOn : ''}>{state}</span>
      {cwd && (
        <>
          <span className={styles.sep}>·</span>
          <span className={styles.path}>{tildify(cwd, home)}</span>
        </>
      )}
      <span className={styles.sep}>·</span>
      <span>{shell}</span>
      {tabCount > 1 && (
        <>
          <span className={styles.sep}>·</span>
          <span>{tabCount} tabs</span>
        </>
      )}
      <button className={styles.power} onClick={() => restartShell()} title="Restart shell (active pane)">
        <IconPower size={12} />
      </button>
    </footer>
  );
}
