# Fero

Fero is a Tauri v2 desktop control plane for rclone.

## Stack

- Desktop shell: Tauri v2
- Backend: Rust commands owned by the app
- Frontend: Vite + React + TypeScript + Tailwind CSS
- rclone integration: official rclone binary as a sidecar / external binary

## Architecture

```text
React UI
  -> Tauri invoke commands
  -> Rust RcloneManager
  -> rclone rcd sidecar
  -> rclone RC API
```

The frontend does not execute shell commands directly. Rust owns the rclone
process lifecycle, RC credentials, app-scoped `rclone.conf`, logs, shutdown, and
fallback cleanup.

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

- Starts and stops an app-owned `rclone rcd`
- Uses local RC auth on a random loopback port
- Stores app-owned rclone config and JSON logs
- Exposes remotes/providers discovery
- Exposes async transfer launch
- Exposes mount/list/unmount commands

Mount behavior still depends on system prerequisites:

- macOS: macFUSE
- Windows: WinFsp
- Linux: FUSE support and user permissions
