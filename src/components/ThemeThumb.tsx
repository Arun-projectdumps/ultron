import { useMemo, type CSSProperties } from 'react';
import { themeVars } from '../theme/apply';
import type { Theme } from '../theme/types';
import { MediaLayer } from './MediaLayer';
import styles from './ThemeThumb.module.css';

/** A tiny live mock of the app in a theme's colors and background (no screenshots needed). */
export function ThemeThumb({ theme }: { theme: Theme }) {
  const vars = useMemo(() => themeVars(theme) as CSSProperties, [theme]);
  const bg = theme.media.background;
  return (
    <div className={styles.thumb} style={vars} aria-hidden>
      {bg && <MediaLayer themeId={theme.id} media={{ ...bg, animate: false }} animate={false} className={styles.bg} />}
      <div className={styles.vignette} />
      <div className={styles.top}><span className={styles.dot} /><span className={styles.word} /></div>
      <div className={styles.side}>
        <span className={styles.primary} />
        <span className={styles.line} />
        <span className={styles.line} />
      </div>
      <div className={styles.panel}>
        <span className={styles.edge} />
        <span className={styles.t1} />
        <span className={styles.t2} />
        <span className={styles.cursor} />
      </div>
    </div>
  );
}
