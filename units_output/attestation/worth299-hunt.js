/* ציד ממוקד ל-16 המילים שהוכחתן אינה נחלת-הכלל/CC0 — גרסה קשוחה.
 *
 * ⛔ מה שנפל בגרסה הראשונה: התאמה בהתעלמות מאמות קריאה. `פיל` נתפס כ-`פלי`,
 * `רישא` כ-`רשאי`, `אלומת` כ-`אילמות`, `טבולה` כ-`טבילה`. 19 מ-27 ההתאמות היו
 * רעש. הכלל כאן: **התאמה מדויקת אחרי הסרת ניקוד בלבד.** כתיב מלא/חסר מותר רק
 * כשההבדל הוא הוספת ו'/י' *בתוך* אותו שלד — אותה אות ראשונה, אותה אחרונה,
 * הפרש אורך 1 — וגם אז זה מודפס לביקורת.
 *
 * ⛔ ולקח שני: מילה שמופיעה בטקסט יהודי-ערבי או ארמי אינה הוכחה למילה עברית.
 * `ראסה` נמצא ב"תפסיר רס"ג" — שם זו המילה הערבית رأسه. נפסל לפי שם החיבור.
 */
const fs = require('fs');
const SEP = '';
const NIQ = /[֑-ׇ]/g;
const clean = s => s.normalize('NFKC').replace(NIQ, '').replace(/["'׳״]/g, '')
  .replace(/[־‐-―]/g, ' ').replace(/-\s*$/, '').replace(/\s+/g, ' ').trim();
const fin = s => s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
  .replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
const key = s => fin(clean(s));

/* כתיב מלא/חסר: היעד הוא תת-סדרה של הלמה, בהוספת ו'/י' אחת בלבד */
function maleVariant(target, lemma) {
  const a = key(target), b = key(lemma);
  if (a === b) return 'exact';
  if (Math.abs(a.length - b.length) !== 1) return null;
  const [sh, lo] = a.length < b.length ? [a, b] : [b, a];
  if (sh[0] !== lo[0] || sh[sh.length - 1] !== lo[lo.length - 1]) return null;
  let i = 0, added = '';
  for (const ch of lo) { if (i < sh.length && ch === sh[i]) i++; else added += ch; }
  return (i === sh.length && /^[וי]$/.test(added)) ? 'male' : null;
}

const PART = /^(את|אל|על|של|עם|כי|אם|לא|מן|ב|ל|מ|ה|ו|כ|ש)$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };
/* ⛔ חיבורים שאינם עבריים — מילה בהם אינה הוכחה למילה עברית */
const NON_HEB = /Tafsir|Rasag|Judeo.?Arabic|Arabic|Targum|Aramaic|Peshitta/i;

/* ---- שכבה 0: הדאמפים המקומיים של ויקינתונים, CC0 ---- */
const idx = new Map();
function load(dir, pat, kind) {
  for (const f of fs.readdirSync(dir).filter(x => pat.test(x)))
    for (const l of fs.readFileSync(dir + f, 'utf8').split('\n')) {
      const m = l.match(/entity\/(L\d+)>\t"([^"]+)"/);
      if (!m) continue;
      const k = key(m[2]);
      if (k && !idx.has(k)) idx.set(k, [m[1], clean(m[2]), kind]);
    }
}
load('../attest/', /^lex-\d\.tsv$/, 'למה');
load('../forms/', /^f-\d\.tsv$/, 'צורה');
console.log(`מפתחות ייחודיים בדאמפים (CC0): ${idx.size}\n`);

/* ---- ספריא, הרישיון נשאל ולא נוחש ---- */
const lic = JSON.parse(fs.existsSync('lic2.json') ? fs.readFileSync('lic2.json', 'utf8') : '{}');
async function licenseOf(ref) {
  if (lic[ref]) return lic[ref];
  try {
    const r = await fetch('https://www.sefaria.org/api/v3/texts/' +
      encodeURIComponent(ref.replace(/ /g, '_')), { headers: UA });
    if (!r.ok) return (lic[ref] = 'err:' + r.status + SEP);
    const j = await r.json();
    const ls = (j.versions || []).map(v => v.license).filter(Boolean);
    const vt = (j.versions || []).map(v => v.versionTitle || '').join(' ');
    return (lic[ref] = (ls.length ? [...new Set(ls)].join(' | ') : 'unknown') + SEP + vt);
  } catch (e) { return (lic[ref] = 'net' + SEP); }
}
const isPD = l => /Public Domain|^PD$|CC0/i.test((l || '').split(SEP)[0]);

