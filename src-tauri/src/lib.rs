// Ultron native backend (Phase 2). Implements the same contract as server/index.ts:
// ptys (portable-pty, output streamed over a Tauri Channel per pane), OS-level foreground-process
// detection, ~/.ultron data + themes, GIF→MP4, and a `media://` protocol (with Range) for theme files.
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime},
};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    http::{header, Request, Response, StatusCode},
    ipc::{Channel, InvokeBody},
    menu::{Menu, PredefinedMenuItem, Submenu},
    Manager, State,
};
use tauri_plugin_dialog::DialogExt;

const MAX_PTYS: usize = 12;
const MAX_UPLOAD: usize = 200 * 1024 * 1024;

// Markers a parent Claude Code session leaves in the environment; a shell started here must not
// inherit them or `claude` thinks it's a child session.
const SESSION_VARS: &[&str] = &[
    "CLAUDECODE", "CLAUDE_PID", "CLAUDE_EFFORT", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_EXECPATH",
    "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN",
];

type R<T> = Result<T, String>;
fn e2s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------- paths

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}
fn data_dir() -> PathBuf {
    home().join(".ultron")
}
fn themes_dir() -> PathBuf {
    data_dir().join("themes")
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 48
        && id.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}
/// Upload names look like `background-k3j2x9.mp4`.
fn valid_name(n: &str) -> bool {
    let Some((stem, ext)) = n.rsplit_once('.') else { return false };
    let Some((slot, tag)) = stem.split_once('-') else { return false };
    !slot.is_empty()
        && slot.chars().all(|c| c.is_ascii_lowercase())
        && !tag.is_empty()
        && tag.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && (2..=5).contains(&ext.len())
        && ext.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}
fn mime(path: &Path) -> Option<&'static str> {
    Some(match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => return None,
    })
}
fn slot_accepts(slot: &str, ext: &str) -> bool {
    let list: &[&str] = match slot {
        "background" => &["png", "jpg", "webp", "gif", "mp4", "webm"],
        "intro" => &["png", "jpg", "webp", "gif", "mp4", "webm"],
        "emblem" => &["svg", "png"],
        "boot" => &["gif", "mp4", "webm"],
        "font" => &["ttf", "otf"],
        _ => &[],
    };
    list.contains(&ext)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> R<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(e2s)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(e2s)?;
    fs::rename(&tmp, path).map_err(e2s)
}

/// Finder-launched apps don't get Homebrew's PATH, so look in the usual places.
fn ffmpeg() -> Option<PathBuf> {
    ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

fn login_shell() -> String {
    if let Ok(s) = std::env::var("SHELL") {
        if !s.is_empty() && Path::new(&s).exists() {
            return s;
        }
    }
    // GUI apps may not have $SHELL; ask Directory Services for the user's login shell.
    let user = std::env::var("USER").unwrap_or_default();
    if let Ok(out) = Command::new("/usr/bin/dscl").args([".", "-read", &format!("/Users/{user}"), "UserShell"]).output() {
        if let Some(s) = String::from_utf8_lossy(&out.stdout).split_whitespace().nth(1) {
            if Path::new(s).exists() {
                return s.to_string();
            }
        }
    }
    "/bin/zsh".into()
}

fn shell_name() -> String {
    Path::new(&login_shell()).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "zsh".into())
}

// ---------------------------------------------------------------- ptys

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
enum PtyEvent {
    Data(String),
    Exit(i32),
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    pid: i32,
    gen: u64,
}

#[derive(Default)]
struct Ptys {
    map: Mutex<HashMap<String, Session>>,
    gen: Mutex<u64>,
}

impl Ptys {
    fn kill(&self, id: &str) {
        if let Some(mut s) = self.map.lock().unwrap().remove(id) {
            let _ = s.child.kill();
        }
    }
    /// Removes the session only if it's still the one this reader thread belongs to.
    fn take_if(&self, id: &str, gen: u64) -> Option<Session> {
        let mut map = self.map.lock().unwrap();
        if map.get(id).is_some_and(|s| s.gen == gen) {
            map.remove(id)
        } else {
            None
        }
    }
}

