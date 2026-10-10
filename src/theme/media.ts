// Media pipeline. Stills (images, and the first frame of GIFs/videos) are pre-rendered once on a
// canvas with brightness, grayscale (optionally keeping red/orange lights) and blur baked in,
// so at runtime they're a plain <img>: no per-frame filter, no backdrop-filter.
import type { CSSProperties } from 'react';
import { backend } from '../backend';
import type { ThemeMedia } from './types';

export const mediaUrl = (themeId: string, file: string) =>
  file.startsWith('/') ? file : backend.themeFileUrl(themeId, file);

export interface Still {
  url: string;
  cssBlur: number; // > 0 only where canvas filters are unsupported (applied once to a static image)
}

const cache = new Map<string, Promise<Still>>();
const CACHE_MAX = 16;

async function loadSource(url: string, kind: ThemeMedia['kind']): Promise<CanvasImageSource & { width: number; height: number }> {
  if (kind === 'video') {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; // media:// (native app) is cross-origin; CORS keeps the canvas readable
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.src = url;
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve();
      v.onerror = () => reject(new Error('video failed to load'));
    });
    if (v.currentTime === 0 && v.readyState < 2) await new Promise((r) => (v.onseeked = r));
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    v.removeAttribute('src');
    v.load();
    return c;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode(); // for a GIF, drawing it gives the first frame
  return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
}

function process(src: CanvasImageSource & { width: number; height: number }, m: Pick<ThemeMedia, 'brightness' | 'grayscale' | 'keepReds' | 'blur'>): HTMLCanvasElement {
  const maxW = m.blur > 6 ? 1280 : 1920; // blurred stills don't need full resolution
  const scale = Math.min(1, maxW / src.width);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);

  if (m.grayscale > 0 || m.brightness !== 1) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const gray = m.grayscale;
    const bright = m.brightness;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let amt = gray;
      if (m.keepReds && amt > 0) {
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        if (delta > 0 && max > 50) {
          let hue = max === r ? ((g - b) / delta) * 60 : max === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
          if (hue < 0) hue += 360;
          const dist = Math.min(Math.abs(hue - 15), 360 - Math.abs(hue - 15)); // 15° ≈ red-orange
          const wHue = Math.max(0, Math.min(1, 1 - (dist - 25) / 25)); // full to ±25°, gone by ±50°
          const wSat = Math.max(0, Math.min(1, (delta / max - 0.25) / 0.25));
          const wVal = Math.max(0, Math.min(1, (max - 50) / 70)); // lights, not murk
          amt *= 1 - wHue * wSat * wVal;
        }
      }
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      d[i] = (r + (l - r) * amt) * bright;
      d[i + 1] = (g + (l - g) * amt) * bright;
      d[i + 2] = (b + (l - b) * amt) * bright;
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

function blurCanvas(src: HTMLCanvasElement, px: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  if (!('filter' in ctx)) return null;
  const r = px * (src.width / Math.max(1, window.innerWidth)); // slider is in screen px
  ctx.filter = `blur(${r}px)`;
  // Overscan so blurred edges don't fade to transparent.
  ctx.drawImage(src, -r * 2, -r * 2, src.width + r * 4, src.height + r * 4);
  return c;
}

export function renderStill(url: string, m: ThemeMedia): Promise<Still> {
  const key = JSON.stringify([url, m.kind, m.brightness, m.grayscale, m.keepReds, m.blur]);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const src = await loadSource(url, m.kind);
      let canvas = process(src, m);
      let cssBlur = 0;
      if (m.blur > 0) {
        const b = blurCanvas(canvas, m.blur);
        if (b) canvas = b;
        else cssBlur = m.blur;
      }
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.88));
      return { url: URL.createObjectURL(blob), cssBlur };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > CACHE_MAX) {
      const [oldKey, old] = cache.entries().next().value as [string, Promise<Still>];
      cache.delete(oldKey);
      old.then((s) => setTimeout(() => URL.revokeObjectURL(s.url), 5000)).catch(() => {});
    }
  }
  return p;
}

export function objectFit(m: ThemeMedia): CSSProperties {
  switch (m.fit) {
    case 'contain': return { objectFit: 'contain' };
    case 'center': return { objectFit: 'none', objectPosition: 'center' };
    case 'focus': return { objectFit: 'cover', objectPosition: `${m.focusX}% ${m.focusY}%` };
    default: return { objectFit: 'cover' };
  }
}
