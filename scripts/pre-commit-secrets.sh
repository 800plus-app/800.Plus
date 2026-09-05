#!/bin/sh
# ══════════════════════════════════════════════════════════════════════════════
# שער סודות לפני קומיט — 800+
#
# למה זה קיים
# ------------
# הריפו הזה ציבורי, כי GitHub Pages מגיש ממנו את 800-plus.com. שני כשלים כבר
# קרו בו: ריצה ידנית של backup.yml פרסמה 14 כתובות מייל, בלובי התקדמות עם
# אסוציאציות פרטיות ו-12 שורות עם user_id לענף ציבורי (נמחק ב-2.8.2026);
# וסשן מקביל הריץ `git add` גורף על אותו עץ עבודה.
#
# .gitignore מגן היטב — אבל רק על מה שמישהו כבר חשב עליו. `git add -A` בסשן
# שלא קרא אותו, על קובץ חדש שאיש לא צפה, עוקף אותו לגמרי. השער הזה בודק את
# מה שבאמת עומד להיכנס, ולא את מה שתוכנן להיכנס.
#
# מה הוא אינו
# ------------
# הוא אינו gitleaks. הוא מכיר את צורות הסוד של הפרויקט הזה בלבד, ואין לו
# entropy detection. היתרון: אפס תלויות, רץ במאיות שנייה, ואפשר לקרוא אותו
# בשלוש דקות. אם יותקן gitleaks בעתיד — הוא מחליף את הקובץ הזה, לא מתווסף לו.
#
# עקיפה מכוונת (רק אחרי שהסתכלת ואתה בטוח):
#   git commit --no-verify
# ══════════════════════════════════════════════════════════════════════════════

RED=$(printf '\033[31m'); YEL=$(printf '\033[33m'); OFF=$(printf '\033[0m')
fail=0

say() { printf '%s\n' "$*" >&2; }

# ── 1 · קבצים שלעולם אינם נכנסים, לפי שם ─────────────────────────────────────
# .env נבדק כאן ולא בתוכן, כי קובץ .env ריק היום מתמלא מחר.
# בלי ארגומנט: מה שמוכן לקומיט (המצב של ה-hook).
# עם ארגומנט: טווח קומיטים — כך אותו קובץ בדיוק משמש גם את ה-workflow ב-CI,
# ואין שתי רשימות תבניות שיכולות להיפרד זו מזו.
RANGE=${1:---cached}
names=$(git diff $RANGE --name-only --diff-filter=AM)
for f in $names; do
  case "$f" in
    .env|.env.*|*.env)              [ "$f" = ".env.example" ] || { say "${RED}✖ קובץ סביבה:${OFF} $f"; fail=1; } ;;
    *סיסמא*|*סיסמאת*)                say "${RED}✖ שם קובץ מכיל 'סיסמא':${OFF} $f"; fail=1 ;;
    *.pem|*.key|*id_rsa*|*.p12|*.pfx) say "${RED}✖ קובץ מפתח:${OFF} $f"; fail=1 ;;
    migrations/*)                    say "${YEL}⚠ migrations/ בדרך כלל ב-.gitignore:${OFF} $f"; fail=1 ;;
  esac
done

# ── 2 · תוכן ─────────────────────────────────────────────────────────────────
# רק שורות שנוספות (^+), ובלי -U0 כדי שגם ההקשר ייראה בהודעה.
added=$(git diff $RANGE --diff-filter=AM -U0 | grep '^+' | grep -v '^+++')

hit() {  # hit <תבנית> <תיאור>
  # -- כדי שתבנית שמתחילה במקף (מפתח פרטי) לא תיקרא כדגל של grep
  m=$(printf '%s\n' "$added" | grep -nE -- "$1" | head -3)
  [ -n "$m" ] && { say "${RED}✖ $2${OFF}"; printf '%s\n' "$m" | cut -c1-120 | sed 's/^/    /' >&2; fail=1; }
}

# JWT בן שלושה חלקים. זו הצורה של service_role ושל anon הישן כאחד — אין דרך
# להבדיל ביניהם מהמחרוזת, ולכן שניהם נחסמים ומי שצריך מסתכל.
hit 'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}' 'טוקן JWT'

# מפתחות Supabase החדשים. sb_publishable_ מותר במפורש — הוא פומבי ויושב ב-config.js.
hit 'sb_secret_[A-Za-z0-9_-]{8,}'                     'מפתח Supabase סודי (sb_secret_)'
hit 'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9]' 'הצבת ערך ל-SERVICE_ROLE_KEY'
hit 'SUPABASE_SERVICE_KEY[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9]'      'הצבת ערך ל-SERVICE_KEY'

hit 're_[A-Za-z0-9]{20,}'                             'מפתח Resend'
hit 'gh[pousr]_[A-Za-z0-9]{30,}'                      'טוקן GitHub'
hit 'github_pat_[A-Za-z0-9_]{30,}'                    'טוקן GitHub (fine-grained)'
hit '\-\-\-\-\-BEGIN [A-Z ]*PRIVATE KEY\-\-\-\-\-'    'מפתח פרטי'
hit 'BILLING_WEBHOOK_SECRET[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9]' 'הצבת ערך לסוד ה-webhook'
hit 'PUSH_TRIGGER_SECRET[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9]'    'הצבת ערך לסוד ה-push'
hit 'VAPID_PRIVATE[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9]'          'מפתח VAPID פרטי'

# ── 3 · כתובות מייל של משתמשים ───────────────────────────────────────────────
# ב-1.8 דלפו 14 כתובות מייל לענף ציבורי. כל כתובת @gmail.com שנוספת נחסמת,
# חוץ משתי החרגות מפורשות (רשימה, לא ניחוש):
#   · 03hagay@gmail.com — הכתובת של חגי עצמו, מופיעה בכוונה בקבצי תפעול.
#   · .github/workflows/uptime.yml — התראות הזמינות נשלחות לכתובת שלו משם.
mail_added=$(git diff $RANGE --diff-filter=AM -U0 -- . ':(exclude).github/workflows/uptime.yml' | grep '^+' | grep -v '^+++')
mails=$(printf '%s\n' "$mail_added" | grep -oE '[A-Za-z0-9._%+-]+@gmail\.com' | grep -v '^03hagay@gmail\.com$' | sort -u | head -3)
[ -n "$mails" ] && { say "${RED}✖ כתובת מייל של משתמש (gmail)${OFF}"; printf '%s\n' "$mails" | sed 's/^/    /' >&2; fail=1; }

if [ "$fail" -ne 0 ]; then
  say ""
  say "${RED}הקומיט נעצר.${OFF} הריפו הזה ציבורי — מה שנכנס להיסטוריה לא יוצא ממנה."
  say "אם זו התראת שווא:  ${YEL}git commit --no-verify${OFF}"
  exit 1
fi
exit 0
