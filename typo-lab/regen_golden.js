'use strict';
/* רגנרציית טבלת הזהב · typo-lab/regen_golden.js
 *
 *   node --max-old-space-size=6144 typo-lab/regen_golden.js
 *
 * טבלת הזהב היא **ארטיפקט השקילות** בין המעבדה לריצה: ‏`tests/71` מריצה אותה מחדש על
 * הפונקציה המורמת מ-`app.js`, ואי-התאמה אחת היא אדום. לכן שינוי בפרמטרים מחייב
 * רגנרציה — ורגנרציה מחייבת הוכחה שהצינור שמייצר אותה לא השתנה.
 *
 * שני שלבים, והראשון הוא שער:
 *
 *   1. ⭐ **שחזור.** בונים את הטבלה מחדש מהפרמטרים ה**נשלחים**, דרך `lib/checker.js`
 *      אחרי שהוספתי לו את `aFirst`/`aShare`. התוצאה חייבת להיות **זהה ביט-אחר-ביט**
 *      ל-`out/golden.jsonl` שבגיט. אם לא — הגן שינה התנהגות קיימת, וזה עוצר כאן.
 *   2. הפקה למועמד → `out/golden.STUDENT.jsonl`, עם ספירת הפסקים שהשתנו.
 *
 * ⛔ **הקובץ `out/golden.jsonl` אינו נדרס.** הוא מתאר את מה ש-`app.js` עושה **עכשיו**,
 * ודריסה שלו לפני ההדבקה הייתה מאדימה את `tests/71` בלי שאיש שינה את `app.js`. ההחלפה
 * היא צעד אחד, יחד עם ההדבקה, והפקודה רשומה בסוף הריצה.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EV = require('./evolve.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const ser = g => g.map(x => JSON.stringify(x)).join('\n') + '\n';
const sha = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const rules = f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).params;

function main() {
  const shipped = rules('typo-rules.json');
  const student = rules('typo-rules.STUDENT.json');

  const { perSet, langs } = EV.loadRows();

  say('\n⭐ שלב 1 · שחזור טבלת הזהב מהפרמטרים הנשלחים · שער');
  const rebuilt = ser(EV.buildGolden(perSet, shipped, langs));
  const onDisk = fs.readFileSync(path.join(OUT, 'golden.jsonl'), 'utf8');
  const same = rebuilt === onDisk;
  say(`   ‏sha שנבנה מחדש ${sha(rebuilt)} · sha שבגיט ${sha(onDisk)}`);
  if (!same) {
    let diff = 0;
    const A = rebuilt.split('\n'), B = onDisk.split('\n');
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) diff++;
    fs.writeFileSync(path.join(OUT, 'golden.REBUILT-MISMATCH.jsonl'), rebuilt);
    throw new Error(`regen_golden: השחזור אינו זהה · ${diff} שורות · הגן שינה התנהגות קיימת`);
  }
  say('   ✅ זהה ביט-אחר-ביט · הוספת aFirst/aShare היא no-op על מה שנשלח');

  say('\nשלב 2 · הפקה למועמד');
  const cand = EV.buildGolden(perSet, student, langs);
  const candText = ser(cand);
  fs.writeFileSync(path.join(OUT, 'golden.STUDENT.jsonl'), candText);

  const A = onDisk.trim().split('\n').map(l => JSON.parse(l));
  let changed = 0, toAccept = 0, toReject = 0;
  const perSetChanged = {};
  for (let i = 0; i < cand.length; i++) {
    const a = A[i], b = cand[i];
    if (a.term !== b.term || a.typed !== b.typed || a.set !== b.set) throw new Error('regen_golden: הטבלאות אינן מיושרות · הדגימה אינה דטרמיניסטית');
    if (a.verdict.ok === b.verdict.ok) continue;
    changed++;
    perSetChanged[b.set] = (perSetChanged[b.set] || 0) + 1;
    if (b.verdict.ok) toAccept++; else toReject++;
  }
  say(`   ‏${cand.length} שורות · ${changed} פסקים השתנו · ${toAccept} דחייה→קבלה · ${toReject} קבלה→דחייה`);
  say(`   לפי סט · ${JSON.stringify(perSetChanged)}`);
  if (toReject) say('   ⚠ יש פסקים שהתהפכו לדחייה · המועמד אינו אדיטיבי טהור, וזה חייב להיאמר');
  say(`   ‏sha המועמד ${sha(candText)}`);

  say('\n⛔ `golden.jsonl` לא נדרס. בזמן ההדבקה ל-`app.js`, ובאותו צעד:');
  say('   mv typo-lab/out/golden.STUDENT.jsonl typo-lab/out/golden.jsonl');
  return { changed, toAccept, toReject };
}

if (require.main === module) main();
module.exports = { main };
