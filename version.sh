#!/usr/bin/env bash
# האם מה שאצלי במחשב זהה למה שבאוויר?
# הרצה:  bash version.sh
set -uo pipefail
cd "$(dirname "$0")"

LOCAL_V=$(grep -oE 'app\.js\?v=[0-9]+' index.html | head -1 | grep -oE '[0-9]+')
LOCAL_REV=$(grep -oE "REV = '[0-9]+'" sw.js | grep -oE '[0-9]+')
LOCAL_SHA=$(git rev-parse --short HEAD)
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo '?')

# GitHub Pages serves index.html with max-age=600, so a plain curl can read a stale copy
# and report a false mismatch. Ask the CDN explicitly not to hand us its cache.
LIVE_V=$(curl -sS -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
         "https://800-plus.com/index.html?probe=$RANDOM$(date +%s)" \
         | grep -oE 'app\.js\?v=[0-9]+' | head -1 | grep -oE '[0-9]+')
LIVE_SHA=$(gh api repos/Hagay-BOT/milim/pages/builds/latest --jq '.commit' 2>/dev/null | cut -c1-7)
LIVE_ST=$(gh api repos/Hagay-BOT/milim/pages/builds/latest --jq '.status' 2>/dev/null)

echo
echo "  ┌─ מקומי ────────────────────────────────"
echo "  │  גרסת נכסים : ${LOCAL_V:-?}"
echo "  │  SW REV     : ${LOCAL_REV:-?}"
echo "  │  commit     : $LOCAL_SHA"
echo "  │  לא נשמרו   : $DIRTY קבצים"
echo "  │  לא נדחפו   : $AHEAD commits"
echo "  └────────────────────────────────────────"
echo "  ┌─ באוויר ───────────────────────────────"
echo "  │  גרסת נכסים : ${LIVE_V:-לא נגיש}"
echo "  │  commit     : ${LIVE_SHA:-?}  (${LIVE_ST:-?})"
echo "  └────────────────────────────────────────"
echo

problems=0
[ -n "${LIVE_V:-}" ] && [ "${LOCAL_V:-x}" != "$LIVE_V" ] && {
  echo "  ⚠  גרסת הנכסים שונה: מקומי ${LOCAL_V:-?} · באוויר $LIVE_V  (ה-CDN יכול לפגר עד 10 דק׳)"; problems=1; }
[ -z "${LIVE_V:-}" ] && { echo "  ⚠  לא הצלחתי לקרוא את הגרסה שבאוויר"; problems=1; }
[ "${LOCAL_V:-x}" != "${LOCAL_REV:-y}" ] && {
  echo "  ⚠  index.html (v=$LOCAL_V) ו-sw.js (REV=$LOCAL_REV) לא תואמים — המכשירים יקבלו קוד ישן"; problems=1; }
[ "$DIRTY" != "0" ] && { echo "  ⚠  יש $DIRTY שינויים שלא נשמרו ב-commit"; problems=1; }
[ "$AHEAD" != "0" ] && [ "$AHEAD" != "?" ] && { echo "  ⚠  יש $AHEAD commits שלא נדחפו"; problems=1; }
[ "$problems" = "0" ] && echo "  ✓  הכול מסונכרן."
echo
