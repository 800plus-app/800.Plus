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
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const RED = process.argv.includes('--red');

const rules = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
const short = JSON.parse(fs.readFileSync(path.join(OUT, 'shortword.json'), 'utf8'));

const GR = short.stages && short.stages.gradedRefined;
if (!GR || !GR.params || !GR.W) {
  console.error('⛔ out/shortword.json בלי stages.gradedRefined · הריצו קודם node typo-lab/shortword.js');
  process.exit(2);
}

const en = JSON.parse(JSON.stringify(GR.params));
en.dir = 'word';
en.WTight = JSON.parse(JSON.stringify(GR.W));

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
out.params['en-word'] = en;
out.candidateNote = RED
  ? 'REDGRADED · הוכחת שיניים לשער. לא ארטיפקט ייצור.'
  : 'CANDIDATE · shortword.stages.gradedRefined על en-word בלבד. שאר הסטים ביט-זהים לנשלח.';

const name = RED ? 'typo-rules.REDGRADED.json' : 'typo-rules.CANDIDATE.json';
fs.writeFileSync(path.join(OUT, name), JSON.stringify(out, null, 1));

const bg = require('./bank_gate.js');
const nb = bs => (bs || []).map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t }));
const eff = p => bg.effOps({ W: p.W, WTight: p.WTight, bands: nb(p.bands), bandsTight: nb(p.bandsTight) });

console.log(`נכתב out/${name}`);
console.log(`  en-word · marginHard=${en.marginHard} marginSoft=${en.marginSoft} minLen=${en.minLen} · EFF=${eff(en)}`);
console.log(`  ‏EFF של הנשלח (להשוואת עלות): ${eff(rules.params['en-word'])}`);
