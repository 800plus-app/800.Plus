/* סבב 6 — 102 האחרונים. אלה עברית **מודרנית** (`בַּר-שְׁפִיטָה`, `מְפוֹרָז`,
 * `שִׁגְעוֹן גַּדְלוּת`), ולכן הם לא נמצאים בטקסט קלאסי ולא היו יכולים להימצא שם.
 *
 * שלושה אתרי ויקימדיה, בסדר עולה של "כמה הרישיון נקי":
 *   1. ויקיטקסט — הטקסטים עצמם בנחלת הכלל (ספרות עד 1955 בקירוב).
 *   2. ויקימילון — ערך מילוני. CC BY-SA.
 *   3. ויקיפדיה — CC BY-SA.
 *
 * ⚠ **CC BY-SA אינו "ללא זכויות"**, וחגי ביקש ללא זכויות. לכן ההוכחות מ-2 ו-3
 * נספרות **בשורה נפרדת** ולא מתערבבות עם נחלת הכלל. הטענה שהן כן מחזיקות:
 * ציטוט של קיום מילה הוא עובדה, וסעיף 5 מחריג עובדות מהגנה — אבל זו טענה,
 * ולכן היא מוצגת ולא נבלעת.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const clean = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ')
  .replace(/-\s*$/, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };

const SITES = [
  { host: 'he.wikisource.org', name: 'ויקיטקסט', lic: 'נחלת הכלל (טקסט מקורי)' },
  { host: 'he.wiktionary.org', name: 'ויקימילון', lic: 'CC BY-SA' },
  { host: 'he.wikipedia.org', name: 'ויקיפדיה', lic: 'CC BY-SA' },
];

async function search(host, q, exact) {
  const term = exact ? '"' + q + '"' : q;
  const u = `https://${host}/w/api.php?action=query&list=search&srsearch=` +
    encodeURIComponent(term) + '&srlimit=3&srprop=snippet&format=json';
  try {
    const r = await fetch(u, { headers: UA });
    if (!r.ok) return null;
    const j = await r.json();
    const n = j.query && j.query.searchinfo ? j.query.searchinfo.totalhits : 0;
    return n > 0 ? j.query.search[0] : null;
  } catch (e) { return null; }
}

/* ויקימילון: קיום **ערך** בשם המילה הוא ההוכחה החזקה שם, לא הופעה בטקסט */
async function entryExists(host, title) {
  const u = `https://${host}/w/api.php?action=query&titles=` +
    encodeURIComponent(title) + '&format=json';
  try {
    const r = await fetch(u, { headers: UA });
    if (!r.ok) return false;
    const j = await r.json();
    const pages = j.query && j.query.pages ? Object.values(j.query.pages) : [];
    return pages.some(p => p && !('missing' in p));
  } catch (e) { return false; }
}

(async () => {
  const todo = fs.readFileSync('attest/attestation-missing.tsv', 'utf8')
    .split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
  /* וגם מי שהוכחתו אינה כשרה */
  const att = fs.readFileSync('attest/attestation.tsv', 'utf8').split('\n').slice(1)
    .filter(Boolean).map(l => l.split('\t'));
  const dirty = att.filter(r => /מוגן|לא ידוע/.test(r[2])).map(r => [r[0], r[1]]);
  const all = [...todo, ...dirty];
  console.log(`${all.length} פריטים (${todo.length} בלי הוכחה, ${dirty.length} הוכחה לא-כשרה)`);

  const found = [], still = [];
  let n = 0;
  for (const [term, unit] of all) {
    const base = clean(term);
    const variants = [base.replace(/[()]/g, ''), base.replace(/\s*\([^)]*\)\s*/g, ' ').trim()]
      .flatMap(v => v.split('/').map(x => x.trim())).filter(x => x && x.length >= 3);
    let hit = null;
    for (const site of SITES) {
      for (const v of variants) {
        /* קודם ערך מילוני בשם המילה — ההוכחה הישירה ביותר */
        if (site.host === 'he.wiktionary.org' && await entryExists(site.host, v)) {
          hit = [site, `ערך: ${v}`, v]; break;
        }
        await sleep(90);
        const r = await search(site.host, v, true) || (v.includes(' ') ? null : await search(site.host, v, false));
        await sleep(140);
        if (r) { hit = [site, r.title, v]; break; }
      }
      if (hit) break;
    }
    if (hit) found.push([term, unit, `${hit[0].name} · ${hit[0].lic}`, hit[1], 'שאילתה: ' + hit[2]]);
    else still.push([term, unit]);
    if (++n % 15 === 0) {
      console.log(`  ${n}/${all.length} · נמצאו ${found.length}`);
      fs.writeFileSync('attest/round6-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
    }
  }
  fs.writeFileSync('attest/round6-hits.tsv', found.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest/round6-miss.tsv', still.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  const tally = {};
  found.forEach(r => tally[r[2]] = (tally[r[2]] || 0) + 1);
  console.log(`\nסבב 6: ${found.length} נמצאו · ${still.length} נשארו`);
  Object.entries(tally).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
})();
