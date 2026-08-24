#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: build-release-lane.sh <tag> <lane> [output-dir]}"
lane="${2:?usage: build-release-lane.sh <tag> <lane> [output-dir]}"
output_dir="${3:-compat-dist}"
version="${tag#v}"

mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"

for target in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do
  target_os="${target%/*}"
  target_arch="${target#*/}"
  display_os="${target_os^}"
  display_arch="$target_arch"
  if [[ "$target_arch" == "amd64" ]]; then
    display_arch="x86_64"
  fi
  archive="writing-workshop_${version}_${display_os}_${display_arch}_${lane}"
  stage="$(mktemp -d)"
  binary="writing-workshop"
  if [[ "$target_os" == "windows" ]]; then
    binary="writing-workshop.exe"
  fi
  CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" go build -trimpath \
    -ldflags="-s -w -X main.version=${version} -X main.commit=${GITHUB_SHA:-unknown}" \
    -o "$stage/$binary" ./cmd/writing-workshop
  cp README.md LICENSE "$stage/"
  if [[ "$target_os" == "windows" ]]; then
    (cd "$stage" && zip -q "$output_dir/$archive.zip" "$binary" README.md LICENSE)
  else
    tar -C "$stage" -czf "$output_dir/$archive.tar.gz" "$binary" README.md LICENSE
  fi
  rm -rf "$stage"
done

(cd "$output_dir" && sha256sum ./* > "writing-workshop_${version}_${lane}_checksums.txt")
