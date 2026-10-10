# Ultron (formerly Nocturne): a themed terminal launcher for Claude Code (macOS)

> **Renamed to Ultron** at the start of Phase 2. The app, window, wordmark, bundle and data folder are
> "Ultron" (`~/.ultron/`, `.ultron-token`, `*.ultron-theme.json`). **Nocturne** remains the name of the
> built-in default theme. Older sections below still say "Nocturne" where they describe the app; read
> them as Ultron. See §16.

> Build brief for Claude Code. Read this whole file before writing code.
> Build in **two phases**: Phase 1 is a localhost prototype in the browser for design iteration. Phase 2 wraps the finished design in a native macOS app and ships a `.dmg`. Phase 2 must match the approved Phase 1 design exactly.

---

## 1. What we're building

A single-window desktop app that is basically **a real terminal with a cinematic, dark UI around it**. Everything the user types goes to a real shell (zsh), the same way the VS Code integrated terminal works. Around the terminal are buttons and panels that send commands to that shell for the user.

### Core features
1. **Real terminal**: a full interactive zsh session (colors, cursor, resizing, Ctrl-C, arrow keys, Claude Code's TUI all working).
2. **Claude button**: types `claude` + Enter into the terminal. While Claude Code boots, show a short loading animation over the terminal.
3. **Open Folder**: opens the native macOS folder picker. On selection, send `cd "<path>"` to the terminal.
4. **Projects library**: a saved list of project folders (name + path). Add, rename, remove, reorder. Clicking a project:
   - if Claude is **not** running → `cd "<path>"` then `claude`
   - if Claude **is** running → send `/exit` + Enter, wait until the shell prompt is back, then `cd "<path>"` then `claude`
5. **Prompt templates**: a dropdown with a search field at the top (auto-focused when opened). Categories: Research, Thinking, Prototype, Bug fixing (plus user-made ones). Choosing a template **pastes** it into the terminal without pressing Enter, so the user can edit before sending. Templates can be added/edited/deleted.
6. **Intro cinematic** on app launch (and when the theme is applied): instant black → metallic welcome text shines in → crimson emblem fades in behind the text → transition into the IDE.
7. **Theme**: one theme for now, **Nocturne** (dark, cinematic, crimson accents). Theme system must be token-based so more themes can be added later.

### Non-goals (for now)
- No file editor, no file tree editing, no git UI.
- No multiple themes UI (architecture supports it, but ship one).
- No cloud sync, no accounts.

---

## 2. Tech stack (chosen for low CPU/RAM)

| Layer | Phase 1 (localhost) | Phase 2 (native app) |
|---|---|---|
| UI | Vite + React + TypeScript | same code, unchanged |
| Styling | CSS variables + CSS modules (no heavy UI kit) | same |
| Terminal renderer | `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` | same |
| Shell backend | small Node server: `node-pty` + `ws` (WebSocket) | **Tauri 2** (Rust) with `portable-pty` |
| Folder picker | Node server runs `osascript -e 'POSIX path of (choose folder)'` | `@tauri-apps/plugin-dialog` |
| Storage | JSON file via the Node server (`~/.nocturne/data.json`) | same file, via Tauri fs commands |
| Packaging | n/a | `tauri build --bundles dmg` |

**Why Tauri, not Electron:** Tauri uses macOS's built-in WebKit instead of bundling Chromium. Typical result: ~10–20 MB app instead of ~150 MB, much lower idle RAM, near-zero idle CPU.

### Backend abstraction (important)
Write the UI against one interface so Phase 2 only swaps the implementation:

```ts
// src/backend/types.ts
export interface Backend {
  spawnShell(cols: number, rows: number): Promise<void>;
  write(data: string): void;                 // raw keystrokes / text into the pty
  resize(cols: number, rows: number): void;
  onData(cb: (chunk: string) => void): () => void;
  onExit(cb: (code: number) => void): () => void;
  foregroundProcess(): Promise<string>;      // e.g. "zsh" or "claude" / "node"
  pickFolder(): Promise<string | null>;
  loadData(): Promise<AppData>;
  saveData(data: AppData): Promise<void>;
}
```
`src/backend/ws.ts` implements it for Phase 1, `src/backend/tauri.ts` for Phase 2. Pick at runtime with `'__TAURI_INTERNALS__' in window`.

> **Superseded by §14.4:** with terminal tabs/splits every pty call takes a session id, and themes add
> media/export methods. The current interface lives in `src/backend/types.ts`.

---

## 3. Terminal behavior details

- **Spawn a login shell**: `zsh -l` (use `$SHELL` if set) with `TERM=xterm-256color`, `COLORTERM=truecolor`, cwd = `$HOME`. A login shell is required or `claude` won't be on PATH (it's usually installed via npm/homebrew paths set in `.zprofile`/`.zshrc`).
- **Sending a command**: `write(cmd + "\r")`. Quote paths: `cd '<path with ' escaped as '\''>'`.
- **Pasting a template**: wrap in bracketed paste so multi-line text isn't executed line by line: `"\x1b[200~" + text + "\x1b[201~"`. Do NOT append `\r`.
- **Detecting whether Claude is running**: don't guess from output. Ask the OS which process is in the pty's foreground:
  - Phase 1: `node-pty`'s `pty.process` property gives the foreground process name on macOS.
  - Phase 2: get the shell's PID from `portable-pty`, then `pgrep -P <shellPid>` / `ps -o comm= -p <pid>`.
  - Treat `claude` (or a `node` child whose args contain `claude`) as "Claude running".
