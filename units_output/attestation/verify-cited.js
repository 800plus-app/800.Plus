'use strict';
/* האם המקור הרשום באמת מכיל את המילה · units_output/attestation/verify-cited.js
 *
 *   node units_output/attestation/verify-cited.js --run        → כל 299 השורות
 *   node units_output/attestation/verify-cited.js --selftest    → בקרה
 *
 * ===== מה נשאל =====
 *
 * לכל שורה ב-`attestation-299-worth.tsv` יש **מקור רשום**. השאלה אינה «האם
 * המקור חוקי» אלא **«האם הישות שנקובה שם באמת מכילה את המילה»**.
 *
 * ===== ⛔ שש מלכודות שנתפסו בבנייה, וכל אחת שינתה תוצאה =====
 *
 * 1 · ⛔ **`?version=hebrew&version=all` מחזיר 200 עם `versions: []`.** נראה
 *     בדיוק כמו «אין טקסט». ⭐ רשימת הגרסאות יושבת ב-`available_versions`.
 * 2 · ⛔ **`?version=hebrew` על ספר מקרא מחזיר «Miqra according to the
 *     Masorah» שהוא CC-BY-SA.** שלוש שורות «כתב־יד לנינגרד» נראו כחשופות
 *     רק בגללו. ⭐ כשברירת המחדל אינה מותרת, נסרקות שאר הגרסאות העבריות.
 * 3 · ⛔ **`קְלִישָאַה / קְלִישָה` אינו מחרוזת אחת** — הוא שתי חלופות, וכל
 *     אחת נבדקת לחוד. השוואה למחרוזת המלאה ייצרה חמישה «שגוי» שקריים.
 * 4 · ⛔ **רפרנס מעורב** — `נשגב=L215043 · מבינתו=Pat Lechem…` — לכל רכיב
 *     מקור משלו, וכל רכיב נבדק מול המקור שלו. השורה אומתה רק אם **כולם** כן.
 * 5 · ⛔ **דף שידור בוויקיטקסט** הוא תבנית קצרה שהטקסט משודר אליה מדף אחר.
 *     חיפוש בו מחזיר «לא נמצא» על **כל** מילה. ⭐ דף קצר מ-400 תווים אינו ראיה.
 * 6 · ⛔ **המטמון `sefaria-licenses.json` אינו נקרא כאן.** נמדד שהוא מתייג
 *     תרגום מ-1989 כ«נחלת הכלל». הרישיון נמשך חי, ומהדורה מ-1929 ומעלה
 *     שמתויגת «נחלת הכלל» מסומנת **חשודה, לא מאושרת**.
 *
 * ===== חמישה פסקי דין =====
 *   ⭐ אומת    · הישות נמשכה והערך נמצא בה במלואו
 *   ⚠ חלקי    · נמצא רכיב מהערך ולא הערך המלא — ⛔ אינו הוכחה לצירוף
 *   ⛔ שגוי    · הישות נמשכה ואין בה לא הערך ולא רכיב ממנו
 *   ⚠ חשוד    · נמצא, אבל הרישיון או שנת המהדורה אינם עומדים בכלל
 *   ⚠ לא ניתן · הישות לא נמשכה (404, דף שידור, רפרנס בלי כתובת)
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
/* ⛔ המטמון יורד ל-temp של המערכת ולא לתוך הריפו הציבורי. */
const CACHE = process.env.CITECACHE || path.join(require('os').tmpdir(), '800plus-citecache.json');
const FILE = path.join(DIR, 'attestation-299-worth.tsv');

