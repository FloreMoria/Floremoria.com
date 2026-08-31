#!/usr/bin/env bash
# Vercel Ignored Build Step — exit 0 = skip deploy, exit 1 = esegui build.
# Non usare `git diff`: .vercelignore esclude .git dal clone Vercel.
set -euo pipefail

MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"

if echo "$MSG" | grep -qiE '\[(skip ci|skip vercel|skip deploy)\]'; then
  echo "Skip build Vercel: commit message con tag skip."
  exit 0
fi

exit 1
