'use strict';
/* כמה מובנים יש לכל פירוש · typo-lab/count_senses.js
 *
 * ⭐ **למה זה קיים:** ההכרעה של חגי היא «אם יש **הרבה** פירושים אפשר לצמצם
 * ל-2 הכי שכיחים». ⛔ ‏«הרבה» אינו מוגדר, ולכן **קודם סופרים**.
 *
 * ⭐ **והבקרה היא העיקר:** סופר שמראה ירידה חייב להראות גם **עלייה** על
 * אוכלוסייה שידוע שמוזגה. ⛔ סופר שמחזיר את אותו כיוון תמיד אינו מודד כלום.
 *
 * **ספירת מובנים:** מפרידים ב-`;` וב-`,`. ⚠ ‏`;` מפריד מובן, `,` מפריד
 * מילה נרדפת **באותו** מובן — ולכן שתי הספירות מודפסות בנפרד.
 *
 *   node count_senses.js                → מצב נוכחי · התפלגות
 *   node count_senses.js --vs-main      → מול origin/main · מי עלה ומי ירד
 *   node count_senses.js --selftest     → הוכחת שיניים
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadSrc(src, key) {
  const ctx = { window: {}, self: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window[key];
}
const flat = units => {
  const g = {};
  for (const u of Object.keys(units || {})) for (const p of units[u]) g[p[0]] = p[1];
  return g;
};

/* ⭐ שתי ספירות · גסה ועדינה */
const senses = s => String(s).split(';').map(x => x.trim()).filter(Boolean).length;
const parts  = s => String(s).split(/[;,]/).map(x => x.trim()).filter(Boolean).length;

/* ---- הוכחת שיניים ---- */
if (process.argv.includes('--selftest')) {
  const CASES = [
    ['אזור, תחום',           1, 2, 'פסיק מפריד מילה נרדפת · מובן אחד'],
    ['אזור, תחום; שטח',      2, 3, '⭐ המקרה שהמבקר נקב בו · הסופר מחזיר 3 חלקים'],
    ['מבנה; לבנות',          2, 2, 'שני מובנים'],
    ['דרך',                  1, 1, 'מובן יחיד'],
    ['ניסיון, לחוות; חוויה', 2, 3, 'מיזוג · המובן נוסף אחרי ה-;'],
  ];
  let bad = 0;
  for (const [g, s, p, why] of CASES) {
    const ok = senses(g) === s && parts(g) === p;
    if (!ok) bad++;
    console.log('  ' + (ok ? '✓' : '⛔') + ' «' + g + '» → מובנים=' + senses(g) + ' חלקים=' + parts(g) +
                '  (ציפייה ' + s + '/' + p + ')  ' + why);
  }
  console.log(bad ? '\n⛔ לסופר אין שיניים' : '\n⭐ לסופר יש שיניים · והוא מבחין בין פסיק לנקודה-פסיק');
  process.exit(bad ? 1 : 0);
}

const FILES = [['data-en.js', 'UNIT_DATA_EN'], ['data.js', 'UNIT_DATA']];

if (process.argv.includes('--vs-main')) {
  for (const [rel, key] of FILES) {
    let mainSrc;
    try { mainSrc = execFileSync('git', ['show', 'origin/main:' + rel], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8'); }
    catch (e) { console.log('⛔ ' + rel + ' · אין ב-origin/main · ' + e.message.slice(0, 60)); continue; }
    const A = flat(loadSrc(mainSrc, key));
    const B = flat(loadSrc(fs.readFileSync(path.join(ROOT, rel), 'utf8'), key));
    const common = Object.keys(B).filter(w => w in A);
    let up = 0, down = 0, sameN = 0;
    const downs = [], ups = [];
    for (const w of common) {
      const a = senses(A[w]), b = senses(B[w]);
      if (b > a) { up++; ups.push(w + ' ' + a + '→' + b); }
      else if (b < a) { down++; downs.push(w + ' ' + a + '→' + b); }
      else sameN++;
    }
    const changed = common.filter(w => A[w] !== B[w]);
    console.log('\n=== ' + rel + ' · מול origin/main ===');
    console.log('  ערכים משותפים : ' + common.length + '   ⭐ מהם פירוש שהשתנה: ' + changed.length);
    console.log('  ⭐ מובנים עלו  : ' + up);
    console.log('  ⛔ מובנים ירדו : ' + down);
    console.log('  ·  ללא שינוי במספר: ' + sameN);
    if (ups.length)   console.log('  דוגמאות עלייה : ' + ups.slice(0, 6).join(' · '));
    if (downs.length) console.log('  ⛔ ירידות, בשם: ' + downs.slice(0, 20).join(' · '));
  }
  process.exit(0);
}

/* ---- התפלגות · «כמה זה הרבה» ---- */
for (const [rel, key] of FILES) {
  const G = flat(loadSrc(fs.readFileSync(path.join(ROOT, rel), 'utf8'), key));
  const hist = {};
  for (const w of Object.keys(G)) { const n = senses(G[w]); hist[n] = (hist[n] || 0) + 1; }
  const tot = Object.keys(G).length;
  console.log('\n=== ' + rel + ' · ' + tot + ' ערכים ===');
  Object.keys(hist).sort((a, b) => a - b).forEach(n =>
    console.log('  ' + n + ' מובנים: ' + String(hist[n]).padStart(5) + '   ' + (100 * hist[n] / tot).toFixed(1) + '%'));
  const many = Object.keys(G).filter(w => senses(G[w]) >= 3).length;
  console.log('  ⭐ ‏3 מובנים ומעלה: ' + many + '  (' + (100 * many / tot).toFixed(1) + '%)');
}
