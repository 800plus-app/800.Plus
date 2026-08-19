/* סבב 4 — לוקח את מה שנשאר בלי הוכחה **נקייה** ומחפש לו מקור בנחלת הכלל.
 *
 * למה זה נדרש אחרי סבב 3: שם נלקחה **ההתאמה הראשונה** שחזרה, וזו לפעמים גרסה
 * מוגנת (שטיינזלץ, מילון קליין) גם כשאותה מילה מופיעה גם בטקסט קלאסי. כלומר
 * ההוכחה הייתה חלשה מפני שהחיפוש עצר מוקדם, לא מפני שאין מקור נקי.
 *
 * הפעם: 20 תוצאות, בדיקת רישיון פר-רפרנס מול api/v3, ובחירת הראשון שהוא
 * Public Domain / CC0. אין כזה — הפריט נשאר ברשימת החוסר, ולא "מתקרב".
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―-]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = s => norm(s).replace(/[וי]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const read = f => fs.existsSync(f)
  ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')) : [];

/* מי צריך טיפול: מי שאין לו הוכחה בכלל, ומי שההוכחה שלו אינה ברישיון נקי */
const att = read('attest/attestation.tsv').slice(1);
const missing = read('attest/attestation-missing.tsv').slice(1);
const dirty = att.filter(r => /מוגן|לא ידוע/.test(r[2])).map(r => [r[0], r[1]]);
const todo = [...missing, ...dirty];
console.log(`${todo.length} פריטים לסבב 4 (${missing.length} בלי הוכחה, ${dirty.length} עם הוכחה לא-כשרה)`);

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

async function search(q) {
  const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' },
    body: JSON.stringify({ query: q, type: 'text', size: 20, field: 'exact', slop: 0 }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.hits && j.hits.hits) || [];
}

(async () => {
  const found = [], still = [];
  let n = 0;
  for (const [term, unit] of todo) {
    const variants = norm(term).split('/').map(x => x.trim()).filter(Boolean);
    let hit = null;
    for (const v of variants) {
      let res = [];
      try { res = await search(v); } catch (e) {}
      await sleep(180);
      for (const h of res) {
        const txt = norm(String((h.highlight && h.highlight.exact || []).join(' '))).replace(/<\/?b>/g, '');
        if (!(txt.includes(v) || fold(txt).includes(fold(v)))) continue;
        const ref = h._source ? h._source.ref : h._id;
        const lic = await licenseOf(ref);
        await sleep(100);
        if (/Public Domain|^PD$|CC0/i.test(lic)) { hit = [ref, lic, v]; break; }
      }
      if (hit) break;
    }
    if (hit) found.push([term, unit, 'נחלת הכלל / CC0 (לפי ספריא)', hit[0], '']);
    else still.push([term, unit]);
    if (++n % 20 === 0) {
      console.log(`  ${n}/${todo.length} · נמצאו ${found.length}`);
      fs.writeFileSync('attest/round4-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
      fs.writeFileSync('attest/sefaria-licenses.json', JSON.stringify(licCache, null, 1), 'utf8');
    }
  }
  fs.writeFileSync('attest/round4-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/round4-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/sefaria-licenses.json', JSON.stringify(licCache, null, 1), 'utf8');
  console.log(`\nסבב 4: ${found.length} קיבלו הוכחה בנחלת הכלל · ${still.length} נשארו`);
})();
