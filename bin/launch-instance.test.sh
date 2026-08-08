#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trash_bin="$(command -v trash || true)"

cleanup() {
  if [[ -n "${trash_bin}" ]]; then
    "${trash_bin}" "${tmp_dir}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "${tmp_dir}/home/.secrets" "${tmp_dir}/bin"

cat > "${tmp_dir}/home/.secrets/nau-bridge-zorwa.env" <<'EOF'
SLACK_BOT_TOKEN=xoxb-test
SLACK_APP_TOKEN=xapp-test
SLACK_STATE_DIR=/tmp/nau-zorwa-state
SLACK_CHANNEL_ID=C0BNRC7LZPD
EOF

cat > "${tmp_dir}/home/.secrets/nau-bridge-octobot.env" <<'EOF'
SLACK_BOT_TOKEN=xoxb-test
SLACK_APP_TOKEN=xapp-test
SLACK_STATE_DIR=/tmp/nau-octobot-state
SLACK_CHANNEL_ID=C0BNY5N4GQ2
EOF

cat > "${tmp_dir}/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'channel=%s\nstate=%s\naudit=%s\nargs=%s\n' \
  "${SLACK_CHANNEL_ID:-}" "${SLACK_STATE_DIR:-}" "${SLACK_AUDIT_LOG:-}" "$*"
EOF
chmod +x "${tmp_dir}/bin/bun"

output="$(
  HOME="${tmp_dir}/home" \
    PATH="${tmp_dir}/bin:/usr/bin:/bin" \
    "${repo_root}/bin/launch-instance.sh" zorwa
)"

[[ "${output}" == *"channel=C0BNRC7LZPD"* ]]
[[ "${output}" == *"state=/tmp/nau-zorwa-state"* ]]
[[ "${output}" == *"audit=/tmp/nau-zorwa-state/audit.log"* ]]
[[ "${output}" == *"args=${repo_root}/server.ts"* ]]

output="$(
  HOME="${tmp_dir}/home" \
    PATH="${tmp_dir}/bin:/usr/bin:/bin" \
    "${repo_root}/bin/launch-instance.sh" octobot
)"

[[ "${output}" == *"channel=C0BNY5N4GQ2"* ]]
[[ "${output}" == *"state=/tmp/nau-octobot-state"* ]]
[[ "${output}" == *"audit=/tmp/nau-octobot-state/audit.log"* ]]

if "${repo_root}/bin/launch-instance.sh" unknown >/dev/null 2>&1; then
  echo "expected unknown instance to fail" >&2
  exit 1
fi

echo "launch-instance tests: 8 passed, 0 failed"
