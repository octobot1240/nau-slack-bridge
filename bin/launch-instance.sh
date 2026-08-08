#!/usr/bin/env bash
set -euo pipefail

instance="${1:-}"
case "${instance}" in
  zorwa | octobot) ;;
  *)
    echo "usage: launch-instance.sh <zorwa|octobot>" >&2
    exit 2
    ;;
esac

env_file="${HOME}/.secrets/nau-bridge-${instance}.env"
if [[ ! -r "${env_file}" ]]; then
  echo "NAU bridge env file is missing or unreadable: ${env_file}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${env_file}"
set +a

: "${SLACK_BOT_TOKEN:?SLACK_BOT_TOKEN is required}"
: "${SLACK_APP_TOKEN:?SLACK_APP_TOKEN is required}"
: "${SLACK_STATE_DIR:?SLACK_STATE_DIR is required}"
: "${SLACK_CHANNEL_ID:?SLACK_CHANNEL_ID is required}"

if [[ "${SLACK_STATE_DIR}" != /* ]]; then
  echo "SLACK_STATE_DIR must be an absolute path" >&2
  exit 1
fi
export SLACK_AUDIT_LOG="${SLACK_AUDIT_LOG:-${SLACK_STATE_DIR}/audit.log}"
if [[ ! "${SLACK_CHANNEL_ID}" =~ ^C[A-Z0-9]+$ ]]; then
  echo "SLACK_CHANNEL_ID must be a Slack channel ID" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun "${repo_root}/server.ts"
