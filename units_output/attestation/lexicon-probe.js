'use strict';
/* חקירת שני המילונים המותרים · units_output/attestation/lexicon-probe.js
 *
 *   node units_output/attestation/lexicon-probe.js --left      → 43 השורות בלי מקור
 *   node units_output/attestation/lexicon-probe.js --eight     → 8 הביטויים שלא הוכחו
 *   node units_output/attestation/lexicon-probe.js --selftest  → בקרה שהחיפוש מבחין
 *
 * ===== מה זה שואל =====
 *
 * שני מילונים בנחלת הכלל בלבד: **BDB (Oxford, 1906)** ו-**Jastrow (Luzac, 1903)**.
 * ⛔ קליין מסונן החוצה במפורש — הוא CC-BY-NC ואסור לשימוש מסחרי.
 * ⛔ ואף מילון אחר אינו מתקבל, גם אם ספריא מחזירה אותו באותה תשובה.
 *
 * ===== ארבע דרגות · ורק הראשונה נחשבת הוכחה אוטומטית =====
 *
 *   A · «ערך»    כותרת הערך **שווה** למילה המבוקשת אחרי הסרת ניקוד בלבד.
 *   B · «ציטוט»  הצירוף המלא מופיע **מילה-במילה** בגוף הערך, על גבולות מילה.
 *   N · «סמוך»   נבדל באם קריאה או בא/ה סופית — ⛔ נשאר להכרעה, לא מוחלף.
 *   C · «רכיב»   רק חלק מהצירוף נמצא — ⛔ **זו אינה הוכחה לצירוף**, וזו בדיוק
 *                המחלקה שהפילה את שמונת הביטויים במבחן הרפוי.
 *
 * ⛔ אין השלמת אם קריאה · אין חילוף א/ה סופית · אין נרמול שורש.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const DIR = __dirname;
/* ⛔ המטמון יורד ל-temp של המערכת ולא לתוך הריפו · הריפו ציבורי ואין
 * סיבה שקובץ עבודה של 10MB ייכנס אליו בטעות. */
const CACHE = process.env.LEXCACHE || path.join(require('os').tmpdir(), '800plus-lexcache.json');

