#!/usr/bin/env bash
# daily-verbale-cron.sh — verbale del GIORNO PRECEDENTE alle 05:00 Europe/Rome
#
# Flusso:
#   1. ISO = ieri (o VERBALE_ISO=YYYY-MM-DD)
#   2. Estrae righe [.today_log] di ieri + git log 00:00–23:59
#   3. Scrive docs/verbali/DD-MM-YYYY.md (4 sezioni operative)
#   4. npm run log:verbale:sync-docs → notes/obsidian/verbali/
#   5. Toglie dal buffer le righe del giorno verbalizzato
#   6. commit + push (salvo SKIP_GIT=1)
#
# Uso:
#   ./scripts/daily-verbale-cron.sh
#   VERBALE_ISO=2026-08-23 SKIP_GIT=1 ./scripts/daily-verbale-cron.sh
#   DRY_RUN=1 ./scripts/daily-verbale-cron.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export LANG="${LANG:-it_IT.UTF-8}"
export LC_ALL="${LC_ALL:-it_IT.UTF-8}"
export TZ="Europe/Rome"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i ${HOME}/.ssh/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes}"

LOG_DIR="${ROOT}/logs"
LOG_FILE="${LOG_DIR}/daily-verbale-cron.log"
TODAY_LOG="${ROOT}/docs/verbali/.today_log.txt"
DRY_RUN="${DRY_RUN:-0}"
SKIP_GIT="${SKIP_GIT:-0}"

mkdir -p "${LOG_DIR}"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[${ts}] $*" | tee -a "${LOG_FILE}"
}

notify_fail() {
  local msg="$1"
  log "ERROR: ${msg}"
  if command -v osascript >/dev/null 2>&1; then
    local escaped
    escaped="$(printf '%s' "${msg}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    osascript -e "display notification \"${escaped}\" with title \"FloreMoria Verbale Cron\" sound name \"Basso\"" >/dev/null 2>&1 || true
  fi
}

on_err() {
  local code=$?
  notify_fail "daily-verbale-cron fallito (exit ${code}). Vedi ${LOG_FILE}"
  exit "${code}"
}
trap on_err ERR

if [[ -n "${VERBALE_ISO:-}" ]]; then
  ISO="${VERBALE_ISO}"
else
  ISO="$(date -v-1d '+%Y-%m-%d' 2>/dev/null || date -d 'yesterday' '+%Y-%m-%d')"
fi

DOCS_NAME="$(date -j -f '%Y-%m-%d' "${ISO}" '+%d-%m-%Y.md' 2>/dev/null || python3 -c "from datetime import datetime; d=datetime.strptime('${ISO}','%Y-%m-%d'); print(d.strftime('%d-%m-%Y.md'))")"
DOCS_PATH="${ROOT}/docs/verbali/${DOCS_NAME}"
OBS_PATH="${ROOT}/notes/obsidian/verbali/${ISO}-Verbale-giornaliero.md"

log "=== Avvio daily-verbale-cron (ISO ieri/ref=${ISO}, file=${DOCS_NAME}, DRY_RUN=${DRY_RUN}) ==="

if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY_RUN: git log ${ISO} 00:00–23:59"
  git log --since="${ISO} 00:00:00" --until="${ISO} 23:59:59" --pretty=format:"%h - %s" --no-merges || true
  echo
  if [[ -f "${TODAY_LOG}" ]]; then
    log "DRY_RUN: righe .today_log [${ISO}]"
    grep -E "^\[${ISO}( |])" "${TODAY_LOG}" || log "(nessuna riga log)"
  fi
  log "DRY_RUN: fine (nessuna scrittura/git)."
  exit 0
fi

log "Genero verbale da Git + .today_log…"
export VERBALE_ISO="${ISO}"
npx tsx Script/generate-daily-verbale.ts
if [[ ! -f "${DOCS_PATH}" ]]; then
  log "SKIP: nessun verbale generato per ${ISO} (fonti vuote)."
  exit 0
fi

log "Eseguo npm run log:verbale:sync-docs…"
npm run log:verbale:sync-docs
log "Sync Obsidian completato (${OBS_PATH})."

# Toglie dal buffer le righe del giorno verbalizzato (tiene eventuale giornata nuova).
if [[ -f "${TODAY_LOG}" ]]; then
  FILTERED="$(grep -Ev "^\[${ISO}( |])" "${TODAY_LOG}" || true)"
  if [[ -z "${FILTERED}" ]]; then
    : > "${TODAY_LOG}"
    log "Buffer .today_log.txt a 0 byte (nessuna riga residua)."
  else
    printf '%s\n' "${FILTERED}" > "${TODAY_LOG}"
    log "Buffer .today_log.txt: rimosse righe ${ISO}, conservate le altre."
  fi
else
  : > "${TODAY_LOG}"
  log "Creato .today_log.txt vuoto."
fi

if [[ "${SKIP_GIT}" == "1" ]]; then
  log "SKIP_GIT=1: nessun commit/push."
  log "=== Fine daily-verbale-cron OK (no git) ==="
  exit 0
fi

git add \
  "docs/verbali/${DOCS_NAME}" \
  "notes/obsidian/verbali/${ISO}-Verbale-giornaliero.md" \
  "docs/verbali/.today_log.txt" 2>/dev/null || true

if git diff --cached --quiet; then
  log "Nessuna differenza da committare dopo sync."
else
  COMMIT_MSG="docs(verbali): auto-sync verbale del giorno precedente"
  git commit -m "${COMMIT_MSG}"
  log "Commit creato: ${COMMIT_MSG}"
  if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
    git pull --rebase --autostash origin "$(git rev-parse --abbrev-ref HEAD)" || {
      notify_fail "git pull --rebase fallito."
      exit 1
    }
  fi
  git push origin HEAD
  log "Push completato su origin."
fi

log "=== Fine daily-verbale-cron OK ==="

if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"Verbale ${DOCS_NAME} sincronizzato.\" with title \"FloreMoria Verbale Cron\"" >/dev/null 2>&1 || true
fi

exit 0
