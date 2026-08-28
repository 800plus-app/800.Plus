# supabase/ — פונקציות הקצה ונהלי ההפעלה

מה יש כאן:

| קובץ | מה זה |
|---|---|
| `config.toml` | `verify_jwt` לכל פונקציה. **השורה החשובה ביותר בתיקייה.** |
| `functions/billing-webhook/index.ts` | קליטת callback מהספק → אימות → `apply_billing_event` |

הפונקציה נשענת על `migrations/10.sql` ו-`migrations/11.sql`. בלעדיהן היא תחזיר 500
בכל קריאה, כי `apply_billing_event` לא קיימת.

**כל עוד `public.billing_enabled=false` במסד — הפונקציה רושמת אירועים ולא נוגעת
בהרשאה של אף אחד.** אפשר לפרוס אותה היום.

---

## א. נוהל הפריסה — פעם אחת, לא ביום ההפעלה

הפריסה עצמה **הפיכה**: אפשר למחוק את הפונקציה ולא קרה כלום.

1. להתקין את ה-CLI אם אין: `npm i -g supabase`, ואז `supabase login`.
2. לקשר את הפרויקט: `supabase link --project-ref <ref>`
3. להגדיר את הסודות. אלה שלושת המינימליים:
   ```
   supabase secrets set BILLING_PROVIDER=payplus
   supabase secrets set BILLING_ENV=test
   supabase secrets set BILLING_WEBHOOK_SECRET=<מחרוזת אקראית ארוכה, 40+ תווים>
   ```
   את המחרוזת האקראית מייצרים ולא ממציאים:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. לבחור מצב אימות — **זו נקודת ההחלטה שתלויה בשיחת הטלפון ל-PayPlus**:
   - ענף א, יש כותרת חתימה:
     `supabase secrets set BILLING_VERIFY_MODE=hmac BILLING_SIG_HEADER=<שם הכותרת> BILLING_SIG_SCHEME=raw`
     (`raw` / `ts_colon` / `ts_dot` — לפי מה שיגידו איך מחשבים)
   - ענף ב, אין חתימה (ברירת המחדל):
     `supabase secrets set BILLING_VERIFY_MODE=secret_url BILLING_REVERIFY=true`
     וכתובת ה-webhook אצל הספק תיגמר ב-`?k=<אותה מחרוזת סודית>`.
5. לאימות החוזר (חובה בענף ב, מומלץ גם בענף א):
   ```
   supabase secrets set PAYPLUS_API_BASE=<כתובת ה-API מהתיעוד>
   supabase secrets set PAYPLUS_API_KEY=<...> PAYPLUS_SECRET_KEY=<...>
   ```
6. לפרוס: `supabase functions deploy billing-webhook`
7. **לוודא ש-`verify_jwt=false` נתפס.** לא לדלג על הצעד הזה:
   ```
   curl -i https://<ref>.supabase.co/functions/v1/billing-webhook/health
   ```
   200 עם JSON = תקין. **401 = `verify_jwt` עדיין דלוק**, וכל webhook ייפול
   בשקט מוחלט: אין שורה בספר, אין שגיאה בלוגים, והלקוח שילם ולא קיבל כלום.
8. אצל הספק: להגדיר את כתובת ה-callback ל-
   `https://<ref>.supabase.co/functions/v1/billing-webhook` (בענף ב — עם `?k=`).
9. לשלוח עסקת בדיקה ולוודא:
   `select * from public.billing_events order by received_at desc limit 5;`
   שורה עם `processed_at` מלא ו-`error` שאומר `test — נרשם, לא הוחל על ההרשאה`
   היא בדיוק מה שאמור לקרות.

**קריאה מהאפליקציה** חייבת להיות דרך `${SUPA_URL}/functions/v1/...` ולא דרך
`https://<ref>.functions.supabase.co` — הראשון הוא origin שכבר מותר ב-`connect-src`
ב-`index.html`, השני ידרוש שינוי CSP.

---

## ב. נוהל ההדלקה — הצעדים שיש בהם דרך אחת

⚠ **צעדים 5 ו-6 אינם הפיכים בלחיצה.** אחרי צעד 6 יש חיוב באתר, ו-`sub_status`
של כל המשתמשים כבר נכתב מחדש. הדרך היחידה חזרה למצב הקודם היא הגיבוי מצעד 1.

1. **גיבוי.** Supabase → Database → Backups → snapshot ידני. **לרשום את המזהה
   על נייר.** זה הצעד היחיד שאי אפשר לעשות בדיעבד.
2. לשמור את מצב הבסיס:
   ```sql
   select sub_status, count(*) from public.profiles group by sub_status;
   ```
   להעתיק את הפלט לקובץ. זה מה שמשווים אליו אם משהו נראה מוזר.
3. להעביר את הפונקציה ל-live:
   ```
   supabase secrets set BILLING_ENV=live
   supabase secrets set BILLING_WEBHOOK_SECRET=<הסוד של live>
   supabase functions deploy billing-webhook
   ```
   ואז שוב `curl .../health` — פריסה מחדש היא ההזדמנות לשכוח את `verify_jwt`.
4. אצל הספק: להעביר את ה-webhook למצב live, **לשלוח אירוע בדיקה, ולוודא 200
   לפני שממשיכים.** לא להמשיך עם 4xx או 5xx על השולחן.
