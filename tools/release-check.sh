#!/bin/sh
# Deterministic checks that can be run from a generated public checkout.
set -eu

cd "$(dirname "$0")/.."

fail=0
check() {
  label=$1
  shift
  printf '%s\n' "==> $label"
  if "$@"; then
    :
  else
    fail=1
  fi
}

check "distribution provenance matches the package tree" node tools/verify-distribution.mjs
check "user-facing Markdown links resolve" node tools/verify-doc-links.mjs
check "workspace builds" npm run build

if [ "$fail" -ne 0 ]; then
  printf '%s\n' "release-check: FAILED" >&2
  exit 1
fi

printf '%s\n' "release-check: all deterministic distribution checks passed"
