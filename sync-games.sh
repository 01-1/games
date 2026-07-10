#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
manifest="$root/games.tsv"

if [ ! -f "$manifest" ]; then
  echo "Missing manifest: $manifest" >&2
  exit 1
fi

tab=$(printf '\t')
while IFS="$tab" read -r directory repository branch; do
  case "$directory" in
    ''|'#'*) continue ;;
    *[!A-Za-z0-9._-]*|.|..) echo "Invalid directory in games.tsv: $directory" >&2; exit 1 ;;
  esac

  if [ -z "$repository" ] || [ -z "$branch" ]; then
    echo "Incomplete entry in games.tsv: $directory" >&2
    exit 1
  fi

  path="$root/$directory"
  if [ ! -e "$path" ]; then
    echo "Cloning $directory ($branch)"
    git clone --branch "$branch" --single-branch "$repository" "$path"
    continue
  fi

  if ! git -C "$path" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Refusing to replace non-repository directory: $path" >&2
    exit 1
  fi

  actual_repository=$(git -C "$path" remote get-url origin 2>/dev/null || true)
  if [ "$actual_repository" != "$repository" ]; then
    echo "Origin mismatch for $directory" >&2
    echo "  manifest: $repository" >&2
    echo "  existing: $actual_repository" >&2
    exit 1
  fi

  echo "Updating $directory ($branch)"
  git -C "$path" fetch origin "$branch"
  git -C "$path" checkout "$branch"
  git -C "$path" merge --ff-only "origin/$branch"
done < "$manifest"
