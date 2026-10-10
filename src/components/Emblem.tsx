import { useId } from 'react';
import { useStore, selectTheme } from '../state/store';
import { mediaUrl } from '../theme/media';
import styles from './Emblem.module.css';

// Original crest: a thin crescent moon pierced vertically by a narrow blade.
export const CRESCENT = 'M43.16 19.72 A33 33 0 1 0 79.37 67.06 A30 30 0 1 1 43.16 19.72 Z';
export const BLADE = 'M50 2 L52.4 12 L52.4 82 L47.6 82 L47.6 12 Z';
export const GUARD = 'M38.5 82.5 H61.5 L59.5 86 H40.5 Z';
export const GRIP = 'M48.7 86 H51.3 V94 H48.7 Z';
export const POMMEL = 'M50 94 L52.6 96.8 L50 99.6 L47.4 96.8 Z';
const PARTS = [CRESCENT, BLADE, GUARD, GRIP, POMMEL];

interface Props {
  size: number;
  glow?: boolean;
  /** Draw as an animated outline (boot overlay). */
  trace?: boolean;
  className?: string;
}

export function Emblem({ size, glow, trace, className = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const theme = useStore(selectTheme);
  const custom = theme.media.emblem;
  const cls = `${styles.emblem} ${glow ? styles.glow : ''} ${className}`;

  if (custom) {
    return (
      <img
        src={mediaUrl(theme.id, custom.file)}
        width={size}
        height={size}
        alt=""
        style={{ opacity: custom.opacity, objectFit: 'contain' }}
        className={`${cls} ${trace ? styles.pulse : ''}`}
        draggable={false}
      />
    );
  }

  if (trace) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={`${cls} ${styles.trace}`} aria-hidden>
        {PARTS.map((d, i) => (
          <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * -0.12}s` }} />
        ))}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cls} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="var(--emblem-from)" />
          <stop offset="0.55" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--emblem-to)" />
        </linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--metal-1)" />
          <stop offset="0.5" stopColor="var(--emblem-from)" />
          <stop offset="1" stopColor="var(--emblem-to)" />
        </linearGradient>
      </defs>
      <path d={CRESCENT} fill={`url(#g${id})`} />
      {/* The blade gets a background-colored edge so it reads as passing through the moon. */}
      <g fill={`url(#b${id})`} stroke="var(--bg)" strokeWidth={size < 24 ? 0 : 1.4} paintOrder="stroke">
        <path d={BLADE} />
        <path d={GUARD} />
        <path d={GRIP} />
        <path d={POMMEL} />
      </g>
    </svg>
  );
}
