/* סבב 3: מה שנשאר אחרי ויקינתונים — חיפוש מופע מדויק בטקסטים קלאסיים דרך ספריא.
 *
 * ההיגיון: ניב כמו "בית בד" או "העלה חרס בידו" חי במקורות — משנה, תלמוד, תנ"ך —
 * שכולם **נחלת הכלל**. מופע מדויק שם הוא הוכחת המקור החזקה ביותר שיש: לא רק
 * "אתר חופשי", אלא הטקסט שהעברית עצמה באה ממנו. ה-API של ספריא פתוח; ההוכחה
 * שנרשמת היא **הרפרנס הקלאסי** (למשל: משנה, שביעית ב׳), לא הטקסט של ספריא.
 *
 * ⚠ התאמה: מופע מדויק של הצירוף (אחרי הסרת ניקוד), או בקיפול כתיב מלא/חסר.
 * חיפוש שמחזיר "משהו קרוב" אינו הוכחה ולא נספר.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―-]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = s => norm(s).replace(/[וי]/g, '');

const miss = fs.readFileSync('attest/round2-miss.tsv', 'utf8').split('\n')
  .filter(Boolean).map(l => l.split('\t'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sefaria(q) {
  const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' },
    body: JSON.stringify({ query: q, type: 'text', size: 5, field: 'exact',
      source_proj: true, slop: 0 }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.hits && j.hits.hits) || [];
}

(async () => {
  const hits = [], still = [];
  let done = 0;
  for (const [term, unit] of miss) {
    const variants = norm(term).split('/').map(x => x.trim()).filter(Boolean);
    let found = null;
    for (const v of variants) {
      let res = [];
      try { res = await sefaria(v); } catch (e) {}
      await sleep(200);
      for (const h of res) {
        const txt = norm(String((h.highlight && h.highlight.exact || []).join(' ') || ''))
          .replace(/<\/?b>/g, '');
        if (txt.includes(v) || fold(txt).includes(fold(v))) {
          found = [h._source ? h._source.ref : h._id, v]; break;
        }
      }
      if (found) break;
    }
    if (found) hits.push([term, unit, 'ספריא: ' + found[0]]);
    else still.push([term, unit]);
    if (++done % 25 === 0) {
      console.log(`${done}/${miss.length} · נמצאו ${hits.length}`);
      fs.writeFileSync('attest/round3-hits.tsv', hits.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
    }
  }
  fs.writeFileSync('attest/round3-hits.tsv', hits.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/round3-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  console.log(`\nסבב 3: נמצאו עוד ${hits.length} · נשארו ${still.length}`);
})();
