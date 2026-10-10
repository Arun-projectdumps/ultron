// Phase 2 backend: Tauri commands in src-tauri/src/lib.rs. Same Backend contract as ws.ts, so the
// UI is unchanged. Each pty streams output over its own Channel.
import { invoke, Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { AppData, Backend, ShellStatus, UploadResult } from './types';
import type { Theme } from '../theme/types';
import { withDefaults } from './defaults';

type PtyEvent = { event: 'data'; data: string } | { event: 'exit'; data: number };

const errText = (e: unknown) => new Error(typeof e === 'string' ? e : (e as Error)?.message ?? String(e));
const call = <T,>(cmd: string, args?: Record<string, unknown>) => invoke<T>(cmd, args).catch((e) => { throw errText(e); });

export function createTauriBackend(): Backend {
  const dataCbs = new Map<string, Set<(chunk: string) => void>>();
  const exitCbs = new Map<string, Set<(code: number) => void>>();
  const emit = <T,>(map: Map<string, Set<(v: T) => void>>, id: string, v: T) => map.get(id)?.forEach((cb) => cb(v));
  const sub = <T,>(map: Map<string, Set<(v: T) => void>>, id: string, cb: (v: T) => void) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id)!.add(cb);
    return () => void map.get(id)?.delete(cb);
  };

  return {
    async spawnShell(id, cols, rows, cwd) {
      const channel = new Channel<PtyEvent>();
      channel.onmessage = (m) => (m.event === 'data' ? emit(dataCbs, id, m.data) : emit(exitCbs, id, m.data));
      await call('pty_spawn', { id, cols, rows, cwd: cwd ?? null, channel });
    },
    write: (id, data) => void call('pty_write', { id, data }).catch(console.error),
    resize: (id, cols, rows) => void call('pty_resize', { id, cols, rows }).catch(console.error),
    kill(id) {
      dataCbs.delete(id);
      exitCbs.delete(id);
      void call('pty_kill', { id }).catch(console.error);
    },
    onData: (id, cb) => sub(dataCbs, id, cb),
    onExit: (id, cb) => sub(exitCbs, id, cb),
    status: (id) => call<ShellStatus>('pty_status', { id }),
    async foregroundProcess(id) {
      return (await call<ShellStatus>('pty_status', { id })).fg;
    },

    async pickFolder() {
      const p = await open({ directory: true, multiple: false, title: 'Open folder' });
      return typeof p === 'string' ? p.replace(/\/$/, '') || '/' : null;
    },
    pathsExist: (paths) => call<boolean[]>('paths_exist', { paths }),
    userInfo: () => call('user_info'),
    async loadData() {
      return withDefaults(await call<AppData | null>('load_data'));
    },
    saveData: (data) => call('save_data', { data }),

    listThemes: () => call<Theme[]>('list_themes'),
    saveTheme: (theme) => call('save_theme', { theme }),
    deleteTheme: (id) => call('delete_theme', { id }),
    async uploadThemeMedia(themeId, slot, file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return invoke<UploadResult>('theme_upload', bytes, {
        headers: { 'x-theme': themeId, 'x-slot': slot, 'x-name': file.name.replace(/[^\x20-\x7e]/g, '_') },
      }).catch((e) => { throw errText(e); });
    },
    // Served by the media:// protocol in lib.rs (Range support for video, CORS for canvas reads).
    themeFileUrl: (themeId, file) => `media://localhost/${themeId}/${encodeURIComponent(file)}`,
    exportTheme: (id) => call<string>('export_theme', { id }),
    importTheme: (json) => call<Theme>('import_theme', { jsonText: json }),
    saveFile: (name, contents) => call<boolean>('save_file_dialog', { name, contents }),
  };
}
