import type { Theme, MediaSlot } from '../theme/types';

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened?: number;
}

export interface Template {
  id: string;
  title: string;
  category: string;
  body: string;
}

export interface Settings {
  claudeCommand: string; // default "claude"; allows e.g. "claude --continue"
  themeId: string; // active theme
  shortcuts?: Record<string, string[]>; // keymap overrides (action id → combos); missing = default
}

/** Saved terminal layout: tabs, nested splits, and each pane's folder. Shells restart fresh. */
export type PaneNode =
  | { type: 'pane'; id: string; cwd?: string }
  | { type: 'split'; id: string; dir: 'row' | 'column'; ratio: number; a: PaneNode; b: PaneNode };

export interface Tab {
  id: string;
  title?: string; // user rename; otherwise derived from the folder
  root: PaneNode;
  activePane: string;
}

export interface Layout {
  tabs: Tab[];
  activeTab: string;
}

export interface AppData {
  version: 1;
  projects: Project[];
  templates: Template[];
  settings: Settings;
  layout?: Layout;
}

export interface ShellStatus {
  fg: string; // foreground process, e.g. "zsh" or "claude"
  cwd: string | null; // shell's working directory
  shell: string; // shell name, e.g. "zsh"
}

export interface UploadResult {
  file: string;
  kind: 'image' | 'gif' | 'video' | 'font';
  converted: boolean; // GIF converted to MP4
}

/** Every pty call takes a session id: one session per terminal pane. */
export interface Backend {
  spawnShell(id: string, cols: number, rows: number, cwd?: string): Promise<void>; // also restarts
  write(id: string, data: string): void; // raw keystrokes / text into the pty
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(id: string, cb: (chunk: string) => void): () => void;
  onExit(id: string, cb: (code: number) => void): () => void;
  foregroundProcess(id: string): Promise<string>; // e.g. "zsh" or "claude"
  status(id: string): Promise<ShellStatus>; // foreground process + cwd in one round trip

  pickFolder(): Promise<string | null>;
  pathsExist(paths: string[]): Promise<boolean[]>;
  userInfo(): Promise<{ username: string; home: string; ffmpeg: boolean }>;
  loadData(): Promise<AppData>;
  saveData(data: AppData): Promise<void>;

  listThemes(): Promise<Theme[]>;
  saveTheme(theme: Theme): Promise<void>;
  deleteTheme(id: string): Promise<void>;
  uploadThemeMedia(themeId: string, slot: MediaSlot | 'font', file: File): Promise<UploadResult>;
  themeFileUrl(themeId: string, file: string): string; // URL the webview can load
  exportTheme(id: string): Promise<string>; // JSON text with media embedded
  importTheme(json: string): Promise<Theme>;
  saveFile(name: string, contents: string): Promise<boolean>; // download (browser) / save panel (native)
}
