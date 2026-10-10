import { useStore } from '../state/store';
import { Dialog } from './Dialog';
import styles from './Overlays.module.css';

/** App-wide confirm dialog (closing panes with Claude running, deleting themes…). */
export function ConfirmHost() {
  const c = useStore((s) => s.confirm);
  if (!c) return null;
  return (
    <div role="alertdialog">
      <Dialog title={c.title} onClose={() => c.resolve(false)} onSubmit={() => c.resolve(true)} submitLabel={c.confirmLabel}>
        <p className={styles.message}>{c.message}</p>
      </Dialog>
    </div>
  );
}

export function Toast() {
  const t = useStore((s) => s.toast);
  if (!t) return null;
  return <div className={styles.toast} role="status">{t}</div>;
}
