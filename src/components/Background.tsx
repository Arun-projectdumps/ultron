import { useStore, selectTheme } from '../state/store';
import { MediaLayer } from './MediaLayer';
import styles from './Background.module.css';

/** Wallpaper (pre-rendered still, or live video when "Animate background" is on) + vignette + haze. */
export function Background() {
  const theme = useStore(selectTheme);
  const bg = theme.media.background;
  return (
    <div className={styles.root} aria-hidden>
      {bg && <MediaLayer key={theme.id + bg.file} themeId={theme.id} media={bg} animate={bg.animate} className={styles.media} />}
      <div className={styles.vignette} />
      <div className={styles.haze} />
    </div>
  );
}
