'use strict';
/* בניית טבלת הזהב מחדש · typo-lab/make_golden.js
 *
 * טבלת הזהב היא ההוכחה היחידה לשקילות מעבדה↔ריצה: ‏tests/71 מריץ אותה מחדש על
 * ‏nearMatch **המורמת מ-app.js**, ואי-התאמה אחת מאדימה. לכן היא חייבת להיות מיוצרת
 * מאותם פרמטרים שנשלחים בפועל.
 *
 * עד היום היא נכתבה רק בסוף ריצת GA מלאה (‏evolve.js, ‏~20 דקות). זה יצר לחץ אמיתי
 * לכיוון הלא נכון: מי שמשנה פרמטר בלי להריץ GA משאיר טבלה שנוצרה מפרמטרים אחרים,
 * ואז ‏tests/71 **מדלג** על בדיקת השקילות במקום להאדים — כלומר הבדיקה החשובה ביותר
 * בקובץ נעלמת בשקט בדיוק ברגע שהיא הכי נחוצה. הכלי הזה מנתק את הקשר: אותה
 * `buildGolden` בדיוק, אותו זרע, בלי אבולוציה.
 *
 *   node typo-lab/make_golden.js                    → מ-out/typo-rules.json
 *   node typo-lab/make_golden.js --rules out/x.json → מארטיפקט אחר
 *   node typo-lab/make_golden.js --check            → בונה לזיכרון ומשווה, בלי לכתוב
 *
 * ‏--check הוא השער: הוא אומר אם הטבלה שעל הדיסק היא באמת זו שהפרמטרים הנוכחיים
 * מייצרים. הוא זה שצריך לרוץ ב-verify_all, לא הבנייה.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
/* ‏--out · תוספת אדיטיבית · ברירת המחדל לא זזה. קיימת כדי שאפשר יהיה להפיק
   טבלת זהב **למועמד** בלי לדרוס את זו שנשלחת · ראה golden.STUDENT.jsonl. */
const oi = argv.indexOf('--out');
const OUT_FILE = oi >= 0 && argv[oi + 1] ? path.resolve(argv[oi + 1]) : null;
const ri = argv.indexOf('--rules');
const RULES_PATH = ri >= 0 && argv[ri + 1]
  ? path.resolve(argv[ri + 1])
  : path.join(OUT, 'typo-rules.json');

const say = s => process.stdout.write(s + '\n');

const EV = require('./evolve.js');

function main() {
  if (!fs.existsSync(RULES_PATH)) {
    say(`⛔ ${path.basename(RULES_PATH)} חסר`);
    process.exit(2);
  }
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  for (const s of EV.SETS) {
    if (!rules.params || !rules.params[s]) { say(`⛔ הארטיפקט בלי params.${s}`); process.exit(2); }
  }

  const t0 = Date.now();
  say('טוען שורות · שני הדאטהסטים');
  const { perSet, langs } = EV.loadRows();
  say(`  ${EV.SETS.reduce((n, s) => n + perSet[s].length, 0)} שורות · ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const golden = EV.buildGolden(perSet, rules.params, langs);
  const text = golden.map(g => JSON.stringify(g)).join('\n') + '\n';
  const nOk = golden.filter(g => g.verdict.ok).length;
  say(`טבלת זהב · ${golden.length} החלטות · ${nOk} קבלות · ${golden.length - nOk} פסילות`);

  const file = OUT_FILE || path.join(OUT, 'golden.jsonl');
  if (CHECK) {
    if (!fs.existsSync(file)) { say('⛔ out/golden.jsonl חסר'); process.exit(1); }
    /* ‏\r?\n · ‏git ממיר ל-CRLF ב-checkout על ווינדוס, ולכן ההשוואה היא שורה-שורה
       על התוכן ולא בייט-בייט על הקובץ. אותו טיפול בדיוק כמו ב-tests/71. */
    const have = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    const want = text.trim().split('\n');
    if (have.length !== want.length) {
      say(`⛔ ${have.length} שורות על הדיסק מול ${want.length} שהפרמטרים מייצרים`);
      process.exit(1);
    }
    let bad = 0;
    for (let i = 0; i < want.length; i++) {
      if (have[i] !== want[i]) {
        if (bad < 5) say(`  ⛔ שורה ${i + 1}\n     דיסק: ${have[i].slice(0, 160)}\n     נכון: ${want[i].slice(0, 160)}`);
        bad++;
      }
    }
    if (bad) { say(`⛔ ${bad} שורות אינן תואמות · הריצו node typo-lab/make_golden.js`); process.exit(1); }
    say('✅ טבלת הזהב על הדיסק היא זו שהפרמטרים הנוכחיים מייצרים');
    return;
  }

  fs.writeFileSync(file, text, 'utf8');
  /* ‏tests/71 משווה את מספר השורות מול השדה בארטיפקט · בלי העדכון הזה הבדיקה
     נופלת על "מספר השורות אינו זה שהארטיפקט מדווח", וזה נכון שהיא תיפול. */
  if (!OUT_FILE && (!rules.golden || rules.golden.rows !== golden.length)) {
    rules.golden = { rows: golden.length, file: 'golden.jsonl' };
    fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 1), 'utf8');
    say(`  עודכן ${path.basename(RULES_PATH)} · golden.rows = ${golden.length}`);
  }
  say(`נכתב ${path.basename(file)} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (require.main === module) main();
