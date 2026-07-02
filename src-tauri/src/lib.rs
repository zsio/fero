use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread::sleep,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

#[derive(Default)]
struct AppState {
    rclone: Mutex<RcloneManager>,
}

#[derive(Default)]
struct RcloneManager {
    daemon: Option<RcloneDaemon>,
    last_error: Option<String>,
}

struct RcloneDaemon {
    endpoint: String,
    username: String,
    password: String,
    source: String,
    process: RcloneProcess,
}

enum RcloneProcess {
    Sidecar(CommandChild),
    System(Child),
}

impl RcloneProcess {
    fn kill(self) -> Result<(), String> {
        match self {
            Self::Sidecar(child) => child.kill().map_err(|err| err.to_string()),
            Self::System(mut child) => {
                let _ = child.kill();
                let _ = child.wait();
                Ok(())
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppOverview {
    product_name: String,
    app_version: String,
    paths: AppPaths,
    daemon: DaemonStatus,
    mount_environment: MountEnvironment,
    drives: Vec<SavedDrive>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    app_config_dir: String,
    rclone_config: String,
    rclone_log: String,
    rclone_cache: String,
    default_mount_root: String,
    activity_log: String,
    drive_catalog: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DaemonStatus {
    running: bool,
    endpoint: Option<String>,
    source: Option<String>,
    config_path: String,
    log_path: String,
    version: Option<Value>,
    last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MountEnvironment {
    platform: String,
    requirement: String,
    state: String,
    summary: String,
    recommendation: String,
    detected_paths: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkDriveRequest {
    protocol: String,
    display_name: String,
    mount_point: String,
    url: Option<String>,
    host: Option<String>,
    port: Option<String>,
    username: Option<String>,
    password: Option<String>,
    domain: Option<String>,
    share: Option<String>,
    remote_path: Option<String>,
    webdav_vendor: Option<String>,
    cache_mode: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkDriveResult {
    protocol: String,
    display_name: String,
    remote_name: String,
    fs: String,
    mount_point: String,
    cache_mode: String,
    drive: SavedDrive,
    remote: Value,
    mount: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkDriveTestResult {
    ok: bool,
    protocol: String,
    fs: String,
    summary: String,
    recommendation: String,
    details: Option<String>,
    item_count: Option<usize>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDriveResult {
    drive: SavedDrive,
    remote: Value,
    remounted: bool,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoveDriveResult {
    drive: SavedDrive,
    unmount: Option<Value>,
    remote: Option<Value>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreDrivesResult {
    attempted: usize,
    mounted: usize,
    skipped: usize,
    items: Vec<RestoreDriveItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestoreDriveItem {
    drive: SavedDrive,
    mounted: bool,
    status: String,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveIssue {
    summary: String,
    recommendation: String,
    details: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MountDriveResult {
    drive: SavedDrive,
    mounted: bool,
    mount: Option<Value>,
    issue: Option<DriveIssue>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveCacheStatus {
    drive_id: String,
    cache_mode: String,
    cache_root: String,
    drive_cache_paths: Vec<String>,
    drive_bytes: u64,
    total_bytes: u64,
    file_count: u64,
    mounted: bool,
    last_scanned_at: u128,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearDriveCacheResult {
    status: DriveCacheStatus,
    removed_bytes: u64,
    removed_paths: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MountPointSuggestion {
    root: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityLogEntry {
    id: String,
    timestamp: String,
    level: String,
    source: String,
    message: String,
    raw: String,
}

fn default_auto_mount() -> bool {
    true
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedDrive {
    id: String,
    display_name: String,
    protocol: String,
    remote_name: String,
    fs: String,
    mount_point: String,
    remote_path: String,
    cache_mode: String,
    #[serde(default = "default_auto_mount")]
    auto_mount: bool,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    domain: Option<String>,
    #[serde(default)]
    share: Option<String>,
    #[serde(default)]
    webdav_vendor: Option<String>,
    #[serde(default)]
    last_mount_state: Option<String>,
    #[serde(default)]
    last_issue_summary: Option<String>,
    #[serde(default)]
    last_issue_recommendation: Option<String>,
    #[serde(default)]
    last_issue_details: Option<String>,
    #[serde(default)]
    last_checked_at: Option<u128>,
    created_at: u128,
}

impl RcloneManager {
    fn status(&self, paths: &AppPaths) -> DaemonStatus {
        let version = self
            .daemon
            .as_ref()
            .and_then(|daemon| self.call_rc_with(daemon, "core/version", json!({})).ok());

        DaemonStatus {
            running: self.daemon.is_some(),
            endpoint: self.daemon.as_ref().map(|daemon| daemon.endpoint.clone()),
            source: self.daemon.as_ref().map(|daemon| daemon.source.clone()),
            config_path: paths.rclone_config.clone(),
            log_path: paths.rclone_log.clone(),
            version,
            last_error: self.last_error.clone(),
        }
    }

    fn ensure_started(&mut self, app: &AppHandle) -> Result<(), String> {
        if self.daemon.is_some() {
            return Ok(());
        }

        self.start(app).map(|_| ())
    }

    fn start(&mut self, app: &AppHandle) -> Result<DaemonStatus, String> {
        if self.daemon.is_some() {
            let paths = resolve_paths(app)?;
            return Ok(self.status(&paths));
        }

        let paths = resolve_pathbufs(app)?;
        let port = pick_local_port()?;
        let endpoint = format!("http://127.0.0.1:{port}");
        let username = "fero".to_string();
        let password = generate_password();
        let rc_addr = format!("127.0.0.1:{port}");

        let args = vec![
            "rcd".to_string(),
            "--rc-addr".to_string(),
            rc_addr,
            "--rc-user".to_string(),
            username.clone(),
            "--rc-pass".to_string(),
            password.clone(),
            "--config".to_string(),
            paths.rclone_config.display().to_string(),
            "--cache-dir".to_string(),
            paths.rclone_cache.display().to_string(),
            "--log-file".to_string(),
            paths.rclone_log.display().to_string(),
            "--log-format".to_string(),
            "date,time,microseconds".to_string(),
            "--use-json-log".to_string(),
            "-vv".to_string(),
        ];

        let (process, source) = spawn_rclone(app, &args).map_err(|err| {
            let message = format!(
                "{err}. Add the bundled sidecar at src-tauri/bin/rclone-<target-triple>, set FERO_RCLONE_BIN, or install rclone on PATH for development."
            );
            self.last_error = Some(message.clone());
            message
        })?;

        self.daemon = Some(RcloneDaemon {
            endpoint,
            username,
            password,
            source,
            process,
        });

        if let Err(err) = self.wait_until_ready() {
            self.last_error = Some(err.clone());
            if let Some(daemon) = self.daemon.take() {
                let _ = daemon.process.kill();
            }
            return Err(err);
        }

        self.last_error = None;
        Ok(self.status(&resolve_paths(app)?))
    }

    fn wait_until_ready(&self) -> Result<(), String> {
        let daemon = self
            .daemon
            .as_ref()
            .ok_or("rclone daemon was not started")?;

        for _ in 0..40 {
            if self.call_rc_with(daemon, "core/version", json!({})).is_ok() {
                return Ok(());
            }
            sleep(Duration::from_millis(150));
        }

        Err("rclone rc daemon did not become ready".to_string())
    }

    fn stop(&mut self, app: &AppHandle) -> Result<DaemonStatus, String> {
        if let Some(daemon) = self.daemon.as_ref() {
            let _ = self.call_rc_with(daemon, "mount/unmountall", json!({}));
            let _ = self.call_rc_with(daemon, "core/quit", json!({}));
        }

        if let Some(daemon) = self.daemon.take() {
            let _ = daemon.process.kill();
        }

        Ok(self.status(&resolve_paths(app)?))
    }

    fn call_rc(&self, endpoint: &str, payload: Value) -> Result<Value, String> {
        let daemon = self.daemon.as_ref().ok_or("rclone daemon is not running")?;
        self.call_rc_with(daemon, endpoint, payload)
    }

    fn call_rc_with(
        &self,
        daemon: &RcloneDaemon,
        endpoint: &str,
        payload: Value,
    ) -> Result<Value, String> {
        post_json(
            &daemon.endpoint,
            endpoint,
            &daemon.username,
            &daemon.password,
            &payload,
        )
    }
}

fn spawn_rclone(app: &AppHandle, args: &[String]) -> Result<(RcloneProcess, String), String> {
    if let Ok(path) = std::env::var("FERO_RCLONE_BIN") {
        if !path.trim().is_empty() {
            let child = Command::new(&path)
                .args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|err| format!("failed to spawn FERO_RCLONE_BIN {path}: {err}"))?;
            return Ok((RcloneProcess::System(child), format!("env:{path}")));
        }
    }

    match app.shell().sidecar("rclone") {
        Ok(command) => {
            let (mut rx, child) = command
                .args(args.to_vec())
                .spawn()
                .map_err(|err| format!("failed to spawn bundled rclone sidecar: {err}"))?;

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            let _ = String::from_utf8_lossy(&line);
                        }
                        _ => {}
                    }
                }
            });

            Ok((RcloneProcess::Sidecar(child), "sidecar".to_string()))
        }
        Err(sidecar_error) => {
            let child = Command::new("rclone")
                .args(args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|system_error| {
                    format!(
                        "failed to resolve bundled sidecar ({sidecar_error}) and system rclone ({system_error})"
                    )
                })?;
            Ok((RcloneProcess::System(child), "path:rclone".to_string()))
        }
    }
}

fn post_json(
    base_url: &str,
    endpoint: &str,
    username: &str,
    password: &str,
    payload: &Value,
) -> Result<Value, String> {
    let address = base_url
        .strip_prefix("http://")
        .ok_or("only http rclone rc endpoints are supported")?;
    let path = format!("/{}", endpoint.trim_start_matches('/'));
    let body = payload.to_string();
    let auth = base64_encode(format!("{username}:{password}").as_bytes());

    let mut stream = TcpStream::connect(address).map_err(|err| err.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|err| err.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|err| err.to_string())?;

    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {address}\r\nAuthorization: Basic {auth}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|err| err.to_string())?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|err| err.to_string())?;

    let (headers, mut body_bytes) = split_http_response(&response)?;
    let status_line = headers.lines().next().unwrap_or_default();
    let ok = status_line.contains(" 200 ")
        || status_line.contains(" 201 ")
        || status_line.contains(" 204 ");
    if headers
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        body_bytes = decode_chunked(&body_bytes)?;
    }

    let text = String::from_utf8_lossy(&body_bytes).trim().to_string();
    if !ok {
        return Err(format!(
            "rclone rc {endpoint} failed with {status_line}: {text}"
        ));
    }
    if text.is_empty() {
        return Ok(json!({}));
    }

    serde_json::from_str(&text).map_err(|err| format!("invalid rclone rc json: {err}: {text}"))
}

fn split_http_response(response: &[u8]) -> Result<(String, Vec<u8>), String> {
    let delimiter = b"\r\n\r\n";
    let index = response
        .windows(delimiter.len())
        .position(|window| window == delimiter)
        .ok_or("invalid HTTP response from rclone rc")?;
    let headers = String::from_utf8_lossy(&response[..index]).to_string();
    let body = response[index + delimiter.len()..].to_vec();
    Ok((headers, body))
}

fn decode_chunked(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut index = 0;
    let mut decoded = Vec::new();

    loop {
        let size_end = find_crlf(body, index).ok_or("invalid chunked response")?;
        let size_text = String::from_utf8_lossy(&body[index..size_end]);
        let size = usize::from_str_radix(size_text.trim(), 16)
            .map_err(|err| format!("invalid chunk size: {err}"))?;
        index = size_end + 2;
        if size == 0 {
            break;
        }
        if index + size > body.len() {
            return Err("truncated chunked response".to_string());
        }
        decoded.extend_from_slice(&body[index..index + size]);
        index += size + 2;
    }

    Ok(decoded)
}

fn find_crlf(bytes: &[u8], start: usize) -> Option<usize> {
    bytes[start..]
        .windows(2)
        .position(|window| window == b"\r\n")
        .map(|offset| start + offset)
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::new();

    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(b0 >> 2) as usize] as char);
        output.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }

    output
}

fn pick_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn generate_password() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("fero-{}-{nanos}", std::process::id())
}

fn resolve_pathbufs(app: &AppHandle) -> Result<ResolvedPaths, String> {
    let config_dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    let cache_dir = app.path().app_cache_dir().map_err(|err| err.to_string())?;
    let log_dir = app.path().app_log_dir().map_err(|err| err.to_string())?;
    let rclone_dir = config_dir.join("rclone");
    let rclone_cache = cache_dir.join("rclone");
    let default_mount_root = app
        .path()
        .home_dir()
        .map(|home| home.join("Fero Drives"))
        .unwrap_or_else(|_| config_dir.join("mounts"));

    std::fs::create_dir_all(&rclone_dir).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&rclone_cache).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|err| err.to_string())?;

    Ok(ResolvedPaths {
        app_config_dir: config_dir.clone(),
        rclone_config: rclone_dir.join("rclone.conf"),
        rclone_cache,
        default_mount_root,
        activity_log: log_dir.join("activity.jsonl"),
        rclone_log: log_dir.join("rclone.jsonl"),
        drive_catalog: config_dir.join("drives.json"),
    })
}

fn resolve_paths(app: &AppHandle) -> Result<AppPaths, String> {
    let paths = resolve_pathbufs(app)?;
    Ok(AppPaths {
        app_config_dir: paths.app_config_dir.display().to_string(),
        rclone_config: paths.rclone_config.display().to_string(),
        rclone_cache: paths.rclone_cache.display().to_string(),
        default_mount_root: paths.default_mount_root.display().to_string(),
        activity_log: paths.activity_log.display().to_string(),
        rclone_log: paths.rclone_log.display().to_string(),
        drive_catalog: paths.drive_catalog.display().to_string(),
    })
}

fn existing_paths(paths: &[&str]) -> Vec<String> {
    paths
        .iter()
        .filter(|path| Path::new(path).exists())
        .map(|path| path.to_string())
        .collect()
}

fn inspect_mount_environment() -> MountEnvironment {
    if cfg!(target_os = "macos") {
        let detected_paths = existing_paths(&[
            "/Library/Filesystems/macfuse.fs",
            "/Library/Filesystems/osxfuse.fs",
            "/Library/PreferencePanes/macFUSE.prefPane",
            "/usr/local/bin/mount_macfuse",
        ]);
        if detected_paths.is_empty() {
            return MountEnvironment {
                platform: "macOS".to_string(),
                requirement: "macFUSE".to_string(),
                state: "needsSetup".to_string(),
                summary: "macFUSE is not detected.".to_string(),
                recommendation:
                    "Install macFUSE before mounting network drives, then restart Fero.".to_string(),
                detected_paths,
            };
        }

        return MountEnvironment {
            platform: "macOS".to_string(),
            requirement: "macFUSE".to_string(),
            state: "ready".to_string(),
            summary: "macFUSE is available.".to_string(),
            recommendation:
                "Fero can mount drives on this Mac. Keep macFUSE approved in System Settings."
                    .to_string(),
            detected_paths,
        };
    }

    if cfg!(target_os = "windows") {
        let detected_paths = existing_paths(&[
            r"C:\Program Files (x86)\WinFsp\bin\winfsp-x64.dll",
            r"C:\Program Files\WinFsp\bin\winfsp-x64.dll",
            r"C:\Program Files (x86)\WinFsp\bin\launchctl-x64.exe",
            r"C:\Program Files\WinFsp\bin\launchctl-x64.exe",
        ]);
        if detected_paths.is_empty() {
            return MountEnvironment {
                platform: "Windows".to_string(),
                requirement: "WinFsp".to_string(),
                state: "needsSetup".to_string(),
                summary: "WinFsp is not detected.".to_string(),
                recommendation: "Install WinFsp before mounting network drives, then restart Fero."
                    .to_string(),
                detected_paths,
            };
        }

        return MountEnvironment {
            platform: "Windows".to_string(),
            requirement: "WinFsp".to_string(),
            state: "ready".to_string(),
            summary: "WinFsp is available.".to_string(),
            recommendation: "Fero can mount drives on this Windows machine.".to_string(),
            detected_paths,
        };
    }

    if cfg!(target_os = "linux") {
        let detected_paths = existing_paths(&["/dev/fuse"]);
        if detected_paths.is_empty() {
            return MountEnvironment {
                platform: "Linux / Docker".to_string(),
                requirement: "FUSE device".to_string(),
                state: "limited".to_string(),
                summary: "FUSE is not available to this process.".to_string(),
                recommendation:
                    "For Docker/server mode, expose /dev/fuse and the required mount capabilities."
                        .to_string(),
                detected_paths,
            };
        }

        return MountEnvironment {
            platform: "Linux / Docker".to_string(),
            requirement: "FUSE device".to_string(),
            state: "ready".to_string(),
            summary: "FUSE is available.".to_string(),
            recommendation: "Fero can request mounts in this environment.".to_string(),
            detected_paths,
        };
    }

    MountEnvironment {
        platform: std::env::consts::OS.to_string(),
        requirement: "Mount support".to_string(),
        state: "unknown".to_string(),
        summary: "Mount support is not verified on this platform.".to_string(),
        recommendation: "Use macOS, Windows, or Docker/server mode for the first release."
            .to_string(),
        detected_paths: Vec::new(),
    }
}

fn text_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(ToString::to_string)
}

fn parse_activity_log_line(prefix: &str, index: usize, line: &str) -> ActivityLogEntry {
    match serde_json::from_str::<Value>(line) {
        Ok(value) => {
            let timestamp = text_field(&value, &["time", "Time", "timestamp", "Timestamp"])
                .unwrap_or_else(|| "unknown time".to_string());
            let level = text_field(&value, &["level", "Level", "severity", "Severity"])
                .unwrap_or_else(|| "info".to_string());
            let source = text_field(
                &value,
                &["source", "Source", "object", "Object", "fs", "Fs"],
            )
            .unwrap_or_else(|| "rclone".to_string());
            let message = text_field(
                &value,
                &["msg", "Msg", "message", "Message", "error", "Error"],
            )
            .unwrap_or_else(|| line.to_string());

            ActivityLogEntry {
                id: format!("{prefix}-{index}-{timestamp}"),
                timestamp,
                level,
                source,
                message,
                raw: line.to_string(),
            }
        }
        Err(_) => ActivityLogEntry {
            id: format!("{prefix}-{index}-raw"),
            timestamp: "unknown time".to_string(),
            level: "info".to_string(),
            source: prefix.to_string(),
            message: line.to_string(),
            raw: line.to_string(),
        },
    }
}

fn read_recent_activity_file(
    path: &Path,
    prefix: &str,
    limit: usize,
) -> Result<Vec<ActivityLogEntry>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let text = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read activity log {}: {err}", path.display()))?;
    let lines = text
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .collect::<Vec<_>>();
    let start = lines.len().saturating_sub(limit);
    Ok(lines[start..]
        .iter()
        .rev()
        .map(|(index, line)| parse_activity_log_line(prefix, *index, line))
        .collect())
}

fn activity_sort_key(entry: &ActivityLogEntry) -> u128 {
    entry.timestamp.parse::<u128>().unwrap_or_default()
}

fn read_recent_activity(app: &AppHandle, limit: usize) -> Result<Vec<ActivityLogEntry>, String> {
    let paths = resolve_pathbufs(app)?;
    let mut entries = read_recent_activity_file(&paths.activity_log, "Fero", limit)?;
    entries.extend(read_recent_activity_file(
        &paths.rclone_log,
        "rclone",
        limit,
    )?);
    entries.sort_by(|left, right| activity_sort_key(right).cmp(&activity_sort_key(left)));
    entries.truncate(limit);
    Ok(entries)
}

fn record_activity(
    app: &AppHandle,
    level: &str,
    source: &str,
    message: &str,
) -> Result<(), String> {
    let paths = resolve_pathbufs(app)?;
    let timestamp = now_millis().to_string();
    let entry = ActivityLogEntry {
        id: format!("fero-{timestamp}"),
        timestamp,
        level: level.to_string(),
        source: source.to_string(),
        message: message.to_string(),
        raw: message.to_string(),
    };
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&paths.activity_log)
        .map_err(|err| {
            format!(
                "failed to open activity log {}: {err}",
                paths.activity_log.display()
            )
        })?;
    let line = serde_json::to_string(&entry)
        .map_err(|err| format!("failed to serialize activity log entry: {err}"))?;
    writeln!(file, "{line}").map_err(|err| {
        format!(
            "failed to write activity log {}: {err}",
            paths.activity_log.display()
        )
    })
}

struct ResolvedPaths {
    app_config_dir: PathBuf,
    rclone_config: PathBuf,
    rclone_cache: PathBuf,
    default_mount_root: PathBuf,
    activity_log: PathBuf,
    rclone_log: PathBuf,
    drive_catalog: PathBuf,
}

fn lock_manager<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, RcloneManager>, String> {
    state
        .rclone
        .lock()
        .map_err(|_| "rclone manager lock poisoned".to_string())
}

fn required_text(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(trimmed.to_string())
    }
}

fn optional_text(value: &Option<String>) -> Option<String> {
    value
        .as_ref()
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn push_param(params: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        params.insert(key.to_string(), Value::String(value));
    }
}

fn protocol_parameters(
    request: &NetworkDriveRequest,
) -> Result<(String, Map<String, Value>), String> {
    let protocol = request.protocol.trim().to_ascii_lowercase();
    let mut params = Map::new();

    match protocol.as_str() {
        "webdav" => {
            let url = optional_text(&request.url).ok_or("WebDAV address is required")?;
            params.insert("url".to_string(), Value::String(url));
            params.insert(
                "vendor".to_string(),
                Value::String(
                    optional_text(&request.webdav_vendor).unwrap_or_else(|| "other".to_string()),
                ),
            );
            push_param(&mut params, "user", optional_text(&request.username));
            push_param(&mut params, "pass", optional_text(&request.password));
        }
        "ftp" => {
            let host = optional_text(&request.host).ok_or("FTP server address is required")?;
            params.insert("host".to_string(), Value::String(host));
            push_param(&mut params, "port", optional_text(&request.port));
            push_param(&mut params, "user", optional_text(&request.username));
            push_param(&mut params, "pass", optional_text(&request.password));
        }
        "sftp" => {
            let host = optional_text(&request.host).ok_or("SFTP server address is required")?;
            params.insert("host".to_string(), Value::String(host));
            push_param(&mut params, "port", optional_text(&request.port));
            push_param(&mut params, "user", optional_text(&request.username));
            push_param(&mut params, "pass", optional_text(&request.password));
        }
        "smb" => {
            let host = optional_text(&request.host).ok_or("SMB server address is required")?;
            params.insert("host".to_string(), Value::String(host));
            push_param(&mut params, "user", optional_text(&request.username));
            push_param(&mut params, "pass", optional_text(&request.password));
            push_param(&mut params, "domain", optional_text(&request.domain));
        }
        _ => return Err(format!("unsupported protocol: {protocol}")),
    }

    Ok((protocol, params))
}

fn build_remote_name(display_name: &str, protocol: &str) -> String {
    let slug = display_name
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric() {
                Some(character.to_ascii_lowercase())
            } else if character.is_whitespace() || matches!(character, '-' | '_') {
                Some('_')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    let slug = if slug.is_empty() { "drive" } else { &slug };
    format!("{protocol}_{slug}_{}", short_nonce())
}

fn mount_folder_name(display_name: &str) -> String {
    let mut result = String::new();
    let mut pending_space = false;

    for character in display_name.trim().chars() {
        let invalid = character.is_control()
            || matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            );

        if invalid || character.is_whitespace() {
            pending_space = !result.is_empty();
            continue;
        }

        if pending_space {
            result.push(' ');
            pending_space = false;
        }
        result.push(character);
    }

    let cleaned = result.trim_matches([' ', '.']).to_string();
    if cleaned.is_empty() {
        "Network Drive".to_string()
    } else {
        cleaned
    }
}

fn suggested_mount_path(
    app: &AppHandle,
    display_name: &str,
    exclude_drive_id: Option<&str>,
) -> Result<PathBuf, String> {
    let paths = resolve_pathbufs(app)?;
    let folder_name = mount_folder_name(display_name);
    let drives = read_drive_catalog(app)?;
    let existing_mounts = drives
        .iter()
        .filter(|drive| Some(drive.id.as_str()) != exclude_drive_id)
        .map(|drive| drive.mount_point.as_str())
        .collect::<Vec<_>>();

    for index in 1..=999 {
        let name = if index == 1 {
            folder_name.clone()
        } else {
            format!("{folder_name} {index}")
        };
        let candidate = paths.default_mount_root.join(name);
        let candidate_text = candidate.display().to_string();
        if !existing_mounts.iter().any(|path| *path == candidate_text) {
            return Ok(candidate);
        }
    }

    Err("could not create a unique suggested mount folder".to_string())
}

fn short_nonce() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{:x}", nanos % 0xffff_ffff)
}

