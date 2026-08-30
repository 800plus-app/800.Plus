'use strict';
/* שער הרישיון המצוטט · units_output/attestation/check-cited-license-mismatch.js
 *
 *   node units_output/attestation/check-cited-license-mismatch.js            → פסק דין
 *   node units_output/attestation/check-cited-license-mismatch.js --selftest → בקרה חיובית
 *
 * ===== מה הוא שואל =====
 *
 * לכל שורה **בכל** טבלת הוכחה שטוענת רישיון נקי (נחלת הכלל · CC0 · PD): האם
 * המהדורה שהיא מצטטת באמת חופשית?
 *
 * ⛔ **הגרסה הראשונה של השער הזה בדקה קובץ אחד מתוך שישה** (`attestation-299-worth.tsv`),
 * ורק מול המטמון. היא החזירה «0 אי-התאמות» בזמן ש-81 שורות בשאר הקבצים ציטטו
 * מהדורות מודרניות. ⭐ **שער שרץ על חלק מהטבלה מחזיר ירוק אמיתי ושקרי בו-זמנית.**
 *
 * ===== שלושת הכללים · וכל אחד נולד מהפרה שנמצאה בפועל =====
 *
 *   א · **המטמון חולק** · `sefaria-licenses.json[רפרנס]` קיים ואינו רישיון נקי,
 *        בעוד השורה טוענת נקי.
 *   ב · **מהדורה מודרנית נקובה** · הרפרנס נוקב במהדורה משנת 1929 ואילך, והשורה
 *        טוענת נחלת הכלל. ⛔ ספריא מתייגת כך גם תרגום מ-1989 — ותרגום הוא יצירה
 *        חדשה שלמתרגם יש עליה זכויות. התיוג של ספריא אינו עדות בפני עצמו.
 *   ג · **מהדורה לא נקובה ליצירה מודרנית** · הרפרנס אינו נוקב במהדורה כלל, והיצירה
 *        שהוא מצטט מופיעה בטבלה **רק** במהדורות מ-1929 ואילך. ⛔ בלי הכלל הזה,
 *        השמטת שם המהדורה מנקה את השורה בשקט — וזה בדיוק מה שקרה ל-9 שורות
 *        ב-`attestation.tsv` אחרי הסבב הקודם, שבו הן «תוקנו» ונשארו חשופות.
 *
 * ⭐ כלל הרישיון עצמו נטען מ-`permitted-sources.js` ואינו משוכפל כאן. שני עותקים
 * של אותו כלל נפרדים בשקט, וזה כבר קרה בפרויקט הזה.
 *
 * ===== מה מדווח ולא מפיל =====
 *
 * שורה שטוענת רישיון נקי ממקור שאינו ספריא (ויקיטקסט) עם שנה מודרנית **מדווחת**
 * ואינה מפילה: אין לה «שדה רישיון של מהדורה» בספריא לאמת מולו, וההכרעה עליה
 * משפטית ולא טכנית. ⛔ היא לא נעלמת — היא נספרת ונקובה בשם.
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const PS = require(path.join(DIR, 'permitted-sources.js'));
const SELFTEST = process.argv.includes('--selftest');

/* ⛔ מפת עמודות מוצהרת לכל קובץ · קובץ שנקרא בעמודות ברירת מחדל מחזיר
 * «אפס אי-התאמות», וזה נראה בדיוק כמו ירוק אמיתי. */
const LAYOUT = [
  { f: 'attestation.tsv', w: 0, s: 2, r: 3 },
  { f: 'attestation-new-bank.tsv', w: 0, s: 2, r: 3 },
  { f: 'attestation-299-worth.tsv', w: 0, s: 2, r: 3 },
  { f: 'attestation-lexicon-proof.tsv', w: 0, s: 2, r: 3 },
  { f: 'attestation-talmud-proof.tsv', w: 0, s: 2, r: 3 },
  { f: 'attestation-nine.tsv', w: 0, s: 1, r: 3 },
  /* ⚠ קובץ פסק דין ולא טבלת הוכחה · שורה בו מותרת לצטט מהדורה מודרנית
   * בתנאי שעמודת «פסק דין» כבר קובעת שהיא אינה מאושרת. */
  { f: 'attestation-299-verified.tsv', w: 0, s: 1, r: 2, verdictCol: 3 },
];
/* קבצים בתיקייה שאינם טבלאות הוכחה · מוצהרים כדי שתוספת עתידית לא תיבלע בשקט */
const NOT_A_TABLE = ['attestation-missing.tsv'];

