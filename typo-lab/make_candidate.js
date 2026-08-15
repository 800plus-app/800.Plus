'use strict';
/* בניית ארטיפקט מועמד לשער · typo-lab/make_candidate.js
 *
 * לוקח את out/typo-rules.json הנשלח ומחליף בו **רק** את params['en-word'] בנקודה
 * המדורגת שנמדדה ב-out/shortword.json (stages.gradedRefined). שאר הסטים נשארים
 * ביט-זהים · כך שכל הפרש שהשער ידווח שייך לגן החדש ולא לרעש.
 *
 *   node typo-lab/make_candidate.js            → out/typo-rules.CANDIDATE.json
 *   node typo-lab/make_candidate.js --red      → out/typo-rules.REDGRADED.json
 *
 * ‏--red הוא הוכחת השיניים של השער, לא מועמד. הוא נבדל מהמועמד **רק** בגני המשטר
 * הצר (marginSoft, bandsTight) ולא בשום דבר אחר, ו-EFF שלו זהה (‏maxT 2.2 מול אותו
 * minW) כדי שגם עלות הריצה תהיה זהה. שער שנשאר ירוק עליו הוא שער שאינו רואה את
 * הגנים האלה בכלל — וזה בדיוק המצב שהיה כאן לפני התיקון ב-shipParams.
 *
 * ===== --set / --from · אותה תבנית לסט אחר =====
 *
 *   node typo-lab/make_candidate.js --set he-word --from out/he-graded-search.json \
 *        --out typo-rules.HE-CANDIDATE.json
 *
 * ברירות המחדל (‏en-word · out/shortword.json · typo-rules.CANDIDATE.json) לא זזו,
 * ולכן שתי הפקודות הוותיקות למעלה מייצרות בדיוק את מה שייצרו קודם. שני מבני מקור
 * נתמכים: `stages.gradedRefined` (הפלט של shortword.js) ו-`candidate` (הפלט של
 * he_graded_search.js, שכבר נושא את המפרט המלא).
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const argv = process.argv.slice(2);
const RED = argv.includes('--red');
const aval = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SET = aval('--set', 'en-word');
const FROM = aval('--from', 'out/shortword.json');
const OUTNAME = aval('--out', RED ? 'typo-rules.REDGRADED.json' : (SET === 'en-word' ? 'typo-rules.CANDIDATE.json' : `typo-rules.${SET.toUpperCase()}-CANDIDATE.json`));

const rules = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
if (!rules.params[SET]) { console.error(`⛔ אין params['${SET}'] ב-typo-rules.json`); process.exit(2); }
const srcPath = path.isAbsolute(FROM) ? FROM : path.join(__dirname, '..', FROM);
const short = JSON.parse(fs.readFileSync(fs.existsSync(srcPath) ? srcPath : path.join(OUT, path.basename(FROM)), 'utf8'));

/* שני מבני מקור · שדות זהים, מקור אחד. */
const GR = (short.stages && short.stages.gradedRefined) || null;
const CAND = short.candidate || null;
let spec = null;
if (CAND && CAND.bands && CAND.bandsTight) {
  spec = { params: CAND, W: CAND.WTight };
} else if (GR && GR.params && GR.W) {
  spec = { params: GR.params, W: GR.W };
}
if (!spec) {
  console.error(`⛔ ${FROM} בלי stages.gradedRefined ובלי candidate · אין ממה לבנות מועמד`);
  process.exit(2);
}
if (!(spec.params.marginSoft > spec.params.marginHard)) {
  console.error(`⛔ המקור אינו מדורג (marginSoft ${spec.params.marginSoft} אינו מעל marginHard ${spec.params.marginHard}) · אין כאן גן לבדוק`);
  process.exit(2);
}

const en = JSON.parse(JSON.stringify(spec.params));
delete en.route; delete en.allow; delete en.byLengthHold;      // מטא-נתוני חיפוש · אינם פרמטרים
en.dir = rules.params[SET].dir || 'word';
en.WTight = JSON.parse(JSON.stringify(spec.W));

if (RED) {
  /* ‏כל שורה נכנסת למשטר הצר, והמשטר הצר מקבל סף אחיד 2.2 בכל אורך עם משקלי המשטר
     הראשי · כלומר "שתי החלפות במילה בת ארבע אותיות". במאגר אנגלי של 3,946 ערכים זה
     חייב לייצר התנגשויות חוצות-כרטיסים. ‏maxT נשאר 2.2 ו-minW נשאר של W הראשי, ולכן
     ‏EFF זהה למועמד ועלות הריצה זהה — ההפרש היחיד הוא הגן שנבדק. */
  en.marginSoft = 99;
  en.bandsTight = en.bands.map(b => ({ maxLen: b.maxLen, t: 2.2 }));
  en.WTight = JSON.parse(JSON.stringify(en.W));
}

const out = JSON.parse(JSON.stringify(rules));
out.params[SET] = en;
out.candidateNote = RED
  ? 'REDGRADED · הוכחת שיניים לשער. לא ארטיפקט ייצור.'
  : `CANDIDATE · ${FROM} על ${SET} בלבד. שאר הסטים ביט-זהים לנשלח.`;

const name = OUTNAME;
fs.writeFileSync(path.join(OUT, name), JSON.stringify(out, null, 1));

/* שער · שאר הסטים חייבים לצאת ביט-זהים לנשלח, אחרת "כל הפרש שהשער ידווח שייך לגן
   החדש" אינו נכון. נבדק ולא מוצהר. */
for (const s of Object.keys(rules.params)) {
  if (s === SET) continue;
  if (JSON.stringify(out.params[s]) !== JSON.stringify(rules.params[s])) {
    console.error(`⛔ params['${s}'] אינו ביט-זהה לנשלח · המועמד אינו מבודד`);
    process.exit(2);
  }
}

const bg = require('./bank_gate.js');
const nb = bs => (bs || []).map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t }));
const eff = p => bg.effOps({ W: p.W, WTight: p.WTight, bands: nb(p.bands), bandsTight: nb(p.bandsTight) });

console.log(`נכתב out/${name}`);
console.log(`  ${SET} · marginHard=${en.marginHard} marginSoft=${en.marginSoft} minLen=${en.minLen} · EFF=${eff(en)}`);
console.log(`  ‏EFF של הנשלח (להשוואת עלות): ${eff(rules.params[SET])}`);
