'use strict';
/* ⛔ הווטו במצב אורח · typo-lab/preview_veto.js
 *
 *   node --max-old-space-size=6144 typo-lab/preview_veto.js
 *   node typo-lab/preview_veto.js --selftest
 *
 * ===== הממצא =====
 *
 * ‏`app.js:452` · `if(PREVIEW) data = { [PREVIEW_UNIT]: data[PREVIEW_UNIT] || [] };`
 * ‏`buildBank` מסנן את **הנתונים הגולמיים**, ולכן `TERM_VETO` נבנה מיחידה 1 בלבד.
 * ‏`buildGlossIndex` (‏app.js:517) בונה את `SEG_VETO` ואת `GLOSS_ALT` מ-`BANK`, ולכן
 * גם הם. ‏`startPreview()` (‏app.js:6977) הוא מה ש"התחל בלי הרשמה" מפעיל.
 *
 * ‏`BANK` מצומצם — **וזה נכון**, הלומד מתרגל יחידה 1. הווטו מצומצם — **וזה לא**:
 * הוא אינו רשימת מה שמתרגלים, הוא רשימת **מה תפוס בשפה**.
 *
 * ===== שלושה ערוצים נחלשים יחד · וזה מה שהמדידה מפרידה =====
 *
 *   1. ‏`isVetoedTerm` · מחרוזת שהיא מונח של ערך מחוץ ליחידה 1 כבר אינה התנגשות.
 *   2. ‏`lexVetoed` · הפרדיקט "מילה אמיתית" הוא `Bloom ∪ TERM_VETO ∪ SEG_VETO`
 *      (‏app.js:951), ולכן ~3,551 מילים אנגליות **נושרות ממנו**.
 *   3. ⭐ ‏`nearestOther` · אינדקס השכנים נבנה מהווטו. פחות מילות מאגר ⇒ `gap` גדול
 *      יותר ⇒ ההכרעה עוברת מהמשטר **הצר** למשטר **הרגיל**, שספיו רפויים בהרבה.
 *      זה הערוץ שאי אפשר לנחש, וגם הגדול מכולם.
 *
 * המדידה היא **מנייה מלאה** על כדור מרחק-1 סביב כל מפתחות יחידה 1 · לא דגימה.
 */

const fs = require('fs');
const path = require('path');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { makeChecker } = require('./lib/checker.js');
const { ball1, shippedParams } = require('./lex_gap.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const PREVIEW_UNIT = '1';                                  // app.js:100

/* ⭐ אותו `buildVeto` בדיוק, על מאגר מסונן · לא מימוש שני. ‏`Object.create` משאיר את
   ‏K/heForms/meaningSegs/LANG על שרשרת האב, ולכן ההבדל היחיד הוא `BANK`. מימוש שני
   של הווטו כאן היה מודד את המימוש שלי במקום את התנהגות האפליקציה. */
function vetoScoped(ctx, lang, keep) {
  const scoped = Object.create(ctx);
  scoped.BANK = Array.from(ctx.BANK).filter(keep);
  return { veto: buildVeto(scoped, lang), n: scoped.BANK.length };
}

function run(lang) {
  const ctx = getCtx(lang);
  const P = shippedParams();
  const full = buildVeto(ctx, lang);
  const prev = vetoScoped(ctx, lang, w => String(w.unit) === PREVIEW_UNIT);

  const ckFull = makeChecker(P, ctx, full, lang);
  const ckPrev = makeChecker(P, ctx, prev.veto, lang);

  const cards = Array.from(ctx.BANK).filter(w => String(w.unit) === PREVIEW_UNIT);
  const unit1Owners = new Set(cards.map(w => ctx.K(w.term)));

  /* בעלים של מפתח, ורק כאלה שמחוץ ליחידה 1 · זו ההגדרה של "תשובה קבילה של ערך אחר". */
  const ownersOutside = s => {
    const out = new Set();
    for (const m of [full.termKeys, full.segKeys]) {
      const o = m.get(s);
      if (o) for (const x of o) if (!unit1Owners.has(x)) out.add(x);
    }
    return out;
  };

  let generated = 0;
  const delta = [];                       // מתקבל אצל אורח, נדחה אצל משתמש מלא
  let deltaOther = 0;                     // ומהן · תשובה קבילה של ערך מחוץ ליחידה 1
  const why = { collision: 0, 'real-word': 0, regime: 0, other: 0 };

  for (const card of cards) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= 3);
    const own = new Set(Array.from(acceptedKeys(card, ctx)).filter(Boolean));
    const seen = new Set();
    for (const k of keys) {
      for (const s of ball1(k)) {
        if (s.length < 3 || own.has(s) || seen.has(s)) continue;
        seen.add(s);
        generated++;
        if (acceptsToday(ctx, s, card)) continue;          // מתקבל בשכבה המדויקת בשני המצבים
        const rP = ckPrev.acceptWord(s, card);
        if (!rP.ok) continue;
        const rF = ckFull.acceptWord(s, card);
        if (rF.ok) continue;                                // מתקבל בשניהם · לא דלתא
        const outs = ownersOutside(s);
        if (outs.size) deltaOther++;
        why[rF.why === 'collision' ? 'collision' : rF.why === 'real-word' ? 'real-word' : rF.why === 'far' ? 'regime' : 'other']++;
        delta.push({ typed: s, key: k, term: card.term, meaning: card.meaning, whyFull: rF.why, owners: Array.from(outs).slice(0, 3) });
      }
    }
  }

  return { lang, cards: cards.length, fullN: full.termKeys.size, prevN: prev.veto.termKeys.size,
    fullSeg: full.segKeys.size, prevSeg: prev.veto.segKeys.size,
    generated, delta, deltaOther, why };
}

