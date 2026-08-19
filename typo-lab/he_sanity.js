'use strict';
/* שן · האם השארית שהפרובה מדווחת היא באמת מה שהאפליקציה עושה, או ארטיפקט של הרתמה.
   כל שורה כאן נבדקת גם דרך nearMatch וגם דרך isCorrect **המלאה** של app.js. */
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys, acceptsToday, acceptsLive } = require('./lib/keys.js');
const { appCtx } = require('./he_search_probe.js');
const say = s => process.stdout.write(s + '\n');
const ctx = getCtx('he'), app = appCtx('he');
const P = app.TYPO_PARAMS['he-word'];
const cards = Array.from(ctx.BANK);
const byTerm = new Map(); for (const c of cards) byTerm.set(c.term, c);

const CASES = [
  ['אוצור', 'אוֹצֵר'], ['אאוצר', 'אוֹצֵר'], ['אוצצר', 'אוֹצֵר'], ['אוצרר', 'אוֹצֵר'],
  ['אנביימ', 'אָבְנַיִים'], ['אמירר', 'אָמִיר'], ['מיכמוררת', 'מִכְמוֹרֶת'],
  ['אצר', 'אוֹצֵר'], ['שוא', 'שָׁוְא'], ['שווא', 'שָׁוְא'],
];
say('מחרוזת        כרטיס        forms                       nearMatch            isCorrect  today');
for (const [typed, term] of CASES) {
  const card = byTerm.get(term);
  if (!card) { say(`   ${typed} · ${term} אינו במאגר`); continue; }
  const forms = Array.from(acceptedKeys(card, ctx));
  const own = new Set([app.K(card.term)]);
  const k = app.K(typed);
  const r = app.nearMatch(k, forms, 'he', P, app.TERM_VETO, own);
  say(`${typed.padEnd(13)} ${term.padEnd(12)} [${forms.join(',')}]`.padEnd(70) +
    ` ${(r.ok ? 'OK d=' + (r.dist == null ? '?' : r.dist.toFixed(3)) : 'no:' + r.why).padEnd(20)} ${String(app.isCorrect(typed, term)).padEnd(10)} ${acceptsToday(ctx, k, card)}`);
}

/* פירוק · איזו רצועה ואיזה משטר נבחרים בפועל */
say('');
say('פירוק ההחלטה · אוצור ← אוֹצֵר');
const card = byTerm.get('אוֹצֵר');
const forms = Array.from(acceptedKeys(card, ctx));
const own = new Set([app.K(card.term)]);
const a = app.K('אוצור');
say(`   מפתחות הכרטיס: ${JSON.stringify(forms)}`);
for (const c of forms) {
  say(`   editDist("${a}","${c}") = ${app.editDist(a, c)} · אורך מועמד ${c.replace(/ /g, '').length}`);
  const vecs = app.typoVectors ? app.typoVectors(a, c, 3) : null;
  if (vecs) say(`      וקטורים: ${JSON.stringify(vecs.slice(0, 4))}`);
}
const gap = app.typoNearestOther ? app.typoNearestOther(a, app.TERM_VETO, own) : '(לא מורם)';
say(`   typoNearestOther = ${gap}`);
say(`   marginHard=${P.marginHard} marginSoft=${P.marginSoft} → משטר ${typeof gap === 'number' ? ((gap - 1) < P.marginSoft ? 'צר' : 'ראשי') : '?'}`);
say(`   bands ראשי: ${JSON.stringify(P.bands.filter(b => b.maxLen <= 6))}`);
say(`   W ראשי: ${JSON.stringify(P.W)}`);
say(`   bandsTight: ${JSON.stringify(P.bandsTight.filter(b => b.maxLen <= 6))}`);
say(`   WTight: ${JSON.stringify(P.WTight)}`);
