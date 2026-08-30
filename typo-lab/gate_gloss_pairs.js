'use strict';
/* שער · צמד שחולק פירוש מוחלף שלם או בכלל לא  ·  typo-lab/gate_gloss_pairs.js
 *
 * ⛔ מה הוא מונע
 * --------------
 * במאגר הנשלח יש ערכים שנושאים בדיוק אותו פירוש. המאגר הממתין
 * (`units_output/unit-*-hebrew.md`) הפריד חלק מהם. **מי שמחליף איבר אחד ומשאיר
 * את השני על הפירוש המשותף — משאיר את ההתנגשות במקום ומסתיר אותה מהמיפוי.**
 * זה בדיוק מה שקרה לזוג `הוֹקִיר רַגְלָיו` / `הִדִּיר רַגְלָיו`.
 *
 * שלוש הבדיקות
 * -------------
 *  1 · **אטומיות** · בכל קבוצה במניפסט, מספר האיברים שעדיין נושאים את הפירוש
 *      המשותף המקורי הוא 0 או **כל** האיברים. ‏1 מתוך 2 = אדום.
 *  2 · **אי-התנגשות פנימית** · בתוך קבוצה, אין שני איברים עם אותה מחרוזת פירוש.
 *  3 · **כיסוי** · כל קבוצה שחולקת פירוש **היום** ב-`data.js` רשומה במניפסט.
 *      קבוצה חדשה שנוצרה בלי לעבור כאן — אדום, ולא שקט.
 *
 * ⭐ הוכחת שיניים · `--selftest` מדמה עדכון חלקי **בזיכרון בלבד** (אינו נוגע
 *   בקובץ) ונופל עליו. שער שלא ראו אותו אדום אינו שער.
 *
 * שימוש:
 *   node typo-lab/gate_gloss_pairs.js              בדיקה · יציאה 1 בכישלון
 *   node typo-lab/gate_gloss_pairs.js --selftest   הוכחת שיניים
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data.js');
const MANIFEST = path.join(__dirname, 'out', 'gloss-pairs.json');

function shipped() {
  const win = {};
  new Function('window', fs.readFileSync(DATA, 'utf8'))(win);
  const m = new Map();
  for (const unit of Object.keys(win.UNIT_DATA))
    for (const [term, gloss] of win.UNIT_DATA[unit]) m.set(term, String(gloss).trim());
  return m;
}

/* ההכרעה כולה · מקבלת מפה מילה→פירוש, ומחזירה רשימת ממצאים.
   ⭐ היא טהורה בכוונה: `--selftest` מזין לה מפה מזויפת ומוכיח שהיא נופלת. */
function findings(cur, manifest) {
  const out = [];
  for (const g of manifest.groups) {
    const live = g.members.filter(m => cur.has(m.term));
    if (live.length !== g.members.length) {
      out.push(`חסר מהמאגר · «${g.shared}» · ` +
        g.members.filter(m => !cur.has(m.term)).map(m => m.term).join(' · '));
      continue;
    }
    /* 1 · אטומיות · חלק מהאיברים ירדו מהפירוש המשותף וחלק נשארו עליו.
       ⚠ איבר שהפירוש המוכן לו בבנק הממתין הוא **בדיוק** הפירוש המשותף
       (כפיר «אריה צעיר») אינו בפיגור — הוא כבר במצבו הסופי. בלי החריג הזה השער
       יורה על המצב התקין. */
    const onShared = live.filter(m => cur.get(m.term) === String(g.shared).trim());
    const stale = onShared.filter(m => m.to !== String(g.shared).trim());
    const off = live.filter(m => cur.get(m.term) !== String(g.shared).trim());
    if (stale.length && off.length)
      out.push(`עדכון חלקי · «${g.shared}» · ${stale.length} מתוך ${live.length} עדיין על הפירוש המשותף · ` +
        live.map(m => `${m.term}=«${cur.get(m.term)}»`).join(' | '));
    /* 2 · אי-התנגשות פנימית · רק בקבוצה שכבר הוחלפה.
       ⚠ בקבוצה שנעצרה בכוונה (אין חלופה מוכנה) השוויון הוא המצב הידוע,
       וירייה עליו היא רעש שיכבה את השער. */
    if (g.applied) {
      const seen = new Map();
      for (const m of live) {
        const v = cur.get(m.term);
        if (seen.has(v)) out.push(`שני איברים בקבוצה שהוחלפה נושאים אותו פירוש · «${v}» · ${seen.get(v)} · ${m.term}`);
        seen.set(v, m.term);
      }
    }
  }
  /* 3 · כיסוי · קבוצה חולקת-פירוש שאינה במניפסט */
  const known = new Set();
  for (const g of manifest.groups) for (const m of g.members) known.add(m.term);
  const by = new Map();
  for (const [term, gloss] of cur) {
    if (!by.has(gloss)) by.set(gloss, []);
    by.get(gloss).push(term);
  }
  for (const [gloss, terms] of by) {
    if (terms.length < 2) continue;
    if (terms.every(t => known.has(t))) continue;
    out.push(`קבוצה חולקת-פירוש שאינה במניפסט · «${gloss}» · ${terms.join(' · ')}`);
  }
  return out;
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('⛔ אין מניפסט · הרץ  node typo-lab/gloss_pairs.js --manifest');
    return 2;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const cur = shipped();

  if (process.argv[2] === '--selftest') {
    /* מקרה שאמור להיפסל · מחזירים איבר אחד בקבוצה שהוחלפה לפירוש המשותף הישן */
    const g = manifest.groups.find(x => x.applied && x.members.length >= 2);
    if (!g) { console.error('⛔ אין במניפסט קבוצה שהוחלפה · אי אפשר להוכיח שיניים'); return 2; }
    const fake = new Map(cur);
    fake.set(g.members[0].term, String(g.shared).trim());
    const red = findings(fake, manifest);
    const green = findings(cur, manifest);
    console.log(`— selftest · הוחזר «${g.members[0].term}» לפירוש המשותף «${g.shared}»`);
    for (const f of red) console.log('   ⛔ ' + f);
    const caught = red.some(f => f.startsWith('עדכון חלקי'));
    console.log(caught ? '⭐ השער נפל על העדכון החלקי · יש שיניים'
                       : '⛔ השער לא נפל על העדכון החלקי · הוא אינו שער');
    console.log(green.length ? `⚠ ובמצב האמיתי יש ${green.length} ממצאים` : '✅ ובמצב האמיתי · נקי');
    return caught ? 0 : 1;
  }

  const f = findings(cur, manifest);
  if (!f.length) {
    console.log(`✅ ${manifest.groups.length} קבוצות במניפסט · אף אחת לא עודכנה חלקית · אין קבוצה חדשה שאינה רשומה`);
    return 0;
  }
  for (const x of f) console.error('⛔ ' + x);
  console.error(`\n⛔ ${f.length} ממצאים · שער צמדי-הפירוש נופל`);
  return 1;
}
process.exit(main());
