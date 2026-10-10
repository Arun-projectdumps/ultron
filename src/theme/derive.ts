// Simple mode: everything derives from Accent + Base, with text contrast ≥ 4.5:1.
import { contrast, ensureContrast, fromHsl, mix, toHsl, withAlpha } from './color';
import type { TerminalColors, TokenName } from './types';

export const DEFAULT_ANSI: Omit<TerminalColors, 'foreground' | 'cursor' | 'selection'> = {
  black: '#1a1a1e', red: '#e0303f', green: '#7fb38a', yellow: '#d9b26a',
  blue: '#7a8ca8', magenta: '#b07a9e', cyan: '#7aa7a8', white: '#c9c9cf',
  brightBlack: '#55555c', brightRed: '#ff4d5a', brightGreen: '#9fd4a9',
  brightYellow: '#f0cf8a', brightBlue: '#9db0cc', brightMagenta: '#d39cc1',
  brightCyan: '#9ccbcc', brightWhite: '#f4f4f6',
};

export function deriveTokens(accent: string, base: string): Record<TokenName, string> {
  const { h, s } = toHsl(accent);
  const bg = base;
  const panel = mix(bg, '#ffffff', 0.035);
  const hot = fromHsl(h, Math.min(1, s * 1.05), Math.min(0.62, toHsl(accent).l + 0.14));
  const text = ensureContrast(mix('#e8e8ec', bg, 0.04), panel, 7);
  return {
    bg,
    surface: withAlpha(panel, 0.66),
    'surface-2': withAlpha(mix(bg, '#ffffff', 0.07), 0.94),
    border: 'rgba(255, 255, 255, 0.07)',
    'border-accent': withAlpha(accent, 0.42),
    text,
    'text-muted': ensureContrast('#8b8b94', panel, 4.5),
    'text-dim': ensureContrast('#55555c', panel, 2.6),
    accent,
    'accent-hot': hot,
    'accent-glow': withAlpha(hot, 0.38),
    'on-accent': contrast('#ffffff', accent) >= 3.2 ? '#ffffff' : '#0b0b0d',
    'metal-1': '#f4f4f6',
    'metal-2': '#9a9ba3',
    'metal-3': '#3c3d43',
    success: '#4ade80',
    warning: '#f5a524',
    'hover-bg': 'rgba(255, 255, 255, 0.04)',
    'active-bg': withAlpha(mix(accent, '#ffffff', 0.5), 0.07),
    overlay: withAlpha(bg, 0.6),
    scrim: withAlpha(mix(bg, '#000000', 0.5), 0.62),
    'btn-border': 'rgba(170, 172, 182, 0.22)',
    haze: withAlpha(accent, 0.16),
  };
}

export function deriveTerminal(tokens: Record<TokenName, string>): TerminalColors {
  return {
    ...DEFAULT_ANSI,
    black: mix(tokens.bg, '#ffffff', 0.08),
    foreground: tokens.text,
    cursor: tokens['accent-hot'],
    selection: withAlpha(tokens.accent, 0.3),
  };
}

/** Bright, saturated colors from an image, most common first: candidates for an accent. */
export async function extractPalette(url: string, count = 6): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = Math.max(1, Math.round((96 * img.naturalHeight) / img.naturalWidth));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  // Bucket by hue (24 buckets); weight by saturation × brightness so lights beat murk.
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const hex = `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const { h, s, l } = toHsl(hex);
    if (s < 0.3 || l < 0.18 || l > 0.85) continue;
    const key = Math.floor(h / 15);
    const w = s * l;
    const b = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    b.w += w; b.r += data[i] * w; b.g += data[i + 1] * w; b.b += data[i + 2] * w;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.w - a.w)
    .slice(0, count)
    .map((b) => {
      const avg = `#${[b.r, b.g, b.b].map((v) => Math.round(v / b.w).toString(16).padStart(2, '0')).join('')}`;
      const { h, s } = toHsl(avg);
      return fromHsl(h, Math.max(0.6, s), 0.5); // normalize to a usable accent
    });
}

export const PRESETS = [
  { name: 'Crimson', accent: '#c8102e', base: '#070708' },
  { name: 'Gold', accent: '#d4a017', base: '#08070a' },
  { name: 'Toxic', accent: '#62e021', base: '#060807' },
  { name: 'Ice', accent: '#3fb7f0', base: '#06080b' },
  { name: 'Violet', accent: '#8b5cf6', base: '#08070c' },
];

export const isValidColor = (c: string) =>
  /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim()) || /^rgba?\([\d\s.,/]+\)$/i.test(c.trim());
