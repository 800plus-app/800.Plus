/* ⛔ זה **אינו** קובץ בדיקה. `tests/run.js` סורק `*.test.js` בתיקייה
   העליונה בלבד, ולכן הקובץ הזה אינו נאסף אליה · והוא לא אמור להיאסף.

   ⭐ **מה זה כן:** רתמת שיניים. היא בונה עותק של הקוד בתיקייה זמנית, שוברת
   בו דבר אחד בכוונה, ומריצה את השער מולו · כדי להראות שהשער **נופל**.
   שער ירוק שלא ראית נופל אינו עדות, וזה קרה בפרויקט הזה שלוש פעמים.

   ⛔ והסיבה שהקובץ יושב בעץ ולא בסקרצ'פד: **טבלת מוטציות שאי אפשר להריץ
   מחדש אינה עדות.** מי שקורא דוח עם `EXIT=1` צריך לדעת איך לשחזר אותו.

   ‏הרצה · `node tests/teeth/<שם> <מוטציה>` · בלי ארגומנט = `none`.
*/
/* הוכחת שיניים ל-tests/89-wtp-shown.
   מריץ את השער החדש מול מקור מוטה בזיכרון · לא כותב app.js שבור לדיסק.
   הטכניקה: דורסים את appSource המיוצאת מ-_harness/sandbox.js לפני שהבדיקה
   נטענת, ולכן השערים הטקסטואליים רואים מקור שבור בזמן ש-app.js האמיתי שלם.

   node tests/teeth/78-wtp-shown.teeth.js <none|old|noguard|nocatch>
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const mut = process.argv[2] || 'none';

const real = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* ⚠ הקובץ בעץ העבודה הוא CRLF במלואו · מוטציה שכתובה עם \n בלבד אינה נתפסת,
   וההרצה נראית אז כמו שער עיוור. הבדיקה בסוף הבלוק עוצרת על זה. */
let src = real;
/* ⛔ `old` **נבנה מהמקור החי**, ולא נקרא מקובץ־תמונה שנשמר בצד.
   הגרסה הקודמת קראה `app.before.js` מהסקרצ'פד · ולכן הרתמה לא רצה בכלל אצל
   מי שאין לו את הקובץ הזה, וטבלת המוטציות שלה לא הייתה ניתנת לשחזור.
   זו בדיוק התלונה שבגללה הרתמות עברו לעץ, שכבה אחת עמוקה יותר.

   שתי ההחלפות יחד משחזרות את הצורה הישנה במלואה: ההדלקה חוזרת לראש הפונקציה,
   יורדת מסוף ה-setTimeout, והבדיקה החוזרת מוסרת. */
if (mut === 'old')
  src = real.replace(/(\r?\n)(\s*)setTimeout\(async \(\)=>\{/,
                     '$1$2wtpShown = true;$1$2setTimeout(async ()=>{')
            .replace(/\r?\n\s*wtpShown = true;(\r?\n\s*\}, 2000\);)/, '$1')
            .replace(/(\r?\n)\s*if\(wtpShown\) return;(\r?\n\s*wtpPrice = null;)/, '$2');
if (mut === 'noguard')                              // מסירים את הבדיקה החוזרת בלבד
  src = real.replace(/(\r?\n)\s*if\(wtpShown\) return;(\r?\n\s*wtpPrice = null;)/, '$2');
if (mut === 'nocatch')                              // מסירים את הנפילה-הסגורה
  src = real.replace('try{ asked = await Store.wtpAsked(); }catch(e){}',
                     'asked = await Store.wtpAsked();');

if (mut !== 'none' && src === real) { console.error('המוטציה לא נתפסה: ' + mut); process.exit(3); }

const sandbox = require(path.join(ROOT, 'tests/_harness/sandbox.js'));
sandbox.appSource = () => src;

require(path.join(ROOT, 'tests/89-wtp-shown.test.js'));
