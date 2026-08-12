/* מאחה את עמודות האימות מגרסה קודמת של gloss-status.tsv אל הגרסה שנבנתה מחדש.
 *
 * ⛔ למה הכלי הזה נדרש בכלל, וזו טעות שלי: `build_status.py` **מייצר את הטבלה
 * מאפס** מקובצי היחידות, ואינו שומר את העמודות שאינן נגזרות מהם — סטטוס האימות,
 * המוצא, המקורות וההערה. הרצתי אותו אחרי שהחלתי ניקוד, ובכך מחקתי את רשומת
 * האימות של 2,015 פירושים (1,496 אומתו · 570 שוכתבו · 9 SKIP) ואת סיווג
 * `כריית-מבחנים` של 60 מילים. הנתונים היו בגיט ולכן שוחזרו.
 *
 * ⚠ הלקח, ולא רק כאן: **סקריפט שבונה טבלה מאפס הוא סקריפט שמוחק כל עמודה שאינה
 * נגזרת.** לפני הרצה כזאת צריך לדעת אילו עמודות אינן נגזרות, ולאחות אותן אחרי.
 *
 * המפתח לאיחוי: המילה בלי ניקוד (עמודה 4). הניקוד שונה בין הגרסאות בכוונה —
 * הוא מה שתוקן — ולכן אסור להשתמש בו כמפתח.
 *
 *   node units_output/gloss-phase/restore_status.js <קובץ ישן> [--write]
 */
const fs = require('fs'), path = require('path');
const HERE = __dirname;
const CUR = path.join(HERE, 'gloss-status.tsv');

const old = process.argv[2];
if (!old || !fs.existsSync(old)) {
  console.error('נדרש נתיב לגרסה קודמת. שליפה מגיט:');
  console.error('  git show <commit>:units_output/gloss-phase/gloss-status.tsv > prev.tsv');
  process.exit(2);
}
const split = f => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
const oldRows = split(old), curRows = split(CUR);
const head = curRows[0];

/* עמודה 4 = המילה בלי ניקוד. 6=מוצא 7=סטטוס 8=מקורות 9=הערה (באינדקס 0: 3,5,6,7,8) */
const key = r => String(r[3] || '').normalize('NFKC').trim();
const prev = new Map(oldRows.slice(1).map(r => [key(r), r]));

let restored = 0, kept = 0, missing = [];
const out = [head];
for (const r of curRows.slice(1)) {
  const p = prev.get(key(r));
  if (!p) { missing.push(r[3]); out.push(r); kept++; continue; }
  /* מאחים רק את מה שאינו נגזר מקובץ היחידה */
  const merged = r.slice();
  [5, 6, 7, 8].forEach(i => { if (p[i] !== undefined && p[i] !== '') merged[i] = p[i]; });
  out.push(merged); restored++;
}

const tally = (rows, i) => { const t = {}; rows.slice(1).forEach(r => t[r[i] || '(ריק)'] = (t[r[i] || '(ריק)'] || 0) + 1); return t; };
console.log('='.repeat(60));
console.log(`שורות בגרסה הישנה: ${oldRows.length - 1} · בנוכחית: ${curRows.length - 1}`);
console.log(`אוחו: ${restored} · נשארו בלי רשומה קודמת: ${kept}`);
if (missing.length) console.log('  ' + missing.slice(0, 12).join(' · '));
console.log('\nסטטוס אחרי איחוי:', JSON.stringify(tally(out, 6)));
console.log('מוצא אחרי איחוי:  ', JSON.stringify(tally(out, 5)));
/* שער: הניקוד חייב להישאר של הגרסה החדשה, לא של הישנה */
const NIQ = /[֑-ׇ]/;
const unpointed = out.slice(1).filter(r => !NIQ.test(r[2] || '')).length;
console.log(`ללא ניקוד אחרי איחוי: ${unpointed}  (חייב להיות 0)`);
console.log('='.repeat(60));

if (process.argv.includes('--write')) {
  if (unpointed) { console.error('⛔ יש מילים בלי ניקוד. לא כותב.'); process.exit(1); }
  fs.writeFileSync(CUR, out.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  console.log('נכתב.');
} else console.log('הרצה יבשה. הוסף --write כדי לכתוב.');