#[tauri::command]
async fn pty_spawn(
    state: State<'_, Arc<Ptys>>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    channel: Channel<PtyEvent>,
) -> R<()> {
    let ptys = state.inner().clone();
    ptys.kill(&id); // spawn doubles as restart
    if ptys.map.lock().unwrap().len() >= MAX_PTYS {
        let _ = channel.send(PtyEvent::Data(format!("\r\n\x1b[31m[ultron: {MAX_PTYS} shells open, close one first]\x1b[0m\r\n")));
        return Ok(());
    }

    let pair = native_pty_system()
        .openpty(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 })
        .map_err(e2s)?;
    let mut cmd = CommandBuilder::new(login_shell());
    cmd.arg("-l"); // login shell: loads .zprofile/.zshrc so `claude` is on PATH
    let dir = cwd.map(PathBuf::from).filter(|p| p.is_dir()).unwrap_or_else(home);
    cmd.cwd(dir);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Ultron");
    if std::env::var("LANG").map(|l| l.is_empty()).unwrap_or(true) {
        cmd.env("LANG", "en_US.UTF-8"); // Finder-launched apps often have no locale
    }
    for k in SESSION_VARS {
        cmd.env_remove(k);
    }

    let child = pair.slave.spawn_command(cmd).map_err(e2s)?;
    drop(pair.slave);
    let pid = child.process_id().unwrap_or(0) as i32;
    let mut reader = pair.master.try_clone_reader().map_err(e2s)?;
    let writer = pair.master.take_writer().map_err(e2s)?;
    let gen = {
        let mut g = ptys.gen.lock().unwrap();
        *g += 1;
        *g
    };
    ptys.map.lock().unwrap().insert(id.clone(), Session { master: pair.master, writer, child, pid, gen });

    thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut carry: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    carry.extend_from_slice(&buf[..n]);
                    // Only send complete UTF-8; keep a split multi-byte char for the next read.
                    let text = match std::str::from_utf8(&carry) {
                        Ok(s) => {
                            let s = s.to_string();
                            carry.clear();
                            s
                        }
                        Err(e) if e.error_len().is_none() => {
                            let ok = e.valid_up_to();
                            let s = String::from_utf8_lossy(&carry[..ok]).into_owned();
                            carry.drain(..ok);
                            s
                        }
                        Err(_) => {
                            let s = String::from_utf8_lossy(&carry).into_owned();
                            carry.clear();
                            s
                        }
                    };
                    if !text.is_empty() && channel.send(PtyEvent::Data(text)).is_err() {
                        break;
                    }
                }
            }
        }
        // Killed sessions are already gone from the map: no exit event for those.
        if let Some(mut s) = ptys.take_if(&id, gen) {
            let code = s.child.wait().map(|st| st.exit_code() as i32).unwrap_or(-1);
            let _ = channel.send(PtyEvent::Exit(code));
        }
    });
    Ok(())
}

#[tauri::command]
async fn pty_write(state: State<'_, Arc<Ptys>>, id: String, data: String) -> R<()> {
    if let Some(s) = state.map.lock().unwrap().get_mut(&id) {
        s.writer.write_all(data.as_bytes()).map_err(e2s)?;
        let _ = s.writer.flush();
    }
    Ok(())
}

#[tauri::command]
async fn pty_resize(state: State<'_, Arc<Ptys>>, id: String, cols: u16, rows: u16) -> R<()> {
    if let Some(s) = state.map.lock().unwrap().get(&id) {
        s.master
            .resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 })
            .map_err(e2s)?;
    }
    Ok(())
}

#[tauri::command]
async fn pty_kill(state: State<'_, Arc<Ptys>>, id: String) -> R<()> {
    state.kill(&id);
    Ok(())
}

#[derive(Serialize)]
struct ShellStatus {
    fg: String,
    cwd: Option<String>,
    shell: String,
}

