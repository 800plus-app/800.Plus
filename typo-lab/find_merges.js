'use strict';
/* איתור הזוגות שהנרדפות מיזגו · typo-lab/find_merges.js
 *
 * ⛔ ‏`tests/71` מדווח **מספר** («מיזגו 6 זוגות») ולא שמות, ולכן אי אפשר לדעת ממנו
 * איזו הצעה אשמה. הכלי הזה מריץ **בדיוק את אותו חישוב** — אותו `ctxFor`, אותו
 * `typoCanon`, אותו `typoOwners` — ומדפיס את הזוגות עצמם.
 *
 * ⚠ הוא **קורא בלבד.** ⛔ להבדיל מ-`gate_synonyms.js`, שכותב מחדש את
 * `typo-lab/lexicon/synonyms.json` כתופעת לוואי · הרצה שלו כדי «רק לראות»
 * משנה את קו הבסיס שהבדיקה משווה אליו, וזה מסתיר את הכשל במקום לאבחן אותו.
 */
const path = require('path');
const T = path.join(__dirname, '..', 'tests', '71-typo-tolerance.test.js');

/* שואבים את `ctxFor` מקובץ הבדיקה עצמו · שכפול שלו כאן היה נסחף ממנו */
const src = require('fs').readFileSync(T, 'utf8');
/* ⚠ `ctxFor` מוגדר כ-`function ctxFor(...)` ולא כ-`const` · חיפוש «const ctxFor»
 *   החזיר −1 ונפל על «לא נמצא». */
const start = src.indexOf('function ctxFor');
const end = src.indexOf('const HE = ctxFor');
if (start < 0 || end < 0) { console.error('⛔ לא נמצא ctxFor בקובץ הבדיקה'); process.exit(1); }

const head = src.slice(0, end).replace(/^const \{ test, describe \}.*$/m, 'const { test, describe } = { test(){}, describe(){} };');
const mod = head + '\nmodule.exports = { ctxFor };\n';
const Module = require('module');
const m = new Module(T, null);
m.filename = T; m.paths = Module._nodeModulePaths(path.dirname(T));
m._compile(mod, T);
const { ctxFor } = m.exports;

for (const lang of ['he', 'en']) {
  const c = ctxFor(lang);
  const classes = canon => {
    const idx = new Map();
    for (const w of Array.from(c.BANK)) {
      const owner = c.K(w.term);
      for (const s of Array.from(c.meaningSegs(w.meaning))) {
        const key = canon ? c.typoCanon(s) : s;
        let m2 = idx.get(key); if (!m2) { m2 = new Set(); idx.set(key, m2); }
        m2.add(owner);
      }
    }
    return idx;
  };
  const allowOf = new Map();
  for (const w of Array.from(c.BANK)) allowOf.set(c.K(w.term), c.typoOwners(w.meaning, w));
  const pairs = idx => {
    const out = new Set();
    for (const [key, owners] of idx) {
      if (owners.size < 2) continue;
      for (const a of owners) for (const b of owners)
        if (a !== b && !(allowOf.get(a) || new Set()).has(b)) out.add(a + ' ⇄ ' + b + '  @ ' + key);
    }
    return out;
  };
  const base = pairs(classes(false)), syn = pairs(classes(true));
  const added = [...syn].filter(x => !base.has(x));
  console.log('[' + lang + '] בסיס ' + base.size + ' · עם נרדפות ' + syn.size + ' · ⭐ נוספו ' + added.length);
  added.forEach(x => console.log('   ⛔ ' + x));
}