fn build_remote_fs(
    remote_name: &str,
    protocol: &str,
    share: &Option<String>,
    remote_path: &Option<String>,
) -> Result<String, String> {
    let path = optional_text(remote_path).unwrap_or_default();

    if protocol == "smb" {
        let share = optional_text(share).ok_or("SMB share name is required")?;
        let path = path.trim_start_matches('/');
        if path.is_empty() {
            return Ok(format!("{remote_name}:{share}"));
        }
        return Ok(format!("{remote_name}:{share}/{path}"));
    }

    if path.is_empty() || path == "/" {
        Ok(format!("{remote_name}:"))
    } else {
        Ok(format!("{remote_name}:{path}"))
    }
}

fn cache_mode_value(mode: &Option<String>) -> (String, u8) {
    match optional_text(mode)
        .unwrap_or_else(|| "smart".to_string())
        .as_str()
    {
        "off" => ("off".to_string(), 0),
        "full" => ("full".to_string(), 3),
        _ => ("smart".to_string(), 2),
    }
}

fn cache_mode_number(mode: &str) -> u8 {
    match mode {
        "off" => 0,
        "full" => 3,
        _ => 2,
    }
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn read_drive_catalog(app: &AppHandle) -> Result<Vec<SavedDrive>, String> {
    let paths = resolve_pathbufs(app)?;
    if !paths.drive_catalog.exists() {
        return Ok(Vec::new());
    }

    let text = std::fs::read_to_string(&paths.drive_catalog).map_err(|err| {
        format!(
            "failed to read drive catalog {}: {err}",
            paths.drive_catalog.display()
        )
    })?;
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&text).map_err(|err| {
        format!(
            "failed to parse drive catalog {}: {err}",
            paths.drive_catalog.display()
        )
    })
}

