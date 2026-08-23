#!/usr/bin/env bash
# daily-verbale-cron.sh — chiusura automatica verbale di giornata (23:50 Europe/Rome)
#
# Flusso:
#   1. Legge docs/verbali/.today_log.txt filtrando SOLO le righe [YYYY-MM-DD …] del giorno
#   2. Compila/aggiorna docs/verbali/DD-MM-YYYY.md
#   3. npm run log:verbale:sync-docs (con VERBALE_RESET_TODAY_LOG=1)
#   4. commit + push
#   5. garanzia: .today_log.txt a 0 byte
#
# Uso:
#   ./scripts/daily-verbale-cron.sh
#   DRY_RUN=1 ./scripts/daily-verbale-cron.sh   # nessun write/git
#
# Assumption: eseguito sulla macchina di sviluppo con accesso SSH a GitHub
# e vault Obsidian raggiungibile dagli script di sync.

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
SECTION_MARKER="## Registro operativo automatico (.today_log)"
DRY_RUN="${DRY_RUN:-0}"

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

ISO="$(date '+%Y-%m-%d')"
DOCS_NAME="$(date '+%d-%m-%Y').md"
DOCS_PATH="${ROOT}/docs/verbali/${DOCS_NAME}"
DAY_NUM="$(date '+%-d' 2>/dev/null || date '+%d' | sed 's/^0//')"
YEAR="$(date '+%Y')"
MONTH_NUM="$(date '+%m')"
case "${MONTH_NUM}" in
  01) MONTH_NAME="Gennaio" ;;
  02) MONTH_NAME="Febbraio" ;;
  03) MONTH_NAME="Marzo" ;;
  04) MONTH_NAME="Aprile" ;;
  05) MONTH_NAME="Maggio" ;;
  06) MONTH_NAME="Giugno" ;;
  07) MONTH_NAME="Luglio" ;;
  08) MONTH_NAME="Agosto" ;;
  09) MONTH_NAME="Settembre" ;;
  10) MONTH_NAME="Ottobre" ;;
  11) MONTH_NAME="Novembre" ;;
  12) MONTH_NAME="Dicembre" ;;
  *) MONTH_NAME="Mese" ;;
esac
TITLE_DATE="${DAY_NUM} ${MONTH_NAME} ${YEAR}"

log "=== Avvio daily-verbale-cron (ISO=${ISO}, file=${DOCS_NAME}, DRY_RUN=${DRY_RUN}) ==="

if [[ ! -f "${TODAY_LOG}" ]]; then
  log "SKIP: ${TODAY_LOG} assente — niente da verbalizzare."
  exit 0
fi

# Filtro rigido: solo righe con prefisso [YYYY-MM-DD …] della giornata di riferimento.
# Scarta timestamp di date precedenti rimasti accidentalmente nel buffer.
RAW_LINES="$(grep -E '[[:alnum:]]' "${TODAY_LOG}" || true)"
if [[ -z "${RAW_LINES}" ]]; then
  log "SKIP: .today_log.txt vuoto — niente da verbalizzare."
  if [[ "${DRY_RUN}" != "1" ]]; then
    : > "${TODAY_LOG}"
  fi
  exit 0
fi

LOG_BODY="$(printf '%s\n' "${RAW_LINES}" | grep -E "^\[${ISO}( |])" || true)"
DISCARDED_BODY="$(printf '%s\n' "${RAW_LINES}" | grep -Ev "^\[${ISO}( |])" || true)"
DISCARDED_COUNT=0
if [[ -n "${DISCARDED_BODY}" ]]; then
  DISCARDED_COUNT="$(printf '%s\n' "${DISCARDED_BODY}" | grep -c . || true)"
  log "Scartate ${DISCARDED_COUNT} righe con data ≠ ${ISO} (residui buffer)."
fi

if [[ -z "${LOG_BODY}" ]]; then
  log "SKIP: nessuna riga con prefisso [${ISO}] — niente da verbalizzare per oggi."
  if [[ "${DRY_RUN}" != "1" ]]; then
    : > "${TODAY_LOG}"
    log "Buffer .today_log.txt comunque svuotato (residui scartati)."
  fi
  exit 0
fi

LINE_COUNT="$(printf '%s\n' "${LOG_BODY}" | grep -c . || true)"
log "Letto .today_log.txt filtrato (${LINE_COUNT} righe del ${ISO})."

build_bullets() {
  printf '%s\n' "${LOG_BODY}" | while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" ]] && continue
    printf -- '- %s\n' "${line}"
  done
}

BULLETS="$(build_bullets)"

NEW_SECTION="$(cat <<EOF
${SECTION_MARKER}

