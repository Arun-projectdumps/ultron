// Built-in default theme. Edits are saved as an override in ~/.ultron/themes/nocturne/.
import { deriveTerminal, deriveTokens, DEFAULT_ANSI } from './derive';
import { defaultMedia, type Theme } from './types';

const tokens = {
  ...deriveTokens('#c8102e', '#070708'),
  'accent-hot': '#ff2a3d',
  'accent-glow': 'rgba(255, 42, 61, 0.35)',
};

export const NOCTURNE: Theme = {
  version: 1,
  id: 'nocturne',
  name: 'Nocturne',
  builtin: true,
  colors: {
    mode: 'simple',
    accent: '#c8102e',
    base: '#070708',
    tokens,
    terminal: { ...deriveTerminal(tokens), ...DEFAULT_ANSI, foreground: '#e6e6e9', cursor: '#ff2a3d', selection: 'rgba(200, 16, 46, 0.30)' },
  },
  media: {
    background: defaultMedia('/theme/nocturne/background.jpg', 'image', {
      opacity: 0.35, brightness: 0.8, grayscale: 1, keepReds: true,
    }),
  },
  intro: {
    title: 'WELCOME BACK',
    subtitle: '',
    font: 'Michroma',
    style: 'chrome',
    duration: 4.2,
    playOnLaunch: true,
    rain: true,
    emblem: true,
    glow: { enabled: true, color: '#c8102e', intensity: 0.55, size: 1 },
  },
};

export const blankTheme = (id: string, name: string): Theme => ({
  ...structuredClone(NOCTURNE),
  id,
  name,
  builtin: false,
});