function main() {
  const t0 = Date.now();
  const r = run('en');
  say(`מצב אורח · ‏PREVIEW_UNIT='${PREVIEW_UNIT}' · ${r.cards} כרטיסים · ${((Date.now() - t0) / 1000) | 0}ש\n`);
  say(`  TERM_VETO · מלא ${r.fullN} → אורח ${r.prevN}   (${(100 * r.prevN / r.fullN).toFixed(1)}%)`);
  say(`  SEG_VETO  · מלא ${r.fullSeg} → אורח ${r.prevSeg}   (${(100 * r.prevSeg / r.fullSeg).toFixed(1)}%)`);
  say(`\n  מחרוזות שנמנו סביב מפתחות יחידה 1 · ${r.generated}`);
  say(`  ⛔ מתקבלות אצל **אורח** ונדחות אצל משתמש מלא · ${r.delta.length}`);
  say(`  ⛔ מהן · תשובה קבילה של ערך **מחוץ ליחידה 1** · ${r.deltaOther}`);
  say(`\n  מה עצר אותן אצל המשתמש המלא:`);
  say(`     collision (וטו המאגר)        ${r.why.collision}`);
  say(`     real-word (פרדיקט הלקסיקון)  ${r.why['real-word']}`);
  say(`     far (המשטר · gap גדול יותר)  ${r.why.regime}`);
  say(`     אחר                          ${r.why.other}`);

  const named = r.delta.filter(d => d.owners.length).slice(0, 40);
  say(`\n⭐ דוגמאות · לומד חדש מקבל עליהן קרדיט, ומשתמש רשום לא:`);
  say('  הוקלד            על הכרטיס            אבל זו התשובה של');
  for (const d of named.slice(0, 12)) {
    say(`  ${d.typed.padEnd(16)} ${String(d.term).padEnd(20)} ${d.owners.join(', ')}   [${d.whyFull}]`);
  }

  fs.writeFileSync(path.join(OUT, 'preview-veto.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'app.js:452 buildBank · app.js:517 buildGlossIndex · app.js:6977 startPreview',
    ...r, delta: r.delta.slice(0, 3000),
  }, null, 1));
  say('\nנכתב · out/preview-veto.json');
  return r;
}

/* ===== שיניים ===== */
function selftest() {
  let fail = 0;
  const t = (n, c, e) => { say((c ? '✅ ' : '⛔ ') + n + (e ? ' · ' + e : '')); if (!c) fail++; };
  const ctx = getCtx('en');
  const full = buildVeto(ctx, 'en');
  const prev = vetoScoped(ctx, 'en', w => String(w.unit) === PREVIEW_UNIT);

  t('הווטו המלא הוא כל המאגר', full.termKeys.size === 3946, `${full.termKeys.size}`);
  t('ווטו האורח הוא יחידה 1 בלבד', prev.veto.termKeys.size === 395, `${prev.veto.termKeys.size}`);
  t('ווטו האורח הוא תת-קבוצה ממש', Array.from(prev.veto.termKeys.keys()).every(k => full.termKeys.has(k)) && prev.veto.termKeys.size < full.termKeys.size);
  t('מילות יחידה 4/10 נשרו מהווטו של האורח',
    ['advice', 'genus', 'evoke'].every(w => full.termKeys.has(w) && !prev.veto.termKeys.has(w)));
  t('מילות יחידה 1 נשארו', ['angry', 'part'].every(w => prev.veto.termKeys.has(w)));

  /* ⛔ המוטציה · ווטו אורח **זהה** לווטו מלא חייב לתת דלתא 0. בלי זה המספר שהכלי
     מדווח יכול לנבוע מכל דבר, ולא מהצמצום. */
  const P = shippedParams();
  const ckA = makeChecker(P, ctx, full, 'en');
  const ckB = makeChecker(P, ctx, buildVeto(ctx, 'en'), 'en');
  const cards = Array.from(ctx.BANK).filter(w => String(w.unit) === PREVIEW_UNIT).slice(0, 40);
  let d = 0;
  for (const card of cards) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= 3);
    for (const k of keys) for (const s of ball1(k)) {
      if (s.length < 3) continue;
      if (ckB.acceptWord(s, card).ok !== ckA.acceptWord(s, card).ok) d++;
    }
  }
  t('מוטציה · שני ווטואים זהים ⇒ דלתא 0', d === 0, `דלתא ${d}`);

  /* ושן הפוך · ווטו מצומצם **חייב** לייצר דלתא חיובית, אחרת הכלי לא רואה כלום */
  const ckP = makeChecker(P, ctx, prev.veto, 'en');
  let dPos = 0;
  for (const card of cards) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= 3);
    for (const k of keys) for (const s of ball1(k)) {
      if (s.length < 3) continue;
      if (ckP.acceptWord(s, card).ok && !ckA.acceptWord(s, card).ok) dPos++;
    }
  }
  t('ווטו מצומצם ⇒ דלתא חיובית', dPos > 0, `דלתא ${dPos} על ${cards.length} כרטיסים`);

  say(fail ? `\n⛔ ${fail} כשלים` : '\n✅ כל השיניים');
  process.exit(fail ? 1 : 0);
}

if (require.main === module) { if (process.argv.includes('--selftest')) selftest(); else main(); }
module.exports = { run, vetoScoped, PREVIEW_UNIT };
