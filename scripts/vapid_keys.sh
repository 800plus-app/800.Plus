#!/usr/bin/env bash
# מייצר זוג מפתחות VAPID ל-Web Push. openssl בלבד — אין צורך ב-npm ובשום ספרייה.
#
# מה עושים עם הפלט
# -----------------
#   הפומבי  → config.js, בשורה window.VAPID_PUBLIC. פומבי מעצם הגדרתו.
#   הפרטי   → Supabase → Edge Functions → Secrets, בשם VAPID_PRIVATE.
#             לעולם לא בקובץ, לא במאגר, ולא בצ'אט.
#
# הסקריפט מדפיס למסך ואינו כותב לשום קובץ. זה מכוון: מפתח פרטי שנכתב לקובץ הוא מפתח
# פרטי ששוכחים למחוק, ואז הוא נכנס לגיבוי הבא ולמאגר שאחריו.
set -eu

command -v openssl >/dev/null || { echo "openssl אינו מותקן" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/k.pem" 2>/dev/null

# base64url בלי ריפוד — הקידוד שתקן ה-Push דורש בשני המפתחות.
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# הפומבי: 65 בתים גולמיים שמתחילים ב-04. ה-DER עוטף אותם, ולכן חותכים את 26 הבתים
# הראשונים ולוקחים את מה שנשאר.
PUB=$(openssl ec -in "$tmp/k.pem" -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)
# הפרטי: 32 הבתים של d.
PRIV=$(openssl ec -in "$tmp/k.pem" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64url)

[ ${#PUB} -eq 87 ] || { echo "המפתח הפומבי יצא באורך ${#PUB} במקום 87 — openssl ישן?" >&2; exit 1; }

echo
echo "VAPID_PUBLIC   (ל-config.js, שורת window.VAPID_PUBLIC)"
echo "$PUB"
echo
echo "VAPID_PRIVATE  (ל-Supabase → Edge Functions → Secrets. לא לקובץ, לא לצ'אט)"
echo "$PRIV"
echo
echo "וגם: VAPID_SUBJECT = mailto:admin@800-plus.com"
echo
