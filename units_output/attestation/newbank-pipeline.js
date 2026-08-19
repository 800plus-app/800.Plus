/* צנרת ההוכחות על **המאגר החדש** (2,073), בכלי אחד ובסדר יורד של נקיון הרישיון.
 *
 * למה זה כלי אחד ולא שבעה כמו בפעם הראשונה: הסבבים ההם נכתבו אחד-אחד תוך כדי
 * למידה מה עובד. עכשיו ידוע: חיפוש לקסמה → חיפוש עם כתיב מלא/חסר → טקסט קלאסי
 * בספריא עם slop והסרת סוגריים → ויקיטקסט → ויקימילון. כל הלקחים כבר בתוך
 * `queries()` ובבדיקת הרישיון.
 *
 * ⛔ הרישיון נשאל מספריא (api/v3/texts) ולא נוחש. נספר כ"נקי" רק
 * Public Domain / CC0. ויקימילון וויקיפדיה מסומנים CC BY-SA בשורה נפרדת.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const clean = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ')
  .replace(/-\s*$/, '').replace(/\s+/g, ' ').trim();
const fold = s => s.replace(/[וי]/g, '');
const PART = /^(את|אל|על|של|עם|ב|ל|מ|ה|ו)$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };

function queries(term) {
  const base = clean(term);
  const out = new Set();
  const wp = base.replace(/[()]/g, '');
  const np = base.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  [wp, np].forEach(v => v.split('/').map(x => x.trim()).filter(Boolean).forEach(x => {
    out.add(x);
    const c = x.split(' ').filter(w => !PART.test(w));
    if (c.length >= 1 && c.length < x.split(' ').length) out.add(c.join(' '));
    if (c.length > 2) out.add(c.slice().sort((a, b) => b.length - a.length).slice(0, 2).join(' '));
  }));
  return [...out].filter(x => x.length >= 3);
}

const licCache = JSON.parse(fs.existsSync('attest2/lic.json')
  ? fs.readFileSync('attest2/lic.json', 'utf8') : '{}');
async function licenseOf(ref) {
  if (licCache[ref]) return licCache[ref];
  try {
    const r = await fetch('https://www.sefaria.org/api/v3/texts/' +
      encodeURIComponent(ref.replace(/ /g, '_')), { headers: UA });
    if (!r.ok) return (licCache[ref] = 'err');
    const j = await r.json();
    const ls = (j.versions || []).map(v => v.license).filter(Boolean);
    return (licCache[ref] = ls.length ? [...new Set(ls)].join(' | ') : 'unknown');
  } catch (e) { return (licCache[ref] = 'net'); }
}
const isPD = l => /Public Domain|^PD$|CC0/i.test(l || '');

async function wdSearch(q) {
  try {
    const r = await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities' +
      '&type=lexeme&language=he&uselang=he&limit=10&format=json&search=' + encodeURIComponent(q),
      { headers: UA });
    if (!r.ok) return null;
    const s = (await r.json()).search || [];
    for (const x of s) {
      const lem = clean(x.label || '');
      if (lem === q || fold(lem) === fold(q)) return x.id;
    }
  } catch (e) {}
  return null;
}
async function sefaria(q, slop) {
  try {
    const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...UA },
      body: JSON.stringify({ query: q, type: 'text', size: 20, field: 'exact', slop }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.hits && j.hits.hits) || [];
  } catch (e) { return []; }
}
async function wiki(host, q) {
  try {
    const r = await fetch(`https://${host}/w/api.php?action=query&titles=` +
      encodeURIComponent(q) + '&format=json', { headers: UA });
    if (r.ok) {
      const j = await r.json();
      if (Object.values(j.query.pages).some(p => p && !('missing' in p))) return 'ערך: ' + q;
    }
    const s = await fetch(`https://${host}/w/api.php?action=query&list=search&srsearch=` +
      encodeURIComponent('"' + q + '"') + '&srlimit=1&format=json', { headers: UA });
    if (s.ok) {
      const j = await s.json();
      if (j.query.searchinfo.totalhits > 0) return j.query.search[0].title;
    }
  } catch (e) {}
  return null;
}

(async () => {
  const todo = fs.readFileSync('attest2/r1-miss.tsv', 'utf8').split('\n')
    .filter(Boolean).map(l => l.split('\t'));
  console.log(`${todo.length} פריטים`);
  const found = [], still = [];
  let n = 0;
  for (const [term, unit, origin] of todo) {
    const qs = queries(term);
    let hit = null;
    /* 1 · לקסמה CC0 */
    for (const q of qs) {
      const id = await wdSearch(q); await sleep(110);
      if (id) { hit = ['ויקינתונים (CC0)', id, q]; break; }
    }
    /* 2 · טקסט קלאסי בנחלת הכלל */
    if (!hit) for (const q of qs) {
      for (const slop of [0, 6]) {
        const res = await sefaria(q, slop); await sleep(150);
        for (const h of res) {
          const ref = h._source ? h._source.ref : h._id;
          const txt = clean(String((h.highlight && h.highlight.exact || []).join(' '))).replace(/<\/?b>/g, '');
          if (!q.split(' ').every(w => txt.includes(w) || fold(txt).includes(fold(w)))) continue;
          const lic = await licenseOf(ref); await sleep(90);
          if (isPD(lic)) { hit = ['ספריא · נחלת הכלל', ref, q]; break; }
        }
        if (hit) break;
      }
      if (hit) break;
    }
    /* 3 · ויקיטקסט — הטקסט עצמו בנחלת הכלל */
    if (!hit) for (const q of qs) {
      const t = await wiki('he.wikisource.org', q); await sleep(120);
      if (t) { hit = ['ויקיטקסט · נחלת הכלל', t, q]; break; }
    }
    /* 4 · ויקימילון — CC BY-SA, בשורה נפרדת */
    if (!hit) for (const q of qs) {
      const t = await wiki('he.wiktionary.org', q); await sleep(120);
      if (t) { hit = ['ויקימילון · CC BY-SA', t, q]; break; }
    }
    if (hit) found.push([term, unit, hit[0], hit[1], hit[2], origin]);
    else still.push([term, unit, origin]);
    if (++n % 25 === 0) {
      console.log(`  ${n}/${todo.length} · נמצאו ${found.length}`);
      fs.writeFileSync('attest2/r2-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
      fs.writeFileSync('attest2/r2-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
      fs.writeFileSync('attest2/lic.json', JSON.stringify(licCache), 'utf8');
    }
  }
  fs.writeFileSync('attest2/r2-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest2/r2-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest2/lic.json', JSON.stringify(licCache), 'utf8');
  const t = {}; found.forEach(r => t[r[2]] = (t[r[2]] || 0) + 1);
  console.log(`\nנמצאו ${found.length} · נשארו ${still.length}`);
  Object.entries(t).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
})();
