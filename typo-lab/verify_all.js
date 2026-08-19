'use strict';
/* אימות מלא של typo-lab, בפקודה אחת, עם פסק דין אחד.
 *
 *   node typo-lab/verify_all.js
 *
 * ===== למה הכלי הזה קיים =====
 *
 * אותה סיבה בדיוק שבגללה נכתב sentence-completion/verify_all.js: במהלך העבודה דווח
 * יותר מפעם אחת "השערים עוברים" כשהמצב היה אחר · פעם מפני שהשער בדק את הדבר הלא נכון,
 * פעם מפני שהוא לא היה יכול לירות בכלל, ופעם מפני שהתוצר לא נבנה מחדש אחרי שהקלט שונה.
 * כל השערים במקום אחד, בסדר הנכון, ובלי מקום לדלג על אחד מהם.
 *
 * הסדר אינו שרירותי: קודם השערים שבודקים את הכלים (מרחק, דאטהסט, כושר), אחר כך אלה
 * שבודקים את התוצר (מקרים שתולים, כל המאגר), ובסוף חבילת הבדיקות של הפרויקט.
 *
 * ===== שני כללים שנלמדו מהתקדים =====
 *
 * 1. **בלי מספר מקובע בביטוי.** ב-sentence-completion היה `t נכתב 204/204`, והוא עבד
 *    בדיוק עד שהקורפוס גדל · ואז השער התלונן על הצלחה. מספר קבוע בתוך שער הוא תאריך
 *    תפוגה שאיש אינו רואה. לכן כל מקום שבו מופיע מונה נכתב כהפניה לאחור: שני המספרים
 *    חייבים להיות זהים, יהיו אשר יהיו.
 * 2. **המספרים הסופיים נגזרים מהתוצר ולא מהפלט.** הדוח למטה קורא את
 *    ‏out/typo-rules.json,‏ out/manifest.json ו-out/bank-gate.md ישירות. שער שמדווח
 *    מספר ששאב מהפלט של שער אחר מדווח על ניסוח, לא על מדידה.
 */