fn write_drive_catalog(app: &AppHandle, drives: &[SavedDrive]) -> Result<(), String> {
    let paths = resolve_pathbufs(app)?;
    let text = serde_json::to_string_pretty(drives)
        .map_err(|err| format!("failed to serialize drive catalog: {err}"))?;
    std::fs::write(&paths.drive_catalog, text).map_err(|err| {
        format!(
            "failed to write drive catalog {}: {err}",
            paths.drive_catalog.display()
        )
    })
}

fn save_drive(app: &AppHandle, drive: SavedDrive) -> Result<SavedDrive, String> {
    let mut drives = read_drive_catalog(app)?;
    drives.retain(|item| {
        item.id != drive.id
            && item.remote_name != drive.remote_name
            && item.mount_point != drive.mount_point
    });
    drives.push(drive.clone());
    drives.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    write_drive_catalog(app, &drives)?;
    Ok(drive)
}

fn delete_drive(app: &AppHandle, drive_id: &str) -> Result<SavedDrive, String> {
    let mut drives = read_drive_catalog(app)?;
    let index = drives
        .iter()
        .position(|drive| drive.id == drive_id)
        .ok_or_else(|| "saved drive was not found".to_string())?;
    let drive = drives.remove(index);
    write_drive_catalog(app, &drives)?;
    Ok(drive)
}

