/* מודד כמה מההסברים הקיימים (`e`) כבר מנמקים כל אפשרות בשמה.
   זה קובע אם סבב הפורמט החדש הוא **פיצול** של טקסט קיים או **כתיבה מאפס**. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'batches');
const all = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    .forEach((it, i) => all.push({ ...it, src: `${f}#${i + 1}` }));

/* ⚠ 23 פריטים הם **זוגות** (שני חסרים), ואז כל אפשרות היא מערך של שתי מילים.
   בלי הטיפול הזה הסקריפט קורס — וזה גם השינוי המהותי בפורמט החדש: זוג דורש
   פירוש לשתי המילים ותרגום עם שני חסרים מושלמים. */
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lbl = o => Array.isArray(o) ? o.join(' + ') : String(o);
const wordsOf = o => Array.isArray(o) ? o : [o];
const mentions = (e, o) => wordsOf(o).every(w =>
  new RegExp('(^|[^A-Za-z])' + esc(w) + '([^A-Za-z]|$)', 'i').test(e));

const dist = {}, miss = [];
let pairs = 0;
for (const it of all) {
  const e = it.e || '';
  if (it.o.some(Array.isArray)) pairs++;
  const hit = it.o.filter(o => mentions(e, o));
  dist[hit.length] = (dist[hit.length] || 0) + 1;
  if (hit.length < 4) miss.push(`${it.src} [${hit.length}/4] חסרות: ${it.o.filter(o => !hit.includes(o)).map(lbl).join(' | ')}`);
}
console.log(`פריטי זוג (שני חסרים): ${pairs} · פריטי חסר בודד: ${all.length - pairs}`);
console.log('כמה אפשרויות מוזכרות בשמן ב-e:', JSON.stringify(dist));
console.log(`פריטים שמנמקים את כל הארבע: ${dist[4] || 0} מתוך ${all.length}`);
const L = all.map(x => (x.e || '').length).sort((a, b) => a - b);
console.log(`אורך e: חציון ${L[L.length >> 1]} · מינ' ${L[0]} · מקס' ${L[L.length - 1]}`);
if (miss.length) {
  console.log(`\n⚠ ${miss.length} פריטים לא מנמקים את כל הארבע — הם דורשים כתיבה, לא פיצול:`);
  miss.forEach(x => console.log('  ' + x));
}
