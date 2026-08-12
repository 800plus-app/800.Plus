/* סבב 5 — ניבים. שלושת התיקונים שבלעדיהם הם לא היו נמצאים בשום מקור:
 *
 * ⛔ 1. **סוגריים.** `חֲרִי (אַף)` נשלח לחיפוש עם הסוגריים, ולכן לא נמצא אף פעם.
 *       עכשיו נשלחות שתי גרסאות: עם התוכן שבסוגריים ובלעדיו.
 * ⛔ 2. **מקף מסיים.** `הִפְלִיג בְּ-` — המקף נשאר במחרוזת החיפוש.
 * ⛔ 3. **צמידות.** ניב מופיע בטקסט עם מילים ביניים ובנטייה אחרת
 *       (`מֵרֵט אֶת עֲצַבָּיו` מול "וימרט את עצביו"). חיפוש exact עם slop=0 פוסל
 *       את כל אלה. עכשיו slop=6, וגם ניסיון על **מילות התוכן בלבד** בלי `את`/`אל`.
 *
 * 143 מ-169 שנשארו הם ניבים, ולכן זה לא כיוונון קטן אלא הרוב.
 * נספרות רק תוצאות שהרישיון שספריא מחזירה עליהן הוא Public Domain / CC0.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const clean = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ')
  .replace(/-\s*$/, '').replace(/\s+/g, ' ').trim();
const PARTICLE = /^(את|אל|על|של|עם|כ|ב|ל|מ|ה|ו)$/;
const fold = s => s.replace(/[וי]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* מייצר את כל וריאנטי החיפוש לערך אחד, מהמדויק לרחב */
function queries(term) {
  const base = clean(term);
  const out = new Set();
  const withParen = base.replace(/[()]/g, '');                 // חרי אף
  const noParen = base.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // חרי
  [withParen, noParen].forEach(v => {
    v.split('/').map(x => x.trim()).filter(Boolean).forEach(x => {
      if (x) out.add(x);
      const content = x.split(' ').filter(w => !PARTICLE.test(w));
      /* ⚠ גם מילת תוכן **אחת** נספרת. `הִפְלִיג בְּ-` הוא ערך שכל התוכן שלו הוא
         `הפליג`, ותנאי `>= 2` היה מוציא אותו מהחיפוש לגמרי. */
      if (content.length >= 1 && content.length < x.split(' ').length)
        out.add(content.join(' '));
      /* שתי מילות התוכן הארוכות ביותר — הליבה שמזהה את הניב */
      if (content.length > 2) {
        const core = content.slice().sort((a, b) => b.length - a.length).slice(0, 2);
        out.add(core.join(' '));
      }
    });
  });
  return [...out].filter(x => x.length >= 3);
}

const licCache = JSON.parse(fs.existsSync('attest/sefaria-licenses.json')
  ? fs.readFileSync('attest/sefaria-licenses.json', 'utf8') : '{}');
async function licenseOf(ref) {
  if (licCache[ref]) return licCache[ref];
  try {
    const r = await fetch('https://www.sefaria.org/api/v3/texts/' +
      encodeURIComponent(ref.replace(/ /g, '_')),
      { headers: { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' } });
    if (!r.ok) return (licCache[ref] = 'שגיאה');
    const j = await r.json();
    const ls = (j.versions || []).map(v => v.license).filter(Boolean);
    return (licCache[ref] = ls.length ? [...new Set(ls)].join(' | ') : 'unknown');
  } catch (e) { return (licCache[ref] = 'שגיאת רשת'); }
}
const isPD = l => /Public Domain|^PD$|CC0/i.test(l || '');

async function search(q, slop) {
  const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' },
    body: JSON.stringify({ query: q, type: 'text', size: 20, field: 'exact', slop }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.hits && j.hits.hits) || [];
}

(async () => {
  const todo = fs.readFileSync('attest/round4-miss.tsv', 'utf8').split('\n')
    .filter(Boolean).map(l => l.split('\t'));
  console.log(`${todo.length} פריטים · ניבים: ${todo.filter(t => clean(t[0]).includes(' ')).length}`);
  const found = [], still = [];
  let n = 0;
  for (const [term, unit] of todo) {
    let hit = null;
    for (const q of queries(term)) {
      for (const slop of [0, 6]) {
        let res = [];
        try { res = await search(q, slop); } catch (e) {}
        await sleep(160);
        for (const h of res) {
          const ref = h._source ? h._source.ref : h._id;
          const txt = clean(String((h.highlight && h.highlight.exact || []).join(' ')))
            .replace(/<\/?b>/g, '');
          /* אימות: כל מילות התוכן של השאילתה נמצאות בקטע שחזר */
          const words = q.split(' ');
          const ok = words.every(w => txt.includes(w) || fold(txt).includes(fold(w)));
          if (!ok) continue;
          const lic = await licenseOf(ref);
          await sleep(90);
          if (isPD(lic)) { hit = [ref, q]; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    }
    if (hit) found.push([term, unit, 'נחלת הכלל / CC0 (לפי ספריא)', hit[0], 'שאילתה: ' + hit[1]]);
    else still.push([term, unit]);
    if (++n % 15 === 0) {
      console.log(`  ${n}/${todo.length} · נמצאו ${found.length}`);
      fs.writeFileSync('attest/round5-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
      fs.writeFileSync('attest/sefaria-licenses.json', JSON.stringify(licCache, null, 1), 'utf8');
    }
  }
  fs.writeFileSync('attest/round5-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/round5-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/sefaria-licenses.json', JSON.stringify(licCache, null, 1), 'utf8');
  console.log(`\nסבב 5: ${found.length} קיבלו הוכחה בנחלת הכלל · ${still.length} נשארו`);
})();