fn update_drive(app: &AppHandle, updated_drive: SavedDrive) -> Result<SavedDrive, String> {
    let mut drives = read_drive_catalog(app)?;
    let index = drives
        .iter()
        .position(|drive| drive.id == updated_drive.id)
        .ok_or_else(|| "saved drive was not found".to_string())?;
    drives[index] = updated_drive.clone();
    drives.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    write_drive_catalog(app, &drives)?;
    Ok(updated_drive)
}

fn find_saved_drive(app: &AppHandle, drive_id: &str) -> Result<SavedDrive, String> {
    read_drive_catalog(app)?
        .into_iter()
        .find(|drive| drive.id == drive_id)
        .ok_or_else(|| "saved drive was not found".to_string())
}

fn update_drive_auto_mount(
    app: &AppHandle,
    drive_id: &str,
    auto_mount: bool,
) -> Result<SavedDrive, String> {
    let mut drives = read_drive_catalog(app)?;
    let drive = drives
        .iter_mut()
        .find(|drive| drive.id == drive_id)
        .ok_or_else(|| "saved drive was not found".to_string())?;
    drive.auto_mount = auto_mount;
    let updated = drive.clone();
    write_drive_catalog(app, &drives)?;
    Ok(updated)
}

fn update_drive_health(
    app: &AppHandle,
    drive_id: &str,
    state: &str,
    issue: Option<&DriveIssue>,
) -> Result<SavedDrive, String> {
    let mut drives = read_drive_catalog(app)?;
    let drive = drives
        .iter_mut()
        .find(|drive| drive.id == drive_id)
        .ok_or_else(|| "saved drive was not found".to_string())?;
    drive.last_mount_state = Some(state.to_string());
    drive.last_checked_at = Some(now_millis());
    if let Some(issue) = issue {
        drive.last_issue_summary = Some(issue.summary.clone());
        drive.last_issue_recommendation = Some(issue.recommendation.clone());
        drive.last_issue_details = issue.details.clone();
    } else {
        drive.last_issue_summary = None;
        drive.last_issue_recommendation = None;
        drive.last_issue_details = None;
    }
    let updated = drive.clone();
    write_drive_catalog(app, &drives)?;
    Ok(updated)
}

fn mount_drive(manager: &RcloneManager, drive: &SavedDrive) -> Result<Value, String> {
    manager.call_rc(
        "mount/mount",
        json!({
            "fs": &drive.fs,
            "mountPoint": &drive.mount_point,
            "vfsOpt": {
                "CacheMode": cache_mode_number(&drive.cache_mode),
            },
        }),
    )
}

