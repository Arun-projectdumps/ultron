import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../state/store';
import styles from './Dialog.module.css';

interface Props {
  title: string;
  onClose(): void;
  onSubmit?(): void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: ReactNode;
  footerLeft?: ReactNode;
  wide?: boolean;
}

export function Dialog({ title, onClose, onSubmit, submitLabel = 'Save', submitDisabled, children, footerLeft, wide }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  // Take focus so keys don't reach the terminal behind the modal (autoFocus'd fields keep theirs).
  useEffect(() => {
    if (!formRef.current?.contains(document.activeElement)) formRef.current?.focus();
  }, []);

  // Capture phase: the terminal would otherwise swallow Esc. The shortcut recorder owns Esc while recording.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useStore.getState().recording) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!submitDisabled) onSubmit?.();
  };

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={formRef} tabIndex={-1} className={`${styles.dialog} ${wide ? styles.wide : ''}`} onSubmit={submit} role="dialog" aria-modal aria-label={title}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          {footerLeft}
          <span className={styles.spacer} />
          <button type="button" className="btn" onClick={onClose}>
            {onSubmit ? 'Cancel' : 'Close'}
          </button>
          {onSubmit && (
            <button type="submit" className="btn btn-primary" disabled={submitDisabled}>
              {submitLabel}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
