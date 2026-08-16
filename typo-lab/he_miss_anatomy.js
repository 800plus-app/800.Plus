'use strict';
/* he_miss_anatomy.js · אנטומיית ה-77% שנופלים
 *
 * לכל שורת accept·trusted שנדחית היום: מה האופרטור **כפי שהאפליקציה מתמחרת אותו**
 * (הווקטור הזול ביותר, לא התווית הגנרטיבית), באיזה משטר ההכרעה נופלת, ומה הסף
 * שהיה נדרש כדי לקבל אותה. זה הופך "far" מסיבה אחת ל-8 סיבות נפרדות שאפשר לתמחר.
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
const OPS = ['sub', 'adjSub', 'transpose', 'ins', 'del', 'doubleLetter', 'materVI', 'homophone'];

const bandOf = (bands, len) => { for (const b of bands) if (len <= (b.maxLen == null ? Infinity : b.maxLen)) return b.t; return bands[bands.length - 1].t; };

/* הווקטור המינימלי, ומהו הרכבו · מתוך typoVectors של app.js עצמה */
function anatomy(typed, forms, own) {
  let best = null;
  for (const c of forms) {
    const d = app.editDist(typed, c);
    if (d > 3) continue;
    for (const v of app.typoVectors(typed, c, 3)) {
      const nOps = OPS.reduce((s, k) => s + v[k], 0);
      const kinds = OPS.filter(k => v[k] > 0);
      const cand = { c, v, nOps, kinds, len: String(c).replace(/ /g, '').length };
      if (!best || cand.nOps < best.nOps) best = cand;
    }
  }
  if (!best) return null;
  const gap = app.typoNearestOther(typed, app.TERM_VETO, own) - Math.min(...forms.map(c => app.editDist(typed, c)));
  const tight = P.marginSoft > P.marginHard && gap < P.marginSoft;
  const W = tight ? P.WTight : P.W;
  const bands = tight ? P.bandsTight : P.bands;
  const cost = OPS.reduce((s, k) => s + best.v[k] * W[k], 0);
  return { ...best, gap, tight, t: bandOf(bands, best.len), cost, label: best.kinds.join('+') || 'none' };
}

const txt = fs.readFileSync(path.join(__dirname, 'out', 'dataset-he.jsonl'), 'utf8');
const miss = new Map(), hit = new Map();
let nMiss = 0, nHit = 0;
const zeroBand = { miss: 0, hit: 0 };
const examples = new Map();
for (const l of txt.split('\n')) {
  if (!l) continue; const r = JSON.parse(l);
  if (r.set !== 'he-word' || r.label !== 'accept' || !r.trusted) continue;
  const card = byTerm.get(r.term); if (!card) continue;
  const forms = Array.from(acceptedKeys(card, ctx));
  if (forms.includes(r.typed)) continue;
  const own = new Set([app.K(card.term)]);
  const ok = app.nearMatch(r.typed, forms, 'he', P, app.TERM_VETO, own).ok;
  const A = anatomy(r.typed, forms, own);
  const key = A ? `${A.label}${A.tight ? ' [צר]' : ' [ראשי]'}` : '(מעבר ל-3 עריכות)';
  const M = ok ? hit : miss;
  M.set(key, (M.get(key) || 0) + 1);
  if (ok) nHit++; else nMiss++;
  if (A && !ok) {
    if (A.t === 0) zeroBand.miss++;
    if (!examples.has(key)) examples.set(key, `"${r.typed}"←${r.term} len=${A.len} t=${A.t} cost=${A.cost.toFixed(2)}`);
  }
  if (A && ok && A.t === 0) zeroBand.hit++;
}
say(`שורות accept·trusted מעבר לשכבה 1: ${nHit + nMiss} · מתקבלות ${nHit} (${(100 * nHit / (nHit + nMiss)).toFixed(2)}%) · נדחות ${nMiss}`);
say('');
say('לפי הרכב הווקטור **שהאפליקציה מתמחרת** ולפי המשטר:');
say('הרכב                             נדחות   מתקבלות   דוגמה של דחייה');
const keys = new Set([...miss.keys(), ...hit.keys()]);
const rows = Array.from(keys).map(k => ({ k, m: miss.get(k) || 0, h: hit.get(k) || 0 })).sort((a, b) => b.m - a.m);
for (const r of rows.slice(0, 26))
  say(`${r.k.padEnd(32)} ${String(r.m).padStart(6)} ${String(r.h).padStart(9)}   ${(examples.get(r.k) || '').slice(0, 60)}`);
say('');
say(`דחיות שנפלו ברצועה שסִפָּהּ 0 (אפס סובלנות מוחלטת): ${zeroBand.miss} מתוך ${nMiss} (${(100 * zeroBand.miss / nMiss).toFixed(1)}%)`);

/* התפלגות משטר · כמה מהדחיות בכלל במשטר הצר */
let tightMiss = 0, mainMiss = 0;
for (const r of rows) { if (r.k.includes('[צר]')) tightMiss += r.m; else if (r.k.includes('[ראשי]')) mainMiss += r.m; }
say(`משטר · דחיות במשטר הצר ${tightMiss} · במשטר הראשי ${mainMiss}`);
