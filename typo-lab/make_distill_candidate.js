'use strict';
/* מועמד הזיקוק · typo-lab/make_distill_candidate.js
 *
 *   node --max-old-space-size=8192 typo-lab/make_distill_candidate.js
 *     → out/typo-rules.DISTILL.json      · המועמד · en-word בלבד · המורה האמיתי
 *     → out/typo-rules.DISTILL-RED.json  · ⛔ הגרסה שחייבת להאדים בשער
 *
 * ⛔ **המועמד הזה אינו מומלץ למשלוח**, והוא נבנה בכל זאת. הסיבה: המדידה היא
 * ‏74.63% → 63.42% — כלומר המורה **מהדק** ואינו מרפה — ומועמד שלא עבר את השער
 * אינו ראיה לכלום. השער כאן מוכיח שהמנגנון עובד ומודד את השארית, לא ממליץ.
 *
 * ===== ⭐ למה הגרסה האדומה היא `useLexicon:false` ולא מוטציה שרירותית =====
 *
 * ‏`make_student_candidate.js` שובר את הגן על ידי איפוס שני מקדמי המשטר הצר. זה
 * תקין, אבל הוא מוטציה סינתטית — היא מוכיחה שהשער רואה, ולא מלמדת דבר.
 *
 * כאן נמדד שמתוך **75** קבלות המורה שהמודל הנשלח דוחה, **37 חסומות בווטו
 * הלקסיקון** (`isRealWord`) — `cloze`~close · `embarrassing`~embarrass. כלומר
 * השאלה "מה היה עולה לנו לתת למורה את מה שהוא ביקש" **היא בדיוק** `useLexicon:false`.
 *
 * ⭐ לכן הריצה האדומה עונה על שאלת מוצר אמיתית ולא רק מוכיחה שיניים: היא מתמחרת
 * את הווטו שחוסם מחצית מהשארית. אם היא חוזרת ירוקה — הווטו מיותר; אם אדומה —
 * המספר שהיא מחזירה הוא המחיר.
 *
 * ⚠ ⛔ **הידוק אינו יכול לייצר התנגשות חדשה** — הוא רק מסיר קבלות — ולכן הריצה
 * הירוקה כאן צפויה מראש. היא רצה בכל זאת, מאותו נימוק שכתוב ב-`app.js`:
 * "מובטח מטיעון" הוא בדיוק מה שהפרויקט הזה לא סומך עליו.
 */

const fs = require('fs');
const path = require('path');
const FIT = require('./fit.js');
const BG = require('./bank_gate.js');
const D = require('./distill.js');
const { RULES } = require('./teacher_rule_probe.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

function main() {
  const S = D.loadS();
  const sp = FIT.splits(S);
  const st = JSON.parse(fs.readFileSync(path.join(OUT, 'distill-state.json'), 'utf8'));
  const shipped = FIT.fromAppParams(FIT.shippedParams('en-word'));
  const structuralNeg = sp.cross.concat(sp.zngry).filter(i => S.isAcc[i] !== 1);

  const setRows = fs.readFileSync(path.join(OUT, 'teacher', 'distill-en-word.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map(l => JSON.parse(l));
  const hm = new Map(setRows.map(r => [r._i, r.h]));
  const oracle = D.makeOracle(S, RULES.R2, null, i => hm.get(i) || D.itemFor(S, i).h);

  const model = D.anchoredModel(S, shipped, st.labeled, oracle, structuralNeg);

  const h = FIT.evalModel(S, sp.holdout, model);
  say(`המועמד · holdout ${(100 * h.recall).toFixed(2)}% · ${st.labeled.length} פסקי מורה · ${model.trainedOn.lowered} רצועות הודקו · ${model.trainedOn.raised} הורפו`);

  const base = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const cur = base.params['en-word'];
  const P = FIT.toAppParams(model, {
    dir: cur.dir, minLen: cur.minLen, vetoMargin: cur.vetoMargin, useLexicon: cur.useLexicon !== false,
  });

  const mk = (params, tag, note) => {
    const j = JSON.parse(JSON.stringify(base));
    j.params['en-word'] = params;
    j.distillProvenance = {
      tag, note, generatedAt: new Date().toISOString(),
      teacher: 'teacher.js · פנקס distill-en-word · חוק R2 · ⚠ R2 נבחר בתוך-מדגם · ראה teacher_rule_probe.js',
      verdicts: st.labeled.length,
      measured: { baselineHoldout: 0.7463015423355367, candidateHoldout: h.recall,
        raised: model.trainedOn.raised, lowered: model.trainedOn.lowered,
        unreachableTeacherAccepts: model.trainedOn.unreachable },
      unchanged: ['he-word', 'gloss'],
      recommendation: '⛔ אינו מומלץ למשלוח · המורה מהדק ואינו מרפה',
    };
    const fp = BG.fingerprint(j.params);
    j.fp = fp;
    const f = path.join(OUT, `typo-rules.${tag}.json`);
    fs.writeFileSync(f, JSON.stringify(j, null, 1));
    say(`${path.basename(f).padEnd(32)} fp=${fp}`);
    return { file: f, fp };
  };

  const shipFp = BG.fingerprint(base.params);
  say(`מה שנשלח היום                    fp=${shipFp}`);
  const good = mk(P, 'DISTILL', 'עיגון · ‏R2 · 500 פסקי מורה');

  /* ⛔⛔ **האדומה · ולמה היא **לא** `useLexicon:false`, למרות שזו הייתה השאלה הנכונה.**
   *
   * הכוונה המקורית הייתה לכבות את וטו הלקסיקון, כי נמדד שהוא חוסם **37 מתוך 75**
   * קבלות המורה שהמודל דוחה — כלומר הריצה האדומה הייתה מתמחרת שאלת מוצר אמיתית.
   * ⚠ **הריצה הופעלה ונזנחה.** ‏`useLexicon:false` מרחיב את יקום המועמדים בסדר
   * גודל, ואחרי ~40 דקות היא לא סיימה אפילו את השכבה הראשונה (`he/he-word`,
   * ‏2.2M זוגות) שריצה רגילה עוברת בדקות. ⭐ זה כשלעצמו נתון: **הווטו אינו
   * אופטימיזציה — הוא מה שהופך את שער המאגר לבר-חישוב בכלל.**
   *
   * במקומה נבחרה השבירה ש**כבר הוכחה אדומה** בפרויקט הזה (`typo-rules.STUDENT-RED`
   * ב-16.8 · **3 התנגשויות חדשות** · `pass:false`): איפוס שני מקדמי המשטר הצר
   * תוך השארת ה-`WTight` הרפוי שהותאם יחד איתם. זו המחצית המסוכנת של הגן —
   * משקלים שהותרו כי הקנס החזיק אותם, בלי הקנס.
   */
  const red = JSON.parse(JSON.stringify(P));
  red.aFirstTight = 0; red.aShareTight = 0;
  const bad = mk(red, 'DISTILL-RED', '⛔ שני מקדמי המשטר הצר אופסו · ה-WTight הרפוי נשאר');

  if (good.fp === shipFp) throw new Error('⛔ למועמד אותה טביעה כמו לנשלח · השער לא יראה את השינוי');
  if (good.fp === bad.fp) throw new Error('⛔ ⚠⚠ `useLexicon` אינו נכנס ל-fingerprint · השער עיוור לגן הזה');
  say('\n✅ שלוש טביעות שונות · השער יראה את המועמד, ויראה גם את השבירה');
  return { good, bad, shipFp };
}

if (require.main === module) main();
module.exports = { main };
