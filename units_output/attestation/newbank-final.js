/* מאחד את כל שכבות ההוכחה של המאגר החדש (2,073) לטבלה אחת, ומחליף את עמודת
 * המוצא — כולל מחיקת סיווג `כריית-מבחנים` וההפניות לשאלות במבחן.
 *
 * ⛔ מה שנמחק כאן, במפורש ובכוונה: הסיווג `כריית-מבחנים` וההפניה מסוג
 * `spring_2025·פרק2·ש5·רגל` בעמודת ההערה. **המילים עצמן נשארות** — 60 המילים
 * נמצאות במאגר בדיוק כפי שהיו, ומקבלות מוצא לפי המקור החופשי שבו הן אומתו.
 * ⚠ מה שלא נמחק: אף מילה. זו הדרישה שהוגדרה, והיא נבדקת בשער למטה — מספר
 * השורות אחרי חייב להיות זהה למספר לפני.
 */
const fs = require('fs');
const GS = 'C:/Users/03hag/Claude projects/800+/units_output/gloss-phase/gloss-status.tsv';
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const read = f => fs.existsSync(f)
  ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')) : [];

/* מפת ההוכחות: מילה → [מקור, רפרנס] */
const att = new Map();
const add = (rows, srcIdx, refIdx) => rows.forEach(r => {
  const k = norm(r[0]); if (!k || att.has(k)) return;
  att.set(k, [r[srcIdx], r[refIdx]]);
});
add(read('attest2/r1-hits.tsv'), 2, 3);
add(read('attest2/r2-hits.tsv'), 2, 3);
add(read('attest2/r3-hits.tsv'), 2, 3);
add(read('attest2/r4-hits.tsv'), 2, 3);
/* המילה האחרונה, שאומתה ידנית מול הטקסט עצמו */
att.set(norm('פלבל'), ['ויקיטקסט · נחלת הכלל',
  'פרוזה (ביאליק)/ספיח — "ואני מפלבל בעיני"']);
console.log(`הוכחות במפה: ${att.size}`);

const rows = read(GS);
const head = rows[0];
const before = rows.length - 1;
let mined = 0, reOrigin = 0, noAtt = [];
const out = [head];
for (const r of rows.slice(1)) {
  const w = norm(r[3]);
  const a = att.get(w);
  const merged = r.slice();
  if (r[5] === 'כריית-מבחנים') {
    mined++;
    /* ⛔ ההפניה לשאלה במבחן נמחקת. היא הייתה גם הראיה וגם החשיפה. */
    if (/·(פרק|ש\d)|(spring|summer|autumn|winter)_\d{4}|\d{4}_(spring|summer|autumn|winter)/.test(r[8] || ''))
      merged[8] = '';
  }
  if (a) { merged[5] = a[0]; merged[9] = a[1]; reOrigin++; }
  else noAtt.push(r[3]);
  out.push(merged);
}
/* ⛔ השער: אף מילה לא נמחקה */
if (out.length - 1 !== before) throw new Error(`מספר השורות השתנה: ${before} → ${out.length - 1}`);

if (process.argv.includes('--write')) {
  fs.writeFileSync(GS, out.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  console.log('נכתב.');
}
const tally = {};
out.slice(1).forEach(r => tally[r[5]] = (tally[r[5]] || 0) + 1);
console.log('='.repeat(62));
console.log(`שורות: ${before} → ${out.length - 1}  (חייב להיות זהה)`);
console.log(`סיווג כריית-מבחנים שהוסר: ${mined}`);
console.log(`מוצא שהוחלף בהוכחה: ${reOrigin}`);
console.log(`בלי הוכחה: ${noAtt.length}${noAtt.length ? ' · ' + noAtt.join(' ') : ''}`);
console.log('\nהמוצא אחרי ההחלפה:');
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
const clean = out.slice(1).filter(r => /CC0|נחלת הכלל/.test(r[5])).length;
const sa = out.slice(1).filter(r => /CC BY/.test(r[5])).length;
console.log('='.repeat(62));
console.log(`נחלת הכלל / CC0: ${clean}/${before} = ${(clean / before * 100).toFixed(1)}%`);
console.log(`CC BY-SA:        ${sa}/${before} = ${(sa / before * 100).toFixed(1)}%`);
console.log(`סה"כ מקור חופשי: ${clean + sa}/${before} = ${((clean + sa) / before * 100).toFixed(1)}%`);