fn apply_request_to_drive(
    mut drive: SavedDrive,
    request: &NetworkDriveRequest,
    display_name: String,
    mount_point: String,
    fs: String,
    cache_mode: String,
) -> SavedDrive {
    drive.display_name = display_name;
    drive.fs = fs;
    drive.mount_point = mount_point;
    drive.remote_path = optional_text(&request.remote_path).unwrap_or_default();
    drive.cache_mode = cache_mode;
    drive.url = optional_text(&request.url);
    drive.host = optional_text(&request.host);
    drive.port = optional_text(&request.port);
    drive.username = optional_text(&request.username);
    drive.domain = optional_text(&request.domain);
    drive.share = optional_text(&request.share);
    drive.webdav_vendor = optional_text(&request.webdav_vendor);
    drive.last_mount_state = Some("ready".to_string());
    drive.last_issue_summary = None;
    drive.last_issue_recommendation = None;
    drive.last_issue_details = None;
    drive.last_checked_at = Some(now_millis());
    drive
}

fn mounted_paths_from_value(value: &Value) -> Vec<String> {
    let items = value
        .get("mounts")
        .or_else(|| value.get("mountPoints"))
        .and_then(Value::as_array);

    let Some(items) = items else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            if let Some(path) = item.as_str() {
                return Some(path.to_string());
            }

            let object = item.as_object()?;
            ["mountPoint", "MountPoint", "mount_point", "path", "Path"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(ToString::to_string)
        })
        .collect()
}

fn cache_candidate_paths(cache_root: &Path, remote_name: &str) -> Vec<PathBuf> {
    [
        cache_root.join("vfs").join(remote_name),
        cache_root.join("vfsMeta").join(remote_name),
        cache_root.join(remote_name),
    ]
    .into_iter()
    .collect()
}

fn directory_size(path: &Path) -> (u64, u64, Vec<String>) {
    if !path.exists() {
        return (0, 0, Vec::new());
    }

    let mut bytes = 0;
    let mut files = 0;
    let mut warnings = Vec::new();
    let mut stack = vec![path.to_path_buf()];

    while let Some(current) = stack.pop() {
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.is_file() => {
                bytes += metadata.len();
                files += 1;
            }
            Ok(metadata) if metadata.is_dir() => match std::fs::read_dir(&current) {
                Ok(entries) => {
                    for entry in entries {
                        match entry {
                            Ok(entry) => stack.push(entry.path()),
                            Err(err) => warnings.push(format!(
                                "Could not read cache entry in {}: {err}",
                                current.display()
                            )),
                        }
                    }
                }
                Err(err) => warnings.push(format!(
                    "Could not read cache folder {}: {err}",
                    current.display()
                )),
            },
            Ok(metadata) => {
                bytes += metadata.len();
                files += 1;
            }
            Err(err) => warnings.push(format!(
                "Could not inspect cache path {}: {err}",
                current.display()
            )),
        }
    }

    (bytes, files, warnings)
}

fn is_drive_mounted(manager: &RcloneManager, drive: &SavedDrive) -> bool {
    manager
        .call_rc("mount/listmounts", json!({}))
        .map(|value| mounted_paths_from_value(&value))
        .map(|paths| paths.iter().any(|path| path == &drive.mount_point))
        .unwrap_or(false)
}

fn cache_status_for_drive(
    app: &AppHandle,
    manager: Option<&RcloneManager>,
    drive: &SavedDrive,
) -> Result<(DriveCacheStatus, Vec<String>), String> {
    let paths = resolve_pathbufs(app)?;
    let cache_root = paths.rclone_cache;
    let candidates = cache_candidate_paths(&cache_root, &drive.remote_name);
    let mut drive_bytes = 0;
    let mut drive_files = 0;
    let mut warnings = Vec::new();
    let mut existing_paths = Vec::new();

    for path in candidates {
        if path.exists() {
            let (bytes, files, mut path_warnings) = directory_size(&path);
            drive_bytes += bytes;
            drive_files += files;
            warnings.append(&mut path_warnings);
            existing_paths.push(path.display().to_string());
        }
    }

    let (total_bytes, _, mut total_warnings) = directory_size(&cache_root);
    warnings.append(&mut total_warnings);

    let mounted = manager
        .filter(|manager| manager.daemon.is_some())
        .map(|manager| is_drive_mounted(manager, drive))
        .unwrap_or(false);

    let message = match drive.cache_mode.as_str() {
        "off" => "Cache is disabled for this drive.".to_string(),
        "full" => "Full cache keeps file data locally for faster repeated access.".to_string(),
        _ => "Smart cache keeps active file data locally while the drive is in use.".to_string(),
    };

    Ok((
        DriveCacheStatus {
            drive_id: drive.id.clone(),
            cache_mode: drive.cache_mode.clone(),
            cache_root: cache_root.display().to_string(),
            drive_cache_paths: existing_paths,
            drive_bytes,
            total_bytes,
            file_count: drive_files,
            mounted,
            last_scanned_at: now_millis(),
            message,
        },
        warnings,
    ))
}

fn already_mounted_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("already mounted")
        || lower.contains("mount point busy")
        || lower.contains("mountpoint busy")
        || lower.contains("already exists")
}

fn diagnose_mount_error(message: &str) -> DriveIssue {
    let lower = message.to_ascii_lowercase();

    if lower.contains("winfsp")
        || lower.contains("macfuse")
        || lower.contains("osxfuse")
        || lower.contains("/dev/fuse")
        || lower.contains("fusermount")
        || lower.contains("fuse:")
        || lower.contains("fuse mount")
        || lower.contains("fuse device")
        || lower.contains("mount helper")
    {
        return DriveIssue {
            summary: "The system mount component is missing or unavailable.".to_string(),
            recommendation:
                "Install or repair WinFsp on Windows, macFUSE on macOS, or FUSE support in Docker/Linux, then try mounting again."
                    .to_string(),
            details: Some(message.to_string()),
        };
    }

    if lower.contains("directory not empty")
        || lower.contains("not empty")
        || lower.contains("mount point busy")
        || lower.contains("mountpoint busy")
        || lower.contains("resource busy")
        || lower.contains("already mounted")
    {
        return DriveIssue {
            summary: "The local mount folder is already in use.".to_string(),
            recommendation:
                "Choose an empty local folder, unmount the existing drive using that folder, or restart the mount service before trying again."
                    .to_string(),
            details: Some(message.to_string()),
        };
    }

    if lower.contains("permission denied")
        || lower.contains("operation not permitted")
        || lower.contains("access is denied")
    {
        return DriveIssue {
            summary: "Fero does not have permission to mount at this location.".to_string(),
            recommendation:
                "Choose a folder inside your user area, check system privacy permissions, or run the Docker/server mode with the required FUSE permissions."
                    .to_string(),
            details: Some(message.to_string()),
        };
    }

    let (summary, recommendation) = diagnose_connection_error(message);
    DriveIssue {
        summary,
        recommendation,
        details: Some(message.to_string()),
    }
}

