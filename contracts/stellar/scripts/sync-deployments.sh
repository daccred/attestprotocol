#!/usr/bin/env bash
# Regenerate the legacy deployments.json alias from the contract registry.
# deployments.json is a generated file: edit bindings/src/contracts.json instead.
set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRY="bindings/src/contracts.json"
TARGET="deployments.json"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

jq 'with_entries(select(.value.current != null and .value[.value.current] != null))
    | map_values({protocol: (.[.current] | {id, hash: .txHash, timestamp: .deployedAt})})' \
  "$REGISTRY" > "$tmp"

jq -e . "$tmp" >/dev/null

mv -f "$tmp" "$TARGET"
trap - EXIT
echo "${TARGET} regenerated from ${REGISTRY}."