5. למלא את המחירים: ⚠ **מכאן זה משפיע על מה שמשתמשים רואים.**
   ```sql
   update public.app_config
      set value = '[{"plan":"monthly","provider_price_id":"...","amount":30}]'::jsonb,
          updated_at = now()
    where key = 'public.prices';
   ```
6. **להריץ את `migrations/12.sql`, כבלוק אחד.** ⚠ **בלתי הפיך בלחיצה.**
   קודם המייסדים, אחר כך החלון המוגן, ואז ברירת המחדל, ורק בסוף המתגים.
7. לאמת: שתי שאילתות האימות שבסוף `12.sql`. השנייה **חייבת** להחזיר אפס שורות.
   אם היא מחזירה משהו — לבצע את נוהל ג' עכשיו, ולחקור אחר כך.
8. לפתוח את האפליקציה בחלון פרטי, להיכנס עם חשבון בדיקה, לרכוש בכרטיס אמיתי
   בסכום הנמוך ביותר, לוודא שהגישה נפתחת תוך 60 שניות, ואז לבצע refund ולוודא
   שהיא נסגרת. ⚠ הרכישה עצמה אמיתית — כסף באמת זז.
9. `select * from public.billing_events order by received_at desc limit 20;`
   כל שורה עם `error` או `needs_review` נבדקת **עכשיו**, לא מחר.
10. 24 שעות אחרי:
    `select count(*) from public.billing_events where processed_at is null;`
    חייב להיות 0.
11. ⛔ **אחרי התשלום האמיתי הראשון — להריץ שוב את
    `supabase/rls-isolation-all-tables.sql`, ולקרוא את שש השורות של
    `billing_customers` · `billing_subscriptions` · `payments`.**

    ⚠ **למה זה לא נבדק כבר:** ‏27.8.2026 השאילתה רצה על כל 13 הטבלאות והחזירה
    20 שורות. שבע טבלאות עברו בשני הכיוונים — ⛔ **אבל שלוש טבלאות החיוב חזרו
    `0 שורות · 0 משתמשים`.** ‏RLS שם **לא «עבר», הוא «לא נבדק»**: בטבלה ריקה
    אין מה לבדוק, והבקרה «רואה את עצמו» מחזירה 0 בדיוק כמו כישלון.

    ⭐ **וזה הרגע היחיד שבו זה נבדק באמת** — אחרי שיש שורה אחת, ולפני שיש
    נתונים של לקוחות רבים. **המדד:** לכל אחת מהשלוש, בשני הכיוונים,
    `רואה_את_האחר = 0` **וגם** `רואה_את_עצמו > 0`.

---

## ג. כיבוי חירום — שתי שורות, שניות, בלי deploy

זו הסיבה שהמתג יושב במסד ולא כקבוע ב-`app.js`: `sw.js` מטמין את `app.js`,
ולכן שינוי בקוד מתפשט על פני מחזור טעינה שלם אצל כל משתמש בנפרד — כלומר
**קבוע בקוד אינו ניתן לכיבוי בחירום.**

```sql
update public.app_config set value='false'::jsonb, updated_at=now() where key='public.billing_enabled';
update public.app_config set value='true'::jsonb,  updated_at=now() where key='public.free_phase';
```

מה זה עושה: `free_phase=true` פותח שוב את `has_access` לכל `sub_status='none'`,
ו-`billing_enabled=false` עוצר את `apply_billing_event` מלגעת בהרשאות. **האירועים
ממשיכים להירשם בספר ולא הולכים לאיבוד** — כשמדליקים בחזרה אפשר לעבד אותם.
מה שכבר שולם לא נמחק: `active` ו-`trialing` נשארים, כי הם אמת.

⚠ **מה שהכיבוי אינו עוצר:** תשלומים שכבר בוצעו אצל הספק. אם מכבים בגלל תקלה —
**להשבית את המוצר גם אצל PayPlus**, אחרת אנשים ימשיכו לשלם על מוצר שהוא כרגע
חינם. זה חיוב שווא, והוא נגמר ב-chargeback ובחשיפה לפי חוק הגנת הצרכן
(₪10,000 פיצוי סטטוטורי לכל לקוח, ללא הוכחת נזק).

**החזרה מלאה למצב שלפני** — כולל `sub_status` ו-`sub_until` של כל המשתמשים —
דורשת שחזור מהגיבוי של צעד 1. אין לזה קיצור דרך.

---

## ד. מה עוד חסר, בכוונה

| מה | למה עוד לא |
|---|---|
| `functions/create-checkout/` | תלוי בבחירת הספק ובמזהי המחיר. המחיר לא יכול להגיע מהדפדפן, ו-`user_id` שיחזור ב-webhook נקבע שם, בשרת, מתוך ה-JWT. |
| פיוס יומי (reconciliation) | ה-job שסורק מנויים שלא שמענו מהם 48 שעות ומיישר מול ה-API. ⚠ **זה הסעיף שהכי קל לדלג עליו והכי כואב כשמדלגים** — webhook שלא הגיע בכלל = משתמש ששילם, אין לו גישה, ואף אחד לא יודע. |
| `words` + `get_bank()` | אכיפת הזכאות על המאגר עצמו. שינוי גדול ונפרד; היום `app.js` קורא מ-`window.UNIT_DATA`. |
| ממשק החיוב באפליקציה | קובצי הליבה בעריכה במקביל. הקוד כאן לא נגע בהם. |