fn diagnose_connection_error(message: &str) -> (String, String) {
    let lower = message.to_ascii_lowercase();

    if lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains("permission denied")
        || lower.contains("authentication")
        || lower.contains("login")
        || lower.contains("401")
        || lower.contains("403")
    {
        return (
            "Fero reached the server, but the credentials were not accepted.".to_string(),
            "Check the username, password, app token, domain, and whether this account can access the selected folder.".to_string(),
        );
    }

    if lower.contains("no such host")
        || lower.contains("dns")
        || lower.contains("lookup")
        || lower.contains("could not resolve")
    {
        return (
            "Fero could not find that server address.".to_string(),
            "Check the host name or URL, remove accidental spaces, and confirm the address works from this computer.".to_string(),
        );
    }

    if lower.contains("connection refused") || lower.contains("actively refused") {
        return (
            "The server refused the connection.".to_string(),
            "Check the port, protocol, firewall, VPN, and whether the storage service is running."
                .to_string(),
        );
    }

    if lower.contains("timeout")
        || lower.contains("timed out")
        || lower.contains("deadline")
        || lower.contains("i/o timeout")
    {
        return (
            "The server did not respond in time.".to_string(),
            "Check the network connection, VPN, firewall, and whether this storage service is reachable right now.".to_string(),
        );
    }

    if lower.contains("certificate")
        || lower.contains("tls")
        || lower.contains("ssl")
        || lower.contains("x509")
    {
        return (
            "The secure connection could not be verified.".to_string(),
            "Check the HTTPS certificate, server date, and whether a company proxy is intercepting secure traffic.".to_string(),
        );
    }

    if lower.contains("not found")
        || lower.contains("no such file")
        || lower.contains("no such directory")
        || lower.contains("doesn't exist")
        || lower.contains("share")
    {
        return (
            "Fero connected, but the folder or share was not found.".to_string(),
            "Check the SMB share name or remote folder path, then try the test again.".to_string(),
        );
    }

    (
        "Fero could not verify this network drive.".to_string(),
        "Open diagnostics for the rclone response, then check the server address, credentials, and remote folder.".to_string(),
    )
}

fn connection_failure_result(protocol: String, fs: String, err: String) -> NetworkDriveTestResult {
    let (summary, recommendation) = diagnose_connection_error(&err);
    NetworkDriveTestResult {
        ok: false,
        protocol,
        fs,
        summary,
        recommendation,
        details: Some(err),
        item_count: None,
        warnings: Vec::new(),
    }
}

#[tauri::command]
fn get_overview(app: AppHandle, state: State<'_, AppState>) -> Result<AppOverview, String> {
    let paths = resolve_paths(&app)?;
    let manager = lock_manager(&state)?;
    Ok(AppOverview {
        product_name: "Fero".to_string(),
        app_version: app.package_info().version.to_string(),
        daemon: manager.status(&paths),
        mount_environment: inspect_mount_environment(),
        drives: read_drive_catalog(&app)?,
        paths,
    })
}

#[tauri::command]
fn start_rclone(app: AppHandle, state: State<'_, AppState>) -> Result<DaemonStatus, String> {
    let mut manager = lock_manager(&state)?;
    let result = manager.start(&app);
    match &result {
        Ok(status) => {
            let source = status.source.as_deref().unwrap_or("rclone");
            let _ = record_activity(
                &app,
                "info",
                "Fero",
                &format!("Mount service started using {source}."),
            );
        }
        Err(err) => {
            let _ = record_activity(
                &app,
                "error",
                "Fero",
                &format!("Mount service failed to start: {err}"),
            );
        }
    }
    result
}

#[tauri::command]
fn stop_rclone(app: AppHandle, state: State<'_, AppState>) -> Result<DaemonStatus, String> {
    let mut manager = lock_manager(&state)?;
    let result = manager.stop(&app);
    match &result {
        Ok(_) => {
            let _ = record_activity(&app, "info", "Fero", "Mount service stopped.");
        }
        Err(err) => {
            let _ = record_activity(
                &app,
                "error",
                "Fero",
                &format!("Mount service failed to stop: {err}"),
            );
        }
    }
    result
}

#[tauri::command]
fn create_network_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    request: NetworkDriveRequest,
) -> Result<NetworkDriveResult, String> {
    let display_name = required_text(&request.display_name, "Drive name")?;
    let mount_point = match optional_text(&Some(request.mount_point.clone())) {
        Some(path) => path,
        None => suggested_mount_path(&app, &display_name, None)?
            .display()
            .to_string(),
    };
    let mount_point = required_text(&mount_point, "Local mount folder")?;
    let (protocol, parameters) = protocol_parameters(&request)?;
    let remote_name = build_remote_name(&display_name, &protocol);
    let fs = build_remote_fs(
        &remote_name,
        &protocol,
        &request.share,
        &request.remote_path,
    )?;
    let (cache_mode, cache_mode_value) = cache_mode_value(&request.cache_mode);

    std::fs::create_dir_all(PathBuf::from(&mount_point))
        .map_err(|err| format!("failed to create local mount folder {mount_point}: {err}"))?;

    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;

    let remote = manager.call_rc(
        "config/create",
        json!({
            "name": &remote_name,
            "type": &protocol,
            "parameters": parameters,
            "opt": {
                "obscure": true,
            },
        }),
    )?;

    let mount = manager.call_rc(
        "mount/mount",
        json!({
            "fs": &fs,
            "mountPoint": &mount_point,
            "vfsOpt": {
                "CacheMode": cache_mode_value,
            },
        }),
    )?;

    let drive = save_drive(
        &app,
        SavedDrive {
            id: remote_name.clone(),
            display_name: display_name.clone(),
            protocol: protocol.clone(),
            remote_name: remote_name.clone(),
            fs: fs.clone(),
            mount_point: mount_point.clone(),
            remote_path: optional_text(&request.remote_path).unwrap_or_default(),
            cache_mode: cache_mode.clone(),
            auto_mount: true,
            url: optional_text(&request.url),
            host: optional_text(&request.host),
            port: optional_text(&request.port),
            username: optional_text(&request.username),
            domain: optional_text(&request.domain),
            share: optional_text(&request.share),
            webdav_vendor: optional_text(&request.webdav_vendor),
            last_mount_state: Some("mounted".to_string()),
            last_issue_summary: None,
            last_issue_recommendation: None,
            last_issue_details: None,
            last_checked_at: Some(now_millis()),
            created_at: now_millis(),
        },
    )?;

    let _ = record_activity(
        &app,
        "info",
        "Fero",
        &format!("Mounted \"{display_name}\" at {mount_point}."),
    );

    Ok(NetworkDriveResult {
        protocol,
        display_name,
        remote_name,
        fs,
        mount_point,
        cache_mode,
        drive,
        remote,
        mount,
    })
}

#[tauri::command]
fn test_network_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    request: NetworkDriveRequest,
) -> Result<NetworkDriveTestResult, String> {
    let (protocol, parameters) = protocol_parameters(&request)?;
    let remote_name = format!("test_{protocol}_{}", short_nonce());
    let fs = build_remote_fs(
        &remote_name,
        &protocol,
        &request.share,
        &request.remote_path,
    )?;

    let mut manager = lock_manager(&state)?;
    if let Err(err) = manager.ensure_started(&app) {
        let result = connection_failure_result(protocol, fs, err);
        let _ = record_activity(&app, "error", "Fero", &result.summary);
        return Ok(result);
    }

    if let Err(err) = manager.call_rc(
        "config/create",
        json!({
            "name": &remote_name,
            "type": &protocol,
            "parameters": parameters,
            "opt": {
                "obscure": true,
            },
        }),
    ) {
        let result = connection_failure_result(protocol, fs, err);
        let _ = record_activity(&app, "error", "Fero", &result.summary);
        return Ok(result);
    }

    let probe = manager.call_rc(
        "operations/list",
        json!({
            "fs": &fs,
            "remote": "",
        }),
    );

    let mut warnings = Vec::new();
    if let Err(err) = manager.call_rc("config/delete", json!({ "name": &remote_name })) {
        warnings.push(format!("Temporary remote cleanup failed: {err}"));
    }

    match probe {
        Ok(value) => {
            let item_count = value
                .get("list")
                .or_else(|| value.get("List"))
                .and_then(Value::as_array)
                .map(Vec::len);
            let _ = record_activity(
                &app,
                "info",
                "Fero",
                &format!("Connection verified for {}.", protocol.to_uppercase()),
            );
            Ok(NetworkDriveTestResult {
                ok: true,
                protocol,
                fs,
                summary: "Connection verified.".to_string(),
                recommendation: "This network drive can be mounted. Choose a local folder, then connect and mount it.".to_string(),
                details: None,
                item_count,
                warnings,
            })
        }
        Err(err) => {
            let mut result = connection_failure_result(protocol, fs, err);
            result.warnings = warnings;
            let _ = record_activity(&app, "error", "Fero", &result.summary);
            Ok(result)
        }
    }
}

