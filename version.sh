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

LIVE_V=$(curl -s "https://hagay-bot.github.io/milim/index.html?probe=$RANDOM" \
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
[ "${LOCAL_V:-x}" != "${LIVE_REV:-${LIVE_V:-y}}" ] && [ "${LOCAL_V:-x}" != "${LIVE_V:-y}" ] && {
  echo "  ⚠  גרסת הנכסים שונה: מקומי ${LOCAL_V:-?} · באוויר ${LIVE_V:-?}"; problems=1; }
[ "${LOCAL_V:-x}" != "${LOCAL_REV:-y}" ] && {
  echo "  ⚠  index.html (v=$LOCAL_V) ו-sw.js (REV=$LOCAL_REV) לא תואמים — המכשירים יקבלו קוד ישן"; problems=1; }
[ "$DIRTY" != "0" ] && { echo "  ⚠  יש $DIRTY שינויים שלא נשמרו ב-commit"; problems=1; }
[ "$AHEAD" != "0" ] && [ "$AHEAD" != "?" ] && { echo "  ⚠  יש $AHEAD commits שלא נדחפו"; problems=1; }
[ "$problems" = "0" ] && echo "  ✓  הכול מסונכרן."
echo