fn cmd_out(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Foreground process of the pty, asked of the OS (not guessed from output).
fn foreground(pid: i32, pgid: Option<i32>, shell: &str) -> String {
    let Some(pg) = pgid.filter(|&p| p > 0 && p != pid) else { return shell.into() };
    let Some(line) = cmd_out("/bin/ps", &["-o", "comm=,args=", "-p", &pg.to_string()]).filter(|l| !l.is_empty()) else {
        return shell.into();
    };
    // Native installs run as `claude`; npm installs run as `node …/claude`.
    if line.split_whitespace().any(|w| w.rsplit('/').next() == Some("claude")) {
        return "claude".into();
    }
    line.split_whitespace().next().and_then(|c| c.rsplit('/').next()).unwrap_or(shell).to_string()
}

fn cwd_of(pid: i32) -> Option<String> {
    let out = cmd_out("/usr/sbin/lsof", &["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])?;
    out.lines().find_map(|l| l.strip_prefix('n')).map(str::to_string)
}

#[tauri::command]
async fn pty_status(state: State<'_, Arc<Ptys>>, id: String) -> R<ShellStatus> {
    let shell = shell_name();
    let info = state.map.lock().unwrap().get(&id).map(|s| (s.pid, s.master.process_group_leader()));
    let Some((pid, pgid)) = info else { return Ok(ShellStatus { fg: shell.clone(), cwd: None, shell }) };
    tauri::async_runtime::spawn_blocking(move || ShellStatus { fg: foreground(pid, pgid, &shell), cwd: cwd_of(pid), shell })
        .await
        .map_err(e2s)
}

// ---------------------------------------------------------------- data

#[tauri::command]
async fn load_data() -> R<Value> {
    Ok(fs::read_to_string(data_dir().join("data.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null))
}

#[tauri::command]
async fn save_data(data: Value) -> R<()> {
    write_atomic(&data_dir().join("data.json"), serde_json::to_string_pretty(&data).map_err(e2s)?.as_bytes())
}

#[tauri::command]
async fn paths_exist(paths: Vec<String>) -> R<Vec<bool>> {
    Ok(paths.iter().map(|p| Path::new(p).exists()).collect())
}

#[tauri::command]
async fn user_info() -> R<Value> {
    let username = std::env::var("USER")
        .ok()
        .filter(|u| !u.is_empty())
        .or_else(|| cmd_out("/usr/bin/id", &["-un"]))
        .unwrap_or_default();
    Ok(json!({ "username": username, "home": home().to_string_lossy(), "ffmpeg": ffmpeg().is_some() }))
}

// ---------------------------------------------------------------- themes

#[tauri::command]
async fn list_themes() -> R<Vec<Value>> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(themes_dir()) {
        for e in entries.flatten() {
            let id = e.file_name().to_string_lossy().into_owned();
            if !valid_id(&id) {
                continue;
            }
            if let Some(v) = fs::read_to_string(e.path().join("theme.json")).ok().and_then(|s| serde_json::from_str(&s).ok()) {
                out.push(v);
            }
        }
    }
    Ok(out)
}

/// Deletes media the theme no longer references (older than a day: an unsaved draft may use newer ones).
fn prune_media(dir: &Path, theme_json: &str) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name == "theme.json" || theme_json.contains(&name) {
            continue;
        }
        let old = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| SystemTime::now().duration_since(t).ok())
            .is_some_and(|age| age > Duration::from_secs(24 * 3600));
        if old {
            let _ = fs::remove_file(e.path());
        }
    }
}

#[tauri::command]
async fn save_theme(theme: Value) -> R<()> {
    let id = theme.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
    if !valid_id(&id) {
        return Err("bad theme id".into());
    }
    let text = serde_json::to_string_pretty(&theme).map_err(e2s)?;
    let dir = themes_dir().join(&id);
    write_atomic(&dir.join("theme.json"), text.as_bytes())?;
    prune_media(&dir, &text);
    Ok(())
}

#[tauri::command]
async fn delete_theme(id: String) -> R<()> {
    if !valid_id(&id) {
        return Err("bad theme id".into());
    }
    let _ = fs::remove_dir_all(themes_dir().join(id));
    Ok(())
}

fn short_tag() -> String {
    let ms = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let mut n = ms;
    let mut s = String::new();
    while n > 0 {
        let d = (n % 36) as u32;
        s.insert(0, std::char::from_digit(d, 36).unwrap());
        n /= 36;
    }
    s
}

/// GIF → H.264 MP4: far cheaper to play than an animated GIF. None if ffmpeg can't.
fn gif_to_mp4(src: &Path) -> Option<PathBuf> {
    let bin = ffmpeg()?;
    let out = src.with_extension("mp4");
    let ok = Command::new(bin)
        .args(["-y", "-loglevel", "error", "-i"])
        .arg(src)
        .args(["-movflags", "+faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"])
        .args(["-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-an"])
        .arg(&out)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        Some(out)
    } else {
        let _ = fs::remove_file(&out);
        None
    }
}

/// Raw-body upload: bytes in the body, theme/slot/name in headers.
#[tauri::command]
async fn theme_upload(request: tauri::ipc::Request<'_>) -> R<Value> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw bytes".into()) };
    if bytes.len() > MAX_UPLOAD {
        return Err("file too large (200 MB max)".into());
    }
    let h = |k: &str| request.headers().get(k).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
    let (id, slot, name) = (h("x-theme"), h("x-slot"), h("x-name"));
    if !valid_id(&id) {
        return Err("bad theme id".into());
    }
    let mut ext = Path::new(&name).extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    if ext == "jpeg" {
        ext = "jpg".into();
    }
    if !slot_accepts(&slot, &ext) {
        return Err(format!("{slot} doesn't accept .{ext} files"));
    }
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = themes_dir().join(&id);
        fs::create_dir_all(&dir).map_err(e2s)?;
        let file = format!("{slot}-{}.{ext}", short_tag());
        let dest = dir.join(&file);
        fs::write(&dest, &bytes).map_err(e2s)?;
        if ext == "gif" && slot != "emblem" {
            if let Some(mp4) = gif_to_mp4(&dest) {
                let _ = fs::remove_file(&dest);
                let f = mp4.file_name().unwrap().to_string_lossy().into_owned();
                return Ok(json!({ "file": f, "kind": "video", "converted": true }));
            }
        }
        let kind = match ext.as_str() {
            "mp4" | "webm" => "video",
            "gif" => "gif",
            "ttf" | "otf" => "font",
            _ => "image",
        };
        Ok(json!({ "file": file, "kind": kind, "converted": false }))
    })
    .await
    .map_err(e2s)?
}

