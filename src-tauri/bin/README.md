# rclone Sidecar Binaries

Tauri packages sidecars from `src-tauri/bin` using the `externalBin` entry in
`src-tauri/tauri.conf.json`.

For Fero the configured base path is:

```json
"externalBin": ["bin/rclone"]
```

That means each binary must be named with its Rust target triple:

- `rclone-aarch64-apple-darwin`
- `rclone-x86_64-apple-darwin`
- `rclone-x86_64-unknown-linux-gnu`
- `rclone-x86_64-pc-windows-msvc.exe`

Use `scripts/fetch-rclone-sidecar.sh` to download and install the pinned rclone
version into this directory.