- **Project switch sequence** (when Claude is running):
  1. `write("/exit\r")`
  2. poll `foregroundProcess()` every 150 ms until it's the shell again (timeout 5 s; on timeout send `\x03` Ctrl-C twice, then continue)
  3. `write(cd ... + "\r")`, then `write("claude\r")`
  Disable the project list and show a small "switching…" state during this.
- **Claude boot overlay**: show the loading animation from the moment `claude` is sent until either (a) pty output goes quiet for 400 ms after the first output arrives, or (b) 6 s pass. Overlay is semi-transparent and never blocks keystrokes.
- **Resize**: `addon-fit` on container resize (ResizeObserver, debounced 50 ms) → `backend.resize`.
- Use the WebGL addon; fall back to the canvas/DOM renderer if WebGL fails.

---

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ◆ NOCTURNE   ~/path/to/current/project        [⌕ Prompts ▾] │  top bar (44px)
├────────────┬─────────────────────────────────────────────────┤
│ ACTIONS    │                                                 │
│ ▶ Claude   │                                                 │
│ 📁 Open…   │            TERMINAL (fills the space)           │
│ ⟲ Restart  │                                                 │
│            │                                                 │
│ PROJECTS + │                                                 │
│ • api      │                                                 │
│ • website  │                                                 │
│ • research │                                                 │
├────────────┴─────────────────────────────────────────────────┤
│ ● claude running · ~/proj/api · zsh            ⏻ status bar  │  24px
└──────────────────────────────────────────────────────────────┘
```

- Sidebar: 240px, collapsible to a 56px icon rail (Cmd+B).
- Terminal panel: rounded 10px corners, 1px crimson-tinted border, sits on a translucent dark surface over the background image.
- Status bar: Claude state dot (crimson pulse = running, grey = idle), current folder, shell name.
- Keyboard shortcuts: Cmd+K prompts, Cmd+O open folder, Cmd+Enter (in sidebar focus) launch Claude, Cmd+B sidebar, Esc closes menus. Terminal keeps focus otherwise.

---

## 5. Nocturne theme: design system

Mood: noir, cinematic, rain-at-night, gunmetal and crimson. Restrained: mostly black and grey, with red used sparingly as a signal (active states, glows, the emblem).

### 5.1 Color tokens (`src/theme/nocturne.css`)
```css
:root[data-theme="nocturne"] {
  --bg:            #070708;   /* app base */
  --surface:       rgba(14, 14, 17, 0.82);  /* panels over the image */
  --surface-2:     rgba(22, 22, 27, 0.90);  /* menus, popovers */
  --border:        rgba(255, 255, 255, 0.06);
  --border-accent: rgba(200, 16, 46, 0.35);
  --text:          #e6e6e9;
  --text-muted:    #8b8b94;
  --text-dim:      #55555c;
  --accent:        #c8102e;   /* crimson */
  --accent-hot:    #ff2a3d;   /* hover / glow core */
  --accent-glow:   rgba(255, 42, 61, 0.35);
  --metal-1:       #f4f4f6;
  --metal-2:       #9a9ba3;
  --metal-3:       #3c3d43;
  --success:       #4ade80;
  --warning:       #f5a524;
}
```

### 5.2 Terminal palette (xterm `theme` option)
```ts
{
  background: 'rgba(0,0,0,0)',   // transparent: panel surface shows through (set allowTransparency: true)
  foreground: '#e6e6e9', cursor: '#ff2a3d', cursorAccent: '#070708',
  selectionBackground: 'rgba(200,16,46,0.30)',
  black:'#1a1a1e', red:'#e0303f', green:'#7fb38a', yellow:'#d9b26a',
  blue:'#7a8ca8', magenta:'#b07a9e', cyan:'#7aa7a8', white:'#c9c9cf',
  brightBlack:'#55555c', brightRed:'#ff4d5a', brightGreen:'#9fd4a9',
  brightYellow:'#f0cf8a', brightBlue:'#9db0cc', brightMagenta:'#d39cc1',
  brightCyan:'#9ccbcc', brightWhite:'#f4f4f6'
}
```

### 5.3 Typography (Google Fonts, bundled locally in Phase 2)
- **Display / cinematic**: `Cinzel` 600–700 (intro title, app wordmark), letter-spacing 0.18em, uppercase.
- **UI**: `Inter` 400/500/600, 13px base.
- **Terminal**: `JetBrains Mono` 13.5px, line-height 1.25, ligatures off.

### 5.4 Background image
- Slot: `public/theme/nocturne/background.jpg` (user drops in their own wallpaper; ship a placeholder: a dark, rainy, night-city skyline, e.g. from Unsplash with search terms "rainy city night noir", "dark skyline rain", "gothic architecture night").
- Rendering, behind everything, much lighter than a normal wallpaper:
  - `filter: grayscale(1) contrast(1.1) brightness(0.55)`; image `opacity: 0.22`
  - over it: radial vignette `radial-gradient(ellipse at center, transparent 30%, #070708 85%)`
  - plus a faint crimson wash at the bottom edge: `linear-gradient(to top, rgba(200,16,46,0.08), transparent 40%)`
- **Pre-process the image once** (CSS filters on a static `<img>` are fine; do NOT use `backdrop-filter: blur()` across the whole app, it's a constant GPU cost). Panels use solid-ish translucent `--surface` instead of blur.
- Settings → "Change background…" lets the user pick any image file; copy it into `~/.nocturne/background.<ext>`.

### 5.5 Emblem
- Original geometric crest (do not use any existing logo): a thin crescent moon pierced vertically by a narrow blade, drawn as an inline SVG with a crimson-to-dark gradient fill and a soft `--accent-glow` drop-shadow.
- Used in: the intro (large, behind the title), the top-bar wordmark (16px), app icon.
- Make it a component `<Emblem size glow />` so it can be swapped later; also allow the user to replace it with their own SVG in Settings (`~/.nocturne/emblem.svg`).

### 5.6 Components
- **Buttons**: transparent bg, 1px `--border`, 8px radius, 34px tall. Hover: border `--border-accent`, text `--text`, a 1px inner top highlight `inset 0 1px 0 rgba(255,255,255,0.04)`. Primary (Claude button): crimson gradient `linear-gradient(180deg, #d4142f, #8e0b20)`, white text, hover glow `0 0 18px var(--accent-glow)`.
- **Sidebar items**: 32px rows, active item has a 2px crimson left bar + slightly lighter background.
- **Prompt dropdown**: 520px wide popover, `--surface-2`, search input at top (auto-focus, fuzzy match on title + category + body), results grouped by category with sticky headers, keyboard navigation (↑/↓/Enter/Esc), preview of the first two lines of the prompt under the title. "＋ New template" row at the bottom.
- **Dialogs** (add project, edit template): centered, 480px, `--surface-2`, crimson focus rings.
- **Focus rings**: `0 0 0 2px var(--bg), 0 0 0 4px var(--accent)`.

### 5.7 Motion
- Default easing `cubic-bezier(0.2, 0.8, 0.2, 1)`, UI transitions 160–220 ms.
- **Claude boot overlay**: the emblem outline traced with an SVG `stroke-dashoffset` animation (1.2 s loop) + text "Summoning Claude…" in Cinzel, letter-spacing animating 0.1em → 0.22em. Overlay `rgba(7,7,8,0.55)`.
- Respect `prefers-reduced-motion`: replace all motion with simple fades.

---

## 6. Intro cinematic (≈4.2 s, skippable with any key/click)

Plays on launch and when the theme is applied. Implement as a full-screen React component with CSS keyframes (no video files, no canvas loop).

| Time | Event |
|---|---|
| 0.00 s | Screen is instantly solid `#000`. |
| 0.30 s | Welcome text fades in from `opacity 0, letter-spacing 0.6em, blur(6px)` to `opacity 1, letter-spacing 0.22em, blur(0)` over 1.2 s. |
| 0.30 s → 2.0 s | Text is **metallic**: `background: linear-gradient(180deg, var(--metal-1) 0%, var(--metal-2) 45%, var(--metal-3) 52%, var(--metal-2) 70%, var(--metal-1) 100%); -webkit-background-clip: text; color: transparent;` plus a **shine sweep**: a second layer with a 20° diagonal white band (`linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.9) 50%, transparent 60%)`) clipped to the text, `background-position` animated from -150% to 250% over 1.1 s, starting at 1.1 s. Subtle `text-shadow: 0 2px 0 #000, 0 0 24px rgba(255,255,255,0.06)`. |
| 1.40 s | Crimson emblem fades in **behind** the text: `opacity 0 → 0.85`, `scale 0.92 → 1`, glow `drop-shadow(0 0 40px var(--accent-glow))`, over 1.0 s. |
| 2.80 s | Hold. |
| 3.20 s | Transition: text and emblem scale to 1.04 and fade out (0.5 s) while the IDE fades/scales in from `0.985` to `1` behind it (0.7 s). |
| 4.20 s | Intro unmounted. Terminal gets focus. |

- Welcome text is configurable in Settings (default: `WELCOME BACK`, second line in smaller muted Inter: the user's macOS short username).
- Text: Cinzel 700, `clamp(40px, 6vw, 88px)`.
- Setting: "Play intro on launch" (on by default).
- The shell spawns **during** the intro so the terminal is ready when it ends.

---

## 7. Data model (`~/.nocturne/data.json`)

```ts
interface AppData {
  version: 1;
  projects: { id: string; name: string; path: string; lastOpened?: number }[];
  templates: { id: string; title: string; category: string; body: string }[];
  settings: {
    welcomeText: string;
    playIntro: boolean;
    claudeCommand: string;     // default "claude"; allows e.g. "claude --continue"
    backgroundPath?: string;
    emblemPath?: string;
  };
}
```
Write atomically (write to `.tmp` then rename). If a project path no longer exists, show it greyed out with a "Locate…" action.

### Seed prompt templates
- **Research**: "Research {topic}. Start by listing what you need to find out, then investigate each point. Cite files/lines or sources for every claim. End with a short summary and open questions."
- **Thinking**: "Before writing any code, think through {problem}. Lay out 2–3 approaches with trade-offs, recommend one, and wait for my go-ahead."
- **Prototype**: "Build a quick, working prototype of {idea}. Favor speed over polish, keep it in as few files as possible, and tell me exactly how to run it."
- **Bug fixing**: "There's a bug: {describe}. Reproduce it first, find the root cause (not just the symptom), fix it, and add a test that would have caught it."
- **Code review**: "Review the changes in this repo (git diff). Flag bugs, risky logic and unclear naming, ordered by severity."

Placeholders like `{topic}` stay as plain text; after pasting, the user edits them in the terminal.

---

## 8. Performance budget (must hold)

- Idle CPU (app open, terminal idle, no animations running): **< 1%**.
- Idle RAM (Phase 2): target < 150 MB total.
- No `requestAnimationFrame` loops or infinite CSS animations while idle. The only looping animations are the Claude boot overlay and the status dot pulse, and both stop when not needed (the pulse is a 2 s animation that runs 3 times, then stays static).
- Pause any animation when the window is hidden (`document.visibilitychange`).
- No full-window `backdrop-filter`.
- Background image ≤ 2560px wide, JPEG quality ~80.

---

## 9. Phase 1: localhost prototype (do this first)

Goal: iterate on the design in the browser with a **working** terminal.

```
nocturne/
  package.json            # workspaces or simple scripts
  server/index.ts         # node-pty + ws + /pick-folder + /data endpoints, port 7777
  src/                    # React app
    backend/{types,ws,tauri}.ts
    theme/nocturne.css
    components/{Intro,Sidebar,TopBar,Terminal,PromptMenu,StatusBar,Emblem,BootOverlay,Dialog}.tsx
    state/store.ts        # zustand
    App.tsx, main.tsx
  public/theme/nocturne/background.jpg
```

- `npm run dev` starts both the Node server and Vite (`concurrently`); open `http://localhost:5173`.
- Server binds to **127.0.0.1 only** (never 0.0.0.0) and checks a random token passed to the page, since it can run shell commands.
- Folder picker endpoint: `GET /pick-folder` → runs `osascript -e 'POSIX path of (choose folder with prompt "Open folder")'`, returns the path or null on cancel.
- Add a dev-only "Replay intro" button in the top bar.
- Vite HMR so design tweaks show instantly.

**Definition of done for Phase 1:** I can run Claude, open a folder via the Finder picker, add/switch projects (including the /exit flow), search and paste templates, see the intro and boot overlay, and everything matches this spec.

---

## 10. Phase 2: native macOS app + .dmg (only after the design is approved)

1. `npm create tauri-app` integration into the existing Vite project (`src-tauri/`), Tauri 2.
2. Rust commands: `spawn_shell`, `write`, `resize`, `foreground_process`, `load_data`, `save_data` using `portable-pty`; stream pty output to the UI with a Tauri `Channel`.
3. Use `@tauri-apps/plugin-dialog` for the folder picker.
4. Implement `src/backend/tauri.ts`; **no UI changes**.
5. Bundle the fonts locally (no network at runtime).
6. Window: `titleBarStyle: "Overlay"`, `hiddenTitle: true`, min size 960×600, dark vibrancy off (we draw our own background). Leave space for traffic lights in the top bar (left padding 78px).
7. App icon: the emblem on a near-black rounded square, generated with `tauri icon`.
8. Build: `npm run tauri build -- --bundles dmg --target aarch64-apple-darwin` (use `universal-apple-darwin` if Intel support is needed).
9. Output: `src-tauri/target/.../bundle/dmg/Nocturne_x.y.z_aarch64.dmg`. Drag to Applications.
10. Unsigned app note: first launch needs right-click → Open, or `xattr -dr com.apple.quarantine /Applications/Nocturne.app`.

**PATH gotcha:** apps launched from Finder don't inherit your terminal's PATH. Spawning `zsh -l` (login shell) fixes this; also source `~/.zshrc` by using `-l -i` if `claude` still isn't found.

---

## 11. Suggested build order for Claude Code

1. Scaffold Phase 1 project, Node pty server, plain xterm working in the browser.
2. Theme tokens, layout shell (top bar, sidebar, status bar), background treatment.
3. Claude button + boot overlay + foreground-process detection.
4. Open Folder (osascript picker).
5. Projects library + switch sequence.
6. Prompt templates dropdown with search + CRUD.
7. Intro cinematic.
8. Settings (welcome text, background, emblem, intro toggle, claude command).
9. Polish pass against sections 5–6, perf check against section 8.
10. → stop and wait for approval → Phase 2.

---

## 12. Nocturne visual upgrade (v2)

Original artwork only: no existing logos, characters or brand marks.

### 12.1 Intro (default theme)
- **Text**: Michroma, uppercase, letter-spacing 0.12em, `clamp(30px, 5vw, 76px)`.
- **3D chrome**, built from stacked layers (text-shadow on clipped text would paint over the face):
  1. *Extrusion layer*: a crimson rim `0 1px 0` (bottom edge of the letters), then 12 text-shadows in
     1px steps down-right, `#8a8a92` → `#1a1a1e`, then a soft black drop shadow.
  2. *Face*: `linear-gradient(180deg, #fff 0%, #d8d8de 38%, #5a5b63 50%, #2b2c31 52%, #9a9ba3 75%, #f2f2f5 100%)`, `background-clip: text`.
  3. *Bevel*: a 0.6px white text-stroke nudged up-left, masked to the top half.
  4. *Specular*: a clipped diagonal light sweep that runs **twice**.
- **Scene**: black; pure-CSS rain (two tiled streak layers, compositor-only `transform` loops, removed
  with the intro); a red horizon glow behind the text; the emblem blooms in behind the text
  (opacity + drop-shadow growing, then settling); the whole scene pushes in 1.0 → 1.06 over the intro.
- **Cut** at 80% of the duration: the intro drops out in ~0.4 s and the IDE lands with a quick accent
  flash on every terminal panel border.
- All timings are fractions of the theme's duration (2–6 s, default 4.2 s). Skippable with any key/click.
  Reduced motion: fades only, no rain, no push-in, no sweep.

### 12.2 Background
- Default: `public/theme/nocturne/background.jpg` (drop your own photo in; a generated placeholder ships).
- Stills are **pre-rendered once on a canvas**: brightness, grayscale and blur are baked in, and
  *keep reds* desaturates every pixel except red/orange lights (hue within ±25–50° of 15°, saturated and
  bright). At runtime it is a plain `<img>`: no per-frame filter, no backdrop-filter.
- Nocturne defaults: grayscale 100% keeping reds, brightness 0.8, opacity 0.35; strong vignette;
  crimson haze along the bottom.
- Panels are more transparent (surface α ≈ 0.66, sidebar ≈ 0.32) so the city shows through.

### 12.3 Crimson details
- **Terminal panels**: corners cut on top-left and bottom-right (`clip-path`), accent notch lines along
  the cuts, a 1px masked border ring, and a thin glowing accent top edge (static gradient).
- **Sidebar headers**: small skewed accent slash before the label.
- **Status bar**: thin accent line across the top; the claude-running dot glows (3 pulses, then static).
- **Wordmark**: small version of the chrome text (3px extrusion + rim).
- **Buttons**: angled ends (`clip-path` on two pseudo layers: border + opaque fill), metal-grey border,
  accent border + `drop-shadow` glow on hover (the glow follows the angled outline).

---

## 13. Custom themes

### 13.1 Model and storage
A theme is plain JSON plus media files, in `~/.nocturne/themes/<id>/` (`theme.json` + uploads).
The built-in **Nocturne** lives in code; editing it saves an override in `~/.nocturne/themes/nocturne/`
("Reset to default" deletes it). The active theme id is `settings.themeId` in `data.json`.

```ts
interface Theme {
  version: 1; id: string; name: string; builtin?: boolean;
  colors: {
    mode: 'simple' | 'advanced';
    accent: string; base: string;               // simple mode inputs
    tokens: Record<TokenName, string>;          // every CSS token (bg, surface, accent, glow, …)
    terminal: { foreground; cursor; selection; black … brightWhite };  // 16 ANSI colors
  };
  media: Partial<Record<'background' | 'intro' | 'emblem' | 'boot', ThemeMedia>>;
  intro: { title; subtitle /* '' = macOS username */; font; customFont?; style: 'chrome'|'flat'|'glow'|'outline';
           duration /* 2–6 s */; playOnLaunch; rain; emblem };
}
interface ThemeMedia {
  file: string /* in the theme folder, or "/theme/…" for built-in assets */; kind: 'image' | 'gif' | 'video';
  opacity; brightness; blur /* px, pre-rendered */; grayscale; keepReds;
  fit: 'cover' | 'contain' | 'center' | 'focus'; focusX; focusY; animate /* background: default off */;
}
```

### 13.2 Theme manager (top bar → Theme)
- Cards with a live mini-mock of the app in each theme's colors + background, name, "Built-in", "Active".
- Clicking a card applies it and **replays the intro**.
- Per card: Edit, Duplicate, Export (`.nocturne-theme.json`, media embedded as base64), Delete
  (built-in: Reset to default). Footer: New theme, Import.
- Duplicating a custom theme keeps colors/intro but drops its uploaded files (each theme owns its folder).

### 13.3 Theme editor (side panel, live preview)
The whole app previews the draft as you edit; Save writes it, Cancel/× discards it.
- **Colors**
  - Simple mode: Accent + Base. Surfaces, borders, glows, hover/active states, on-accent text and the
    terminal cursor/selection are derived; text and muted text are pushed to ≥ 4.5:1 contrast.
    A contrast readout warns below 4.5:1.
  - Advanced mode: every token and the terminal foreground/cursor/selection + 16 ANSI colors.
  - Color field: react-colorful picker, hex text, R/G/B(/A) inputs, eyedropper where the
    EyeDropper API exists (Chromium; hidden in WebKit).
  - Presets: Crimson, Gold, Toxic, Ice, Violet.
  - "Pick colors from background": samples the background still (96px wide), buckets by hue weighted
    by saturation × lightness, normalizes to usable accents; the first is the suggestion.
- **Media** (Background, Intro screen, Emblem, Claude boot animation)
  - Accepted: background png/jpg/webp/gif/mp4/webm; intro png/jpg/gif/mp4/webm; emblem svg/png;
    boot gif/mp4/webm. Fonts: ttf/otf.
  - Sliders: opacity, brightness, blur, grayscale; keep red & orange lights; position (cover / contain /
    center / focus point with X/Y).
  - GIFs are converted to H.264 MP4 on upload when ffmpeg is available (far lighter than GIF).
  - Animated background: "Animate background" toggle, default **off** (first frame as a pre-rendered
    still). When on, video pauses while the window is hidden or after 60 s without input.
- **Intro**: title, subtitle (default: macOS username), font (Michroma, Orbitron, Cinzel Decorative,
  Bebas Neue, Inter, or an uploaded .ttf/.otf), style (Chrome 3D / Flat / Glow / Outline),
  duration 2–6 s, play on launch, rain, emblem, Preview intro.
- **Glow under text** (Intro section): toggle (default on), its own color picker (same color field as
  everywhere else; independent of the accent; default crimson `#c8102e`), intensity 0–100%, size/spread
  50–200%. A small live preview in the editor redraws as you drag; Preview intro plays the draft.
  Stored as `intro.glow = { enabled, color, intensity /* 0–1 */, size /* 0.5–2 */ }`.

### 13.4 Server endpoints (Phase 1)
`GET /api/themes` · `PUT /api/themes/:id` (atomic; prunes unreferenced media older than 24 h) ·
`DELETE /api/themes/:id` · `POST /api/themes/:id/media?slot=&name=` (raw body, 200 MB max) ·
`GET /api/themes/:id/file/:name` (HTTP Range, needed by WebKit video) · `GET /api/themes/:id/export` ·
`POST /api/themes/import`.

---

## 14. Terminal tabs + splits

### 14.1 Behavior
- VS Code–style tab bar above the terminal. Each tab holds a tree of panes; each pane is an independent
  zsh pty with its own cwd and Claude state. The status bar shows the **active pane**.
- Claude button, Open Folder, Projects and prompt templates act on the active pane (the focused one).
- Splits: right / down, nested, resizable dividers (drag; double-click evens out). The focused pane in a
  split gets the accent border; others recede.
- Tab: name = folder name, or `claude · folder` while Claude runs in its active pane; accent dot when
  Claude runs in any of its panes; × on hover; middle-click closes; double-click renames; drag to reorder;
  "+" at the end. Split buttons on the right of the bar.
- Tab context menu: New Tab, Duplicate Tab (same folders), Rename, Split Right, Split Down, Move to
  Left/Right, Close, Close Others, Close Tabs to the Left/Right, Close All. Empty bar: New Tab, Close All.
  Pane context menu: Launch Claude, Split Right/Down, Restart Shell, Close Pane.
- Closing a pane/tab running Claude asks first; Close All/Others/Left/Right ask once.
- Tabs, splits, ratios and each pane's folder are saved in `data.json` → `layout` and restored on launch
  (shells start fresh in the saved folder). Inactive tabs spawn their shell when first shown.
- Up to 10 terminals (server hard cap 12). Idle ptys cost ~0%: status is only queried after output.
- xterm instances live outside React (`src/lib/terminals.ts`), so splitting or moving a pane keeps its
  scrollback.

### 14.2 Shortcuts → see §15 (configurable keymap)

### 14.3 Data model
```ts
type PaneNode =
  | { type: 'pane'; id: string; cwd?: string }
  | { type: 'split'; id: string; dir: 'row' | 'column'; ratio: number; a: PaneNode; b: PaneNode };
interface Tab { id: string; title?: string; root: PaneNode; activePane: string }
interface Layout { tabs: Tab[]; activeTab: string }   // AppData.layout
```

### 14.4 Backend interface (replaces §2)
```ts
interface Backend {
  spawnShell(id: string, cols: number, rows: number, cwd?: string): Promise<void>;
  write(id: string, data: string): void;
  resize(id: string, cols: number, rows: number): void;
  kill(id: string): void;
  onData(id: string, cb: (chunk: string) => void): () => void;
  onExit(id: string, cb: (code: number) => void): () => void;
  foregroundProcess(id: string): Promise<string>;
  status(id: string): Promise<{ fg: string; cwd: string | null; shell: string }>;
  pickFolder(): Promise<string | null>;
  pathsExist(paths: string[]): Promise<boolean[]>;
  userInfo(): Promise<{ username: string; home: string; ffmpeg: boolean }>;
  loadData(): Promise<AppData>;  saveData(data: AppData): Promise<void>;
  listThemes(): Promise<Theme[]>;  saveTheme(t: Theme): Promise<void>;  deleteTheme(id: string): Promise<void>;
  uploadThemeMedia(themeId: string, slot: MediaSlot | 'font', file: File): Promise<UploadResult>;
  themeFileUrl(themeId: string, file: string): string;
  exportTheme(id: string): Promise<string>;  importTheme(json: string): Promise<Theme>;
}
```
Phase 1 multiplexes all ptys over one WebSocket (`{t, id, …}` messages). Phase 2 maps the same calls to
Tauri commands + one `Channel` per pty; ffmpeg conversion uses a bundled or system ffmpeg if present.

---

## 15. Keyboard shortcuts (configurable)

### 15.1 Default keymap
| Action | Native app | Browser (localhost) |
|---|---|---|
| Run Claude in the active pane (if already running there: focus it + flash the pane border) | ⌘↵ | ⌘↵ |
| Send /exit to Claude in the active pane (Ctrl-C first to clear any half-typed prompt) | ⌘⇧E | ⌘⇧E |
| Prompt templates | ⌘K | ⌘K |
| Quick-switch projects (searchable; ↵ = /exit → cd → claude in the active pane) | ⌘P | ⌘P |
| Open folder | ⌘O | ⌘O |
| Toggle sidebar | ⌘B | ⌘B |
| Settings (General · Shortcuts; theme editor is one click from General) | ⌘, | ⌘, (flagged: browsers may reserve it) |
| Shortcuts cheat sheet overlay | ⌘/ | ⌘/ |
| New tab / close pane or tab | ⌘T / ⌘W | ⌥T / ⌥W |
| Split right / down | ⌘D / ⌘⇧D | ⌥D / ⌥⇧D |
| Go to tab 1–8 / last | ⌘1–⌘8 / ⌘9 | ⌥1–⌥8 / ⌥9 |
| Next / previous tab | ⌃⇥ or ⌘⇧] / ⌃⇧⇥ or ⌘⇧[ | same (flagged: browsers reserve them) |
| Previous / next pane | ⌘⌥← / ⌘⌥→ | same |

⌘↵ works from anywhere, including while the terminal has focus. ⌘P lists projects by most recently
opened; missing folders are struck through; the last row is "Add project…".

### 15.2 Matching rules
- Combos are stored as `Ctrl+Alt+Shift+Meta+<KeyboardEvent.code>` (e.g. `Shift+Meta+KeyE`), matched on
  `code` because ⌥ turns letters into symbols on macOS.
- One capture-phase `keydown` listener on `window` dispatches actions, so xterm never sees them; xterm's
  custom key handler also returns `false` for any bound combo.
- Unbound keys are never touched. In text fields only ⌘ combos act; while a dialog is open the dialog
  handles its keys; while the recorder is capturing, all shortcuts pause.
- Dialogs take focus when they open and close on Esc in the capture phase (the terminal would otherwise
  swallow Esc).

### 15.3 Keys the terminal keeps (cannot be bound)
Plain or ⇧-only keys, ⇧↵ (newline in Claude), Esc, Tab, arrows, ⌫, ⌥-arrows/⌥⌫ (word motion), and every
⌃ combination except ⌃⇥ (⌃C, ⌃D, ⌃R, ⌃L…). The recorder rejects these with the reason.

### 15.4 Shortcuts editor (Settings → Shortcuts)
- Every action with its combos (up to 3). Click a combo to record a new one (Esc cancels), "+" adds one,
  × removes one, "default" restores that action, **Reset to defaults** restores all.
- Warnings: conflicts ("⌘K is also Prompt templates; the first listed wins"), combos macOS reserves
  (⌘Q, ⌘H, ⌘M, ⌘⇥, ⌘Space), and on localhost the ones Safari/Chrome reserve (⌘T, ⌘W, ⌘N, ⌘L, ⌘R, ⌘,,
  ⌘1–9, ⌃⇥, ⌘⇧[ ]). ⌥+letter combos note that they stop typing that special character.
- Saved to `~/.nocturne/data.json` as overrides only: `settings.shortcuts: { [actionId]: string[] }`
  (absent = defaults). Takes effect immediately.

---

## 16. Phase 2: native app (built)

### 16.1 Layout
```
ultron/
  src-tauri/
    Cargo.toml            # tauri 2, tauri-plugin-dialog, portable-pty 0.9, base64
    tauri.conf.json       # productName Ultron, id dev.ultron.terminal, overlay title bar, min 960×600
    capabilities/default.json   # core:default, window dragging, dialog:allow-open
    icons/                # generated by `tauri icon` from icons/app-icon.svg (emblem on a near-black plate)
    src/lib.rs            # every command below + media:// protocol + app menu
  src/backend/tauri.ts    # implements Backend over invoke() + one Channel per pty
```

### 16.2 Rust commands (same contract as server/index.ts)
| Command | Notes |
|---|---|
| `pty_spawn(id, cols, rows, cwd, channel)` | `$SHELL -l` (falls back to `dscl` UserShell, then `/bin/zsh`), cwd = saved folder or `$HOME`, `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=Ultron`, `LANG=en_US.UTF-8` if unset, parent Claude session markers removed. A reader thread streams UTF-8-safe chunks (`{event:'data'}`), then `{event:'exit', data: code}`. Max 12. |
| `pty_write`, `pty_resize`, `pty_kill` | Kill removes the session first, so no exit event follows. |
| `pty_status(id)` | Foreground process group from `MasterPty::process_group_leader()`; if it isn't the shell, `ps -o comm=,args=` decides `claude`. cwd via `lsof -d cwd`. Runs off the main thread. |
| `load_data`, `save_data` | `~/.ultron/data.json`, atomic (`.tmp` + rename). |
| `paths_exist`, `user_info` | `user_info` also reports whether ffmpeg exists (Homebrew paths checked explicitly). |
| `list_themes`, `save_theme`, `delete_theme` | `~/.ultron/themes/<id>/theme.json`; save prunes unreferenced media older than 24 h. |
| `theme_upload` | Raw-body IPC (bytes + `x-theme`/`x-slot`/`x-name` headers), 200 MB max; GIF → MP4 via ffmpeg. |
| `export_theme`, `import_theme` | Media embedded as base64; accepts `ultronTheme: 1` and legacy `nocturneTheme: 1`. |
| `save_file_dialog(name, contents)` | Native save panel and write in Rust (the web view never supplies a path). |

- **Folder picker**: `@tauri-apps/plugin-dialog` `open({ directory: true })`.
- **Theme media**: `media://localhost/<theme>/<file>` custom protocol, validated names only, HTTP Range
  (WebKit video needs it, ≤ 8 MB per response) and `Access-Control-Allow-Origin: *` so stills can be
  pre-rendered on a canvas (`crossOrigin = 'anonymous'`).
- **Menu**: Ultron (About, Hide, Quit), Edit (Undo/Redo/Cut/Copy/Paste/Select All, needed for text
  fields), Window (Minimize, Zoom, Full Screen). No default "Close Window ⌘W", so ⌘T/⌘W/⌘D/⌘1… reach the
  app's tab shortcuts.
- **Window**: overlay title bar, hidden title, `--traffic-lights: 78px` padding in the top bar, top bar
  and its brand/path are `data-tauri-drag-region`.
- **Fonts**: bundled via `@fontsource/*` (Inter, JetBrains Mono, Michroma, Orbitron, Cinzel Decorative,
  Bebas Neue); no network at runtime, in either phase.
- **Shortcuts**: `IS_TAURI` selects the ⌘ keymap for tabs/splits (§15).

### 16.3 WebKit-specific decisions (measured on the built app)
Idle = intro finished, one shell at its prompt, 30 s without input. Footprint = macOS phys_footprint
of the app plus its WebKit GPU, WebContent and Networking processes.

| Build | Total footprint | Idle CPU |
|---|---|---|
| First build (WebGL, pane `clip-path`, fixed background) | 267 MB | 2.0% |
| + idle caret parking | 260 MB | **0.0%** |
| + DOM renderer | 174 MB | 0.0% |
| + leaf-only `clip-path`, non-fixed background (WebGL) | 216 MB | 0.0% |
| **+ both (shipped)** | **134 MB** | **0.0%** |

- **Idle caret parking** (`src/lib/terminals.ts`): WebKit animates the caret of a focused editable
  field even when invisible (`OpacityCaretAnimator`), and xterm keeps a hidden textarea focused, so an
  idle window re-rendered continuously. `readonly` and `caret-color: transparent` did not stop it;
  blurring did. After 2 s with no input or output the textarea is blurred, with the blur/focus events
  swallowed in the capture phase so xterm keeps its focused cursor and sends no focus reports. The next
  keydown refocuses it and is passed to xterm's `_keyDown` (private API, guarded), so no keystroke is
  lost; output on a parked pane refocuses it; app deactivation/reactivation while parked sends the
  `ESC[O`/`ESC[I` reports xterm would have. Verified: first key, ↑, ↵ and ⌃C after idle all arrive.
- **Terminal renderer**: the native app uses xterm's DOM renderer (WebGL costs ~80 MB of Retina canvas
  buffers + glyph atlas in WebKit). The browser prototype keeps WebGL. This supersedes §3's "use WebGL"
  for Phase 2 because of §8's 150 MB budget.
- **Layers**: the notched `clip-path` lives on leaf elements (surface, ring, overlays) instead of the
  pane, which would otherwise be composited with a mask layer around the terminal's scroll layer; the
  background is `position: absolute` (the page never scrolls).
- xterm's textarea also gets `writingsuggestions="false"`, which stops macOS inline-prediction queries.
- Peak footprint during the intro is higher (rain, scaling, emblem bloom) and is released when it ends.

### 16.4 Build
```sh
npm run app:dev      # tauri dev (Vite + native window)
npm run app:build    # tauri build --bundles dmg --target aarch64-apple-darwin
# → src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Ultron_0.1.0_aarch64.dmg
```
Needs Rust (rustup) and Xcode Command Line Tools. The app is ad-hoc signed, not notarized: a copy
downloaded from elsewhere needs right-click → Open the first time, or
`xattr -dr com.apple.quarantine /Applications/Ultron.app`. A locally built copy opens normally.
