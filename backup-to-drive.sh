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
# בחינות-נייט ושיווק נוספו אחרי ש-scripts/backup_status.py סימן אותן ✗: שתיהן ב-.gitignore
# מסיבה טובה (זכויות יוצרים, וידאו כבד), והתוצאה הייתה שהן היו קיימות במקום אחד בעולם.
# 41 מבחני נייט סרוקים אינם ניתנים לשחזור בכלל אם הדיסק הזה נעלם.
# --exclude על node_modules ו-out: נוספו ב-5.8 כשפרויקט Remotion נכנס ל-שיווק/.
# שניהם נבנים מחדש בפקודה אחת (npm i / remotion render), ובלעדי החריגה הגיבוי
# מעתיק מאות מגה של תלויות בכל הרצה ונתקע לדקות ארוכות.
# rsync אינו מותקן על המכונה הזאת (נבדק 5.8). גם cpio אינו מותקן — ההערה הקודמת כאן
# טענה ש"הוא קיים בכל Git Bash", וזה פשוט לא נכון על המכונה הזאת.
#
# ⚠ הכשל שזה גרם, והוא הסיבה שהשורות האלה נכתבו מחדש: `... 2>/dev/null && echo "$d"`
# בלע את "cpio: command not found", הלולאה לא הדפיסה כלום, והסקריפט סיים ב-"done".
# כלומר **הגיבוי דיווח הצלחה בזמן שלא העתיק ולו קובץ אחד** מששת הספריות. גיבוי שקט
# שנכשל גרוע מאין גיבוי, כי מסתמכים עליו. נתפס ב-5.8.2026 כשקובץ שנכתב באותו רגע לא
# הגיע לדרייב.
#
# tar קיים (GNU tar 1.35, נבדק), ו---exclude שלו מייתר את find. השגיאות אינן נבלעות
# יותר, ושורת ה-echo מדווחת כישלון במקום להיעלם.
for d in "דוחות" migrations supabase tests "בחינות-נייט" "שיווק"; do
  [ -d "$SRC/$d" ] || continue
  if ( cd "$SRC" && tar -cf - --exclude=node_modules --exclude=out "$d" ) \
     | ( cd "$DST" && tar -xf - ); then
    echo "  $d"
  else
    echo "  ✗ $d — הגיבוי נכשל" >&2
  fi
done
# .js so Drive does not treat it as code to run; it holds only the public anon key
cp "$SRC/config.js" "$DST/config.js.txt" 2>/dev/null && echo "  config.js"
# מסמכי ההקמה — הנוהל להקים את Supabase מאפס. בלעדיהם שחזור הוא ניחוש.
cp "$SRC/supabase-setup.md" "$DST/supabase-setup.md" 2>/dev/null && echo "  supabase-setup.md"

printf 'גובה: %s\n' "$(date '+%Y-%m-%d %H:%M')" > "$DST/מתי-גובה.txt"
echo "done → $DST"
