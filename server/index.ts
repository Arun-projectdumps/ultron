// Ultron Phase 1 backend: many ptys multiplexed over one WebSocket, plus small JSON endpoints.
// Binds to 127.0.0.1 only and requires a per-checkout random token, since it can run shell commands.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer, type WebSocket } from 'ws';
import pty from 'node-pty';

const run = promisify(execFile);
const PORT = 7777;
const HOST = '127.0.0.1';
const HOME = os.homedir();
const DATA_DIR = path.join(HOME, '.ultron');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const THEMES_DIR = path.join(DATA_DIR, 'themes');
const TOKEN_FILE = path.join(process.cwd(), '.ultron-token');
const MAX_PTYS = 12;
const MAX_UPLOAD = 200 * 1024 * 1024;

// Random per checkout; reused across `tsx watch` restarts so an open page keeps working.
// Delete .ultron-token to rotate it.
const TOKEN = await fs.readFile(TOKEN_FILE, 'utf8').then((t) => t.trim()).catch(() => '')
  || crypto.randomBytes(24).toString('hex');
await fs.writeFile(TOKEN_FILE, TOKEN, { mode: 0o600 });

// Finder-launched apps lack Homebrew's PATH, so look in the usual places too.
const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find(existsSync) ?? null;

// ---------- helpers ----------

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 300 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function authorized(url: URL, req: http.IncomingMessage): boolean {
  const t = url.searchParams.get('token') ?? req.headers['x-ultron-token'];
  if (typeof t !== 'string' || t.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

async function osascript(script: string): Promise<string | null> {
  try {
    const { stdout } = await run('osascript', ['-e', script]);
    return stdout.trim() || null;
  } catch {
    return null; // user cancelled (error -128) or no GUI session
  }
}

async function writeAtomic(file: string, contents: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, file);
}

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const VIDEO = new Set(['.mp4', '.webm']);

// Which file types each theme slot accepts.
const SLOT_TYPES: Record<string, string[]> = {
  background: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'],
  intro: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm'],
  emblem: ['.svg', '.png'],
  boot: ['.gif', '.mp4', '.webm'],
  font: ['.ttf', '.otf'],
};

const validId = (id: string) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
const validName = (n: string) => /^[a-z]+-[0-9a-z]+\.[a-z0-9]{2,5}$/.test(n);
const themeDir = (id: string) => path.join(THEMES_DIR, id);

/** GIF → H.264 MP4: far cheaper to play than an animated GIF. Returns null if ffmpeg can't. */
async function gifToMp4(src: string): Promise<string | null> {
  if (!FFMPEG) return null;
  const out = src.replace(/\.gif$/, '.mp4');
  try {
    await run(FFMPEG, [
      '-y', '-loglevel', 'error', '-i', src, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-an', out,
    ], { timeout: 120_000 });
    return out;
  } catch {
    await fs.rm(out, { force: true });
    return null;
  }
}

/** Serves a file with HTTP Range support (WebKit needs it for <video>). */
async function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type || !existsSync(file)) return json(res, 404, { error: 'not found' });
  const size = statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return pipeline(createReadStream(file, { start, end }), res).catch(() => {});
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  return pipeline(createReadStream(file), res).catch(() => {});
}

async function listThemes() {
  const out: unknown[] = [];
  const ids = await fs.readdir(THEMES_DIR).catch(() => [] as string[]);
  for (const id of ids) {
    if (!validId(id)) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(themeDir(id), 'theme.json'), 'utf8')));
    } catch { /* not a theme */ }
  }
  return out;
}

/** Deletes media in a theme folder that theme.json no longer references (e.g. replaced uploads). */
async function pruneMedia(id: string, themeJson: string) {
  for (const f of await fs.readdir(themeDir(id)).catch(() => [] as string[])) {
    if (f === 'theme.json' || themeJson.includes(f)) continue;
    // Keep very recent uploads: an unsaved editor draft may still point at them.
    const st = await fs.stat(path.join(themeDir(id), f)).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 24 * 3600_000) await fs.rm(path.join(themeDir(id), f), { force: true });
  }
}

// ---------- process inspection ----------

