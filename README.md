# Fero

Fero is a Wails v3 desktop client for rclone with a React + Vite frontend, Tailwind CSS styling, and shadcn-style component primitives.

## Architecture

- **GUI:** Wails v3 + React + Vite
- **Frontend styling:** Tailwind CSS + custom desktop-first design system + shadcn-style UI primitives
- **rclone integration:** upstream `rclone` binary only; no source patching or vendoring
- **Binary strategy:** prefer a configured custom path, then bundled binaries under `resources/rclone/<os-arch>/`, then system `rclone`
- **Transfer/mount execution:** managed child processes launched by Go
- **Remote/provider management:** CLI-backed `rclone config *` workflows

## Why binary embedding instead of vendoring rclone source?

Fero treats rclone as an immutable upstream dependency so upgrades stay cheap and predictable. That keeps the maintenance surface close to official rclone releases and avoids carrying a fork.

## Current pinned rclone version

- `v1.73.3`

Place platform binaries here when packaging:

- `resources/rclone/darwin-arm64/rclone`
- `resources/rclone/darwin-amd64/rclone`
- `resources/rclone/linux-amd64/rclone`
- `resources/rclone/windows-amd64/rclone.exe`

## Development

```bash
# install frontend deps
cd frontend && pnpm install

# run the desktop app in dev mode
cd .. && wails3 dev
```

## Validation commands

```bash
# frontend typecheck + build
cd frontend && pnpm run typecheck && pnpm run build

# backend tests
cd .. && go test ./...

# desktop build
wails3 build
```

## Implemented surfaces

- environment + binary resolution overview
- provider catalog discovery
- remote create / update / delete
- transfer queue management
- mount session management
- app settings persistence
- desktop-oriented dashboard UI

## Notes

- Windows drive-letter mounts usually require **WinFsp**.
- macOS mounts typically require **macFUSE**.
- Linux mounts require working **FUSE** support and permissions.
