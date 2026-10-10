import type { Backend } from './types';
import { createWsBackend } from './ws';
import { createTauriBackend } from './tauri';

declare global {
  interface Window {
    __ultronBackend?: Backend;
  }
}

export const IS_TAURI = '__TAURI_INTERNALS__' in window;

// Kept on window so Vite HMR doesn't open a second set of shells.
export const backend: Backend =
  window.__ultronBackend ?? (window.__ultronBackend = IS_TAURI ? createTauriBackend() : createWsBackend());

export type * from './types';