#[tauri::command]
fn update_saved_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
    request: NetworkDriveRequest,
) -> Result<UpdateDriveResult, String> {
    let existing = find_saved_drive(&app, &drive_id)?;
    let display_name = required_text(&request.display_name, "Drive name")?;
    let mount_point = optional_text(&Some(request.mount_point.clone()))
        .unwrap_or_else(|| existing.mount_point.clone());
    let mount_point = required_text(&mount_point, "Local mount folder")?;
    let requested_protocol = request.protocol.trim().to_ascii_lowercase();

    if requested_protocol != existing.protocol {
        return Err("Changing a saved drive protocol is not supported yet. Create a new drive for a different protocol.".to_string());
    }

    let (protocol, parameters) = protocol_parameters(&request)?;
    let fs = build_remote_fs(
        &existing.remote_name,
        &protocol,
        &request.share,
        &request.remote_path,
    )?;
    let (cache_mode, _) = cache_mode_value(&request.cache_mode);
    std::fs::create_dir_all(PathBuf::from(&mount_point))
        .map_err(|err| format!("failed to create local mount folder {mount_point}: {err}"))?;

    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    let mounted_paths = manager
        .call_rc("mount/listmounts", json!({}))
        .map(|value| mounted_paths_from_value(&value))
        .unwrap_or_default();
    let was_mounted = mounted_paths
        .iter()
        .any(|path| path == &existing.mount_point);

    let remote = manager.call_rc(
        "config/update",
        json!({
            "name": &existing.remote_name,
            "parameters": parameters,
            "opt": {
                "obscure": true,
            },
        }),
    )?;

    let updated = apply_request_to_drive(
        existing.clone(),
        &request,
        display_name,
        mount_point,
        fs,
        cache_mode,
    );
    let mut drive = update_drive(&app, updated)?;

    let mut remounted = false;
    let mut warnings = Vec::new();
    if was_mounted {
        if let Err(err) = manager.call_rc(
            "mount/unmount",
            json!({ "mountPoint": &existing.mount_point }),
        ) {
            warnings.push(format!("Old mount could not be stopped: {err}"));
        }

        match mount_drive(&manager, &drive) {
            Ok(_) => {
                drive = update_drive_health(&app, &drive.id, "mounted", None)?;
                remounted = true;
            }
            Err(err) => {
                let issue = diagnose_mount_error(&err);
                drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))?;
                warnings.push(format!("Saved settings, but remount failed: {err}"));
            }
        }
    }

    let level = if warnings.is_empty() { "info" } else { "warn" };
    let message = if remounted {
        format!("Saved and remounted \"{}\".", drive.display_name)
    } else {
        format!("Saved settings for \"{}\".", drive.display_name)
    };
    let _ = record_activity(&app, level, "Fero", &message);

    Ok(UpdateDriveResult {
        drive,
        remote,
        remounted,
        warnings,
    })
}

#[tauri::command]
fn mount_saved_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
) -> Result<MountDriveResult, String> {
    let drive = find_saved_drive(&app, &drive_id)?;
    if let Err(err) = std::fs::create_dir_all(PathBuf::from(&drive.mount_point)) {
        let issue = DriveIssue {
            summary: "Fero could not create the local mount folder.".to_string(),
            recommendation:
                "Choose a folder you can write to, or create the folder manually and try mounting again."
                    .to_string(),
            details: Some(format!(
                "failed to create local mount folder {}: {err}",
                drive.mount_point
            )),
        };
        let updated_drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))?;
        let _ = record_activity(
            &app,
            "error",
            "Fero",
            &format!(
                "Could not mount \"{}\": {}",
                updated_drive.display_name, issue.summary
            ),
        );
        return Ok(MountDriveResult {
            drive: updated_drive,
            mounted: false,
            mount: None,
            issue: Some(issue),
        });
    }

    let mut manager = lock_manager(&state)?;
    if let Err(err) = manager.ensure_started(&app) {
        let issue = diagnose_mount_error(&err);
        let updated_drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))?;
        let _ = record_activity(
            &app,
            "error",
            "Fero",
            &format!(
                "Could not mount \"{}\": {}",
                updated_drive.display_name, issue.summary
            ),
        );
        return Ok(MountDriveResult {
            drive: updated_drive,
            mounted: false,
            mount: None,
            issue: Some(issue),
        });
    }

    match mount_drive(&manager, &drive) {
        Ok(value) => {
            let updated_drive = update_drive_health(&app, &drive.id, "mounted", None)?;
            let _ = record_activity(
                &app,
                "info",
                "Fero",
                &format!(
                    "Mounted \"{}\" at {}.",
                    updated_drive.display_name, updated_drive.mount_point
                ),
            );
            Ok(MountDriveResult {
                drive: updated_drive,
                mounted: true,
                mount: Some(value),
                issue: None,
            })
        }
        Err(err) => {
            let issue = diagnose_mount_error(&err);
            let updated_drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))?;
            let _ = record_activity(
                &app,
                "error",
                "Fero",
                &format!(
                    "Could not mount \"{}\": {}",
                    updated_drive.display_name, issue.summary
                ),
            );
            Ok(MountDriveResult {
                drive: updated_drive,
                mounted: false,
                mount: None,
                issue: Some(issue),
            })
        }
    }
}

#[tauri::command]
fn restore_saved_drives(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<RestoreDrivesResult, String> {
    let drives = read_drive_catalog(&app)?;
    let skipped = drives.iter().filter(|drive| !drive.auto_mount).count();
    let auto_drives = drives
        .into_iter()
        .filter(|drive| drive.auto_mount)
        .collect::<Vec<_>>();
    let attempted = auto_drives.len();

    if auto_drives.is_empty() {
        let _ = record_activity(
            &app,
            "info",
            "Fero",
            "No drives were configured for launch restore.",
        );
        return Ok(RestoreDrivesResult {
            attempted,
            mounted: 0,
            skipped,
            items: Vec::new(),
        });
    }

    let mut manager = lock_manager(&state)?;
    if let Err(err) = manager.ensure_started(&app) {
        let issue = diagnose_mount_error(&err);
        let items = auto_drives
            .into_iter()
            .map(|drive| {
                let drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))
                    .unwrap_or(drive);
                RestoreDriveItem {
                    drive,
                    mounted: false,
                    status: "failed".to_string(),
                    message: Some(err.clone()),
                }
            })
            .collect();
        let _ = record_activity(
            &app,
            "error",
            "Fero",
            &format!("Launch restore could not start the mount service: {err}"),
        );
        return Ok(RestoreDrivesResult {
            attempted,
            mounted: 0,
            skipped,
            items,
        });
    }

    let mounted_paths = manager
        .call_rc("mount/listmounts", json!({}))
        .map(|value| mounted_paths_from_value(&value))
        .unwrap_or_default();
    let mut mounted = 0;
    let mut items = Vec::with_capacity(auto_drives.len());

    for drive in auto_drives {
        if mounted_paths.iter().any(|path| path == &drive.mount_point) {
            mounted += 1;
            let drive = update_drive_health(&app, &drive.id, "mounted", None).unwrap_or(drive);
            items.push(RestoreDriveItem {
                drive,
                mounted: true,
                status: "alreadyMounted".to_string(),
                message: None,
            });
            continue;
        }

        if let Err(err) = std::fs::create_dir_all(PathBuf::from(&drive.mount_point)) {
            let issue = DriveIssue {
                summary: "Fero could not create the local mount folder.".to_string(),
                recommendation:
                    "Choose a folder you can write to, or create the folder manually and try mounting again."
                        .to_string(),
                details: Some(format!("failed to create local mount folder: {err}")),
            };
            let drive =
                update_drive_health(&app, &drive.id, "attention", Some(&issue)).unwrap_or(drive);
            items.push(RestoreDriveItem {
                drive,
                mounted: false,
                status: "failed".to_string(),
                message: issue.details.clone(),
            });
            continue;
        }

        match mount_drive(&manager, &drive) {
            Ok(_) => {
                mounted += 1;
                let drive = update_drive_health(&app, &drive.id, "mounted", None).unwrap_or(drive);
                items.push(RestoreDriveItem {
                    drive,
                    mounted: true,
                    status: "mounted".to_string(),
                    message: None,
                });
            }
            Err(err) if already_mounted_error(&err) => {
                mounted += 1;
                let drive = update_drive_health(&app, &drive.id, "mounted", None).unwrap_or(drive);
                items.push(RestoreDriveItem {
                    drive,
                    mounted: true,
                    status: "alreadyMounted".to_string(),
                    message: Some(err),
                });
            }
            Err(err) => {
                let issue = diagnose_mount_error(&err);
                let drive = update_drive_health(&app, &drive.id, "attention", Some(&issue))
                    .unwrap_or(drive);
                items.push(RestoreDriveItem {
                    drive,
                    mounted: false,
                    status: "failed".to_string(),
                    message: Some(err),
                });
            }
        }
    }

    let failed = attempted.saturating_sub(mounted);
    let level = if failed > 0 { "warn" } else { "info" };
    let _ = record_activity(
        &app,
        level,
        "Fero",
        &format!("Launch restore mounted {mounted}/{attempted} drives."),
    );

    Ok(RestoreDrivesResult {
        attempted,
        mounted,
        skipped,
        items,
    })
}

