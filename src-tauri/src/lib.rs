use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
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
    drives: Vec<SavedDrive>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    app_config_dir: String,
    rclone_config: String,
    rclone_log: String,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferRequest {
    mode: Option<String>,
    source: String,
    destination: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MountRequest {
    remote: String,
    mount_point: String,
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
    let log_dir = app.path().app_log_dir().map_err(|err| err.to_string())?;
    let rclone_dir = config_dir.join("rclone");

    std::fs::create_dir_all(&rclone_dir).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|err| err.to_string())?;

    Ok(ResolvedPaths {
        app_config_dir: config_dir.clone(),
        rclone_config: rclone_dir.join("rclone.conf"),
        rclone_log: log_dir.join("rclone.jsonl"),
        drive_catalog: config_dir.join("drives.json"),
    })
}

fn resolve_paths(app: &AppHandle) -> Result<AppPaths, String> {
    let paths = resolve_pathbufs(app)?;
    Ok(AppPaths {
        app_config_dir: paths.app_config_dir.display().to_string(),
        rclone_config: paths.rclone_config.display().to_string(),
        rclone_log: paths.rclone_log.display().to_string(),
        drive_catalog: paths.drive_catalog.display().to_string(),
    })
}

struct ResolvedPaths {
    app_config_dir: PathBuf,
    rclone_config: PathBuf,
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

fn already_mounted_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("already mounted")
        || lower.contains("mount point busy")
        || lower.contains("mountpoint busy")
        || lower.contains("already exists")
}

#[tauri::command]
fn get_overview(app: AppHandle, state: State<'_, AppState>) -> Result<AppOverview, String> {
    let paths = resolve_paths(&app)?;
    let manager = lock_manager(&state)?;
    Ok(AppOverview {
        product_name: "Fero".to_string(),
        app_version: app.package_info().version.to_string(),
        daemon: manager.status(&paths),
        drives: read_drive_catalog(&app)?,
        paths,
    })
}

#[tauri::command]
fn start_rclone(app: AppHandle, state: State<'_, AppState>) -> Result<DaemonStatus, String> {
    let mut manager = lock_manager(&state)?;
    manager.start(&app)
}

#[tauri::command]
fn stop_rclone(app: AppHandle, state: State<'_, AppState>) -> Result<DaemonStatus, String> {
    let mut manager = lock_manager(&state)?;
    manager.stop(&app)
}

#[tauri::command]
fn call_rclone_rc(
    app: AppHandle,
    state: State<'_, AppState>,
    endpoint: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc(&endpoint, payload.unwrap_or_else(|| json!({})))
}

#[tauri::command]
fn list_providers(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc("config/providers", json!({}))
}

#[tauri::command]
fn list_remotes(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc("config/listremotes", json!({}))
}

#[tauri::command]
fn start_transfer(
    app: AppHandle,
    state: State<'_, AppState>,
    request: TransferRequest,
) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    let mode = request.mode.unwrap_or_else(|| "copy".to_string());
    let endpoint = match mode.as_str() {
        "sync" => "sync/sync",
        "move" => "sync/move",
        _ => "sync/copy",
    };
    manager.call_rc(
        endpoint,
        json!({
            "srcFs": request.source,
            "dstFs": request.destination,
            "_async": true,
            "_group": format!("transfer-{}", generate_password()),
        }),
    )
}

#[tauri::command]
fn start_mount(
    app: AppHandle,
    state: State<'_, AppState>,
    request: MountRequest,
) -> Result<Value, String> {
    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    manager.call_rc(
        "mount/mount",
        json!({
            "fs": request.remote,
            "mountPoint": request.mount_point,
        }),
    )
}

#[tauri::command]
fn create_network_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    request: NetworkDriveRequest,
) -> Result<NetworkDriveResult, String> {
    let display_name = required_text(&request.display_name, "Drive name")?;
    let mount_point = required_text(&request.mount_point, "Local mount folder")?;
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
            created_at: now_millis(),
        },
    )?;

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
fn mount_saved_drive(
    app: AppHandle,
    state: State<'_, AppState>,
    drive_id: String,
) -> Result<Value, String> {
    let drive = find_saved_drive(&app, &drive_id)?;
    std::fs::create_dir_all(PathBuf::from(&drive.mount_point)).map_err(|err| {
        format!(
            "failed to create local mount folder {}: {err}",
            drive.mount_point
        )
    })?;

    let mut manager = lock_manager(&state)?;
    manager.ensure_started(&app)?;
    mount_drive(&manager, &drive)
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
        return Ok(RestoreDrivesResult {
            attempted,
            mounted: 0,
            skipped,
            items: Vec::new(),
        });
    }

    let mut manager = lock_manager(&state)?;
    if let Err(err) = manager.ensure_started(&app) {
        let items = auto_drives
            .into_iter()
            .map(|drive| RestoreDriveItem {
                drive,
                mounted: false,
                status: "failed".to_string(),
                message: Some(err.clone()),
            })
            .collect();
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
            items.push(RestoreDriveItem {
                drive,
                mounted: true,
                status: "alreadyMounted".to_string(),
                message: None,
            });
            continue;
        }

        if let Err(err) = std::fs::create_dir_all(PathBuf::from(&drive.mount_point)) {
            items.push(RestoreDriveItem {
                drive,
                mounted: false,
                status: "failed".to_string(),
                message: Some(format!("failed to create local mount folder: {err}")),
            });
            continue;
        }

        match mount_drive(&manager, &drive) {
            Ok(_) => {
                mounted += 1;
                items.push(RestoreDriveItem {
                    drive,
                    mounted: true,
                    status: "mounted".to_string(),
                    message: None,
                });
            }
            Err(err) if already_mounted_error(&err) => {
                mounted += 1;
                items.push(RestoreDriveItem {
                    drive,
                    mounted: true,
                    status: "alreadyMounted".to_string(),
                    message: Some(err),
                });
            }
            Err(err) => {
                items.push(RestoreDriveItem {
                    drive,
                    mounted: false,
                    status: "failed".to_string(),
                    message: Some(err),
                });
            }
        }
    }

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
    update_drive_auto_mount(&app, &drive_id, auto_mount)
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
    manager.call_rc("mount/unmount", json!({ "mountPoint": mount_point }))
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
            call_rclone_rc,
            list_providers,
            list_remotes,
            start_transfer,
            start_mount,
            create_network_drive,
            mount_saved_drive,
            restore_saved_drives,
            set_drive_auto_mount,
            remove_saved_drive,
            unmount,
            list_mounts,
            job_status
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
