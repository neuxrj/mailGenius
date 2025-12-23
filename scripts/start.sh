#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.mailagent.pid"
LOG_FILE="${ROOT_DIR}/server.log"

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  if [[ -n "${PID}" ]] && kill -0 "${PID}" 2>/dev/null; then
    echo "MailAgent already running (pid ${PID})."
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

cd "${ROOT_DIR}"
nohup node --import tsx src/index.ts > "${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"
echo "MailAgent started (pid $(cat "${PID_FILE}")). Logs: ${LOG_FILE}"
