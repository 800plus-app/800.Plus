'use strict';
/* כמה פסקי דין מתהפכים · typo-lab/diff_runtime_lexicon.js
 *
 * ⛔ השאלה אינה «כמה טיפוסים ירדו» אלא **«כמה מחרוזות משנות פסק דין»**.
 * ‏2,969 טיפוסים שירדו אינם 2,969 החלטות: רובם מילים שאיש לא הקליד מעולם.
 *
 * ⭐ הכיוון, מתוך `lib/lexicon.js`: *«מכריע רק בכיוון אחד — נמצא ⇒ מילה אמיתית
 * ⇒ דחייה»*. ולכן **רשימה קטנה יותר = פחות דחיות = קבלה מתירנית יותר**, וכל
 * היפוך הוא מחרוזת שנדחתה ומעכשיו תתקבל.
 *
 * ⚠ הכלי **קורא בלבד** · טוען שני ארטיפקטים ומשווה. ⛔ אינו כותב את `typo-lex.js`.
 *
 *   node typo-lab/diff_runtime_lexicon.js <ישן.js> <חדש.js>
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) { console.error('שימוש: node typo-lab/diff_runtime_lexicon.js <ישן.js> <חדש.js>'); process.exit(2); }

function loadArtifact(p) {
  /* ⚠ הארטיפקט מפענח base64 · בדפדפן דרך `atob`, ב-node דרך `Buffer`.
   * ⛔ ‏`vm.createContext` מייצר סביבה **ריקה** ושניהם חסרים בה, והשגיאה
   * («Buffer is not defined») נראית כמו ארטיפקט שבור ולא כמו סנדבוקס חסר. */
  const ctx = { window: {}, module: { exports: {} }, console, Buffer,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    Uint8Array, Uint32Array, Math, JSON, String, Array, Object, Number };
  ctx.self = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  const a = ctx.window.TYPO_LEX || ctx.module.exports;
  if (!a || typeof a.lookup !== 'function') throw new Error('⛔ אין lookup ב-' + p);
  return a;
}
const A = loadArtifact(oldPath), B = loadArtifact(newPath);

/* קורפוס · כל המחרוזות שהמעבדה כבר שפטה, בשתי השפות */
const OUT = path.join(__dirname, 'out');
const rows = [];
for (const f of fs.readdirSync(OUT)) {
  if (!/^answers-.*\.jsonl$/.test(f)) continue;
  for (const ln of fs.readFileSync(path.join(OUT, f), 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    try {
      const o = JSON.parse(ln);
      const typed = o.typed;
      if (!typed) continue;
      /* ⛔ שני באגים שתוקנו כאן, ושניהם היו משנים את המספר:
       *
       * 1. ‏`srcKey` היה תמיד null · שם השדה הוא `card_term` ולא `src`/`term`.
       *    ⭐ בלעדיו המסנן שמוריד מילים שלא השתנו אינו פועל, ופסקי דין זזים.
       *
       * 2. ⚠ ‏`o.lang` הוא **שפת הכרטיס ולא שפת המחרוזת**: בכרטיס אנגלי
       *    (`lang='en'`) הלומד מקליד את הפירוש **בעברית**. חיפוש עברית במסנן
       *    האנגלי מחזיר שטויות. ⭐ הלקסיקון מאונדקס לפי **כתב המחרוזת**,
       *    ולכן זה מה שקובע. */
      const script = /[א-ת]/.test(typed) ? 'he' : 'en';
      rows.push({ typed, lang: script, cardLang: o.lang || null, src: o.card_term || null });
    } catch (e) { }
  }
}
console.log('מחרוזות בקורפוס: ' + rows.length.toLocaleString());
if (!rows.length) { console.log('⛔ הקורפוס ריק · המדידה חסרת משמעות. עוצר.'); process.exit(1); }

const MIN = 2;
function hit(art, typed, lang, srcKey) {
  const parts = String(typed).split(' ').filter(Boolean);
  if (!parts.length) return false;
  let check = parts;
  if (srcKey != null) {
    const src = String(srcKey).split(' ').filter(Boolean);
    if (src.length === parts.length) {
      check = parts.filter((p, i) => p !== src[i]);
      if (!check.length) return false;
    }
  }
  for (const p of check) if (p.length < MIN || !art.lookup(p, lang)) return false;
  return true;
}

/* ⭐ בקרה חיובית · בלי זה «0 היפוכים» עלול להיות «הארטיפקטים לא נטענו» */
let sameCount = 0;
for (const r of rows.slice(0, 500)) if (hit(A, r.typed, r.lang, r.src)) sameCount++;
console.log('בקרה · דחיות בארטיפקט הישן ב-500 הראשונות: ' + sameCount +
  (sameCount ? '  ✓ הארטיפקט חי' : '  ⛔ אפס · הארטיפקט לא נטען כראוי'));
if (!sameCount) process.exit(1);

const flips = { toAccept: [], toReject: [] };
for (const r of rows) {
  const a = hit(A, r.typed, r.lang, r.src);
  const b = hit(B, r.typed, r.lang, r.src);
  if (a === b) continue;
  (a && !b ? flips.toAccept : flips.toReject).push(r);
}
console.log('\n=== ⭐ היפוכי פסק דין ===');
console.log('  ⛔ נדחה → מתקבל (מתירני יותר): ' + flips.toAccept.length.toLocaleString());
console.log('  ⭐ מתקבל → נדחה (מחמיר יותר): ' + flips.toReject.length.toLocaleString());
console.log('  אחוז מהקורפוס: ' + ((flips.toAccept.length + flips.toReject.length) / rows.length * 100).toFixed(3) + '%');

const show = (list, title) => {
  if (!list.length) return;
  console.log('\n--- ' + title + ' · עד 10 בשם ---');
  const seen = new Set();
  for (const r of list) {
    const k = r.typed + '|' + r.src;
    if (seen.has(k)) continue; seen.add(k);
    console.log('  «' + r.typed + '»' + (r.src ? '  ← ' + r.src : '') + '   [' + r.lang + ']');
    if (seen.size >= 10) break;
  }
};
show(flips.toAccept, '⛔ נדחה → מתקבל');
show(flips.toReject, '⭐ מתקבל → נדחה');
