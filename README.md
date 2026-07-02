# Fero

Fero is an open-source RaiDrive-style mount manager built on top of rclone. It
is focused on making network storage feel like a local drive or local folder,
with clear mount state, cache state, activity, and actionable errors.

Fero is not a general-purpose rclone sync GUI. Sync and transfer workflows are
secondary to reliable mount lifecycle management.

## Stack

- Desktop shell: Tauri v2
- Backend: Rust commands owned by the app
- Frontend: Vite + React + TypeScript + Tailwind CSS
- rclone integration: official rclone binary as a sidecar / external binary

## Architecture

```text
Shared React UI
  -> Tauri invoke commands
  -> Rust RcloneManager
  -> rclone rcd sidecar
  -> rclone RC API
```

The frontend does not execute shell commands directly. Rust owns the rclone
process lifecycle, RC credentials, app-scoped `rclone.conf`, logs, shutdown, and
fallback cleanup.

The same React UI is intended to be reused by the desktop app and the future
Docker/Web control surface. Desktop commands currently go through Tauri; the
Docker/Web edition should expose equivalent HTTP APIs around the same product
concepts.

## Sidecar binaries

Tauri is configured with:

```json
"externalBin": ["bin/rclone"]
```

Install the pinned rclone binaries into `src-tauri/bin`:

```bash
./scripts/fetch-rclone-sidecar.sh
```

For local development before the sidecar is installed, Fero can also use:

```bash
FERO_RCLONE_BIN=/opt/homebrew/bin/rclone pnpm tauri dev
```

or a system `rclone` on `PATH`.

## Development

```bash
pnpm install
pnpm tauri dev
```

## Validation

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

## Current scope

- Starts and stops an app-owned `rclone rcd` mount service
- Uses local RC auth on a random loopback port
- Stores app-owned rclone config, drive catalog, cache files, and JSON logs
- Creates and tests WebDAV, FTP, SFTP, and SMB network drives
- Mounts saved drives into local folders
- Lists active mount sessions and unmounts individual drives
- Restores selected drives on app launch
- Shows per-drive health, cache status, recent activity, and mount errors

Mount behavior still depends on system prerequisites:

- macOS: macFUSE
- Windows: WinFsp
- Linux: FUSE support and user permissions
