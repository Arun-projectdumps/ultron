import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { applyTheme, createTheme, deleteTheme, exportTheme, importTheme, openEditor } from '../theme/themes';
import { ThemeThumb } from './ThemeThumb';
import { IconCheck, IconCopy, IconDownload, IconEdit, IconPlus, IconRestart, IconTrash, IconUpload } from './Icons';
import styles from './ThemeMenu.module.css';

/** Theme manager popover. Selecting a theme applies it and replays the intro. */
export function ThemeMenu() {
  const themes = useStore((s) => s.themes);
  const active = useStore((s) => s.data?.settings.themeId ?? 'nocturne');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node) && !(e.target as Element).closest?.('[role=alertdialog]')) {
        useStore.setState({ themeMenuOpen: false });
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={ref} className={styles.menu} role="dialog" aria-label="Themes">
      <div className={styles.header}>
        <span className="section-label">Themes</span>
        <span className={styles.count}>{themes.length}</span>
      </div>
      <div className={styles.list}>
        {themes.map((t) => (
          <div key={t.id} className={`${styles.card} ${t.id === active ? styles.current : ''}`}>
            <button className={styles.pick} onClick={() => applyTheme(t.id)} title={`Apply ${t.name} (replays the intro)`}>
              <ThemeThumb theme={t} />
              <span className={styles.meta}>
                <span className={styles.name}>{t.name}</span>
                {t.builtin && <span className={styles.tag}>Built-in</span>}
                {t.id === active && (
                  <span className={styles.activeTag}>
                    <IconCheck size={12} /> Active
                  </span>
                )}
              </span>
            </button>
            <div className={styles.actions}>
              <button className="icon-btn" title="Edit" onClick={() => openEditor(t)}><IconEdit size={13} /></button>
              <button className="icon-btn" title="Duplicate" onClick={() => createTheme(t).then(openEditor)}><IconCopy size={13} /></button>
              <button className="icon-btn" title="Export (.json)" onClick={() => exportTheme(t)}><IconDownload size={13} /></button>
              {t.builtin ? (
                <button className="icon-btn" title="Reset to default" onClick={() => deleteTheme(t)}><IconRestart size={13} /></button>
              ) : (
                <button className="icon-btn danger" title="Delete" onClick={() => deleteTheme(t)}><IconTrash size={13} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <button className="btn" onClick={() => createTheme().then(openEditor)}><IconPlus /> New theme</button>
        <button className="btn btn-ghost" onClick={importTheme}><IconUpload /> Import</button>
      </div>
    </div>
  );
}
