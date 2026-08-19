# העלאת השלמת המשפטים לאתר

## ⛔ למה אסור למזג את `pipeline-v2` ל-`main`

האתר מוגש מ-`main` (GitHub Pages), והעבודה נעשית ב-`pipeline-v2`. הפיתוי הוא למזג.
**אסור.** נמדד ב-10.8.2026:

| מה | כמה |
|---|---|
`pipeline-v2` לפני `main` | **82 קומיטים** |
קבצי `units_output/` בענף | **419** |
`exams/mining/` | חילוץ מ-22 מבחני עבר |

הענף משותף לשלושה סשנים במקביל, והוא נושא את מאגר המילים בעברית ואת חילוץ מבחני
העבר. חגי הגדיר במפורש: **"עדיין לא לפרסם מילים, זה בכוונה. אפשר לדחוף משפטים."**
מיזוג היה מפרסם את כל זה לאתר במכה אחת, וגם את החומר שיש לו חשיפה משפטית
(ראה `CLAUDE.md`).

⚠ ואם לא די בזה: `origin/pipeline-v2` **קיים ב-GitHub עם 419 קבצי המילים**. הענף
נמחק פעם אחת לבקשת חגי והסשן המקביל דחף אותו מחדש. האתר עצמו נקי, נמדד: `main`
מחזיק אפס קבצים כאלה והאתר החי מחזיר 404.

## מה כן מעלים

הדיף מול `origin/main` הוא **306 שורות בשלושה קבצים**, ולזה מצטרף קובץ נתונים חדש:

```
app.js                    מסך השלמת המשפטים והחיווט
index.html                המסך, העיצוב, וכפתור הכניסה
data-sent-en.js           הקורפוס בגרסת ייצור  (חדש)
data-en.js                שורה אחת: ratify ליחידה 9
sw.js                     העלאת REV
tests/68-sentence-completion.test.js   (חדש)
scripts/serve.js          שרת בדיקה מקומי  (חדש, אינו חלק מהמוצר)
```

⚠ `data-en.js` הוא **מילה אחת**, ולא מאגר: `ratify` נדרשת כי היא מסיח בפריט
`v2#6`, ובלעדיה ההרכבה דוחה אותו. הקובץ הזה כבר ציבורי וכבר מוגש לאתר.

## ⛔ מה במפורש לא עולה

`sentence-completion/` כולו — המנות, השערים, התדריכים, קובצי המדידה והדוחות.
הם כלי עבודה, לא מוצר. הם מקומטים ב-`pipeline-v2` ונשארים שם.

## הפעולה

```bash
cd "C:/Users/03hag/Claude projects/800+"

# 1. ענף העלאה נקי, מ-main ולא מ-pipeline-v2
git fetch origin
git checkout -B deploy-sent origin/main

# 2. רק הקבצים האלה, מפורשים. אין git add -A בשום מקום.
git checkout pipeline-v2 -- app.js index.html data-en.js data-sent-en.js sw.js \
  tests/68-sentence-completion.test.js scripts/serve.js

# 3. שערים לפני הקומיט
node tests/run.js

# 4. קומיט ודחיפה ל-main
git commit -m "..."
git push origin deploy-sent:main
```

## מה מאמתים אחרי

```bash
curl -s https://800-plus.com/data-sent-en.js | head -c 80
curl -s https://800-plus.com/index.html | grep -o 'app.js?v=[0-9]*'
curl -s -o /dev/null -w '%{http_code}\n' https://800-plus.com/units_output/STATE.md   # חייב 404
```

⚠ **אימות בעין, לא רק ב-curl.** בדיקה בדפדפן על האתר החי: הכפתור מופיע בצד
האנגלי בלבד · הבורר מציג ארבע רצועות · שאלה נפתחת · ההסבר נפתח בשלושת החלקים.
`curl` מוכיח שהקובץ שם, ולא שהמסך עובד.