const LIC = JSON.parse(fs.readFileSync(path.join(DIR, 'sefaria-licenses.json'), 'utf8'));
const CLEAN_LICENSE = /Public Domain|^PD$|CC0/i;
/* טענת רישיון נקי · בכל הניסוחים שמופיעים בפועל בקבצים */
const CLEAN_CLAIM = /נחלת הכלל|CC0|Public Domain|🟢 נקי/i;
/* טענה שמקורה ספריא · רק עליה אפשר לאמת שדה רישיון של מהדורה */
const SEFARIA_CLAIM = /לפי ספריא|ספריא ·|טקסט קלאסי/;
/* פסק דין בקובץ ה-verified שכבר שולל אישור */
const NOT_APPROVED = /^(חשוד|שגוי|חלקי|לא ניתן)/;

const tsv = p => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
const parseRef = r => {
  const m = String(r).match(/^(.*?)\s*\(([^()]*?)\s*\[(he|en)\]\)\s*$/);
  return m ? { base: m[1].trim(), ver: m[2].trim() } : { base: String(r).trim(), ver: null };
};
const workOf = b => String(b).replace(/\s+\d+[ab]?([:.]\d+[ab]?)*\s*$/, '').trim();

function load(overrides) {
  const files = {};
  for (const L of LAYOUT) {
    const o = overrides && overrides[L.f];
    files[L.f] = o !== undefined ? o.split('\n').filter(l => l.trim()).map(l => l.split('\t'))
      : tsv(path.join(DIR, L.f));
  }
  return files;
}

/* יצירות שכל המהדורות שנצפו עבורן בטבלה כולה הן מ-1929 ואילך */
function modernOnlyWorks(files) {
  const years = new Map();
  for (const L of LAYOUT) for (const c of files[L.f].slice(1)) {
    const p = parseRef((c[L.r] || '').trim());
    if (!p.ver) continue;
    const w = workOf(p.base);
    if (!years.has(w)) years.set(w, new Set());
    years.get(w).add(PS.maxYear(p.ver));
  }
  const out = new Set();
  for (const [w, ys] of years) { const a = [...ys]; if (a.length && a.every(y => y && y >= PS.CUTOFF)) out.add(w); }
  return out;
}

function run(overrides) {
  const files = load(overrides);
  const modern = modernOnlyWorks(files);
  const bad = [];         /* אי-התאמות · מפילות */
  const outOfScope = [];  /* מדווחות ולא מפילות */
  let claims = 0;
  for (const L of LAYOUT) {
    for (const [i, c] of files[L.f].slice(1).entries()) {
      const word = (c[L.w] || '').trim();
      const src = (c[L.s] || '').trim();
      const ref = (c[L.r] || '').trim();
      if (!word || !CLEAN_CLAIM.test(src)) continue;
      claims++;
      if (L.verdictCol !== undefined && NOT_APPROVED.test((c[L.verdictCol] || '').trim())) continue;
      const at = L.f + ':' + (i + 2) + ' · «' + word + '»';
      /* א · המטמון חולק על הרפרנס המדויק */
      if (ref in LIC && !CLEAN_LICENSE.test(LIC[ref])) {
        bad.push(at + ' · ⛔ הקאש מחזיר «' + LIC[ref] + '» לרפרנס הזה · ' + ref); continue;
      }
      const p = parseRef(ref);
      const y = PS.maxYear(p.ver || '');
      if (!SEFARIA_CLAIM.test(src)) {
        /* מקור שאינו ספריא · אין שדה רישיון של מהדורה לאמת מולו */
        if (PS.maxYear(ref) >= PS.CUTOFF) outOfScope.push(at + ' · ' + src + ' · ' + ref);
        continue;
      }
      /* ב · מהדורה נקובה מ-1929 ואילך */
      if (y >= PS.CUTOFF) {
        bad.push(at + ' · ⛔ מהדורה ' + y + ' מתויגת נחלת הכלל · ' + ref); continue;
      }
      /* ג · מהדורה לא נקובה, ליצירה שכל מהדורותיה בטבלה מודרניות */
      if (!p.ver && modern.has(workOf(p.base)))
        bad.push(at + ' · ⛔ מהדורה לא נקובה ליצירה שכל מהדורותיה בטבלה מ-' + PS.CUTOFF + ' ואילך · ' + ref);
    }
  }
  return { bad, outOfScope, claims, files: LAYOUT.length };
}

