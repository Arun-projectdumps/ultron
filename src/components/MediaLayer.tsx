import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../state/store';
import { mediaUrl, objectFit, renderStill, type Still } from '../theme/media';
import type { ThemeMedia } from '../theme/types';

interface Props {
  themeId: string;
  media: ThemeMedia;
  /** Play GIF/video media. Still pauses while the window is hidden or idle for 60 s. */
  animate: boolean;
  className?: string;
  style?: CSSProperties;
}

/** One theme media layer: a pre-rendered still, or (when animating) the live video/GIF. */
export function MediaLayer({ themeId, media, animate, className, style }: Props) {
  const url = mediaUrl(themeId, media.file);
  const moving = animate && media.kind !== 'image';
  const paused = useStore((s) => s.idle);
  const [still, setStill] = useState<Still | null>(null);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (moving) return;
    let live = true;
    setError(false);
    // Debounced so dragging a slider re-renders the still once it settles, not on every tick.
    const t = setTimeout(() => {
      renderStill(url, media).then((s) => live && setStill(s)).catch(() => live && setError(true));
    }, still ? 90 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [moving, url, media.kind, media.brightness, media.grayscale, media.keepReds, media.blur]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause when hidden or idle; resume on return. (Hidden also pauses CSS animations globally.)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => (paused || document.hidden ? v.pause() : v.play().catch(() => {}));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [paused, moving, url]);

  const base: CSSProperties = { width: '100%', height: '100%', opacity: media.opacity, ...objectFit(media), ...style };

  if (moving) {
    // Live media can't be pre-rendered: filters apply per frame (blur here costs GPU while playing).
    const filter = [
      media.grayscale ? `grayscale(${media.grayscale})` : '',
      media.brightness !== 1 ? `brightness(${media.brightness})` : '',
      media.blur ? `blur(${media.blur}px)` : '',
    ].join(' ').trim();
    const s = { ...base, filter: filter || undefined };
    if (media.kind === 'gif') return paused ? null : <img className={className} src={url} style={s} alt="" draggable={false} />;
    return <video ref={videoRef} className={className} src={url} style={s} muted loop playsInline autoPlay disablePictureInPicture />;
  }

  if (error || !still) return null;
  return (
    <img
      className={className}
      src={still.url}
      style={{ ...base, filter: still.cssBlur ? `blur(${still.cssBlur}px)` : undefined }}
      alt=""
      draggable={false}
    />
  );
}
