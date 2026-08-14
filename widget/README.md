# גאדג'טים ל-800+ · מה אפשר, מה חסום, ומה נבנה כאן

**השאלה:** איך נותנים למשתמשי 800+ ווידג'ט על מסך הבית.

**התשובה הקצרה:** ⛔ **PWA לא יכול לייצר ווידג'ט לא באייפון ולא באנדרואיד.** יש
שלוש דרכים עוקפות, אחת מהן נבנתה כאן ועובדת בלי לשלם כלום.

---

## מה נמצא במחקר · המצב ל-אוגוסט 2026

| פלטפורמה | ווידג'ט מ-PWA? | מה כן |
|---|---|---|
**iOS** | ⛔ **לא** | ווידג'ט מחייב WidgetKit = קוד Swift באפליקציה נייטיב. iOS 26 הוסיף מצב web-app כברירת מחדל, אבל **הפער הזה לא נסגר** |
**Android** | ⛔ **לא** | אין API. `AppWidgetProvider` הוא קוד נייטיב, ו-Chrome אינו חושף אותו לאתר |
**Windows 11** | ✅ כן | Edge תומך ב-`widgets` ב-manifest, דרך Adaptive Cards. **ניסיוני**, ולא רלוונטי לתלמידים בנייד |

מה שכן זמין ל-PWA בנייד היום: **Web Push** (iOS 16.4+) · **Badging API**
(מספר על האייקון) · **`shortcuts`** ב-manifest (אנדרואיד בלבד; iOS לא תומך).

## שלוש הדרכים שכן עובדות, לפי עלות

### 1 · Scriptable — ⭐ נבנה כאן, עלות 0

אפליקציה חינמית באפ-סטור שמריצה JavaScript ומרנדרת **ווידג'ט נייטיב אמיתי**.
המשתמש מתקין אותה, מדביק סקריפט, ומוסיף ווידג'ט. **בלי חשבון מפתח, בלי מק,
בלי אפ-סטור משלנו.**

⚠ המחיר: המשתמש צריך להתקין אפליקציה נוספת ולהדביק קוד. זה מסנן — מתאים
למשתמשים מחוברים, לא להמונים. באנדרואיד המקבילה היא KWGT.

### 2 · עטיפה נייטיב — הדרך ה"אמיתית"

| | אנדרואיד | iOS |
|---|---|---|
העטיפה | TWA דרך PWABuilder/Bubblewrap | Capacitor / עטיפה דקה |
הווידג'ט | `AppWidgetProvider` ב-Kotlin | WidgetKit ב-Swift |
עלות | **25$ חד-פעמי** (Play) | **99$ לשנה** (Apple) |
צריך מק? | לא — Android Studio על ווינדוס | כן, או CI ענן (Codemagic) |

⚠ Bubblewrap מייצר פרויקט אנדרואיד שאפשר לפתוח ב-Android Studio ולהוסיף אליו
ווידג'ט — אבל **לא מצאתי מדריך שמחבר את שני הדברים**. זו עבודה שצריך לעשות,
לא להעתיק.

### 3 · אפליקציות ווידג'ט גנריות — עלות 0, בלי קוד

`Widgy` · `API Widget` — קוראות JSON מכתובת ומציגות אותו. אותה נקודת קצה שנבנתה
כאן משרתת גם אותן.

---

## מה נבנה כאן, ועובד

### `build_widget_json.js` → `widget.json`

נקודת קצה סטטית אחת שכל גאדג'ט קורא ממנה. **קובץ סטטי ולא Supabase**, כי גאדג'ט
הוא קריאה בלבד בלי משתמש מחובר: אין מפתח, אין RLS, ואי אפשר לדלוף דרכו נתוני
משתמש.

⛔ המילים נלקחות מ-`data.js` — **המאגר שכבר באתר** — ולא מהמאגר החדש. פרסום
מילים חדשות מוקפא.

### ⭐ הבחירה: תמורה, לא גיבוב

הגרסה הראשונה גיבבה את התאריך לאינדקס. מדדתי: **33 חזרות ב-365 ימים.** זו בעיית
יום ההולדת ולא באג, אבל "מילת היום" שחוזרת פעמיים בחודשיים נראית כמו תקלה.

**התיקון:** תמורה דטרמיניסטית של כל המאגר בזרע קבוע, וקידום ביום.

| | חזרות |
|---|---:|
גיבוב · 365 ימים | 33 |
**תמורה · 365 ימים** | **0** |
**תמורה · 1,717 ימים (מחזור מלא)** | **0** |

שני שערים בקוד: אותו תאריך נותן אותה מילה, וימים סמוכים נותנים מילים שונות.

### `800plus.scriptable.js`

הווידג'ט עצמו — צבעי המותג, יישור לימין, מצב נפילה מפורש. ⚠ ווידג'ט שנופל מציג
מסך ריק והמשתמש חושב שהאפליקציה שבורה, ולכן יש הודעה ולא ריק.

**התקנה למשתמש:** Scriptable מהאפ-סטור ← סקריפט חדש ← להדביק ← לחיצה ארוכה על
מסך הבית ← + ← Scriptable ← לבחור.

---

## ⚠ שלושה דברים שחייבים להיאמר

1. ⛔ **`widget.json` עדיין לא באוויר.** הוא נוצר מקומית. כדי שגאדג'ט יקרא ממנו
   צריך לפרוס אותו ל-`800-plus.com/widget/widget.json`, וזו החלטת פריסה.
   ובנוסף — הקובץ צריך להתעדכן כל יום, כלומר משימה מתוזמנת.
2. ⛔ **אין קישור עמוק למילה.** בדקתי: `app.js` אינו קורא `URLSearchParams`,
   `location.search` או `location.hash` בכלל. לכן הווידג'ט פותח את האתר ולא את
   המילה. הכנסתי `url` לאתר בלבד — לשלוח קישור שמרמז על יכולת שאין זה באג.
   ⭐ אותה חוסר-ניתוב היא גם הסיבה ש-`shortcuts` ב-manifest לא יעזור כרגע.
3. ⚠ **iOS מחליט מתי לרענן ווידג'טים.** `refreshAfterDate` היא בקשה ולא הבטחה.

## הרצה

```
node widget/build_widget_json.js                 היום
node widget/build_widget_json.js 2026-09-01 --days 30
```

## המקורות

- [PWA widgets ב-Windows · Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/widgets)
- [PWA-driven Widgets Explainer · MSEdgeExplainers](https://microsoftedge.github.io/MSEdgeExplainers/PWAWidgets/)
- [מה PWA יכול ולא יכול ב-iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios)
- [מגבלות PWA ב-iOS · Safari](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Scriptable · תיעוד ListWidget](https://docs.scriptable.app/listwidget/)
- [PWABuilder · פלטפורמת אנדרואיד TWA](https://github.com/pwa-builder/pwabuilder-android-twa)
- [Trusted Web Activities · Android Developers](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [ווידג'טים באנדרואיד · vogella](https://www.vogella.com/tutorials/AndroidWidgets/article.html)
- [shortcuts ב-manifest · MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)
- [בניית אפליקציית iOS בלי מק · Capawesome](https://capawesome.io/blog/how-to-build-and-deploy-ios-apps-without-a-mac/)