/** Foreground process of the pty, asked of the OS (not guessed from output). */
async function foreground(shellPid: number, shellName: string): Promise<string> {
  try {
    const { stdout } = await run('ps', ['-o', 'tpgid=', '-p', String(shellPid)]);
    const tpgid = Number(stdout.trim());
    if (!tpgid || tpgid === shellPid) return shellName;
    const { stdout: info } = await run('ps', ['-o', 'comm=,args=', '-p', String(tpgid)]);
    const line = info.trim();
    if (!line) return shellName;
    // Native installs run as `claude`; npm installs run as `node …/claude`.
    if (/(^|[\s/])claude(\s|$)/.test(line)) return 'claude';
    return path.basename(line.split(/\s+/)[0]);
  } catch {
    return shellName;
  }
}

async function cwdOf(pid: number): Promise<string | null> {
  try {
    const { stdout } = await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

// ---------- HTTP ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  if (!authorized(url, req)) return json(res, 401, { error: 'unauthorized' });
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  try {
    if (req.method === 'GET' && url.pathname === '/api/pick-folder') {
      const p = await osascript('POSIX path of (choose folder with prompt "Open folder")');
      return json(res, 200, { path: p ? p.replace(/\/$/, '') || '/' : null });
    }

    if (req.method === 'GET' && url.pathname === '/api/data') {
      try {
        return json(res, 200, JSON.parse(await fs.readFile(DATA_FILE, 'utf8')));
      } catch {
        return json(res, 200, null); // client seeds defaults
      }
    }

    if (req.method === 'PUT' && url.pathname === '/api/data') {
      const body = await readBody(req);
      JSON.parse(body); // validate before touching the file
      await writeAtomic(DATA_FILE, body);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/paths-exist') {
      const paths: string[] = JSON.parse(await readBody(req));
      return json(res, 200, paths.map((p) => existsSync(p)));
    }

    if (req.method === 'GET' && url.pathname === '/api/user') {
      return json(res, 200, { username: os.userInfo().username, home: HOME, ffmpeg: !!FFMPEG });
    }

    // ----- themes -----
    if (parts[1] === 'themes') {
      if (req.method === 'GET' && parts.length === 2) return json(res, 200, await listThemes());

      if (req.method === 'POST' && parts[2] === 'import' && parts.length === 3) {
        const pkg = JSON.parse(await readBody(req));
        const theme = pkg?.theme;
        // Theme files from before the rename (nocturneTheme) still import.
        if ((pkg?.ultronTheme ?? pkg?.nocturneTheme) !== 1 || !theme || typeof theme !== 'object') return json(res, 400, { error: 'not an Ultron theme file' });
        const slug = String(theme.name ?? 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'theme';
        const id = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
        await fs.mkdir(themeDir(id), { recursive: true });
        for (const [name, b64] of Object.entries(pkg.files ?? {})) {
          if (!validName(name) || !MIME[path.extname(name)]) continue;
          await fs.writeFile(path.join(themeDir(id), name), Buffer.from(String(b64), 'base64'));
        }
        const saved = { ...theme, id, builtin: false };
        await writeAtomic(path.join(themeDir(id), 'theme.json'), JSON.stringify(saved, null, 2));
        return json(res, 200, saved);
      }

      const id = parts[2] ?? '';
      if (!validId(id)) return json(res, 400, { error: 'bad theme id' });

      if (req.method === 'PUT' && parts.length === 3) {
        const body = await readBody(req, 5 * 1024 * 1024);
        const theme = JSON.parse(body);
        if (theme.id !== id) return json(res, 400, { error: 'id mismatch' });
        await writeAtomic(path.join(themeDir(id), 'theme.json'), body);
        await pruneMedia(id, body);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'DELETE' && parts.length === 3) {
        await fs.rm(themeDir(id), { recursive: true, force: true });
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && parts[3] === 'media') {
        const slot = url.searchParams.get('slot') ?? '';
        const ext = path.extname(url.searchParams.get('name') ?? '').toLowerCase().replace('.jpeg', '.jpg');
        if (!SLOT_TYPES[slot]?.includes(ext)) return json(res, 400, { error: `${slot} accepts ${SLOT_TYPES[slot]?.join(', ') ?? 'nothing'}` });
        if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD) return json(res, 413, { error: 'file too large (200 MB max)' });
        await fs.mkdir(themeDir(id), { recursive: true });
        const name = `${slot}-${Date.now().toString(36)}${ext}`;
        const dest = path.join(themeDir(id), name);
        await pipeline(req, createWriteStream(dest));
        if (ext === '.gif' && slot !== 'emblem') {
          const mp4 = await gifToMp4(dest);
          if (mp4) {
            await fs.rm(dest, { force: true });
            return json(res, 200, { file: path.basename(mp4), kind: 'video', converted: true });
          }
        }
        return json(res, 200, { file: name, kind: VIDEO.has(ext) ? 'video' : ext === '.gif' ? 'gif' : slot === 'font' ? 'font' : 'image', converted: false });
      }

      if (req.method === 'GET' && parts[3] === 'file' && parts[4] && validName(parts[4])) {
        return sendFile(req, res, path.join(themeDir(id), parts[4]));
      }

      if (req.method === 'GET' && parts[3] === 'export') {
        const theme = JSON.parse(await fs.readFile(path.join(themeDir(id), 'theme.json'), 'utf8'));
        const files: Record<string, string> = {};
        for (const f of await fs.readdir(themeDir(id))) {
          if (f !== 'theme.json' && validName(f) && JSON.stringify(theme).includes(f)) {
            files[f] = (await fs.readFile(path.join(themeDir(id), f))).toString('base64');
          }
        }
        return json(res, 200, { ultronTheme: 1, theme, files });
      }
    }

    json(res, 404, { error: 'not found' });
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
});

// ---------- WebSocket: ptys ----------

type ClientMsg =
  | { t: 'spawn'; id: string; cols: number; rows: number; cwd?: string }
  | { t: 'in'; id: string; d: string }
  | { t: 'resize'; id: string; cols: number; rows: number }
  | { t: 'kill'; id: string }
  | { t: 'status'; id: string; req: number };

const SESSION_VARS = [
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
];

function shellEnv() {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Ultron' } as Record<string, string>;
  // Don't leak this dev server's npm/vite environment into the user's shell,
  // nor a parent Claude Code session's markers (if `npm run dev` was started from inside Claude).
  for (const k of Object.keys(env)) if (k.startsWith('npm_') || k === 'INIT_CWD') delete env[k];
  for (const k of SESSION_VARS) delete env[k];
  if (env.NODE_OPTIONS?.includes('tsx')) delete env.NODE_OPTIONS;
  return env;
}

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  if (url.pathname !== '/ws' || !authorized(url, req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws: WebSocket) => {
  const terms = new Map<string, pty.IPty>();
  const shell = process.env.SHELL || '/bin/zsh';
  const shellName = path.basename(shell);
  const send = (msg: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  const kill = (id: string) => {
    const t = terms.get(id);
    if (!t) return;
    terms.delete(id);
    try { t.kill(); } catch { /* already gone */ }
  };

  ws.on('message', async (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (typeof msg.id !== 'string') return;

    switch (msg.t) {
      case 'spawn': {
        kill(msg.id); // spawn doubles as restart
        if (terms.size >= MAX_PTYS) {
          send({ t: 'out', id: msg.id, d: `\r\n\x1b[31m[ultron: ${MAX_PTYS} shells open, close one first]\x1b[0m\r\n` });
          return;
        }
        let cwd = HOME;
        try { if (msg.cwd && statSync(msg.cwd).isDirectory()) cwd = msg.cwd; } catch { /* gone: use $HOME */ }
        const t = pty.spawn(shell, ['-l'], { name: 'xterm-256color', cols: msg.cols, rows: msg.rows, cwd, env: shellEnv() });
        const id = msg.id;
        terms.set(id, t);
        t.onData((d) => terms.get(id) === t && send({ t: 'out', id, d }));
        t.onExit(({ exitCode }) => {
          if (terms.get(id) !== t) return;
          terms.delete(id);
          send({ t: 'exit', id, code: exitCode });
        });
        break;
      }
      case 'in':
        terms.get(msg.id)?.write(msg.d);
        break;
      case 'resize':
        if (msg.cols > 0 && msg.rows > 0) terms.get(msg.id)?.resize(msg.cols, msg.rows);
        break;
      case 'kill':
        kill(msg.id);
        break;
      case 'status': {
        const t = terms.get(msg.id);
        if (!t) return send({ t: 'status', id: msg.id, req: msg.req, fg: shellName, cwd: null, shell: shellName });
        const [fg, cwd] = await Promise.all([foreground(t.pid, shellName), cwdOf(t.pid)]);
        send({ t: 'status', id: msg.id, req: msg.req, fg, cwd, shell: shellName });
        break;
      }
    }
  });

  ws.on('close', () => [...terms.keys()].forEach(kill));
});

server.listen(PORT, HOST, () => {
  console.log(`ultron server on http://${HOST}:${PORT} (token in .ultron-token, ffmpeg: ${FFMPEG ?? 'not found'})`);
});

const shutdown = () => {
  for (const c of wss.clients) c.terminate();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