#[tauri::command]
async fn export_theme(id: String) -> R<String> {
    if !valid_id(&id) {
        return Err("bad theme id".into());
    }
    let dir = themes_dir().join(&id);
    let text = fs::read_to_string(dir.join("theme.json")).map_err(e2s)?;
    let theme: Value = serde_json::from_str(&text).map_err(e2s)?;
    let mut files = serde_json::Map::new();
    for e in fs::read_dir(&dir).map_err(e2s)?.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name != "theme.json" && valid_name(&name) && text.contains(&name) {
            files.insert(name, Value::String(B64.encode(fs::read(e.path()).map_err(e2s)?)));
        }
    }
    Ok(json!({ "ultronTheme": 1, "theme": theme, "files": files }).to_string())
}

#[tauri::command]
async fn import_theme(json_text: String) -> R<Value> {
    let pkg: Value = serde_json::from_str(&json_text).map_err(|_| "not a theme file".to_string())?;
    // Theme files from before the rename (nocturneTheme) still import.
    let version = pkg.get("ultronTheme").or_else(|| pkg.get("nocturneTheme")).and_then(Value::as_i64);
    let Some(theme) = pkg.get("theme").filter(|t| t.is_object() && version == Some(1)) else {
        return Err("not an Ultron theme file".into());
    };
    let name = theme.get("name").and_then(Value::as_str).unwrap_or("theme");
    let mut slug: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    slug = slug.trim_matches('-').chars().take(30).collect();
    if slug.is_empty() {
        slug = "theme".into();
    }
    let tag = short_tag();
    let id = format!("{slug}-{}", &tag[tag.len().saturating_sub(6)..]); // the fast-changing end
    let dir = themes_dir().join(&id);
    fs::create_dir_all(&dir).map_err(e2s)?;
    if let Some(files) = pkg.get("files").and_then(Value::as_object) {
        for (fname, b64) in files {
            if !valid_name(fname) || mime(Path::new(fname)).is_none() {
                continue;
            }
            if let Some(bytes) = b64.as_str().and_then(|s| B64.decode(s).ok()) {
                fs::write(dir.join(fname), bytes).map_err(e2s)?;
            }
        }
    }
    let mut saved = theme.clone();
    saved["id"] = Value::String(id);
    saved["builtin"] = Value::Bool(false);
    write_atomic(&dir.join("theme.json"), serde_json::to_string_pretty(&saved).map_err(e2s)?.as_bytes())?;
    Ok(saved)
}

