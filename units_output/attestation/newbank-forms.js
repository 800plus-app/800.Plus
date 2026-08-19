/* התאמה מול **צורות** של לקסמות ויקינתונים, לא רק מול הלמה. רישיון CC0.
 *
 * למה זה המקור החזק שנשאר: חלק מהמילים במאגר הן **נטייה** ולא לקסמה —
 * `יַרְכָתַיִים` היא צורת זוגי של `יַרְכָּה`, `מְגֻבָּב` היא בינוני פעול. חיפוש
 * למות לעולם לא ימצא אותן, וחיפוש צורות מוצא אותן עם רישיון נקי לגמרי.
 * 461,238 צורות מול 49,943 למות — פי תשע יותר משטח חיפוש.
 *
 * ⚠ ההתאמה שמרנית בכוונה: זהות מלאה אחרי הסרת ניקוד, או קיפול כתיב מלא/חסר.
 * לא התאמת גזע. הרפרנס שנרשם הוא הלקסמה שהצורה שייכת לה, כדי שאפשר יהיה לפתוח
 * אותה ולראות את הצורה עצמה.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = s => norm(s).replace(/[וי]/g, '');

/* מפת הצורות. שתי מפות: מדויקת, ומקופלת ככתיב מלא/חסר. */
const exact = new Map(), folded = new Map();
let rows = 0;
for (const f of fs.readdirSync('forms')) {
  for (const line of fs.readFileSync('forms/' + f, 'utf8').split('\n')) {
    const m = line.match(/entity\/(L\d+)(?:-F\d+)?>\t"?(.+?)"?(?:@he)?\s*$/);
    if (!m) continue;
    rows++;
    const k = norm(m[2]);
    if (!k) continue;
    if (!exact.has(k)) exact.set(k, m[1]);
    const g = fold(m[2]);
    if (g && !folded.has(g)) folded.set(g, m[1]);
  }
}
console.log(`צורות שנטענו: ${rows} · מדויקות ייחודיות: ${exact.size} · מקופלות: ${folded.size}`);

const todo = fs.readFileSync('attest2/r2-miss.tsv', 'utf8').split('\n')
  .filter(Boolean).map(l => l.split('\t'));
const hits = [], miss = [];
for (const [term, unit, origin] of todo) {
  const variants = [norm(term).replace(/[()]/g, ''), norm(term).replace(/\s*\([^)]*\)\s*/g, ' ').trim()]
    .flatMap(v => v.split('/').map(x => x.trim())).filter(Boolean);
  let hit = null;
  for (const v of variants) {
    if (exact.has(v)) { hit = [exact.get(v), v, 'צורה מדויקת']; break; }
    const g = fold(v);
    if (g && folded.has(g)) { hit = [folded.get(g), v, 'כתיב מלא/חסר']; break; }
  }
  if (hit) hits.push([term, unit, 'ויקינתונים · צורה (CC0)', hit[0], hit[2], origin]);
  else miss.push([term, unit, origin]);
}
fs.writeFileSync('attest2/r3-hits.tsv', hits.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync('attest2/r3-miss.tsv', miss.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
console.log(`\nנבדקו ${todo.length} · נמצאו ${hits.length} · נשארו ${miss.length}`);
const single = miss.filter(([t]) => !norm(t).includes(' ')).length;
console.log(`  מתוך הנשארים: ${single} מילים בודדות · ${miss.length - single} צירופים`);
