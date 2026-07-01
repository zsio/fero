#!/usr/bin/env bash
set -euo pipefail

VERSION="${RCLONE_VERSION:-v1.73.3}"
ROOT_URL="https://downloads.rclone.org/${VERSION}"
DEST_ROOT="src-tauri/bin"
CACHE_DIR=".cache/rclone/${VERSION}"

mkdir -p "${DEST_ROOT}" "${CACHE_DIR}"

fetch_one() {
  local target_triple="$1"
  local asset_suffix="$2"
  local binary_name="$3"
  local output_name="$4"
  local archive_name="rclone-${VERSION}-${asset_suffix}.zip"
  local archive_path="${CACHE_DIR}/${archive_name}"
  local extract_dir="${CACHE_DIR}/${target_triple}"

  if [[ ! -f "${archive_path}" ]]; then
    curl -fL "${ROOT_URL}/${archive_name}" -o "${archive_path}"
  fi

  rm -rf "${extract_dir}"
  mkdir -p "${extract_dir}"
  unzip -q "${archive_path}" -d "${extract_dir}"

  local extracted
  extracted="$(find "${extract_dir}" -type f -name "${binary_name}" | head -n 1)"
  if [[ -z "${extracted}" ]]; then
    echo "Unable to find ${binary_name} in ${archive_name}" >&2
    exit 1
  fi

  cp "${extracted}" "${DEST_ROOT}/${output_name}"
  chmod +x "${DEST_ROOT}/${output_name}"
}

fetch_one "aarch64-apple-darwin"      "osx-arm64"     "rclone"     "rclone-aarch64-apple-darwin"
fetch_one "x86_64-apple-darwin"       "osx-amd64"     "rclone"     "rclone-x86_64-apple-darwin"
fetch_one "x86_64-unknown-linux-gnu"  "linux-amd64"   "rclone"     "rclone-x86_64-unknown-linux-gnu"
fetch_one "x86_64-pc-windows-msvc"    "windows-amd64" "rclone.exe" "rclone-x86_64-pc-windows-msvc.exe"

echo "Installed rclone ${VERSION} sidecars in ${DEST_ROOT}"