/// Native save panel + write (theme export). The path never comes from the web view.
#[tauri::command]
async fn save_file_dialog(app: tauri::AppHandle, name: String, contents: String) -> R<bool> {
    let picked = app.dialog().file().set_file_name(&name).add_filter("JSON", &["json"]).blocking_save_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(false) };
    fs::write(path, contents).map_err(e2s)?;
    Ok(true)
}

// ---------------------------------------------------------------- media:// protocol

/// `media://localhost/<theme id>/<file>` → ~/.ultron/themes/<id>/<file>, with Range support
/// (WebKit's <video> requires it) and CORS so stills can be read back from a canvas.
fn media_response(req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let fail = |code: StatusCode| Response::builder().status(code).body(Vec::new()).unwrap();
    let path = req.uri().path().trim_start_matches('/').to_string();
    let decoded = percent_decode(&path);
    let mut parts = decoded.splitn(2, '/');
    let (Some(id), Some(name)) = (parts.next(), parts.next()) else { return fail(StatusCode::BAD_REQUEST) };
    if !valid_id(id) || !valid_name(name) {
        return fail(StatusCode::FORBIDDEN);
    }
    let file_path = themes_dir().join(id).join(name);
    let Some(ct) = mime(&file_path) else { return fail(StatusCode::FORBIDDEN) };
    let Ok(mut f) = fs::File::open(&file_path) else { return fail(StatusCode::NOT_FOUND) };
    let size = f.metadata().map(|m| m.len()).unwrap_or(0);

    let base = || {
        Response::builder()
            .header(header::CONTENT_TYPE, ct)
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
    };
    let range = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|r| r.strip_prefix("bytes="));
    if let Some(r) = range {
        let (a, b) = r.split_once('-').unwrap_or((r, ""));
        let (start, mut end) = match (a.parse::<u64>().ok(), b.parse::<u64>().ok()) {
            (Some(s), Some(e)) => (s, e.min(size.saturating_sub(1))),
            (Some(s), None) => (s, size.saturating_sub(1)),
            (None, Some(n)) => (size.saturating_sub(n), size.saturating_sub(1)),
            _ => return fail(StatusCode::RANGE_NOT_SATISFIABLE),
        };
        if start >= size || start > end {
            return base().status(StatusCode::RANGE_NOT_SATISFIABLE).header(header::CONTENT_RANGE, format!("bytes */{size}")).body(Vec::new()).unwrap();
        }
        end = end.min(start + 8 * 1024 * 1024 - 1); // serve at most 8 MB per request; the player asks again
        let mut buf = vec![0u8; (end - start + 1) as usize];
        if f.seek(SeekFrom::Start(start)).and_then(|_| f.read_exact(&mut buf)).is_err() {
            return fail(StatusCode::INTERNAL_SERVER_ERROR);
        }
        return base()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"))
            .header(header::CONTENT_LENGTH, buf.len())
            .body(buf)
            .unwrap();
    }
    let mut buf = Vec::with_capacity(size as usize);
    if f.read_to_end(&mut buf).is_err() {
        return fail(StatusCode::INTERNAL_SERVER_ERROR);
    }
    base().status(StatusCode::OK).header(header::CONTENT_LENGTH, buf.len()).body(buf).unwrap()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ---------------------------------------------------------------- app

/// macOS menu without the default ⌘W "Close Window", so ⌘T/⌘W/⌘D/⌘1… reach the app's tab shortcuts.
/// Edit stays: text fields need it for ⌘C/⌘V/⌘X/⌘A/⌘Z.
fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "Ultron",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Ultron"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Ptys::default()))
        .register_asynchronous_uri_scheme_protocol("media", |_ctx, request, responder| {
            thread::spawn(move || responder.respond(media_response(&request)));
        })
        .setup(|app| {
            let menu = build_menu(app)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn, pty_write, pty_resize, pty_kill, pty_status,
            load_data, save_data, paths_exist, user_info,
            list_themes, save_theme, delete_theme, theme_upload, export_theme, import_theme, save_file_dialog,
        ])
        .on_window_event(|window, event| {
            // Closing the window ends every shell (they'd get SIGHUP anyway when the app exits).
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(ptys) = window.try_state::<Arc<Ptys>>() {
                    let ids: Vec<String> = ptys.map.lock().unwrap().keys().cloned().collect();
                    ids.iter().for_each(|id| ptys.kill(id));
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Ultron");
}
