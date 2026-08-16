'use strict';
/* he_ambiguity.js · H5 · כמה מהדחיות העבריות הן חד-משמעיות
 *
 * השאלה: מחרוזת שנדחית היום, וש**אמורה** להתקבל (שורת accept·trusted בדאטהסט) —
 * כמה כרטיסים במאגר נמצאים ממנה במרחק ≤2? אם אחד בלבד, אין מה להתבלבל איתו ו-
 * "התכוונת ל-X?" הוא מידע ולא הימור. אם שניים או יותר — אין מידע שיכריע.
 *
 * ⚠ המספר הזה **אינו** המלצה לבנות ממשק. הוא התמחור בלבד.
 */
const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const { appCtx } = require('./he_search_probe.js');
const say = s => process.stdout.write(s + '\n');

const ctx = getCtx('he'), app = appCtx('he');
const P = app.TYPO_PARAMS['he-word'];
const cards = Array.from(ctx.BANK);
const byTerm = new Map(); for (const c of cards) byTerm.set(c.term, c);

/* אינדקס · מפתח → קבוצת מונחי-בעלים. אותו מבנה של TERM_VETO, נבנה כאן כדי שנוכל
   לספור בעלים ולא רק לשאול "קיים". */
const keyOwners = new Map();
for (const c of cards) for (const k of acceptedKeys(c, ctx)) {
  let s = keyOwners.get(k); if (!s) { s = new Set(); keyOwners.set(k, s); }
  s.add(c.term);
}
const delsOf = (s, d) => {
  const all = new Set([s]); let cur = [s];
  for (let st = 0; st < d; st++) { const nx = []; for (const x of cur) for (let i = 0; i < x.length; i++) { const y = x.slice(0, i) + x.slice(i + 1); if (!all.has(y)) { all.add(y); nx.push(y); } } cur = nx; }
  return all;
};
const ix = new Map();
const allKeys = Array.from(keyOwners.keys());
allKeys.forEach((k, i) => { for (const d of delsOf(k, 2)) { let a = ix.get(d); if (!a) { a = []; ix.set(d, a); } a.push(i); } });

function neighbours(typed, maxD) {
  const seen = new Set(), out = new Map();     // term -> best dist
  for (const d of delsOf(typed, 2)) {
    const a = ix.get(d); if (!a) continue;
    for (const i of a) {
      if (seen.has(i)) continue; seen.add(i);
      const k = allKeys[i];
      const dist = app.editDist(k, typed);
      if (dist > maxD) continue;
      for (const t of keyOwners.get(k)) { const p = out.get(t); if (p == null || dist < p) out.set(t, dist); }
    }
  }
  return out;
}

/* אוכלוסייה · שורות accept·trusted שנדחות היום */
const txt = fs.readFileSync(path.join(__dirname, 'out', 'dataset-he.jsonl'), 'utf8');
const rows = [];
for (const l of txt.split('\n')) {
  if (!l) continue; const r = JSON.parse(l);
  if (r.set !== 'he-word' || r.label !== 'accept' || !r.trusted) continue;
  const card = byTerm.get(r.term); if (!card) continue;
  const forms = Array.from(acceptedKeys(card, ctx));
  if (forms.includes(r.typed)) continue;
  const own = new Set([app.K(card.term)]);
  if (app.nearMatch(r.typed, forms, 'he', P, app.TERM_VETO, own).ok) continue;   // כבר מתקבל
  rows.push({ r, card, forms });
}
say(`דחיות · שורות accept·trusted שנדחות היום: ${rows.length}`);

const tally = { 1: 0, 2: 0, '3+': 0, 0: 0 };
const byWhy = new Map();
const uniqEx = [], ambEx = [];
for (const { r, card, forms } of rows) {
  const own = new Set([app.K(card.term)]);
  const why = app.nearMatch(r.typed, forms, 'he', P, app.TERM_VETO, own).why || 'null';
  const nb = neighbours(r.typed, 2);
  const n = nb.size;
  const key = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : '3+';
  tally[key]++;
  let e = byWhy.get(why); if (!e) { e = { n: 0, uniq: 0, none: 0 }; byWhy.set(why, e); }
  e.n++; if (n === 1) e.uniq++; if (n === 0) e.none++;
  if (n === 1 && uniqEx.length < 12) uniqEx.push(`"${r.typed}" → ${card.term} [${r.op}·${why}]`);
  if (n >= 2 && ambEx.length < 12) ambEx.push(`"${r.typed}" → ${card.term} · ${Array.from(nb.keys()).slice(0, 3).join('/')} [${why}]`);
}
const tot = rows.length;
say('');
say('כמה כרטיסים במאגר נמצאים במרחק ≤2 מהמחרוזת שהוקלדה:');
say(`   0 כרטיסים (רחוקה מהכול)     ${String(tally[0]).padStart(5)}  ${(100 * tally[0] / tot).toFixed(1)}%`);
say(`   ⭐ 1 כרטיס · חד-משמעי       ${String(tally[1]).padStart(5)}  ${(100 * tally[1] / tot).toFixed(1)}%`);
say(`   2 כרטיסים · דו-משמעי        ${String(tally[2]).padStart(5)}  ${(100 * tally[2] / tot).toFixed(1)}%`);
say(`   3+ כרטיסים                  ${String(tally['3+']).padStart(5)}  ${(100 * tally['3+'] / tot).toFixed(1)}%`);
say('');
say('לפי סיבת הדחייה:');
for (const [w, e] of Array.from(byWhy).sort((a, b) => b[1].n - a[1].n))
  say(`   ${w.padEnd(12)} ${String(e.n).padStart(5)} דחיות · מהן חד-משמעיות ${String(e.uniq).padStart(5)} (${(100 * e.uniq / e.n).toFixed(1)}%) · רחוקות מהכול ${e.none}`);
say('');
say('דוגמאות חד-משמעיות: ' + uniqEx.slice(0, 6).join(' | '));
say('דוגמאות דו-משמעיות: ' + ambEx.slice(0, 6).join(' | '));

/* כמה מה-recall היה נקנה אילו כל החד-משמעיות היו נפתחות */
const allAccept = (() => { let n = 0; for (const l of txt.split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.set === 'he-word' && r.label === 'accept' && r.trusted) { const c = byTerm.get(r.term); if (c && !Array.from(acceptedKeys(c, ctx)).includes(r.typed)) n++; } } return n; })();
say('');
say(`תקרה תיאורטית · אם כל ${tally[1]} החד-משמעיות היו נפתחות: recall ${(100 * (allAccept - tot + tally[1]) / allAccept).toFixed(2)}% (מ-${(100 * (allAccept - tot) / allAccept).toFixed(2)}%)`);