const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const BG = require('./bank_gate.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

/* צעד עם `optional` מדלג בשקט-מוצהר כשהקובץ עדיין אינו קיים · מודול שנבנה במקביל אינו
   סיבה להפיל את האימות, אבל הוא כן סיבה לומר בפירוש שהוא לא נבדק. */
const steps = [
  { name: 'שער שלב א · acceptedKeys, זוגות מרחק-1, אינדקסי הווטו',
    cmd: ['typo-lab/selfcheck1.js'], need: /(\d+)\/\1 בדיקות עברו[\s\S]*פסק דין: ירוק/ },
  { name: 'שער הדאטהסט · שמונה טענות + שחזור ביט-אחר-ביט',
    cmd: ['typo-lab/selfcheck2b.js'], need: /לשער יש שיניים[\s\S]*פסק דין · ירוק/ },
  { name: 'שער שלבים 3-4 · מרחק, כושר, אילוצים קשיחים, טבלת הזהב',
    cmd: ['typo-lab/selfcheck34.js'], need: /=== (\d+)\/\1 עברו[\s\S]*לשער יש שיניים/ },
  { name: 'שער חוקי צד-הפירוש',
    cmd: ['typo-lab/selfcheck_gloss.js'], need: /לשער יש שיניים[\s\S]*(\d+)\/\1 בדיקות עברו[\s\S]*פסק דין: ירוק/ },
  { name: 'שער הנרדפות',
    cmd: ['typo-lab/selfcheck_syn.js'], need: /לשער יש שיניים/ },
  { name: 'שער המורפולוגיה', optional: true,
    cmd: ['typo-lab/selfcheck_morph.js'], need: /לשער יש שיניים|פסק דין: ירוק/ },
  { name: 'מקרים שתולים · הוכחת שיניים',
    cmd: ['typo-lab/gates.js', '--selftest'], need: /לשער יש שיניים/ },
  { name: 'מקרים שתולים · הרצה על הפרמטרים הנשלחים',
    cmd: ['typo-lab/gates.js'], need: /(\d+)\/\1 שערים עברו[\s\S]*פסק דין: ירוק/ },
  { name: 'שער כל המאגר · אפס התנגשויות חדשות',
    cmd: ['typo-lab/bank_gate.js'], need: /סה"כ (\d+) ערכים[\s\S]*אפס התנגשויות חדשות · \1 ערכים · (\d+) זוגות/ },
  { name: 'חבילת הבדיקות של הפרויקט',
    cmd: ['tests/run.js'], need: /PASS \S+ (\d+) tests, 0 failures/ },
];

let failed = 0, skipped = 0;
const T0 = Date.now();
for (const s of steps) {
  if (s.optional && !fs.existsSync(path.join(ROOT, s.cmd[0]))) {
    skipped++;
    say(`➖ ${s.name} · ${s.cmd[0]} עדיין אינו קיים · לא נבדק`);
    continue;
  }
  const t = Date.now();
  let out = '', code = 0;
  try {
    out = cp.execFileSync(process.execPath, s.cmd,
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, env: Object.assign({}, process.env) });
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status || 1; }
  const ok = code === 0 && s.need.test(out);
  if (!ok) failed++;
  say(`${ok ? '✅' : '⛔'} ${s.name} · ${((Date.now() - t) / 1000).toFixed(1)}ש`);
  if (!ok) say('   ' + out.trim().split('\n').slice(-12).join('\n   '));
}

/* ===== המספרים · נגזרים מהתוצר, לא נשאבים מהפלט ===== */

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const rules = readJson(path.join(OUT, 'typo-rules.json'));
const manifest = readJson(path.join(OUT, 'manifest.json'));

let gate = null;
try {
  const mdTxt = fs.readFileSync(path.join(OUT, 'bank-gate.md'), 'utf8');
  const m = mdTxt.match(/<!-- bank-gate: ([\s\S]*?) -->/);
  if (m) gate = JSON.parse(m[1]);
} catch (e) { gate = null; }

say('');
say('='.repeat(72));
if (rules) {
  say(`פרמטרים: ver=${rules.ver} · טביעת אצבע ${rules.params ? BG.fingerprint(rules.params) : '?'} · enabled=${rules.enabled} · נוצר ${rules.generatedAt || '?'}`);
  for (const set of Object.keys(rules.params || {})) {
    const q = rules.params[set];
    const r = (rules.results && rules.results[set]) || {};
    const h = r.holdout || {};
    say(`  ${set}: minLen=${q.minLen} vetoMargin=${q.vetoMargin} ` +
      `ספים=[${q.bands.map(b => b.t).join(', ')}]` +
      (h.recall == null ? '' : ` · holdout recall=${(h.recall * 100).toFixed(2)}% falseAccepts=${h.falseAccepts}`));
  }
} else say('⛔ out/typo-rules.json אינו קריא');

if (manifest) {
  say(`דאטהסט: ${manifest.total} שורות · ` +
    (manifest.files || []).map(f => `${f.name} ${f.rows} (${String(f.sha256).slice(0, 12)})`).join(' · '));
} else say('⛔ out/manifest.json אינו קריא');

if (gate) {
  say(`שער כל המאגר: ${gate.cards} ערכים · ${gate.pairs} זוגות חושבו · ` +
    `${gate.newCollisions} התנגשויות חדשות · ${gate.baselineExact} קבלות של היום · ` +
    `${gate.synonymGroups} קבוצות נרדפות · צירה ${gate.tsereRejected}/${gate.tserePairs}`);
} else say('⛔ out/bank-gate.md בלי בלוק סיכום קריא');

/* אי-התאמה בין הארטיפקטים היא כשל בפני עצמו · ונמדדה כאן בפועל: בזמן שהאימות רץ,
   האופטימיזציה כתבה מחדש את out/typo-rules.json, והסיכום הדפיס פרמטרים שאינם אלה
   שהשער נבדק עליהם. ‏ver אינו מספיק כזיהוי (הוא זהה בין הריצות), ולכן ההשוואה היא על
   טביעת אצבע של הפרמטרים עצמם. */
const nowFp = rules && rules.params ? BG.fingerprint(rules.params) : null;
if (rules && gate && gate.paramsFp && nowFp && gate.paramsFp !== nowFp) {
  failed++;
  say(`⛔ השער נבדק על פרמטרים ${gate.paramsFp} והארטיפקט מחזיק עכשיו ${nowFp} · הוא נכתב מחדש תוך כדי, הריצו שוב`);
} else if (rules && gate && !gate.paramsFp) {
  say('⚠ הדוח נוצר בלי טביעת אצבע · אי אפשר לאמת שהוא מתאר את הארטיפקט הנוכחי');
}

say('='.repeat(72));
say(`${((Date.now() - T0) / 1000).toFixed(1)} שניות`);
if (skipped) say(`➖ ${skipped} צעדים לא נבדקו (הקובץ אינו קיים)`);
say(failed ? `⛔ ${failed} שערים נכשלו · אין להעביר לשלב ב'` : '✅ כל השערים עברו');
/* ⚠ הסייג הזה נכתב כשהשכבה עוד לא הייתה ב-app.js, והוא נשאר במקומו אחרי שהיא
   נשלחה · כלומר הדוח המשיך להצהיר "לא נבדק" על משהו שכן נבדק. שקילות מעבדה↔ריצה
   נבדקת היום בשני מקומות: ‏tests/71 מריץ מחדש את טבלת הזהב על nearMatch המורמת
   מ-app.js, ו-`graded_runtime_probe.js` עושה את אותו הדבר למשטר הצר, שאין לו ולו
   שורה אחת בטבלת הזהב של הפרמטרים הישנים. */
say('⚠ מה שלא נבדק כאן: התנהגות בדפדפן, ניסוח ההודעה למשתמש, ואיכות התוכן.');
say('   שקילות מעבדה↔ריצה **כן** נבדקת · tests/71 (טבלת הזהב) ו-graded_runtime_probe');
say('   (המשטר הצר). שלוש השכבות (מרחק, חוק');
say('   צד-הפירוש, נרדפות) נמדדות זו לצד זו ולא זו דרך זו, וה-recall נמדד מול הטקסונומיה');
say('   שייצרה את הדאטהסט · ‏24 המקרים האמיתיים הם הבנצ\'מרק החיצוני היחיד.');
say('='.repeat(72));
process.exit(failed ? 1 : 0);
