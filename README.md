<div align="center">

# Ultron

**A real zsh terminal wrapped in a cinematic UI, built for launching and driving Claude Code.**

![Platform](https://img.shields.io/badge/platform-macOS%2011%2B-black?logo=apple)
![Arch](https://img.shields.io/badge/arch-Apple%20Silicon%20(arm64)-black)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-backend-B7410E?logo=rust)

</div>

> [!IMPORTANT]
> **This is a macOS-only build.** The native app targets **Apple Silicon (`aarch64-apple-darwin`)** on
> **macOS 11 Big Sur or later** and ships as a `.dmg`. Windows and Linux are not supported, and the
> browser prototype also relies on macOS tools (`osascript`, `ps`, `lsof`).

**[⬇ Download the latest `.dmg`](https://github.com/Arun-projectdumps/ultron/releases/latest)** (Apple Silicon, macOS 11+)

---

## Contents

- [What it is](#what-it-is)
- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Building the macOS app](#building-the-macos-app)
- [Browser prototype](#browser-prototype)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Themes](#themes)
- [Where data lives](#where-data-lives)
- [Project structure](#project-structure)
- [Architecture](#architecture)
- [Performance](#performance)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## What it is

Ultron is a single-window desktop app that behaves like the VS Code integrated terminal: everything
you type goes to a real login shell (zsh), including Claude Code's full TUI. Around that terminal sits
a dark, cinematic interface with buttons and panels that send commands to the shell for you: launch
Claude, jump between projects, paste prompt templates, split panes.

It is built with **Tauri 2**, so it uses macOS's built-in WebKit instead of bundling Chromium. The
result is a small app with **0% idle CPU** and roughly **134 MB** total memory.

> The app was originally called **Nocturne**. That name now belongs to its built-in default theme.

## Features

| | |
|---|---|
| **Real terminal** | Full interactive zsh via a pty: colors, cursor, resizing, Ctrl-C, arrow keys, and Claude Code's TUI all work. |
| **One-key Claude** | `⌘↵` types `claude` into the active pane and shows a boot animation while it starts. |
| **Projects library** | Save project folders, then switch with `⌘P`. If Claude is running, Ultron sends `/exit`, waits for the shell, `cd`s, and relaunches Claude. |
| **Prompt templates** | Searchable menu (`⌘K`) with Research, Thinking, Prototype and Bug-fixing templates. Choosing one pastes it without pressing Enter so you can edit first. |
| **Tabs and splits** | Up to 12 terminals across tabs and horizontal/vertical splits, each keeping its scrollback. |
| **Configurable shortcuts** | Rebind every action in Settings → Shortcuts, with conflict and reserved-key warnings. |
| **Theme engine** | Token-based themes with a live editor, custom backgrounds (image, video, GIF→MP4) and import/export. |
| **Intro cinematic** | A ~4 s skippable intro: metallic wordmark, crimson emblem, transition into the workspace. |
| **Native folder picker** | Uses the macOS open panel to pick folders. |

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| macOS | 11 Big Sur or later, Apple Silicon | Everything |
| [Node.js](https://nodejs.org) | 20+ (developed on 26) | Frontend build, browser prototype |
| [Rust](https://rustup.rs) | stable, `~/.cargo/bin` on `PATH` | Native app |
| Xcode Command Line Tools | `xcode-select --install` | Native app |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` on your `PATH` | Launching Claude from the UI |
| [ffmpeg](https://ffmpeg.org) *(optional)* | `brew install ffmpeg` | Converting GIF backgrounds to MP4 |

## Quick start

```sh
git clone git@github.com:Arun-projectdumps/ultron.git
cd ultron
npm install
npm run app:dev      # native macOS window with hot reload
```

## Building the macOS app

```sh
npm run app:build
```

This runs `tauri build --bundles dmg --target aarch64-apple-darwin` and writes:

```
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Ultron_0.1.0_aarch64.dmg
```

Open the `.dmg` and drag **Ultron** into Applications.

> [!NOTE]
> The app is **ad-hoc signed** (`signingIdentity: "-"`) and not notarized. On first launch macOS
> Gatekeeper may block it. Right-click **Ultron.app → Open**, or run
> `xattr -dr com.apple.quarantine /Applications/Ultron.app`.

## Browser prototype

The same UI runs in a browser against a small Node backend. This is useful for fast design iteration.

```sh
npm install
npm run dev
```

This starts a `node-pty` WebSocket server on `127.0.0.1:7777` and Vite on
**http://127.0.0.1:5173**. Open that URL in your browser.

In the browser, tab and split shortcuts use `⌥` instead of `⌘`, because browsers reserve `⌘T`, `⌘W` and
`⌘1–9`.

## Keyboard shortcuts

| Action | Native app | Browser |
|---|---|---|
| Run Claude in the active pane | `⌘↵` | `⌘↵` |
| Send `/exit` to Claude | `⌘⇧E` | `⌘⇧E` |
| Prompt templates | `⌘K` | `⌘K` |
| Quick-switch project | `⌘P` | `⌘P` |
| Open folder | `⌘O` | `⌘O` |
| Toggle sidebar | `⌘B` | `⌘B` |
| Settings | `⌘,` | `⌘,` |
| Shortcuts cheat sheet | `⌘/` | `⌘/` |
| New tab / close pane or tab | `⌘T` / `⌘W` | `⌥T` / `⌥W` |
| Split right / down | `⌘D` / `⌘⇧D` | `⌥D` / `⌥⇧D` |
| Go to tab 1–8 / last | `⌘1–8` / `⌘9` | `⌥1–8` / `⌥9` |
| Next / previous tab | `⌃⇥` / `⌃⇧⇥` | same |
| Previous / next pane | `⌘⌥←` / `⌘⌥→` | same |

- `⇧↵` inserts a newline inside Claude.
- All shortcuts can be changed in **Settings → Shortcuts**. Only overrides are saved.
- The terminal always keeps `Esc`, `Tab`, arrows, `⌫`, `⌥`-word motion and every `⌃` combo (`⌃C`, `⌃D`,
  `⌃R`…), so these can't be bound.

## Themes

- **Nocturne** is the built-in theme: dark, cinematic, with crimson accents.
- Open the editor from **Settings → General** to create your own. It has a simple mode and an
  advanced mode (every token, plus the 16 ANSI colors).
- Backgrounds can be images, videos or GIFs. GIFs are converted to MP4 when ffmpeg is installed.
- Themes are exported and imported as `*.ultron-theme.json`, with media embedded. Legacy Nocturne exports
  also import.
- To replace the default wallpaper, swap `public/theme/nocturne/background.jpg` (≤ 2560 px wide,
  JPEG ~80) or use **Settings → Change background**. `scripts/make-placeholder-bg.sh` regenerates the
  placeholder.

## Where data lives

| Path | Contents |
|---|---|
| `~/.ultron/data.json` | Projects, prompt templates, settings, shortcut overrides (written atomically) |
| `~/.ultron/themes/<id>/` | `theme.json` plus that theme's media |
| `.ultron-token` *(repo root, gitignored)* | Random auth token for the browser prototype's server |

## Project structure

```
ultron/
├── src/                     React + TypeScript UI (shared by both builds)
│   ├── backend/             Backend interface + implementations
│   │   ├── types.ts         The contract the UI is written against
│   │   ├── ws.ts            Browser prototype: WebSocket → Node server
│   │   └── tauri.ts         Native app: Tauri invoke() + one Channel per pty
│   ├── components/          TopBar, Sidebar, Workspace, TabBar, Intro, Settings, ThemeEditor…
│   ├── lib/
│   │   ├── terminals.ts     One xterm per pane, kept outside React; idle caret parking
│   │   ├── tabs.ts          Tab and split actions
│   │   ├── shell.ts         Claude launch, boot overlay, /exit → cd → claude switching
│   │   └── shortcuts.ts     Keymap, matching and the recorder
│   ├── state/store.ts       Zustand store
│   └── theme/               Theme model, Nocturne, color derivation, media pre-rendering
├── src-tauri/               Native macOS shell (Rust)
│   ├── src/lib.rs           pty commands, data/theme storage, media:// protocol, app menu
│   ├── tauri.conf.json      Bundle config (Ultron, dev.ultron.terminal, macOS 11+)
│   ├── capabilities/        Window dragging + dialog permissions
│   └── icons/
├── server/index.ts          Browser-prototype backend: node-pty + ws + osascript pickers
├── public/                  Favicon + default Nocturne wallpaper
├── scripts/                 Placeholder background generators
└── docs/SPEC.md             Full design and build specification
```

## Architecture

The UI is written against a single `Backend` interface (`src/backend/types.ts`), so the two builds differ
only in which implementation is plugged in:

```
                ┌──────────────────────────────┐
                │   React UI + xterm.js        │
                └──────────────┬───────────────┘
                               │  Backend interface
             ┌─────────────────┴─────────────────┐
             ▼                                   ▼
   Browser prototype                       Native macOS app
   ws.ts → Node server                     tauri.ts → Rust (lib.rs)
   node-pty · ws · osascript               portable-pty · plugin-dialog · media://
```

- **Claude detection** asks the OS which process is in the pty's foreground (`ps` / process-group
  leader). It never parses terminal output.
- **Project switching while Claude runs** sends `Ctrl-C` (clears a half-typed prompt), then `/exit`.
  It polls until zsh is back (5 s timeout, then `Ctrl-C ×2`), then sends `cd` and your Claude command.
- **Shells** start as `$SHELL -l` with `TERM=xterm-256color`, `COLORTERM=truecolor` and
  `TERM_PROGRAM=Ultron`.

The full design rationale is in **[docs/SPEC.md](docs/SPEC.md)**.

## Performance

Measured on the built app at idle: intro finished, one shell at its prompt, 30 s without input. Total
includes the WebKit GPU, WebContent and Networking processes.

| Metric | Value |
|---|---|
| Idle CPU | **0.0%** |
| Total memory footprint | **~134 MB** |

The native build uses xterm's DOM renderer, because WebGL costs about 80 MB in WebKit on Retina. It also
parks the hidden caret after 2 s idle, because WebKit otherwise re-renders continuously. See
[docs/SPEC.md §16.3](docs/SPEC.md) for the measurements.

## Security

- The browser prototype's server binds to **`127.0.0.1` only** and requires a random token. Vite injects
  the token into the page, and the server stores it in `.ultron-token`. Delete that file to rotate it.
- The native app has no network server at all. Its pty and file access go through Tauri commands.
- Save dialogs are opened and written from Rust, so the web view never supplies a file path.
- Fonts are bundled locally, so the app makes no network requests at runtime.

## Troubleshooting

| Problem | Fix |
|---|---|
| `posix_spawnp failed` when a terminal opens | Run `npm install` again. The `postinstall` script makes node-pty's `spawn-helper` executable, which npm 11 no longer does by default. |
| `cargo: command not found` during `app:build` | Install Rust with [rustup](https://rustup.rs) and make sure `~/.cargo/bin` is on your `PATH`. |
| "Ultron can't be opened" on first launch | The app isn't notarized. Right-click → Open, or clear the quarantine flag (see [Building](#building-the-macos-app)). |
| Clicking the Claude button does nothing | Check that `claude` works in a normal Terminal window, since Ultron runs your login shell's `PATH`. |
| GIF backgrounds don't upload | Install ffmpeg (`brew install ffmpeg`). |
