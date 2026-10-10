import { useStore, selectTheme } from '../state/store';
import { Emblem } from './Emblem';
import { MediaLayer } from './MediaLayer';
import styles from './BootOverlay.module.css';

/** Shown in a pane while Claude Code boots. Never blocks keystrokes (pointer-events: none). */
export function BootOverlay({ paneId }: { paneId: string }) {
  const booting = useStore((s) => s.panes[paneId]?.booting);
  const theme = useStore(selectTheme);
  if (!booting) return null;
  const boot = theme.media.boot;
  return (
    <div className={styles.overlay} aria-live="polite">
      {boot ? (
        <div className={styles.media}>
          <MediaLayer themeId={theme.id} media={{ ...boot, fit: 'contain' }} animate />
        </div>
      ) : (
        <Emblem size={84} trace />
      )}
      <div className={styles.label}>Summoning Claude…</div>
    </div>
  );
}
