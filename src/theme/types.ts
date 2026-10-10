// A theme is plain JSON (+ media files in ~/.ultron/themes/<id>/), so it's easy to back up and share.

export const TOKEN_NAMES = [
  'bg', 'surface', 'surface-2', 'border', 'border-accent', 'text', 'text-muted', 'text-dim',
  'accent', 'accent-hot', 'accent-glow', 'on-accent', 'metal-1', 'metal-2', 'metal-3',
  'success', 'warning', 'hover-bg', 'active-bg', 'overlay', 'scrim', 'btn-border', 'haze',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];

export const ANSI_NAMES = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const;
export type AnsiName = (typeof ANSI_NAMES)[number];

export interface TerminalColors extends Record<AnsiName, string> {
  foreground: string;
  cursor: string;
  selection: string;
}

export type MediaSlot = 'background' | 'intro' | 'emblem' | 'boot';
export type MediaFit = 'cover' | 'contain' | 'center' | 'focus';

export interface ThemeMedia {
  /** File name in the theme folder, or an absolute app URL for built-in assets ("/theme/…"). */
  file: string;
  kind: 'image' | 'gif' | 'video';
  opacity: number; // 0–1
  brightness: number; // 0–2
  blur: number; // px, pre-rendered into stills
  grayscale: number; // 0–1
  keepReds: boolean; // grayscale everything except red/orange lights (stills)
  fit: MediaFit;
  focusX: number; // 0–100, for fit = focus
  focusY: number;
  animate: boolean; // background only; off = first frame as a still
}

export type IntroStyle = 'chrome' | 'flat' | 'glow' | 'outline';

/** The horizon glow under the intro text. Its color is independent of the accent. */
export interface IntroGlow {
  enabled: boolean;
  color: string;
  intensity: number; // 0–1
  size: number; // spread multiplier, 0.5–2
}

export interface IntroSettings {
  title: string;
  subtitle: string; // empty = macOS username
  font: string; // a FONT_CHOICES family or "custom"
  customFont?: string; // file name of an uploaded .ttf/.otf
  style: IntroStyle;
  duration: number; // seconds, 2–6
  playOnLaunch: boolean;
  rain: boolean;
  emblem: boolean;
  glow: IntroGlow;
}

export interface Theme {
  version: 1;
  id: string;
  name: string;
  builtin?: boolean;
  colors: {
    mode: 'simple' | 'advanced';
    accent: string;
    base: string;
    tokens: Record<TokenName, string>;
    terminal: TerminalColors;
  };
  media: Partial<Record<MediaSlot, ThemeMedia>>;
  intro: IntroSettings;
}

export const FONT_CHOICES = ['Michroma', 'Orbitron', 'Cinzel Decorative', 'Bebas Neue', 'Inter'] as const;

export const defaultMedia = (file: string, kind: ThemeMedia['kind'], patch: Partial<ThemeMedia> = {}): ThemeMedia => ({
  file, kind, opacity: 1, brightness: 1, blur: 0, grayscale: 0, keepReds: false,
  fit: 'cover', focusX: 50, focusY: 50, animate: false, ...patch,
});