#[tauri::command]
fn set_drive_auto_mount(
    app: AppHandle,
    drive_id: String,
    auto_mount: bool,
) -> Result<SavedDrive, String> {
    let drive = update_drive_auto_mount(&app, &drive_id, auto_mount)?;
    let state = if auto_mount { "enabled" } else { "disabled" };
    let _ = record_activity(
        &app,
        "info",
        "Fero",
        &format!("Launch restore {state} for \"{}\".", drive.display_name),
    );
    Ok(drive)
}

#[tauri::command]
fn suggest_mount_point(
    app: AppHandle,
    display_name: String,
    drive_id: Option<String>,
) -> Result<MountPointSuggestion, String> {
    let paths = resolve_pathbufs(&app)?;
    let path = suggested_mount_path(&app, &display_name, drive_id.as_deref())?;
    Ok(MountPointSuggestion {
        root: paths.default_mount_root.display().to_string(),
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn get_cache_status(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
) -> Result<DriveCacheStatus, String> {
    let drive = find_saved_drive(&app, &drive_id)?;
    let manager = lock_manager(&state)?;
    let (status, _) = cache_status_for_drive(&app, Some(&manager), &drive)?;
    Ok(status)
}

#[tauri::command]
fn clear_drive_cache(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
) -> Result<ClearDriveCacheResult, String> {
    let drive = find_saved_drive(&app, &drive_id)?;
    let manager = lock_manager(&state)?;
    let (before, mut warnings) = cache_status_for_drive(&app, Some(&manager), &drive)?;
    let mut removed_paths = Vec::new();
    let mut removed_bytes = 0;

    if before.mounted {
        warnings.push(
            "Stop this drive before clearing cached files, then run clear cache again.".to_string(),
        );
        let _ = record_activity(
            &app,
            "warn",
            "Fero",
            &format!(
                "Skipped cache cleanup for \"{}\" because it is mounted.",
                drive.display_name
            ),
        );
        return Ok(ClearDriveCacheResult {
            status: before,
            removed_bytes,
            removed_paths,
            warnings,
        });
    }

    let paths = resolve_pathbufs(&app)?;
    for path in cache_candidate_paths(&paths.rclone_cache, &drive.remote_name) {
        if !path.exists() {
            continue;
        }
        let (bytes, _, mut path_warnings) = directory_size(&path);
        warnings.append(&mut path_warnings);
        match std::fs::remove_dir_all(&path) {
            Ok(_) => {
                removed_bytes += bytes;
                removed_paths.push(path.display().to_string());
            }
            Err(err) => warnings.push(format!("Could not remove {}: {err}", path.display())),
        }
    }

    let (status, mut status_warnings) = cache_status_for_drive(&app, Some(&manager), &drive)?;
    warnings.append(&mut status_warnings);

    let level = if warnings.is_empty() { "info" } else { "warn" };
    let _ = record_activity(
        &app,
        level,
        "Fero",
        &format!(
            "Cleared {} of cache for \"{}\".",
            removed_bytes, drive.display_name
        ),
    );

    Ok(ClearDriveCacheResult {
        status,
        removed_bytes,
        removed_paths,
        warnings,
    })
}

#[tauri::command]
fn remove_saved_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
) -> Result<RemoveDriveResult, String> {
    let drive = find_saved_drive(&app, &drive_id)?;
    let mut warnings = Vec::new();
    let mut unmount = None;
    let mut remote = None;

    match lock_manager(&state).and_then(|mut manager| {
        manager.ensure_started(&app)?;
        Ok(manager)
    }) {
        Ok(manager) => {
            match manager.call_rc("mount/unmount", json!({ "mountPoint": &drive.mount_point })) {
                Ok(value) => unmount = Some(value),
                Err(err) => warnings.push(format!("Unmount skipped: {err}")),
            }
            match manager.call_rc("config/delete", json!({ "name": &drive.remote_name })) {
                Ok(value) => remote = Some(value),
                Err(err) => warnings.push(format!("Remote cleanup skipped: {err}")),
            }
        }
        Err(err) => warnings.push(format!("Service cleanup skipped: {err}")),
    }

    let drive = delete_drive(&app, &drive_id)?;
    let level = if warnings.is_empty() { "info" } else { "warn" };
    let _ = record_activity(
        &app,
        level,
        "Fero",
        &format!("Removed \"{}\" from Fero.", drive.display_name),
    );
    Ok(RemoveDriveResult {
        drive,
        unmount,
        remote,
        warnings,
    })
}

#[tauri::command]
fn unmount(
    app: AppHandle,
    state: State<'_, AppState>,
    mount_point: String,
) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    let result = manager.call_rc("mount/unmount", json!({ "mountPoint": mount_point }));
    match &result {
        Ok(_) => {
            let _ = record_activity(&app, "info", "Fero", "Drive unmounted.");
        }
        Err(err) => {
            let _ = record_activity(&app, "error", "Fero", &format!("Unmount failed: {err}"));
        }
    }
    result
}

#[tauri::command]
fn list_mounts(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc("mount/listmounts", json!({}))
}

#[tauri::command]
fn job_status(app: AppHandle, state: State<'_, AppState>, job_id: u64) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc("job/status", json!({ "jobid": job_id }))
}

#[tauri::command]
fn get_activity_log(app: AppHandle, limit: Option<usize>) -> Result<Vec<ActivityLogEntry>, String> {
    read_recent_activity(&app, limit.unwrap_or(40).clamp(1, 200))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_overview,
            start_rclone,
            stop_rclone,
            create_network_drive,
            test_network_drive,
            update_saved_drive,
            mount_saved_drive,
            restore_saved_drives,
            set_drive_auto_mount,
            suggest_mount_point,
            get_cache_status,
            clear_drive_cache,
            remove_saved_drive,
            unmount,
            list_mounts,
            job_status,
            get_activity_log
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<AppState>();
                let app = window.app_handle().clone();
                if let Ok(mut manager) = state.rclone.lock() {
                    let _ = manager.stop(&app);
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
