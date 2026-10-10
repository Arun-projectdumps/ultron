// Applies the active theme: CSS variables on <html>, terminal colors, display font.
import { useEffect } from 'react';
import { useStore, selectTheme } from '../state/store';
import { mix, withAlpha } from './color';
import { setTerminalTheme } from '../lib/terminals';
import { mediaUrl } from './media';
import type { Theme } from './types';

export function fontFamilyOf(theme: Theme) {
  if (theme.intro.font === 'custom' && theme.intro.customFont) return `"ThemeFont-${theme.id}", "Michroma", sans-serif`;
  return `"${theme.intro.font}", "Michroma", sans-serif`;
}

const loadedFonts = new Set<string>();
async function loadCustomFont(theme: Theme) {
  if (theme.intro.font !== 'custom' || !theme.intro.customFont) return;
  const key = `${theme.id}/${theme.intro.customFont}`;
  if (loadedFonts.has(key)) return;
  loadedFonts.add(key);
  try {
    const face = new FontFace(`ThemeFont-${theme.id}`, `url("${mediaUrl(theme.id, theme.intro.customFont)}")`);
    document.fonts.add(await face.load());
  } catch (err) {
    console.warn('custom font failed', err);
    loadedFonts.delete(key);
  }
}

export function themeVars(theme: Theme): Record<string, string> {
  const t = theme.colors.tokens;
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) vars[`--${k}`] = v;
  vars['--primary-gradient'] = `linear-gradient(180deg, ${mix(t.accent, '#ffffff', 0.08)}, ${mix(t.accent, '#000000', 0.32)})`;
  vars['--emblem-from'] = t['accent-hot'];
  vars['--emblem-to'] = mix(t.accent, '#000000', 0.72);
  vars['--accent-soft'] = withAlpha(t.accent, 0.14);
  vars['--accent-line'] = withAlpha(t['accent-hot'], 0.85);
  vars['--font-display'] = fontFamilyOf(theme);
  return vars;
}

export function useApplyTheme() {
  const theme = useStore(selectTheme);
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(themeVars(theme))) root.style.setProperty(k, v);
    root.dataset.theme = theme.id;
    setTerminalTheme(theme.colors.terminal);
    loadCustomFont(theme);
  }, [theme]);
}
