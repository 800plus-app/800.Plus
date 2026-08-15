'use strict';
/* האם `evolve.decideOne` רואה את המשטר הצר · typo-lab/graded_eval_probe.js
 *
 * הרקע · `selfcheck34` דיווח על הפרמטרים הנשלחים ‎19 קבלות-שווא ו-973 פערים מול
 * טבלת הזהב, בעוד ש-`shortword.js` מדד לאותה נקודה `fullFA: 0`, ‏`graded_probe`
 * הראה אפס פערים בין `lib/checker.js` לבין מימוש עצמאי, ושער המאגר חזר ירוק על
 * ‏10,165,462 זוגות. שלוש עדויות מול אחת · אחת מהן מודדת משהו אחר.
 *
 * ההשערה · `evolve.packSet`/`decideOne` הם **מסלול מהיר מקבילי**: כל שורה נפרשת
 * מראש לווקטורי ספירת-אופרטורים, וקבלה היא מכפלה סקלרית מול וקטור סף אחד. המבנה
 * הזה אינו יכול לבטא "אם gap קטן מ-marginSoft, השתמש בווקטור סף ובמשקלים אחרים",
 * ולכן הוא מעריך את **המשטר הראשי על כל שורה** · כלומר בודק **מתירני יותר** מזה
 * שנשלח. אם ההשערה נכונה, כל שורה שהמסלול המהיר מקבל ושה-checker דוחה תיפול
 * בדיוק בענף הזה.
 *
 * הבדיקה · לוקחים את השורות ש-`decideOne` מקבל תחת הפרמטרים הנשלחים ומריצים
 * עליהן את `lib/checker.js` **האמיתי**. שלוש תוצאות אפשריות, ורק אחת מזכה:
 *
 *   · ה-checker דוחה את כולן  → ההשערה מאוששת · אין קבלת-שווא אמיתית
 *   · ה-checker מקבל חלק      → יש קבלות-שווא אמיתיות · הנקודה אינה ברת-משלוח
 *   · אין שורות כאלה בכלל     → הדיווח של selfcheck34 בא ממקום אחר
 *
 *   node typo-lab/graded_eval_probe.js
 */

const path = require('path');
const say = s => process.stdout.write(s + '\n');

const EV = require('./evolve.js');
const BG = require('./bank_gate.js');
const { makeChecker, normalizeParams } = require('./lib/checker.js');
const { buildVeto } = require('./lib/veto.js');

function main() {
  const ship = BG.shipParams();
  const { perSet, langs } = EV.loadRows();

  const SETS = [
    { set: 'he-word', lang: 'he' },
    { set: 'en-word', lang: 'en' },
    { set: 'gloss', lang: 'he' },
  ];

  const summary = [];
  for (const { set, lang } of SETS) {
    const P = normalizeParams(ship.sets[set]);
    const graded = P.marginSoft > P.marginHard;
    const rows = perSet[set];
    const S = EV.packSet(rows);
    /* ‏makeFastEval מקבל פרמטרים בלבד. מה שהוא מחזיר הוא כבר ההוכחה המבנית:
       ‏{wv, anyT, tcache, minLen, margin, useLex} · וקטור משקלים **אחד**, מטמון
       ספים **אחד**, ו-margin יחיד. אין בו מקום שבו משטר צר יכול להתקיים. */
    const E = EV.makeFastEval(P);
    const all = [];
    for (let i = 0; i < rows.length; i++) all.push(i);

    /* בדיוק המדד של selfcheck34: שורות reject שהמסלול המהיר מקבל, בלי אלה
       שמתקבלות היום ממילא (‏flag 8 = label accept, ‏flag 4 = via exact). */
    const fa = EV.listFalseAccepts(S, all, E, 500);

    /* ומה ה-checker האמיתי אומר עליהן. */
    const byLang = {};
    const ckFor = l => {
      if (!byLang[l]) {
        const ctx = langs[l].ctx;
        byLang[l] = makeChecker(ship.sets[set], ctx, buildVeto(ctx), l);
      }
      return byLang[l];
    };
    const byCard = langs[lang].byCard;

    let confirmed = 0, refuted = 0, noCard = 0;
    const samples = [];
    for (const r of fa) {
      const card = byCard.get(r.term + '|' + r.unit);
      if (!card) { noCard++; continue; }
      const ck = ckFor(lang);
      const v = set === 'gloss' ? ck.acceptGloss(r.typed, card) : ck.acceptWord(r.typed, card);
      /* ‏via=exact אינה קבלה של השכבה · היא ההתנהגות של היום. */
      const real = v.ok && v.via !== 'exact';
      if (real) { confirmed++; if (samples.length < 10) samples.push(`⛔ ${r.typed} ~ ${r.term} · ${r.why || r.op} · dist ${v.dist}`); }
      else { refuted++; if (samples.length < 10) samples.push(`✔ ${r.typed} ~ ${r.term} · המסלול המהיר קיבל · ה-checker: ${v.ok ? 'via=' + v.via : v.why}`); }
    }

    say('');
    say(`## ${set} · מדורג=${graded ? 'כן' : 'לא'} · ${rows.length} שורות`);
    say(`המסלול המהיר (decideOne) מקבל: ${fa.length}`);
    say(`מתוכן ה-checker האמיתי מקבל: **${confirmed}** · דוחה: ${refuted}${noCard ? ` · בלי כרטיס: ${noCard}` : ''}`);
    for (const s of samples) say('   ' + s);
    summary.push({ set, graded, fast: fa.length, confirmed, refuted });
  }

  say('');
  say('## פסק דין');
  let bad = 0;
  for (const s of summary) {
    if (s.confirmed > 0) bad++;
    say(`· ${s.set} · מהיר ${s.fast} → אמיתי ${s.confirmed}` +
      (s.graded && s.fast > 0 && s.confirmed === 0 ? '  ✅ הפער כולו של המסלול המהיר' : '') +
      (s.confirmed > 0 ? '  ⛔ קבלות-שווא אמיתיות' : ''));
  }
  if (bad) { say(''); say('⛔ יש קבלות-שווא שה-checker האמיתי מאשר · הנקודה אינה ברת-משלוח'); process.exit(1); }
  say('');
  say('✅ אף שורה שהמסלול המהיר קיבל אינה מתקבלת על ידי הבודק שנשלח.');
  say('   כלומר `evolve.decideOne` מעריך בודק **מתירני יותר** מזה שרץ בפועל · הוא');
  say('   אינו יכול לבטא את המשטר הצר, ולכן הוא מריץ את המשטר הראשי על כל שורה.');
}

if (require.main === module) main();