const NIQ = /[֑-ׇ]/g;
const strip = s => String(s).replace(/<[^>]*>/g, ' ').normalize('NFKC').replace(NIQ, '')
  .replace(/[׳״"’']/g, '').replace(/[־‐-―]/g, ' ')
  .replace(/[^֐-׿\s]/g, ' ').replace(/\s+/g, ' ').trim();
const CUTOFF = 1929;
const yearOf = v => { const y = String(v).match(/\b(1[5-9]\d\d|20\d\d)\b/g); return y ? Math.max.apply(null, y.map(Number)) : null; };
const isPD = l => /^(public domain|pd|cc0)$/i.test(String(l).trim());
const okVer = v => isPD(v.license) && !(yearOf(v.versionTitle) >= CUTOFF);
const UA = { 'User-Agent': '800plus-attestation/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* צורות הערך · חלופות «/» ומה שבסוגריים, עם השלמת חלופה קטועה */
function formsOf(entry) {
  const alts = String(entry).split('/').map(s => s.trim()).filter(Boolean);
  const head = strip(alts[0].replace(/\([^)]*\)/g, ' ')).split(' ').filter(Boolean);
  const out = new Set();
  alts.forEach((a, i) => [strip(a.replace(/\([^)]*\)/g, ' ')), strip(a)].forEach(v => {
    const w = v.split(' ').filter(Boolean);
    if (!w.length) return;
    if (i > 0 && w.length < head.length && head.length > 1) out.add(head.slice(0, head.length - w.length).concat(w).join(' '));
    else out.add(w.join(' '));
  }));
  return Array.from(out);
}
const partsOf = entry => Array.from(new Set(formsOf(entry).join(' ').split(' ').filter(w => w.length > 1)));
/* רצף על גבולות מילה · «כל המילים קיימות» אינו «הצירוף מופיע»
 * ⭐ תחילית ו/ה/ב/ל/כ/מ/ש על המילה **הראשונה** מתקבלת — `ושפל` בתהילים קל״ח
 * הוא המילה `שפל`, ודרישת הצורה החשופה הפילה שם שורה תקינה.
 * ⛔ אבל סיומת אינה מתקבלת: `שפכו` אינו `שפך`. */
function seqIn(text, needle) {
  const H = Array.isArray(text) ? text : strip(text).split(' ').filter(Boolean);
  const N = strip(needle).split(' ').filter(Boolean);
  if (!N.length || H.length < N.length) return false;
  for (let i = 0; i + N.length <= H.length; i++) {
    if (H[i] !== N[0] && !(H[i].length === N[0].length + 1 && /^[והבלכמש]/.test(H[i]) && H[i].slice(1) === N[0])) continue;
    let ok = true;
    for (let k = 1; k < N.length; k++) if (H[i + k] !== N[k]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }
let dirty = 0;
const flush = () => { if (dirty) { fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8'); dirty = 0; } };
async function grab(url, asText) {
  const k = (asText ? 'T|' : 'J|') + url;
  if (cache[k] !== undefined) return cache[k];
  let v = null;
  for (let a = 0; a < 3 && v === null; a++) {                 /* ⛔ «terminated» חוזר · לא נספר ככשל */
    try {
      const r = await fetch(url, { headers: UA });
      v = r.ok ? (asText ? await r.text() : await r.json()) : { __status: r.status };
      if (asText && !r.ok) v = '';
    } catch (e) { v = null; await sleep(700); }
  }
  if (v === null) v = asText ? '' : { __status: 0 };
  cache[k] = v; dirty++; if (dirty > 25) flush();
  await sleep(80);
  return v;
}

/* ===== ויקינתונים ===== */
async function wikidata(entry, id) {
  const j = await grab('https://www.wikidata.org/wiki/Special:EntityData/' + id + '.json');
  const e = j && j.entities && j.entities[id];
  if (!e) return { v: 'לא ניתן', why: 'הישות ' + id + ' לא נמשכה' };
  const forms = [];
  Object.keys(e.lemmas || {}).forEach(k => forms.push(e.lemmas[k].value));
  (e.forms || []).forEach(f => Object.keys(f.representations || {}).forEach(k => forms.push(f.representations[k].value)));
  const norm = forms.map(f => strip(f));
  const hit = formsOf(entry).find(f => norm.indexOf(f) >= 0);
  if (hit) return { v: 'אומת', why: id + ' ⟵ «' + hit + '»' };
  const part = partsOf(entry).find(p => norm.indexOf(p) >= 0);
  if (part) return { v: 'חלקי', why: id + ' מכסה את «' + part + '» בלבד, לא את הערך המלא' };
  return { v: 'שגוי', why: id + ' · ' + forms.length + ' צורות, אף אחת אינה הערך · ' + forms.slice(0, 4).join(', ') };
}

/* ===== ספריא · טקסט + רישיון חי ===== */
async function sefariaVersions(ref) {
  const u = 'https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(ref.replace(/ /g, '_'));
  const j = await grab(u + '?version=hebrew');
  if (!j || j.__status) return { err: (j && j.__status) || '?' };
  const cur = (j.versions || []).filter(v => (v.actualLanguage || v.language) === 'he');
  const avail = (j.available_versions || []).filter(v => (v.actualLanguage || v.language) === 'he');
  return { cur: cur, avail: avail, u: u };
}
async function sefaria(entry, ref) {
  const s = await sefariaVersions(ref);
  if (s.err) return { v: 'לא ניתן', why: 'הרפרנס החזיר ' + s.err };
  const seen = [];
  const take = v => {
    const t = Array.isArray(v.text) ? v.text.flat(9).join(' ') : String(v.text || '');
    if (!t) return null;
    const hit = formsOf(entry).find(f => seqIn(t, f));
    if (hit) return { full: true, form: hit, v: v };
    const part = partsOf(entry).find(p => seqIn(t, p));
    return part ? { full: false, form: part, v: v } : null;
  };
  for (const v of s.cur) { const r = take(v); if (r) seen.push(r); }
  /* ⛔ ברירת המחדל של `version=hebrew` על מקרא היא CC-BY-SA · אם היא הראשונה
   * שנמצאה, ממשיכים לגרסאות המותרות ברשימת `available_versions`. */
  if (!seen.some(r => r.full && okVer(r.v))) {
    for (const av of s.avail) {
      if (!okVer(av) || s.cur.some(c => c.versionTitle === av.versionTitle)) continue;
      const j2 = await grab(s.u + '?version=' + encodeURIComponent('hebrew|' + av.versionTitle));
      const v2 = (j2.versions || [])[0];
      if (!v2 || v2.versionTitle !== av.versionTitle) continue;
      const r = take(v2); if (r) { seen.push(r); if (r.full) break; }
    }
  }
  if (!seen.length) return { v: 'שגוי', why: 'אין בטקסט העברי לא את הערך ולא רכיב ממנו · ' + (s.cur.length + s.avail.length) + ' גרסאות' };
  const good = seen.find(r => r.full && okVer(r.v));
  if (good) return { v: 'אומת', why: good.v.versionTitle + ' · ' + good.v.license };
  const fullAny = seen.find(r => r.full);
  if (fullAny) return { v: 'חשוד', why: fullAny.v.versionTitle + ' · רישיון «' + fullAny.v.license + '»' + (yearOf(fullAny.v.versionTitle) >= CUTOFF ? ' · מהדורה ' + yearOf(fullAny.v.versionTitle) : '') };
  return { v: 'חלקי', why: 'נמצא «' + seen[0].form + '» בלבד ב-' + seen[0].v.versionTitle + ', לא הערך המלא' };
}

/* ===== מילון בנחלת הכלל · BDB 1906 / יסטרוב 1903 ===== */
async function lexicon(entry, ref) {
  const head = String(ref).replace(/^(BDB|Jastrow)[^,]*,\s*/, '').replace(/[*²³¹]/g, '').trim();
  const j = await grab('https://www.sefaria.org/api/words/' + encodeURIComponent(strip(head) || strip(entry)));
  if (!Array.isArray(j)) return { v: 'לא ניתן', why: 'המילון לא החזיר תשובה על «' + head + '»' };
  const pd = j.filter(e => /^(BDB|Jastrow)/.test(e.parent_lexicon || ''));
  if (!pd.length) return { v: 'שגוי', why: 'אין ערך ב-BDB או ביסטרוב עבור «' + head + '»' };
  const want = strip(head);
  const hit = pd.find(e => strip(String(e.headword).replace(/\s+(I|II|III|IV|V|VI)$/, '')) === want);
  return hit ? { v: 'אומת', why: hit.headword + ' @ ' + hit.parent_lexicon }
    : { v: 'חלקי', why: 'הוחזרו ' + pd.map(e => e.headword).slice(0, 3).join(', ') + ' ואף אחד אינו «' + head + '»' };
}

/* ===== ויקיטקסט ===== */
async function wikisource(entry, page, host) {
  const t = await grab('https://' + host + '/w/index.php?action=raw&title=' + encodeURIComponent(page.replace(/ /g, '_')), true);
  if (!t) return { v: 'לא ניתן', why: 'הדף «' + page + '» לא נמשך' };
  if (t.length < 400) return { v: 'לא ניתן', why: 'דף שידור · ' + t.length + ' תווים, הטקסט משודר מדף אחר' };
  const hit = formsOf(entry).find(f => seqIn(t, f));
  if (hit) return { v: 'אומת', why: page + ' · ' + t.length + ' תווים · «' + hit + '»' };
  if (!/[֐-׿]/.test(t)) return { v: 'לא ניתן', why: page + ' · הדף אינו עברי, לא ניתן לאמת בו מילה עברית' };
  const part = partsOf(entry).find(p => seqIn(t, p));
  if (part) return { v: 'חלקי', why: page + ' · נמצא «' + part + '» בלבד' };
  return { v: 'שגוי', why: page + ' · ' + t.length + ' תווים, אפס מופעים' };
}

/* ⛔ מלכודת שביעית · הרפרנס נושא את שם הגרסה בסוגריים —
 * `Sefer HeArukh, Letter Shin 300 (Sefer HeArukh, Lublin 1883 [he])`.
 * הכתובת עצמה נגמרת לפני הסוגריים, ובלי הקיצוץ הזה שלוש שורות תקינות
 * חזרו 404/400 ונספרו כ«לא ניתן». */
const bareRef = r => String(r).replace(/\s*\([^()]*\[[a-z]{2}\]\)\s*$/, '').trim();

/* ===== ניתוב שורה ===== */
async function one(entry, src, ref) {
  ref = bareRef(ref);
  if (/^(BDB|Jastrow)\b/.test(String(ref).trim())) return await lexicon(entry, ref);
  if (/^L\d+$/.test(String(ref).trim())) return await wikidata(entry, ref.trim());
  if (/ויקיטקסט/.test(src)) {
    /* ⭐ כאן שם הדף **הוא** עברי · הבדיקה על «אין אותיות לטיניות» חלה על
     * רפרנס ספריא בלבד, ובסדר הפוך היא הפילה 12 דפי ויקיטקסט תקינים. */
    const host = /לטיני/.test(src) ? 'la.wikisource.org' : 'he.wikisource.org';
    return await wikisource(entry, String(ref).replace(/^ערך:\s*/, '').split(' · ')[0], host);
  }
  if (!/[A-Za-z]/.test(ref)) return { v: 'לא ניתן', why: 'רפרנס ספריא שנכתב כציטוט עברי חופשי ואינו כתובת שאפשר למשוך · «' + ref.slice(0, 40) + '»' };
  return await sefaria(entry, ref);
}
async function verifyRow(entry, src, ref) {
  /* רפרנס מעורב · לכל רכיב מקור משלו, והשורה אומתה רק אם כולם אומתו */
  const parts = String(ref).split(/\s+·\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every(p => /^[^=]+=./.test(p))) {
    const outs = [];
    for (const p of parts) {
      const m = p.match(/^([^=]+)=\s*(.+)$/);
      outs.push([m[1].trim(), await one(m[1].trim(), src, m[2].trim())]);
    }
    const bad = outs.find(o => o[1].v !== 'אומת');
    return bad ? { v: bad[1].v, why: 'רכיב «' + bad[0] + '» · ' + bad[1].why } : { v: 'אומת', why: outs.map(o => o[1].why).join(' · ') };
  }
  const m1 = String(ref).match(/^([^=·]+)=\s*(.+)$/);
  if (m1) return await one(m1[1].trim(), src, m1[2].trim());
  return await one(entry, src, ref);
}

/* ===== בקרה ===== */
async function selftest() {
  let ok = true;
  const cases = [
    ['ויקינתונים · ערך שקיים', 'אֶקְרָן', 'ויקינתונים (CC0)', 'L205350', 'אומת'],
    ['ויקינתונים · ערך שאינו', 'גְלוֹפְּסְטִיק', 'ויקינתונים (CC0)', 'L205350', 'שגוי'],
    ['ויקינתונים · חלופות «/»', 'קְלִישָאַה / קְלִישָה', 'ויקינתונים (CC0)', 'L218280', 'אומת'],
    ['ויקינתונים · מזהה שאינו קיים', 'אֶקְרָן', 'ויקינתונים (CC0)', 'L999999999', 'לא ניתן'],
    ['ספריא · ערך שקיים', 'אִלוּלֵא', 'נחלת הכלל / CC0 (לפי ספריא)', 'Penei Moshe on Jerusalem Talmud Beitzah 2:7:3:3', 'אומת'],
    ['ספריא · ערך שאינו', 'גְלוֹפְּסְטִיק', 'נחלת הכלל / CC0 (לפי ספריא)', 'Genesis 1:1', 'שגוי'],
    ['ספריא · ברירת מחדל CC-BY-SA', 'שָׁפָל', 'כתב־יד לנינגרד — נחלת הכלל', 'Psalms 138:6', 'אומת'],
    ['ספריא · רכיב בלבד', 'בְּרֵאשִׁית גְלוֹפְּסְטִיק', 'נחלת הכלל / CC0 (לפי ספריא)', 'Genesis 1:1', 'חלקי'],
    ['ויקינתונים · רכיב בלבד', 'אָזַר עֹז / כֹּחַ / אֹמֶץ', 'ויקינתונים (CC0)', 'L65701', 'חלקי'],
    ['מילון · ערך שקיים', 'מַק', 'נחלת הכלל / CC0 (לפי ספריא)', 'BDB, מַק', 'אומת'],
  ];
  for (const [why, w, s, r, want] of cases) {
    const o = await verifyRow(w, s, r);
    const p = o.v === want;
    ok = ok && p;
    console.log((p ? '✓ ' : '⛔ ') + why + ' → ' + o.v + ' (ציפייה ' + want + ') · ' + o.why);
  }
  const p6 = yearOf('Torat Emet 1989') === 1989 && yearOf('Miqra according to the Masorah') === null
    && isPD('CC-BY-NC') === false && isPD('Public Domain') === true;
  ok = ok && p6;
  console.log((p6 ? '✓ ' : '⛔ ') + 'בקרה · CC-BY-NC נדחה, ושנת מהדורה נקראת מהשם ולא מהמטמון');
  const p7 = !fs.readFileSync(__filename, 'utf8').split(/\r?\n/)
    .some(l => /sefaria-licenses/.test(l) && /(readFileSync|require|existsSync|open)\s*\(/.test(l));
  ok = ok && p7;
  console.log((p7 ? '✓ ' : '⛔ ') + 'בקרה · אין בקובץ אף קריאה למטמון sefaria-licenses.json');
  const p9 = bareRef('Sefer HeArukh, Letter Shin 300 (Sefer HeArukh, Lublin 1883 [he])') === 'Sefer HeArukh, Letter Shin 300'
    && bareRef('Genesis 1:1') === 'Genesis 1:1';
  ok = ok && p9;
  console.log((p9 ? '✓ ' : '⛔ ') + 'בקרה · שם הגרסה בסוגריים נחתך מהכתובת, ורפרנס נקי אינו נפגע');
  const p8 = seqIn('שפך את לבו לפני', 'שפך לבו') === false && seqIn('שפך לבו לפני', 'שפך לבו') === true
    && seqIn('כי רם יהוה ושפל יראה', 'שפל') === true && seqIn('שפכו לפניו לבבכם', 'שפך') === false;
  ok = ok && p8;
  console.log((p8 ? '✓ ' : '⛔ ') + 'בקרה · רצף שבור נדחה · תחילית «ושפל» מתקבלת · סיומת «שפכו» נדחית');
  flush();
  console.log(ok ? '\n⭐ לבודק יש שיניים · הוא מאשר, פוסל, מבחין בין מלא לחלקי, ומודה כשלא ניתן' : '\n⛔ הבודק אינו מבחין');
  process.exit(ok ? 0 : 1);
}

async function run() {
  const rows = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t')).slice(1);
  const by = { 'אומת': 0, 'חלקי': 0, 'שגוי': 0, 'חשוד': 0, 'לא ניתן': 0 };
  const out = [['מילה', 'מקור ההוכחה הרשום', 'הרפרנס הרשום', 'פסק דין', 'מה נמצא בפועל'].join('\t')];
  for (const c of rows) {
    let o;
    try { o = await verifyRow(c[0], (c[2] || '').trim(), (c[3] || '').trim()); }
    catch (e) { o = { v: 'לא ניתן', why: 'שגיאה · ' + e.message }; }
    by[o.v]++;
    out.push([c[0], c[2] || '', c[3] || '', o.v, o.why].join('\t'));
    if (o.v !== 'אומת') console.log('  ' + (o.v === 'שגוי' ? '⛔' : '⚠') + ' ' + o.v + ' | ' + c[0] + ' | ' + (c[2] || '') + ' | ' + o.why);
  }
  flush();
  fs.writeFileSync(path.join(DIR, 'attestation-299-verified.tsv'), out.join('\n') + '\n', 'utf8');
  console.log('');
  console.log('  שורות בטבלה : ' + rows.length);
  console.log('  ⭐ אומת      : ' + by['אומת']);
  console.log('  ⚠ חלקי       : ' + by['חלקי'] + '   ⛔ רכיב, לא הערך המלא');
  console.log('  ⛔ שגוי      : ' + by['שגוי']);
  console.log('  ⚠ חשוד       : ' + by['חשוד']);
  console.log('  ⚠ לא ניתן    : ' + by['לא ניתן']);
  const sum = Object.keys(by).reduce((n, k) => n + by[k], 0);
  console.log('  ' + (sum === rows.length ? '✅ הסכום מתיישב · ' + sum : '⛔ הסכום אינו מתיישב'));
}

(async () => {
  const a = process.argv;
  if (a.indexOf('--selftest') >= 0) return selftest();
  if (a.indexOf('--run') >= 0) return void await run();
  console.log('--run | --selftest');
})().catch(e => { flush(); console.error('⛔ ' + e.message); process.exit(2); });
