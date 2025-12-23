#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.mailagent.pid"
PORT="${PORT:-3000}"

stop_pid() {
  local pid="$1"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    kill "${pid}"
    for _ in {1..20}; do
      if kill -0 "${pid}" 2>/dev/null; then
        sleep 0.1
      else
        return 0
      fi
    done
    kill -9 "${pid}" 2>/dev/null || true
  fi
}

if [[ -f "${PID_FILE}" ]]; then
  PID="$(cat "${PID_FILE}")"
  stop_pid "${PID}"
  rm -f "${PID_FILE}"
  echo "MailAgent stopped (pid ${PID})."
  exit 0
fi

if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti tcp:${PORT} || true)"
  if [[ -n "${PIDS}" ]]; then
    for pid in ${PIDS}; do
      stop_pid "${pid}"
    done
    echo "MailAgent stopped (port ${PORT})."
    exit 0
  fi
fi

echo "MailAgent is not running."
