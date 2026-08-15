'use strict';
/* שקילות מעבדה↔ריצה **על המשטר הצר** · typo-lab/graded_runtime_probe.js
 *
 * למה הקובץ הזה קיים · חבילת הבדיקות ירוקה על 991 בדיקות, אבל היא מוכיחה **תאימות
 * לאחור בלבד**: הפרמטרים הנשלחים אינם מדורגים, ולכן `tight` הוא false בכל שורה
 * בטבלת הזהב, וענף `bandsTight`/`WTight` ב-`app.js` **לא מורץ אפילו פעם אחת**.
 * ירוק כזה אינו עדות למה שעומד להישלח.
 *
 * מה נבדק כאן · אותה השוואה של `tests/71`, אבל עם פרמטרי המועמד המדורג מוזרקים
 * לשני הצדדים: ‏`typo-lab/lib/checker.js` (המעבדה) מול `nearMatch` **המורמת
 * מ-app.js** דרך ארגז החול. אי-התאמה אחת = אדום.
 *
 *   node typo-lab/graded_runtime_probe.js                  → המועמד מ-out/typo-rules.CANDIDATE.json
 *   node typo-lab/graded_runtime_probe.js --rules <path>   → ארטיפקט אחר
 *   node typo-lab/graded_runtime_probe.js --mutant         → שיניים · שובר את app.js בזיכרון
 *
 * ‏--mutant מחליף בטקסט של app.js את בחירת המשטר ב-`bandOf`/`wOf` כך שהמשטר הראשי
 * ירוץ תמיד, ומריץ את אותה השוואה. שער שאינו מודגם אדום אינו עדות (‏CLAUDE.md).
 */

const fs = require('fs');
const path = require('path');

const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');

const argv = process.argv.slice(2);
const MUTANT = argv.includes('--mutant');
const ri = argv.indexOf('--rules');
const RULES_PATH = ri >= 0 && argv[ri + 1]
  ? path.resolve(argv[ri + 1])
  : path.join(__dirname, 'out', 'typo-rules.CANDIDATE.json');

const { loadApp } = require(path.join(ROOTD, 'tests', '_harness', 'sandbox.js'));
const { makeChecker } = require('./lib/checker.js');
const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys } = require('./lib/keys.js');

const LEX_PATH = path.join(ROOTD, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;

/* אותו מוטנט טקסטואלי כמו ב-graded_probe · הוא מאמת שההחלפה באמת הוחלה, כדי
   ש"אדום" לא ייווצר מטעות כתיב בתבנית. */
const MUT = {
  from: 'const tBands = tight ? p.bandsTight : p.bands;',
  to: 'const tBands = p.bands;',
};

function appCtx(lang) {
  let opts = { lang };
  if (MUTANT) {
    const src = fs.readFileSync(path.join(ROOTD, 'app.js'), 'utf8');
    if (!src.includes(MUT.from)) throw new Error('תבנית המוטנט לא נמצאה ב-app.js · הפרובה אינה תקפה');
    opts = { lang, source: src.split(MUT.from).join(MUT.to) };
  }
  const c = loadApp(opts);
  if (LEX) c.window.TYPO_LEX = LEX;
  return c;
}

function main() {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const P = rules.params['en-word'];
  const graded = P.marginSoft != null && P.marginHard != null && P.marginSoft > P.marginHard;
  say(`ארטיפקט · ${path.basename(RULES_PATH)} · en-word marginHard=${P.marginHard} marginSoft=${P.marginSoft} · מדורג=${graded ? 'כן' : 'לא'}`);
  if (!graded) {
    say('⛔ הארטיפקט אינו מדורג · הפרובה הזאת לא הייתה בודקת כלום');
    process.exit(2);
  }

  const ctx = getCtx('en');
  const veto = buildVeto(ctx);
  const ck = makeChecker(P, ctx, veto, 'en');

  const app = appCtx('en');
  /* מזריקים את פרמטרי המועמד למופע שבזיכרון · הקובץ על הדיסק לא נגוע. */
  app.TYPO_PARAMS['en-word'] = JSON.parse(JSON.stringify(P));
  app.TYPO_PARAMS.enabled = true;

  const cards = Array.from(ctx.BANK);
  say(`מאגר אנגלי · ${cards.length} ערכים`);

  /* מחוללים הקלדות · כל צורה קבילה של כל ערך, ועליה שיבושים דטרמיניסטיים. הכיסוי
     חשוב פחות מהעובדה ששני הצדדים מקבלים **בדיוק** את אותה מחרוזת ואת אותם מועמדים. */
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const AL = 'abcdefghijklmnopqrstuvwxyz';
  const mutate = w => {
    const i = Math.floor(rnd() * w.length);
    const k = Math.floor(rnd() * 4);
    if (k === 0) return w.slice(0, i) + w.slice(i + 1);                      // מחיקה
    if (k === 1) return w.slice(0, i) + AL[Math.floor(rnd() * 26)] + w.slice(i);  // הכנסה
    if (k === 2) return w.slice(0, i) + w[i] + w.slice(i);                   // הכפלה
    return w.slice(0, i) + AL[Math.floor(rnd() * 26)] + w.slice(i + 1);      // החלפה
  };

  const bad = [];
  let n = 0, tight = 0, acc = 0;
  for (const card of cards) {
    const cands = Array.from(acceptedKeys(card, ctx)).sort();
    if (!cands.length) continue;
    const own = new Set([ctx.K(card.term)]);
    const base = cands[0];
    const typed = [base];
    for (let i = 0; i < 6; i++) typed.push(mutate(base));
    for (const t of typed) {
      const a = ctx.K(t);
      if (!a) continue;
      n++;
      const lab = ck.acceptWord(t, card);
      const run = app.nearMatch(a, cands, 'en', app.TYPO_PARAMS['en-word'], app.TERM_VETO, own);
      /* ‏acceptWord כולל את שכבה 1 (‏via='exact'), ש-nearMatch אינה מכילה · משווים
         רק שורות שהמעבדה הכריעה בהן דרך הפאזי או דרך פסילה. */
      if (lab.via === 'exact') continue;
      if (lab.regime === 'tight') tight++;
      if (lab.ok) acc++;
      const L = { ok: lab.ok, why: lab.why || null, dist: lab.dist == null ? null : Number(lab.dist.toFixed(6)) };
      const R = { ok: run.ok, why: run.why || null, dist: run.dist == null ? null : Number(run.dist.toFixed(6)) };
      if (L.ok !== R.ok || L.why !== R.why || L.dist !== R.dist) {
        if (bad.length < 12) bad.push(`"${t}" ~ ${card.term} · מעבדה ${JSON.stringify(L)} · ריצה ${JSON.stringify(R)}`);
        else bad.push(null);
      }
    }
  }

  const nBad = bad.length;
  say('');
  say(`הושוו ${n} הקלדות · ${tight} הוכרעו במשטר הצר · ${acc} התקבלו`);
  if (!tight) {
    say('⛔ אף שורה לא נכנסה למשטר הצר · הפרובה לא בדקה את מה שהיא נועדה לבדוק');
    process.exit(2);
  }
  if (nBad) {
    say(`⛔ ${nBad} אי-התאמות מעבדה↔ריצה:`);
    for (const b of bad) if (b) say('   ' + b);
    process.exit(1);
  }
  say('✅ אפס אי-התאמות · המשטר הצר מכריע זהה במעבדה וב-app.js');
}

if (require.main === module) main();
