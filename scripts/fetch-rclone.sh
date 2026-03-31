#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-v1.73.3}"
ROOT_URL="https://downloads.rclone.org/${VERSION}"
DEST_ROOT="resources/rclone"
CACHE_DIR=".cache/rclone/${VERSION}"
mkdir -p "$CACHE_DIR"
mkdir -p "$DEST_ROOT"

SHA_FILE="$CACHE_DIR/SHA256SUMS"
wget -q -O "$SHA_FILE" "$ROOT_URL/SHA256SUMS"

fetch_one() {
  local resource_dir="$1"
  local asset_suffix="$2"
  local bin_name="$3"
  local archive_name="rclone-${VERSION}-${asset_suffix}.zip"
  local archive_path="$CACHE_DIR/$archive_name"
  local target_dir="$DEST_ROOT/$resource_dir"
  local target_path="$target_dir/$bin_name"

  echo "==> downloading $archive_name"
  wget -c -q --show-progress -O "$archive_path" "$ROOT_URL/$archive_name"

  local expected
  expected="$(awk -v name="$archive_name" '$2==name{print $1}' "$SHA_FILE")"
  if [[ -z "$expected" ]]; then
    echo "Missing checksum for $archive_name" >&2
    exit 1
  fi
  local actual
  actual="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "Checksum mismatch for $archive_name" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi

  mkdir -p "$target_dir"
  unzip -p "$archive_path" "*/$bin_name" > "$target_path"
  chmod +x "$target_path"
  echo "installed -> $target_path"
}

fetch_one "darwin-arm64"  "osx-arm64"     "rclone"
fetch_one "darwin-amd64"  "osx-amd64"     "rclone"
fetch_one "linux-amd64"   "linux-amd64"   "rclone"
fetch_one "windows-amd64" "windows-amd64" "rclone.exe"

echo "Done. Installed bundled rclone binaries for supported platforms at $DEST_ROOT"
