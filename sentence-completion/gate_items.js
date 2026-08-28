'use strict';
/* ששת השערים המכניים על 450 הפריטים · sentence-completion/gate_items.js
 *
 * ⭐ המקור הוא `batches/*.json` · `sentences-en-v3.js` נוצר אוטומטית ותיקון בו נמחק.
 *
 * השערים:
 *   1  ב-`t` יש **בדיוק** זוג `**…**` אחד      ⛔ אפס או שניים = ממצא
 *   2  len(g) == len(o) == len(r) == 4
 *   3  `g[i]` מתחיל ב-`o[i]` ואחריו " = "
 *   4  `a` בטווח 0..3 · והמשפט מכיל `___`
 *   5  `e` קיים                                 ⚠ מדווח ולא מפיל · הכרעה פתוחה
 *   6  אין פריט כפול לפי `s` · ואין `src` כפול
 *
 * ⛔⛔ ולפורמט **שני מצבים**: «יחיד» (410) ו«זוג» (40, שני `___`).
 *    בפריט זוג `o[i]` הוא `"word1,word2"` ו-`t` מדגישה **שתי** מילים.
 *    ⭐ שער שבודק «בדיוק זוג אחד» עיוור ל-40 האלה ונראה ירוק.
 *
 *   node gate_items.js            → פסק דין
 *   node gate_items.js --control  → שותל פריט פגום ומוודא שהשער מסמן אותו
 */
const fs = require('fs');
const path = require('path');
const B = path.join(__dirname, 'batches');
const CONTROL = process.argv.includes('--control');

function load() {
  const out = [];
  for (const f of fs.readdirSync(B).sort()) {
    if (!f.endsWith('.json')) continue;
    let d; try { d = JSON.parse(fs.readFileSync(path.join(B, f), 'utf8')); } catch (e) { continue; }
    const arr = Array.isArray(d) ? d : (d.items || []);
    arr.forEach((it, i) => out.push({ id: it.id || (f.replace(/\.json$/, '') + '#' + (i + 1)), file: f, it }));
  }
  return out;
}

function check(items) {
  const bad = [];
  const bySent = new Map(), bySrc = new Map();
  for (const { id, it } of items) {
    const s = String(it.s || ''), t = String(it.t || '');
    const o = Array.isArray(it.o) ? it.o : [];
    const g = Array.isArray(it.g) ? it.g : [];
    const r = Array.isArray(it.r) ? it.r : [];
    const gaps = (s.match(/___/g) || []).length;
    const isPair = gaps >= 2;

    /* 1 · הדגשות · יחיד=1 · ⭐ זוג=2 */
    const marks = (t.match(/\*\*/g) || []).length / 2;
    const wantMarks = isPair ? 2 : 1;
    if (marks !== wantMarks) bad.push([id, '1 הדגשות', 'יש ' + marks + ' · צריך ' + wantMarks + (isPair ? ' (זוג)' : '')]);

    /* 2 · אורכים */
    if (o.length !== 4 || g.length !== 4 || r.length !== 4)
      bad.push([id, '2 אורכים', 'o=' + o.length + ' g=' + g.length + ' r=' + r.length]);

    /* 3 · g[i] פותח ב-o[i] + " = " */
    for (let i = 0; i < Math.min(g.length, o.length); i++) {
      const pre = String(o[i]).split(',').map(x => x.trim()).join(' · ');
      const gi = String(g[i]);
      const okSingle = gi.startsWith(String(o[i]) + ' = ');
      const okPair = isPair && String(o[i]).split(',').map(x => x.trim()).every(w => gi.includes(w + ' = '));
      if (!okSingle && !okPair) bad.push([id, '3 קידומת g', 'g[' + i + ']=«' + gi.slice(0, 46) + '» מול o[' + i + ']=«' + o[i] + '»']);
    }

    /* 4 · a ו-___ */
    if (!(Number.isInteger(it.a) && it.a >= 0 && it.a <= 3)) bad.push([id, '4 a', 'a=' + it.a]);
    if (!gaps) bad.push([id, '4 ___', 'אין חסר במשפט']);

    /* 5 · e · מדווח בלבד */
    if (!it.e) bad.push([id, '5 e חסר', '⚠ מדווח · לא מפיל']);

    /* 6 · כפילויות */
    const ks = s.trim();
    if (ks) { if (bySent.has(ks)) bad.push([id, '6 s כפול', 'זהה ל-' + bySent.get(ks)]); else bySent.set(ks, id); }
    if (it.src) { if (bySrc.has(it.src)) bad.push([id, '6 src כפול', 'זהה ל-' + bySrc.get(it.src)]); else bySrc.set(it.src, id); }
  }
  return bad;
}

const items = load();
const pairs = items.filter(x => (String(x.it.s || '').match(/___/g) || []).length >= 2).length;
console.log('פריטים: ' + items.length + '  ·  יחיד ' + (items.length - pairs) + '  ·  זוג ' + pairs);

if (CONTROL) {
  /* ⭐ בקרה חיובית · פריט פגום שתול, אחד לכל שער */
  const base = check(items).length;
  console.log('ממצאים לפני השתילה: ' + base);
  const POISON = [
    ['1 הדגשות', it => { it.t = String(it.t).replace(/\*\*/g, ''); }],
    ['2 אורכים', it => { it.g = it.g.slice(0, 3); }],
    ['3 קידומת g', it => { it.g[0] = 'זהלאהאפשרות = משהו'; }],
    ['4 a', it => { it.a = 9; }],
    ['6 s כפול', it => { it.s = items[0].it.s; }],
  ];
  let ok = true;
  for (const [name, mut] of POISON) {
    const clone = JSON.parse(JSON.stringify(items));
    mut(clone[5].it);
    const after = check(clone);
    const hit = after.some(b => b[0] === clone[5].id && b[1] === name);
    console.log((hit ? '✓ נתפס  ' : '⛔ פספס ') + name);
    if (!hit) ok = false;
  }
  console.log(ok ? '\n⭐ לשער יש שיניים · חמשת המקרים נתפסו' : '\n⛔ השער אינו תופס את מה שהוא טוען');
  process.exit(ok ? 0 : 1);
}

const bad = check(items);
const byGate = {};
bad.forEach(b => byGate[b[1]] = (byGate[b[1]] || 0) + 1);
console.log('\nממצאים לפי שער:');
Object.entries(byGate).sort().forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + k));
const hard = bad.filter(b => !/^5 /.test(b[1]));
console.log('\n⭐ ממצאים מפילים (בלי «e חסר»): ' + hard.length);
hard.slice(0, 25).forEach(b => console.log('  ' + b[0].padEnd(11) + b[1].padEnd(14) + b[2]));
if (hard.length > 25) console.log('  … ועוד ' + (hard.length - 25));
process.exit(hard.length ? 1 : 0);
