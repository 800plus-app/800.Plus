'use strict';
/* מועמד התלמיד · typo-lab/make_student_candidate.js
 *
 *   node typo-lab/make_student_candidate.js
 *     → out/typo-rules.STUDENT.json          · המועמד · en-word בלבד
 *     → out/typo-rules.STUDENT-RED.json      · אותו מועמד עם הגן **שבור בכוונה**
 *
 * ⚠ **‏`en-word` בלבד.** ‏`he-word` ו-`gloss` מועתקים ביט-אחר-ביט ממה שנשלח היום.
 * ‏he-word נמדד (‏23.29% → 31.73%) ו**אינו נשלח בסבב הזה**: חגי ביקש את הבסיס
 * באנגלית, ושתי שפות בשער אחד מקשות על אבחון כשל.
 *
 * ⭐ **הגרסה האדומה היא חלק מהתוצר ולא נספח.** שער שלא ראיתי אדום אינו עדות, וזה
 * נכתב שלוש פעמים ב-`STATE.md` על שערים שדיווחו "עבר" בלי לבדוק דבר. השבירה כאן
 * היא **מכוונת וממוקדת**: מאפסים את שני מקדמי המשטר הצר ומשאירים את `WTight` הרפוי
 * שהותאם יחד איתם. זו בדיוק המחצית המסוכנת של הגן — משקלים שהותרו כי הקנס החזיק
 * אותם, בלי הקנס.
 */

const fs = require('fs');
const path = require('path');
const FIT = require('./fit.js');
const BG = require('./bank_gate.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

function main() {
  const student = JSON.parse(fs.readFileSync(path.join(OUT, 'student-en-word.json'), 'utf8'));
  const v1 = student.A.find(x => x.name.startsWith('V1'));
  if (!v1) throw new Error('make_student_candidate: אין V1 ב-student-en-word.json');

  const base = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const cur = base.params['en-word'];
  const P = FIT.toAppParams(v1.model, {
    dir: cur.dir, minLen: cur.minLen, vetoMargin: cur.vetoMargin, useLexicon: cur.useLexicon !== false,
  });

  const mk = (params, tag, note) => {
    const j = JSON.parse(JSON.stringify(base));
    j.params['en-word'] = params;
    j.ver = base.ver;
    j.studentProvenance = {
      tag, note,
      generatedAt: new Date().toISOString(),
      from: 'typo-lab/fit.js · V1 (posFirst + shareRatio) · פרוטוקול A',
      teacher: '⚠ זמני · תיוגי הדאטהסט. המורה האמיתי (teacher.js) טרם חובר ללולאה',
      measured: {
        baselineHoldout: student.baseline.holdoutRecall,
        candidateHoldout: v1.holdoutRecall,
        falseAcceptsHoldTrainCross: [v1.holdoutFA, v1.trainFA, v1.crossFA],
        newAccepts: v1.residue.newAccepts, newFalse: v1.residue.newFalse,
        cacheWithCross: student.cache.withCross,
      },
      unchanged: ['he-word', 'gloss'],
      heWordMeasuredNotShipped: { from: 0.2329, to: 0.3173, why: 'חגי ביקש את הבסיס באנגלית · שפה אחת לשער' },
    };
    const fp = BG.fingerprint(j.params);
    j.fp = fp;
    const f = path.join(OUT, `typo-rules.${tag}.json`);
    fs.writeFileSync(f, JSON.stringify(j, null, 1));
    say(`${path.basename(f).padEnd(30)} fp=${fp}`);
    return { file: f, fp };
  };

  const shipFp = BG.fingerprint(base.params);
  say(`מה שנשלח היום                  fp=${shipFp}`);
  const good = mk(P, 'STUDENT', 'המועמד · aFirstTight/aShareTight על en-word');

  /* השבירה · הקנס מוסר, המשקלים הרפויים נשארים. */
  const red = JSON.parse(JSON.stringify(P));
  red.aFirstTight = 0; red.aShareTight = 0;
  const bad = mk(red, 'STUDENT-RED', 'שבור בכוונה · שני מקדמי המשטר הצר אופסו וה-WTight הרפוי נשאר');

  if (good.fp === shipFp) throw new Error('⛔ למועמד אותה טביעת אצבע כמו לנשלח · הגן אינו נראה לשער');
  if (good.fp === bad.fp) throw new Error('⛔ למועמד ולגרסה השבורה אותה טביעה · השבירה שקופה');
  say('\n✅ שלוש טביעות שונות · השער יראה את הגן, ויראה גם את שבירתו');
  return { good, bad, shipFp };
}

if (require.main === module) main();
module.exports = { main };