const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '').replace(/[׳’']/g, '')
  .replace(/[־\-]/g, ' ').replace(/[?!.,;:()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const PD_LEX = /^(BDB|Jastrow)/;              /* ⛔ קליין ואחרים נופלים כאן */

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');

function get(url) {
  return new Promise(res => {
    const req = https.get(url, { timeout: 20000, headers: { 'User-Agent': '800plus-attestation/1.0' } }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res({ code: r.statusCode, body: b }));
    });
    req.on('error', e => res({ code: 0, body: '', err: e.code || e.message }));
    req.on('timeout', () => { req.destroy(); res({ code: 0, body: '', err: 'TIMEOUT' }); });
  });
}
async function words(w) {
  if (cache[w]) return cache[w];
  const r = await get('https://www.sefaria.org/api/words/' + encodeURIComponent(w));
  if (r.code !== 200) { if (r.code === 0) throw new Error('רשת: ' + (r.err || '?') + ' על «' + w + '»'); return []; }
  let j; try { j = JSON.parse(r.body); } catch (e) { j = []; }
  if (!Array.isArray(j)) j = [];
  const slim = j.filter(e => PD_LEX.test(e.parent_lexicon || ''))
    .map(e => ({ h: e.headword || '', lex: e.parent_lexicon, txt: flat(e.content) }));
  cache[w] = slim; saveCache();
  return slim;
}
/* כל הטקסט של ערך, בשרשור אחד · כדי לחפש בו את הצירוף המלא */
function flat(c) {
  const out = [];
  (function walk(x) {
    if (x == null) return;
    if (typeof x === 'string') { out.push(x); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') { Object.keys(x).forEach(k => walk(x[k])); }
  })(c);
  return out.join(' ');
}
/* התאמת רצף על גבולות מילה · «כל המילים קיימות» אינו «הצירוף מופיע» */
function seqIn(hay, needle) {
  const H = norm(hay).split(' ').filter(Boolean), N = norm(needle).split(' ').filter(Boolean);
  if (!N.length || H.length < N.length) return false;
  for (let i = 0; i + N.length <= H.length; i++) {
    let ok = true;
    for (let k = 0; k < N.length; k++) if (H[i + k] !== N[k]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
/* ⛔ «סמוך» אינו «שווה» */
const loose = s => norm(s).replace(/[אהוי]/g, '');

/* המילה עשויה להיכתב עם וריאנטים «/» או סוגריים · כל וריאנט נשאל בנפרד */
function variants(w) {
  const out = new Set();
  const base = String(w).split('/').map(s => s.trim()).filter(Boolean);
  for (const b of base) {
    out.add(norm(b));
    out.add(norm(b.replace(/\([^)]*\)/g, ' ')));       /* בלי מה שבסוגריים */
  }
  return Array.from(out).filter(Boolean);
}

async function probe(word) {
  const vs = variants(word);
  const res = { word: word, tier: 'C', hits: [], near: [], comp: [] };
  for (const v of vs) {
    let j = [];
    try { j = await words(v); } catch (e) { res.tier = 'ERR'; res.err = e.message; return res; }
    for (const e of j) {
      const hw = norm(String(e.h).replace(/\s+(I|II|III|IV|V|VI)$/, ''));
      if (hw === v) { res.hits.push({ v: v, h: e.h, lex: e.lex }); continue; }
      if (loose(hw) === loose(v) && loose(v).length >= 2) res.near.push({ v: v, h: e.h, lex: e.lex });
      else res.comp.push({ v: v, h: e.h, lex: e.lex });
    }
    /* דרגה B · הצירוף המלא בגוף ערך של אחד המילונים */
    if (v.indexOf(' ') >= 0) for (const e of j) if (seqIn(e.txt, v)) res.hits.push({ v: v, h: e.h, lex: e.lex, body: true });
  }
  const direct = res.hits.filter(h => !h.body), quoted = res.hits.filter(h => h.body);
  res.tier = direct.length ? 'A' : quoted.length ? 'B' : res.near.length ? 'N' : res.comp.length ? 'C' : '-';
  return res;
}

/* ===== בקרה · שהחיפוש מסוגל להבחין בין ארבע התשובות ===== */
async function selftest() {
  const cases = [
    ['מַק', ['A'], 'ערך קיים ב-BDB'],
    ['נִצַּחַת', ['A'], 'ערך קיים ביסטרוב'],
    ['אֶנִיגְמָה', ['N', 'C', '-'], 'מילה מודרנית — ⛔ אסור שתחזיר A'],
    ['גְלוֹפְּסְטִיק', ['-'], 'מילה מומצאת — חייבת לחזור ריקה'],
  ];
  let ok = true;
  for (const c of cases) {
    const r = await probe(c[0]);
    const p = c[1].indexOf(r.tier) >= 0;
    ok = ok && p;
    console.log((p ? '✓ ' : '⛔ ') + c[0] + ' → ' + r.tier + ' (ציפייה ' + c[1].join('/') + ') · ' + c[2] +
      (r.hits.length ? ' · ' + r.hits.map(h => h.h + '@' + h.lex + (h.body ? '·גוף' : '')).join(', ') : ''));
  }
  /* בקרה · קליין חייב להיות מסונן גם כשהוא בתשובה */
  const raw = await get('https://www.sefaria.org/api/words/' + encodeURIComponent('דא'));
  const hasKlein = /Klein/.test(raw.body);
  const kept = (await words('דא')).some(e => /Klein/.test(e.lex));
  const p4 = hasKlein && !kept;
  ok = ok && p4;
  console.log((p4 ? '✓ ' : '⛔ ') + 'בקרה · ספריא החזירה קליין על «דא» ' + (hasKlein ? '(כן)' : '(לא — הבקרה לא נבדקה)') +
    ' והמסנן ' + (kept ? 'העביר אותו' : 'הפיל אותו'));
  /* בקרה · «כל המילים קיימות» אינו «הצירוף מופיע» */
  const p5 = seqIn('שפך את לבו לפני', 'שפך לבו') === false && seqIn('שפך לבו לפני', 'שפך לבו') === true;
  ok = ok && p5;
  console.log((p5 ? '✓ ' : '⛔ ') + 'בקרה · «שפך את לבו» אינו מאשר את «שפך לבו», ורצף רציף כן');
  /* בקרה · תשובה שהיא רכיבים בלבד לא מסווגת כהוכחה */
  const r6 = await probe('דָּא עָקָא');
  const p6 = r6.tier !== 'A';
  ok = ok && p6;
  console.log((p6 ? '✓ ' : '⛔ ') + 'בקרה · «דא עקא» מוחזרת כשני ערכים נפרדים ולכן אינה דרגה A · קיבלה ' + r6.tier);
  console.log(ok ? '\n⭐ לחיפוש יש שיניים · הוא מבחין בין ערך, ציטוט, רכיב, וכלום' : '\n⛔ החיפוש אינו מבחין');
  process.exit(ok ? 0 : 1);
}

/* ===== הרשימות ===== */
const EIGHT = ['יֵשׁ בְּלִבּוֹ עָלָיו', 'סָכַר אֶת פִּיו', 'הִתְאַבֵּק בַּעֲפַר רַגְלָיו',
  'שָׁלַח יָד בְּנַפְשׁוֹ', 'סָבַב אוֹתוֹ בְּכַחַשׁ', 'שָׁפַךְ לִבּוֹ', 'מִלְּגוֹ / מִלְגַו', 'קַל תְּפִיסָה'];

function leftWords() {
  const out = require('child_process').execSync(
    'node "' + path.join(DIR, 'permitted-sources.js') + '" --list', { encoding: 'utf8', maxBuffer: 1 << 24 });
  const lines = out.split(/\r?\n/);
  const i = lines.findIndex(l => /=== נשארו בלי חלופה ===/.test(l));
  const j = lines.findIndex(l => /=== קיבלו חלופה ===/.test(l));
  return lines.slice(i + 1, j < 0 ? lines.length : j).filter(l => l.trim())
    .map(l => l.trim().split(' | ')[0]);
}

async function run(list, label) {
  console.log('=== ' + label + ' · ' + list.length + ' ===\n');
  const by = { A: [], B: [], N: [], C: [], '-': [], ERR: [] };
  for (const w of list) {
    const r = await probe(w);
    by[r.tier].push(r);
    const ev = r.tier === 'A' ? r.hits.filter(h => !h.body).map(h => h.h + ' @ ' + h.lex).join(' · ')
      : r.tier === 'B' ? r.hits.filter(h => h.body).map(h => 'בגוף ' + h.h + ' @ ' + h.lex).join(' · ')
        : r.tier === 'N' ? r.near.slice(0, 3).map(h => h.h + ' @ ' + h.lex).join(' · ')
          : r.tier === 'C' ? r.comp.slice(0, 3).map(h => h.h).join(' · ') : (r.err || '');
    console.log('  ' + r.tier + ' | ' + r.word + ' | ' + ev);
  }
  console.log('');
  console.log('  A · ערך מלא במילון מותר  : ' + by.A.length);
  console.log('  B · הצירוף מצוטט בגוף ערך: ' + by.B.length);
  console.log('  N · סמוך · לא זהה        : ' + by.N.length + '   ⛔ לא מוחלף');
  console.log('  C · רכיבים בלבד          : ' + by.C.length + '   ⛔ אינו הוכחה לצירוף');
  console.log('  - · אין כלום             : ' + by['-'].length);
  if (by.ERR.length) console.log('  ⛔ שגיאות רשת           : ' + by.ERR.length);
  const sum = by.A.length + by.B.length + by.N.length + by.C.length + by['-'].length + by.ERR.length;
  console.log('  ' + (sum === list.length ? '✅ הסכום מתיישב · ' + sum : '⛔ הסכום אינו מתיישב'));
  return by;
}

(async () => {
  const a = process.argv;
  if (a.indexOf('--selftest') >= 0) return selftest();
  if (a.indexOf('--eight') >= 0) { await run(EIGHT, 'שמונת הביטויים · 230b3bb6'); return; }
  if (a.indexOf('--left') >= 0) { await run(leftWords(), '43 הנותרות בלי מקור מותר'); return; }
  console.log('--left | --eight | --selftest');
})().catch(e => { console.error('⛔ ' + e.message); process.exit(2); });
