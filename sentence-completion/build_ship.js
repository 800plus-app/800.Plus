/* בונה את קובץ הייצור שהאפליקציה טוענת: `data-sent-en.js` בשורש.
 *
 *   node sentence-completion/build_ship.js
 *
 * למה קובץ נפרד מהקורפוס, ולמה צעד בנייה ולא העתקה ידנית
 * -------------------------------------------------------
 * הקורפוס `sentences-en-v3.js` הוא הארכיון: הוא נושא גם את `e`, ההסבר בפורמט הישן,
 * שממנו נגזרו הנימוקים `r`. הוא **אינו מוצג ללומד** ולכן אין סיבה לשלוח אותו לדפדפן.
 * נמדד: 200KB עם `e` מול 137KB בלעדיו, כלומר 62KB מיותרים בכל טעינה ראשונה.
 * באפליקציה שבה sw.js מנמק במפורש למה לא לתלות פונטים ב-REV כדי לא להוריד 152KB
 * מחדש, 62KB של טקסט שאינו נצפה הם לא זניחים.
 *
 * ⚠ העתקה ידנית הייתה סוטה. אחרי כל `assemble.js` צריך גם `build_ship.js`, ולכן
 * `assemble.js` קורא לו בסופו.
 *
 * מה נשמר ומה נזרק:
 *   נשמר  src s o a k w g t r    src לדיווח באגים · k ו-w לתרגול ממוקד עתידי
 *   נזרק  e                       הארכיון
 */
const fs = require('fs'), path = require('path');
const { writeGen } = require('./write_gen.js');

global.window = global.window || {};
delete global.window.SENT_EN;
require(path.join(__dirname, 'sentences-en-v3.js'));
const SENT = global.window.SENT_EN;

const out = {};
let n = 0, missing = [];
for (const band of Object.keys(SENT)) {
  out[band] = SENT[band].map(it => {
    n++;
    /* ⛔ שער: פריט בלי g/t/r אינו ניתן להצגה בפורמט שאושר, ואסור שיגיע לאפליקציה
       חצי אפוי. הלומד היה רואה מסך הסבר ריק. */
    if (!it.t || !Array.isArray(it.g) || !it.g.length || !Array.isArray(it.r) || it.r.some(x => !x))
      missing.push(`${band}/${it.src}`);
    return { src: it.src, s: it.s, o: it.o, a: it.a, k: it.k, w: it.w, g: it.g, t: it.t, r: it.r };
  });
}

if (missing.length) {
  console.error(`⛔ ${missing.length} פריטים חסרי g/t/r — לא נבנה קובץ ייצור:`);
  missing.slice(0, 20).forEach(x => console.error('   ' + x));
  process.exit(1);
}

const header = [
  '/* השלמת משפטים באנגלית · קובץ ייצור · נבנה ע"י sentence-completion/build_ship.js.',
  ' * ⛔ אל תערוך ביד. המקור הוא sentence-completion/batches/ ומשם assemble.js.',
  ' *',
  ' * נטען **בהשהיה**, רק בכניסה למסך השלמת המשפטים, ולא מ-index.html: הקובץ שוקל',
  ' * מעל 130KB ורוב הכניסות לאפליקציה אינן נוגעות בתרגול הזה.',
  ' *',
  ' * מבנה פריט:',
  ' *   s  המשפט, עם ___ בחסר       o  ארבע האפשרויות      a  אינדקס התשובה',
  ' *   g  פירוש כל אפשרות          t  תרגום המשפט לעברית, התשובה מודגשת ב-**…**',
  ' *   r  נימוק לכל אפשרות         k  סוג ההיגיון          w  מילת הקישור',
  ' * שדה `e` של הפורמט הישן נשאר בארכיון ואינו נשלח לדפדפן.',
  ' */',
  'window.SENT_EN = ' + JSON.stringify(out) + ';',
  '',
].join('\n');

const dest = path.join(__dirname, '..', 'data-sent-en.js');
/* writeGen · ההנמקה המלאה ב-write_gen.js. */
const נכתבייצור = writeGen(dest, header);
const kb = Math.round(fs.statSync(dest).size / 1024);
console.log(`${נכתבייצור ? 'נכתב' : 'ללא שינוי'}: data-sent-en.js · ${n} פריטים · ${kb}KB`);
console.log('רצועות: ' + Object.keys(out).map(b => `${b} ${out[b].length}`).join(' · '));
