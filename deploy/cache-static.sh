#!/bin/sh
# Input is a tar of .next/static from a web image. Only these public assets are archived.
set -eu
release=$1
case "$release" in ''|*[!0-9a-f]*) exit 1 ;; esac
archive=${2:-/data/shop-static}
mkdir -p "$archive"
stage=$(mktemp -d "$archive/.incoming-XXXXXX")
trap 'rm -rf "$stage"' EXIT
mkdir "$stage/_next"
tar -xf - -C "$stage/_next"
test -d "$stage/_next/static"
chmod 755 "$stage"
if [ -d "$archive/$release" ]; then
  # A rebuild of the same commit can produce additional content-hashed chunks.
  cp -Rn "$stage/_next/." "$archive/$release/_next/"
  touch "$archive/$release"
else
  mv "$stage" "$archive/$release"
fi
find "$archive" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
