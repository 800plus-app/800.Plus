/* סבב שני על 9 המילים, אחרי שהביקורת פסלה 5 מ-8 ההתאמות.
 *
 * ⛔ שני כשלים שהמנגנון הקשוח **לא** תפס:
 *   1. הסרת ניקוד מאחדת הומוגרפים. `לבו` נתפס כלמה `ליבה` (הבעירה), `הגדר` כלמה
 *      `הוגדר`, ו-`בחובו` נמצא בספריא במובן "בחוב שלו" ולא "בחיקו".
 *   2. אות שימוש מוצמדת לא הופשטה מהטוקן, ולכן חיפשתי `הגדר` במקום `גדר`.
 *
 * התיקון: מחפשים את **הלמה** אחרי הפשטת אות שימוש וכינוי חבור, ומאמתים את
 * הקטגוריה הדקדוקית הצפויה. ומה שנשאר מונח לועזי — מאומת בשפת המקור, כמו
 * `tabula rasa` אצל אקווינס.
 */
const fs = require('fs');
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NIQ = /[֑-ׇ]/g;
const clean = s => s.normalize('NFKC').replace(NIQ, '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim();
const NOUN = 'Q1084', VERB = 'Q24905', ADJ = 'Q34698';

/* מה בדיוק צריך להוכיח לכל מילה, ובאיזו קטגוריה */
const TARGETS = [
  { term: 'בְּחוּבּוֹ',           need: [['חוב', NOUN, 'חיק, קפל הבגד — לא חוב כספי']] },
  { term: 'יוֹשֵׁב עַל הַגָּדֵר', need: [['יושב', VERB, ''], ['גדר', NOUN, 'מחיצה — לא הפועל הגדיר']] },
  { term: 'נוֹטֵר טִינָה',        need: [['נטר', VERB, 'שמר כעס — לא נוטר במובן שומר'], ['טינה', NOUN, '']] },
  { term: 'נִכְמַר לִבּוֹ',        need: [['נכמר', VERB, ''], ['לב', NOUN, 'האיבר — לא הפועל ליבה']] },
];

async function wdLemma(q, cat) {
  const r = await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities&type=lexeme' +
    '&language=he&uselang=he&limit=25&format=json&search=' + encodeURIComponent(q), { headers: UA });
  if (!r.ok) return null;
  for (const x of (await r.json()).search || []) {
    if (clean(x.label || '') !== clean(q)) continue;
    const d = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${x.id}.json`, { headers: UA });
    await sleep(180);
    if (!d.ok) continue;
    const e = (await d.json()).entities[x.id];
    if (cat && e.lexicalCategory !== cat) continue;
    return { id: x.id, lemma: Object.values(e.lemmas || {}).map(v => v.value).join(' / '), cat: e.lexicalCategory };
  }
  return null;
}
async function sefariaPD(q) {
  for (const slop of [0, 3]) {
    const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...UA },
      body: JSON.stringify({ query: q, type: 'text', size: 15, field: 'exact', slop }),
    });
    await sleep(160);
    if (!r.ok) continue;
    for (const h of ((await r.json()).hits || {}).hits || []) {
      const ref = h._source ? h._source.ref : h._id;
      if (/Tafsir|Rasag|Arabic|Targum/i.test(ref)) continue;
      const l = await fetch('https://www.sefaria.org/api/v3/texts/' +
        encodeURIComponent(ref.replace(/ /g, '_')), { headers: UA });
      await sleep(120);
      if (!l.ok) continue;
      const j = await l.json();
      const lic = [...new Set((j.versions || []).map(v => v.license))].join('|');
      if (!/Public Domain|CC0/i.test(lic)) continue;
      const txt = clean(String((j.versions || []).map(v => v.text).join(' ')).replace(/<[^>]+>/g, ''));
      const i = txt.indexOf(clean(q).split(' ')[0]);
      if (i < 0) continue;
      return { ref, lic, ctx: txt.slice(Math.max(0, i - 60), i + 70).replace(/\s+/g, ' ') };
    }
  }
  return null;
}

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.term}`);
    for (const [w, cat, note] of t.need) {
      const d = await wdLemma(w, cat);
      if (d) { console.log(`   ✓ ${w}: ויקינתונים ${d.id} · למה "${d.lemma}" · קטגוריה ${d.cat}${note ? ' · ' + note : ''}`); continue; }
      const s = await sefariaPD(w);
      console.log(s ? `   ✓ ${w}: ספריא ${s.ref} (${s.lic}) :: ${s.ctx}` : `   ⛔ ${w}: לא נמצא`);
    }
  }
  /* המונחים הלועזיים — בשפת המקור, בנחלת הכלל */
  console.log('\n=== מונחים לועזיים · חיפוש בשפת המקור');
  for (const [q, hosts] of [['force majeure', ['en.wikisource.org', 'fr.wikisource.org']],
                            ['surrealism', ['en.wikisource.org']],
                            ['surréalisme', ['fr.wikisource.org']]]) {
    for (const host of hosts) {
      const r = await fetch(`https://${host}/w/api.php?action=query&list=search&srsearch=` +
        encodeURIComponent('"' + q + '"') + '&srlimit=3&srprop=snippet&format=json', { headers: UA });
      await sleep(220);
      if (!r.ok) continue;
      const j = await r.json();
      console.log(`  ${host} "${q}": ${j.query.searchinfo.totalhits} תוצאות`);
      (j.query.search || []).forEach(s => console.log(`     ${s.title} :: ` +
        String(s.snippet).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 100)));
    }
  }
})();
