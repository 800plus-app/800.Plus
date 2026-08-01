#!/usr/bin/env bash
# Everything that exists ONLY on this machine, copied to Drive.
#
# `דוחות/` and `migrations/` are both in .gitignore — deliberately, they hold exam-derived
# material and setup notes that should not sit in a public repo. The consequence nobody had
# looked at: they existed in exactly one place, and that place is a laptop.
#
# Run it whenever a report is written. It is a copy, not a sync — nothing here ever deletes.
set -u
SRC="C:/Users/03hag/Claude projects/800+"
DST="/g/האחסון שלי/800+ גיבוי"

if [ ! -d "/g/האחסון שלי" ]; then
  echo "Drive is not mounted — Drive for Desktop is not running. Nothing copied." >&2
  exit 1
fi

mkdir -p "$DST"
for d in "דוחות" migrations supabase tests; do
  [ -d "$SRC/$d" ] && cp -r "$SRC/$d" "$DST/" && echo "  $d"
done
# .js so Drive does not treat it as code to run; it holds only the public anon key
cp "$SRC/config.js" "$DST/config.js.txt" 2>/dev/null && echo "  config.js"

printf 'גובה: %s\n' "$(date '+%Y-%m-%d %H:%M')" > "$DST/מתי-גובה.txt"
echo "done → $DST"
