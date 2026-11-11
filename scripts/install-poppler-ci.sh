#!/usr/bin/env bash
# Optional CI oracle only: no Poppler or micromamba files enter the npm archive.
set -euo pipefail
[ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] || { echo 'This CI installer requires Linux x86_64' >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/build/pdf-tools"
PREFIX="$ROOT/prefix"
if [ ! -x "$PREFIX/bin/pdfinfo" ] || [ ! -x "$PREFIX/bin/pdftoppm" ]; then
  mkdir -p "$ROOT"
  # Official standalone micromamba release, checksum pinned from its release asset.
  curl -fsSL --retry 3 --connect-timeout 20 --max-time 120 \
    https://github.com/mamba-org/micromamba-releases/releases/download/2.10.0-0/micromamba-linux-64 \
    -o "$ROOT/micromamba"
  echo "701f39c06f8e6a670a0e186c8479b9e5c0502a2f0cda6cef65d83bdd2875e8bd  $ROOT/micromamba" | sha256sum --check
  chmod +x "$ROOT/micromamba"
  MAMBA_ROOT_PREFIX="$ROOT/mamba-root" "$ROOT/micromamba" --no-rc create --yes \
    --prefix "$PREFIX" --override-channels --channel conda-forge 'poppler=26.11.0'
fi
"$PREFIX/bin/pdfinfo" -v
"$PREFIX/bin/pdftoppm" -v
if [ -n "${GITHUB_PATH:-}" ]; then echo "$PREFIX/bin" >> "$GITHUB_PATH"; fi