function report(r, label) {
  console.log('\n== ' + label + ' ==');
  console.log('קבצים שנסרקו: ' + r.files + '  ·  שורות שטוענות רישיון נקי: ' + r.claims);
  console.log('אי-התאמות: ' + r.bad.length);
  r.bad.slice(0, 40).forEach(b => console.log('  ' + b));
  if (r.bad.length > 40) console.log('  … ועוד ' + (r.bad.length - 40));
  console.log('מחוץ לתחום השער (מקור שאינו ספריא · מדווח, לא מפיל): ' + r.outOfScope.length);
  r.outOfScope.forEach(b => console.log('  ⚠ ' + b));
}

/* ⭐ בקרה חיובית · שתילת שורה מוגנת בכל אחד משלושת הכללים, בזיכרון בלבד */
function selftest() {
  const base = run();
  const raw = f => fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\s+$/, '');
  const F = 'attestation-299-worth.tsv';
  const badKey = Object.keys(LIC).find(k => !CLEAN_LICENSE.test(LIC[k]));
  const poison = {
    'כלל א · הקאש חולק': ['⭐בקרה-א', '0', 'נחלת הכלל / CC0 (לפי ספריא)', badKey, ''],
    'כלל ב · מהדורה 1989 מתויגת נחלת הכלל': ['⭐בקרה-ב', '0', 'ספריא · נחלת הכלל',
      'Rav Hirsch on Torah, Leviticus 27:28:3 (The Pentateuch, rendered into English by Isaac Levy. Gateshead; Judaica Press, 1989 [en])', ''],
    'כלל ג · מהדורה לא נקובה ליצירה מודרנית': ['⭐בקרה-ג', '0', 'ספריא · נחלת הכלל',
      'Sermons Unto My People, The Three Festivals 9:9', ''],
  };
  let ok = true;
  console.log('קו בסיס · אי-התאמות: ' + base.bad.length);
  for (const [name, row] of Object.entries(poison)) {
    const r = run({ [F]: raw(F) + '\n' + row.join('\t') });
    const caught = r.bad.length > base.bad.length;
    console.log((caught ? '✓ נפל  ' : '⛔ לא נפל  ') + name + '  ·  ' +
      base.bad.length + ' ⟵ ' + r.bad.length + (caught ? '  ·  ' + r.bad[r.bad.length - 1] : ''));
    if (!caught) ok = false;
  }
  console.log(ok ? '\n⭐ לשער יש שיניים · שלושת הכללים נפלו על השורה המורעלת'
    : '\n⛔ כלל אחד לפחות לא נפל · השער אינו עדות');
  process.exit(ok ? 0 : 1);
}

if (SELFTEST) selftest();
else {
  const r = run();
  report(r, 'כל טבלאות ההוכחה');
  const extra = fs.readdirSync(DIR).filter(f => f.endsWith('.tsv'))
    .filter(f => !LAYOUT.some(L => L.f === f) && NOT_A_TABLE.indexOf(f) < 0);
  if (extra.length) {
    console.log('\n⛔ קובץ TSV בתיקייה שאינו מוצהר במפת העמודות: ' + extra.join(' · '));
    console.log('   קובץ לא מוצהר אינו נבדק, והשער יחזיר עליו ירוק מזויף.');
    process.exit(1);
  }
  console.log(r.bad.length ? '\n⛔ ' + r.bad.length + ' אי-התאמות' : '\n✅ 0 אי-התאמות');
  process.exit(r.bad.length ? 1 : 0);
}