async function sefaria(q, slop) {
  try {
    const r = await fetch('https://www.sefaria.org/api/search-wrapper', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...UA },
      body: JSON.stringify({ query: q, type: 'text', size: 30, field: 'exact', slop }),
    });
    if (!r.ok) return [];
    return ((await r.json()).hits || {}).hits || [];
  } catch (e) { return []; }
}
async function sefariaPD(q) {
  const want = key(q).split(' ').filter(Boolean);
  for (const slop of [0, 4, 10]) {
    const res = await sefaria(q, slop); await sleep(140);
    for (const h of res) {
      const ref = h._source ? h._source.ref : h._id;
      if (NON_HEB.test(ref)) continue;
      const txt = clean(String(((h.highlight || {}).exact || []).join(' ')).replace(/<\/?b>/g, ''));
      const kt = key(txt);
      /* המילה חייבת להופיע כטוקן, לכל היותר עם אות שימוש מוצמדת מלפנים */
      if (!want.every(w => new RegExp('(^|[\\s\\u05D5\\u05D4\\u05D1\\u05DC\\u05DB\\u05E9\\u05DE])' + w + '(?![\\u05D0-\\u05EA])').test(kt))) continue;
      const L = await licenseOf(ref); await sleep(80);
      if (!isPD(L)) continue;
      const ver = L.split(SEP)[1] || '';
      if (NON_HEB.test(ver)) continue;
      return { ref, lic: L.split(SEP)[0], ver, txt: txt.slice(0, 150) };
    }
  }
  return null;
}
async function wdSearch(q) {
  try {
    const r = await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities&type=lexeme' +
      '&language=he&uselang=he&limit=20&format=json&search=' + encodeURIComponent(q), { headers: UA });
    if (!r.ok) return null;
    for (const x of (await r.json()).search || []) {
      const v = maleVariant(q, x.label || '');
      if (v) return { id: x.id, lemma: clean(x.label), how: v };
    }
  } catch (e) {}
  return null;
}
async function wikisource(q) {
  try {
    const s = await fetch('https://he.wikisource.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent('"' + q + '"') + '&srlimit=1&format=json', { headers: UA });
    if (s.ok) {
      const j = await s.json();
      if (j.query.searchinfo.totalhits > 0) return j.query.search[0].title;
    }
  } catch (e) {}
  return null;
}

const todo = fs.readFileSync('weak.tsv', 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));
(async () => {
  const out = [];
  for (const [term, unit, oldSrc] of todo) {
    const words = clean(term).split(' ').filter(w => !PART.test(w));
    const per = [];
    for (const w of words) {
      let ev = null;
      const l = idx.get(key(w));
      if (l) ev = { how: `ויקינתונים · ${l[2]} (CC0)`, ref: l[0], as: l[1], match: 'מדויק' };
      if (!ev) {
        const d = await wdSearch(w); await sleep(110);
        if (d) ev = { how: 'ויקינתונים · חיפוש (CC0)', ref: d.id, as: d.lemma, match: d.how };
      }
      if (!ev) {
        const s = await sefariaPD(w);
        if (s) ev = { how: 'ספריא · נחלת הכלל', ref: s.ref, as: s.txt, ver: s.ver, match: 'בטקסט' };
      }
      if (!ev) {
        const k = await wikisource(w); await sleep(110);
        if (k) ev = { how: 'ויקיטקסט · נחלת הכלל', ref: k, as: w, match: 'בטקסט' };
      }
      per.push({ w, ev });
    }
    const whole = words.length > 1 ? await sefariaPD(clean(term)) : null;
    const ok = per.every(p => p.ev);
    out.push({ term, unit, oldSrc, per, whole, ok });
    console.log(`${ok ? '✓' : '✗'} ${term}${whole ? `  [שלם: ${whole.ref}]` : ''}`);
    per.forEach(p => console.log(`     ${p.w}: ` + (p.ev
      ? `${p.ev.how} · ${p.ev.ref} · "${p.ev.as.slice(0, 60)}" [${p.ev.match}]`
      : '⛔ לא נמצא')));
    fs.writeFileSync('lic2.json', JSON.stringify(lic), 'utf8');
    fs.writeFileSync('hunt2.json', JSON.stringify(out, null, 1), 'utf8');
  }
  console.log(`\n${out.filter(o => o.ok).length}/${out.length} כל מילות התוכן ממקור חופשי`);
})();
