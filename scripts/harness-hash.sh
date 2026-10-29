#!/usr/bin/env bash
# harness-hash.sh: SHA-256 manifest for engineer-owned artifacts.
#
# Mirrored from the /audit-tests skill at ~/.claude/skills/audit-tests/scripts/
# with local fail-closed verification of tool errors. The in-repo copy lets
# CI runners invoke it without $HOME/.claude/. Follow-up bd tracks upstreaming to
# a pinnable version — see 000-docs/TEST_AUDIT.md → Post-audit follow-up.
#
# Pins .feature files and architecture rule configs. Any byte change to a
# pinned file without a fresh --init is treated as HARNESS_TAMPERED and
# causes escape-scan.sh to REFUSE the AI diff.
#
# Usage:
#   bash harness-hash.sh --init      # write manifest (engineer-initiated)
#   bash harness-hash.sh --verify    # compare current hashes to manifest
#   bash harness-hash.sh --list      # show which files are pinned
#
# Exit codes:
#   0: OK (pin matches, or init succeeded)
#   1: verification could not complete (tool or input error)
#   2: HARNESS_TAMPERED (hash mismatch)
#   3: no manifest found (--verify without --init)

set -euo pipefail

ROOT="${ROOT:-$(pwd)}"
MANIFEST="${ROOT}/.harness-hash"

PATTERNS=(
  # Wall 1: acceptance
  "features/**/*.feature"
  "features/*.feature"
  # Wall 7: architecture rule configs
  ".dependency-cruiser.js"
  ".dependency-cruiser.cjs"
  ".importlinter"
  "deptrac.yaml"
  "arch-go.yml"
  # Java ArchUnit tests
  "src/test/java/**/*ArchTest*.java"
  "src/test/java/**/*ArchitectureTest*.java"
  # .NET ArchTests
  "test/**/*ArchTests.cs"
  "tests/**/*ArchTests.cs"
  # Coverage thresholds (edits to these are escape attempts — hash them)
  ".c8rc.json"
  "stryker.conf.json"
  "stryker.config.js"
  # RFC 8785 JCS interop vectors (ccsc-713) — silent edits would let an
  # incompatible canonicalJson change land without breaking signature
  # verification on existing audit logs. Pin them with the same tamper-
  # evident discipline as the .feature files.
  "features/jcs-vectors.json"
)

collect_files() {
  local out=()
  shopt -s nullglob globstar || return 1
  for pattern in "${PATTERNS[@]}"; do
    for f in $pattern; do
      [[ -f "$f" ]] && out+=("$f")
    done
  done
  # de-dupe
  printf '%s\n' "${out[@]}" | sort -u
}

hash_files() {
  local files
  files=$(collect_files) || return 1
  if [[ -z "$files" ]]; then
    return 0
  fi
  local sum digest
  while IFS= read -r f; do
    if ! sum=$(sha256sum "$f"); then
      echo "harness-hash: failed to hash $f" >&2
      return 1
    fi
    digest=${sum%% *}
    if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ ]]; then
      echo "harness-hash: invalid hash output for $f" >&2
      return 1
    fi
    printf '%s  %s\n' "$digest" "$f" || return 1
  done <<< "$files"
}

cmd_init() {
  cd "$ROOT"
  hash_files > "$MANIFEST"
  local count
  count=$(wc -l < "$MANIFEST" | tr -d ' ')
  echo "harness-hash: pinned $count file(s) → $MANIFEST"
}

cmd_verify() {
  cd "$ROOT"
  if [[ ! -f "$MANIFEST" ]]; then
    echo "harness-hash: no manifest at $MANIFEST (run --init)" >&2
    exit 3
  fi
  local current
  if ! current=$(hash_files); then
    echo "harness-hash: failed to collect current hashes" >&2
    exit 1
  fi
  local expected
  if ! expected=$(cat "$MANIFEST"); then
    echo "harness-hash: failed to read manifest" >&2
    exit 1
  fi

  # Compare sorted manifests so order doesn't matter
  local expected_sorted current_sorted
  if ! expected_sorted=$(printf '%s\n' "$expected" | sort); then
    echo "harness-hash: failed to sort expected hashes" >&2
    exit 1
  fi
  if ! current_sorted=$(printf '%s\n' "$current" | sort); then
    echo "harness-hash: failed to sort current hashes" >&2
    exit 1
  fi
  local diff_out
  local diff_status=0
  diff_out=$(diff <(printf '%s\n' "$expected_sorted") <(printf '%s\n' "$current_sorted")) || diff_status=$?
  case "$diff_status" in
    0) echo "harness-hash: OK"; exit 0 ;;
    1) echo "HARNESS_TAMPERED: pinned artifact changed" >&2
       echo "$diff_out" >&2
       exit 2 ;;
    *) echo "harness-hash: comparison failed (diff exit $diff_status)" >&2
       exit 1 ;;
  esac
}

cmd_list() {
  cd "$ROOT"
  if [[ ! -f "$MANIFEST" ]]; then
    echo "harness-hash: no manifest (run --init)" >&2
    exit 3
  fi
  awk '{print $2}' "$MANIFEST"
}

case "${1:-}" in
  --init)   cmd_init ;;
  --verify) cmd_verify ;;
  --list)   cmd_list ;;
  --help|-h|*)
    sed -n '2,23p' "$0"
    exit 0
    ;;
esac
