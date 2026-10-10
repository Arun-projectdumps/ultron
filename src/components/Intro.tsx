import { useEffect, useState, type CSSProperties } from 'react';
import { useStore, selectTheme } from '../state/store';
import { Emblem } from './Emblem';
import { MediaLayer } from './MediaLayer';
import type { IntroGlow } from '../theme/types';
import styles from './Intro.module.css';
export { styles as introStyles };

// Timeline as fractions of the duration (default 4.2 s): text 0.07 · sweep 0.26 · emblem 0.33 ·
// cut to the IDE at 0.80. Everything is CSS; the rain only exists while the intro is mounted.
const CUT_AT = 0.8;
const CUT_MS = 420;

/** CSS variables for the horizon glow (shared with the editor's live preview). */
export const glowVars = (g: IntroGlow) => ({
  '--glow-color': g.color,
  '--glow-a': String(Math.max(0, Math.min(1, g.intensity))),
  '--glow-size': String(Math.max(0.3, g.size)),
});

interface Props {
  onExitStart(): void;
  onDone(): void;
}

export function Intro({ onExitStart, onDone }: Props) {
  const theme = useStore(selectTheme);
  const username = useStore((s) => s.user.username);
  const [exiting, setExiting] = useState(false);
  const { intro } = theme;
  const d = Math.min(6, Math.max(2, intro.duration));

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), d * 1000 * CUT_AT);
    return () => clearTimeout(t);
  }, [d]);

  useEffect(() => {
    if (!exiting) return;
    onExitStart();
    const t = setTimeout(onDone, CUT_MS);
    return () => clearTimeout(t);
  }, [exiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skippable with any key or click.
  useEffect(() => {
    const skip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      setExiting(true);
    };
    window.addEventListener('keydown', skip, true);
    window.addEventListener('mousedown', skip, true);
    return () => {
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('mousedown', skip, true);
    };
  }, []);

  const title = intro.title || 'WELCOME BACK';
  const subtitle = intro.subtitle || username;
  const media = theme.media.intro;

  return (
    <div
      className={`${styles.intro} ${exiting ? styles.exiting : ''}`}
      style={{ '--d': `${d}s`, ...glowVars(intro.glow) } as CSSProperties}
      data-style={intro.style}
      aria-hidden
    >
      <div className={styles.camera}>
        {media && <MediaLayer themeId={theme.id} media={media} animate className={styles.media} />}
        {intro.glow.enabled && <div className={styles.horizon} />}
        {intro.rain && (
          <div className={styles.rain}>
            <div className={styles.rainFar} />
            <div className={styles.rainNear} />
          </div>
        )}
        <div className={styles.stage}>
          {intro.emblem && (
            <div className={styles.emblem}>
              <Emblem size={420} />
            </div>
          )}
          <div className={styles.lockup}>
            <h1 className={styles.title}>
              <span className={styles.extrude}>{title}</span>
              <span className={styles.face}>{title}</span>
              <span className={styles.bevel}>{title}</span>
              <span className={styles.sweep}>{title}</span>
            </h1>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
