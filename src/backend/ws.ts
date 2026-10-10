// Phase 1 backend: talks to server/index.ts over one WebSocket (all ptys multiplexed) + HTTP.
import type { AppData, Backend, ShellStatus, UploadResult } from './types';
import type { Theme } from '../theme/types';
import { withDefaults } from './defaults';

type ServerMsg =
  | { t: 'out'; id: string; d: string }
  | { t: 'exit'; id: string; code: number }
  | ({ t: 'status'; id: string; req: number } & ShellStatus);

const token = document.querySelector<HTMLMetaElement>('meta[name="ultron-token"]')?.content ?? '';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'x-ultron-token': token, 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export function createWsBackend(): Backend {
  const dataCbs = new Map<string, Set<(chunk: string) => void>>();
  const exitCbs = new Map<string, Set<(code: number) => void>>();
  const pending = new Map<number, (s: ShellStatus) => void>();
  const sessions = new Map<string, { cols: number; rows: number; cwd?: string }>(); // for reconnects
  let ws: WebSocket | null = null;
  let queue: string[] = [];
  let nextReq = 1;
  let wasConnected = false;

  const send = (msg: object) => {
    const s = JSON.stringify(msg);
    if (ws?.readyState === WebSocket.OPEN) ws.send(s);
    else queue.push(s);
  };
  const emit = <T,>(map: Map<string, Set<(v: T) => void>>, id: string, v: T) => map.get(id)?.forEach((cb) => cb(v));
  const sub = <T,>(map: Map<string, Set<(v: T) => void>>, id: string, cb: (v: T) => void) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id)!.add(cb);
    return () => void map.get(id)?.delete(cb);
  };

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws = sock;
    sock.onopen = () => {
      if (wasConnected) {
        // Server restarted (e.g. tsx watch): every pane gets a fresh shell.
        queue = [...sessions].map(([id, s]) => JSON.stringify({ t: 'spawn', id, ...s }));
        sessions.forEach((_, id) => emit(dataCbs, id, '\r\n\x1b[2m[ultron: reconnected, new shell]\x1b[0m\r\n'));
      }
      wasConnected = true;
      for (const m of queue) sock.send(m);
      queue = [];
    };
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMsg;
      if (msg.t === 'out') emit(dataCbs, msg.id, msg.d);
      else if (msg.t === 'exit') emit(exitCbs, msg.id, msg.code);
      else if (msg.t === 'status') {
        pending.get(msg.req)?.({ fg: msg.fg, cwd: msg.cwd, shell: msg.shell });
        pending.delete(msg.req);
      }
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      pending.forEach((resolve) => resolve({ fg: 'zsh', cwd: null, shell: 'zsh' }));
      pending.clear();
      setTimeout(connect, 1000);
    };
  };
  connect();

  const status = (id: string) =>
    new Promise<ShellStatus>((resolve) => {
      const req = nextReq++;
      pending.set(req, resolve);
      send({ t: 'status', id, req });
    });

  return {
    async spawnShell(id, cols, rows, cwd) {
      sessions.set(id, { cols, rows, cwd });
      send({ t: 'spawn', id, cols, rows, cwd });
    },
    write: (id, d) => send({ t: 'in', id, d }),
    resize(id, cols, rows) {
      const s = sessions.get(id);
      if (s) Object.assign(s, { cols, rows });
      send({ t: 'resize', id, cols, rows });
    },
    kill(id) {
      sessions.delete(id);
      dataCbs.delete(id);
      exitCbs.delete(id);
      send({ t: 'kill', id });
    },
    onData: (id, cb) => sub(dataCbs, id, cb),
    onExit: (id, cb) => sub(exitCbs, id, cb),
    status,
    async foregroundProcess(id) {
      return (await status(id)).fg;
    },
    async pickFolder() {
      return (await api<{ path: string | null }>('/api/pick-folder')).path;
    },
    pathsExist: (paths) => api<boolean[]>('/api/paths-exist', { method: 'POST', body: JSON.stringify(paths) }),
    userInfo: () => api('/api/user'),
    async loadData() {
      return withDefaults(await api<AppData | null>('/api/data'));
    },
    async saveData(data) {
      await api('/api/data', { method: 'PUT', body: JSON.stringify(data, null, 2) });
    },

    listThemes: () => api<Theme[]>('/api/themes'),
    async saveTheme(theme) {
      await api(`/api/themes/${theme.id}`, { method: 'PUT', body: JSON.stringify(theme, null, 2) });
    },
    async deleteTheme(id) {
      await api(`/api/themes/${id}`, { method: 'DELETE' });
    },
    uploadThemeMedia: (themeId, slot, file) =>
      api<UploadResult>(`/api/themes/${themeId}/media?slot=${slot}&name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    themeFileUrl: (themeId, file) => `/api/themes/${themeId}/file/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`,
    async exportTheme(id) {
      return JSON.stringify(await api(`/api/themes/${id}/export`));
    },
    importTheme: (json) => api<Theme>('/api/themes/import', { method: 'POST', body: json }),
    async saveFile(name, contents) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return true;
    },
  };
}