Registro accumulato automaticamente da Cursor durante la giornata (fonte: \`docs/verbali/.today_log.txt\`, solo righe \`${ISO}\`).

${BULLETS}
EOF
)"

FULL_VERBALE="$(cat <<EOF
---
title: "Verbale Operativo Automatico — ${TITLE_DATE}"
date: ${ISO}
tags: [floremoria, verbale, automatico, cursor, today_log]
author: BARBARA (Staff AI) & daily-verbale-cron
---

# Verbale Operativo Automatico — ${TITLE_DATE}

**Società:** FloreMoria S.r.l. (Startup Innovativa)  
**Redazione:** BARBARA (Staff AI) & cron locale (\`scripts/daily-verbale-cron.sh\`)  
**Ambiente:** Dashboard Next.js / IDE Cursor / Production Vercel  
**Giornata di riferimento:** ${ISO}

---

${NEW_SECTION}
EOF
)"

if [[ "${DRY_RUN}" == "1" ]]; then
  log "DRY_RUN: anteprima verbale (${DOCS_NAME}):"
  if [[ -f "${DOCS_PATH}" ]]; then
    log "DRY_RUN: file esistente → verrebbe aggiornata la sezione registro operativo."
  else
    log "DRY_RUN: file assente → verrebbe creato verbale nuovo."
  fi
  printf '%s\n' "${NEW_SECTION}" | tee -a "${LOG_FILE}"
  log "DRY_RUN: fine (nessuna scrittura/git)."
  exit 0
fi

# Compila verbale: non sovrascrivere integrazioni Regia; aggiorna/appende solo la sezione log.
if [[ -f "${DOCS_PATH}" ]]; then
  EXISTING="$(cat "${DOCS_PATH}")"
  if grep -Fq "${SECTION_MARKER}" "${DOCS_PATH}"; then
    # Sostituisce dalla marker fino a EOF senza toccare il contenuto Regia precedente.
    DOCS_PATH="${DOCS_PATH}" NEW_SECTION="${NEW_SECTION}" python3 <<'PY'
import os
from pathlib import Path

path = Path(os.environ["DOCS_PATH"])
section = os.environ["NEW_SECTION"]
marker = "## Registro operativo automatico (.today_log)"
text = path.read_text(encoding="utf-8")
idx = text.find(marker)
if idx == -1:
    path.write_text(text.rstrip() + "\n\n---\n\n" + section + "\n", encoding="utf-8")
else:
    path.write_text(text[:idx].rstrip() + "\n\n---\n\n" + section + "\n", encoding="utf-8")
PY
    log "Aggiornata sezione registro in ${DOCS_NAME}."
  else
    printf '\n\n---\n\n%s\n' "${NEW_SECTION}" >> "${DOCS_PATH}"
    log "Append sezione registro a verbale esistente ${DOCS_NAME}."
  fi
else
  printf '%s\n' "${FULL_VERBALE}" > "${DOCS_PATH}"
  log "Creato verbale nuovo ${DOCS_NAME}."
fi

# Changelog leggero allineato al verbale
CHANGELOG_PATH="${ROOT}/docs/changelog/${ISO}.md"
if [[ ! -f "${CHANGELOG_PATH}" ]]; then
  cat > "${CHANGELOG_PATH}" <<EOF
# Changelog operativo — ${TITLE_DATE}

Registro allineato a \`docs/verbali/${DOCS_NAME}\` (generato da \`.today_log.txt\` via cron, filtro data ${ISO}).

## Registro operativo

${BULLETS}
EOF
  log "Creato changelog ${ISO}.md."
else
  if ! grep -Fq "Registro operativo (.today_log)" "${CHANGELOG_PATH}"; then
    cat >> "${CHANGELOG_PATH}" <<EOF

## Registro operativo (.today_log)

${BULLETS}
EOF
    log "Append registro operativo a changelog esistente."
  fi
fi

log "Eseguo npm run log:verbale:sync-docs (con reset buffer)…"
export VERBALE_RESET_TODAY_LOG=1
npm run log:verbale:sync-docs
log "Sync Obsidian completato."

# Commit solo artefatti verbale (mai workspace Obsidian)
git add \
  "docs/verbali/${DOCS_NAME}" \
  "docs/changelog/${ISO}.md" \
  "notes/obsidian/verbali/${ISO}-Verbale-giornaliero.md" 2>/dev/null || true

# staged?
if git diff --cached --quiet; then
  log "Nessuna differenza da committare dopo sync — reset log comunque."
else
  COMMIT_MSG="chore(verbali): sincronizzato verbale automatico ${DOCS_NAME%.md}"
  git commit -m "${COMMIT_MSG}"
  log "Commit creato: ${COMMIT_MSG}"

  # Rebase soft se remoto avanti, poi push
  if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
    git pull --rebase --autostash origin "$(git rev-parse --abbrev-ref HEAD)" || {
      notify_fail "git pull --rebase fallito — log NON resettato."
      exit 1
    }
  fi
  git push origin HEAD
  log "Push completato su origin."
fi

# Garanzia buffer a 0 byte (anche se sync-docs ha già resettato)
: > "${TODAY_LOG}"
log "Reset completato: .today_log.txt a 0 byte."
log "=== Fine daily-verbale-cron OK ==="

if command -v osascript >/dev/null 2>&1; then
  osascript -e "display notification \"Verbale ${DOCS_NAME} sincronizzato e pushato.\" with title \"FloreMoria Verbale Cron\"" >/dev/null 2>&1 || true
fi

exit 0
