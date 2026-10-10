import { useStore } from '../state/store';
import { ACTIONS, formatCombo, getKeymap, hint } from '../lib/shortcuts';
import { IS_TAURI } from '../backend';
import styles from './Palette.module.css';

const TERMINAL_KEYS: [string, string][] = [
  ['⇧↵', 'Newline in Claude without sending'],
  ['⌃C / ⌃D', 'Interrupt / end of input (always reach the terminal)'],
  ['Esc, ↑↓←→, ⇥', 'Always reach the terminal and Claude'],
];

/** ⌘/: every action and its current shortcut. */
export function CheatSheet() {
  const open = useStore((s) => s.cheatsheetOpen);
  useStore((s) => s.data?.settings.shortcuts); // re-render on edits
  if (!open) return null;
  const keymap = getKeymap();
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  const close = () => useStore.setState({ cheatsheetOpen: false });

  return (
    <div className={styles.scrim} onMouseDown={close}>
      <div className={`${styles.palette} ${styles.sheet}`} role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.sheetHead}>
          <span className="section-label">Keyboard shortcuts</span>
          <span className={styles.sub}>{IS_TAURI ? 'Native app' : 'Browser (localhost): tab keys use ⌥'} · {hint('cheatsheet')} to close</span>
        </div>
        <div className={styles.sheetGrid}>
          {groups.map((g) => (
            <section key={g}>
              <h3 className={styles.sheetGroup}>{g}</h3>
              {ACTIONS.filter((a) => a.group === g && !/^tab[2-8]$/.test(a.id)).map((a) => (
                <div key={a.id} className={styles.sheetRow}>
                  <span>{a.id === 'tab1' ? 'Go to tab 1–8' : a.label}</span>
                  <span className={styles.keys}>
                    {a.id === 'tab1'
                      ? <kbd>{formatCombo(keymap.tab1[0] ?? '')}…{formatCombo(keymap.tab8[0] ?? '').slice(-1)}</kbd>
                      : keymap[a.id].length ? keymap[a.id].map((c) => <kbd key={c}>{formatCombo(c)}</kbd>) : <em>none</em>}
                  </span>
                </div>
              ))}
            </section>
          ))}
          <section>
            <h3 className={styles.sheetGroup}>Terminal</h3>
            {TERMINAL_KEYS.map(([k, l]) => (
              <div key={k} className={styles.sheetRow}><span>{l}</span><span className={styles.keys}><kbd>{k}</kbd></span></div>
            ))}
          </section>
        </div>
        <div className={styles.foot}>Change these in Settings → Shortcuts.</div>
      </div>
    </div>
  );
}
