'use strict';
/* כיול הגדרת ה-recall · איזו הגדרה מייצרת את 22.93% שנשלח */
const fs = require('fs');
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const { appCtx } = require('./he_search_probe.js');
const ctx = getCtx('he'), app = appCtx('he');
const P = app.TYPO_PARAMS['he-word'];
const byTerm = new Map(); for (const c of ctx.BANK) byTerm.set(c.term, c);
const txt = fs.readFileSync(require('path').join(__dirname, 'out', 'dataset-he.jsonl'), 'utf8');
const B = {};
const bump = (k, ok) => { const e = B[k] || (B[k] = { n: 0, tp: 0 }); e.n++; if (ok) e.tp++; };
for (const l of txt.split('\n')) {
  if (!l) continue; const r = JSON.parse(l);
  if (r.set !== 'he-word' || r.label !== 'accept') continue;
  const card = byTerm.get(r.term); if (!card) continue;
  const forms = Array.from(acceptedKeys(card, ctx));
  const own = new Set([app.K(card.term)]);
  const exact = forms.includes(r.typed);
  const fuzzy = app.nearMatch(r.typed, forms, 'he', P, app.TERM_VETO, own).ok;
  const seg = (r.holdout ? 'HO' : 'EV') + '|' + (r.trusted ? 'T' : 'U');
  bump(seg + '|incl', exact || fuzzy);
  if (!exact) bump(seg + '|excl', fuzzy);
}
const g = (...ks) => { let n = 0, tp = 0; for (const k of ks) if (B[k]) { n += B[k].n; tp += B[k].tp; } return (100 * tp / n).toFixed(2) + '% (' + tp + '/' + n + ')'; };
console.log('HOLDOUT trusted, incl exact :', g('HO|T|incl'));
console.log('HOLDOUT all,     incl exact :', g('HO|T|incl', 'HO|U|incl'));
console.log('HOLDOUT trusted, excl exact :', g('HO|T|excl'));
console.log('HOLDOUT all,     excl exact :', g('HO|T|excl', 'HO|U|excl'));
console.log('FULLSET trusted, incl exact :', g('HO|T|incl', 'EV|T|incl'));
console.log('FULLSET all,     incl exact :', g('HO|T|incl', 'EV|T|incl', 'HO|U|incl', 'EV|U|incl'));
console.log('FULLSET trusted, excl exact :', g('HO|T|excl', 'EV|T|excl'));
