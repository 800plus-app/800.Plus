/* סבב 2: החוסרים מסבב הלמות — מול חיפוש הלקסמות של ויקינתונים (wbsearchentities).
 *
 * למה API ולא עוד SPARQL: החיפוש מכסה גם צורות וכתיב מלא/חסר, בדיוק המחלקות
 * שנפלו בסבב 1 (אִלוּלֵא ← אילולא, טָוָה ← טווה). 550 קריאות בקצב מנומס.
 * כל התאמה מאומתת: הלמה שחזרה מנורמלת ומושווית למילה שלנו גם בקיפול מלא/חסר
 * (הסרת ו/י אמות קריאה) — כדי שחיפוש "קרוב" לא ייחשב הוכחה.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―-]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = s => norm(s).replace(/[וי]/g, '');          // קיפול כתיב מלא/חסר

const miss = fs.readFileSync('attest/wikidata-miss.tsv', 'utf8').split('\n')
  .filter(Boolean).map(l => l.split('\t'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function searchLex(q) {
  const u = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&type=lexeme' +
    '&language=he&uselang=he&limit=10&format=json&search=' + encodeURIComponent(q);
  const r = await fetch(u, { headers: { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' } });
  if (!r.ok) return [];
  return (await r.json()).search || [];
}

(async () => {
  const hits = [], still = [];
  let done = 0;
  for (const [term, unit] of miss) {
    /* וריאנטים עם קו נטוי — כל אחד מועמד בפני עצמו */
    const variants = norm(term).split('/').map(x => x.trim()).filter(Boolean);
    let found = null;
    for (const v of variants) {
      const res = await searchLex(v);
      await sleep(120);
      for (const s of res) {
        const lem = norm(s.label || '');
        if (lem === v || fold(lem) === fold(v)) { found = [s.id, s.label, v]; break; }
      }
      if (found) break;
    }
    if (found) hits.push([term, unit, found[0], found[1]]);
    else still.push([term, unit]);
    if (++done % 50 === 0) {
      console.log(`${done}/${miss.length} · נמצאו ${hits.length}`);
      fs.writeFileSync('attest/round2-hits.tsv', hits.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
    }
  }
  fs.writeFileSync('attest/round2-hits.tsv', hits.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/round2-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  const single = still.filter(([t]) => !norm(t).includes(' ')).length;
  console.log(`\nסבב 2: נמצאו עוד ${hits.length} · נשארו ${still.length} (מילים בודדות: ${single}, צירופים: ${still.length - single})`);
})();
