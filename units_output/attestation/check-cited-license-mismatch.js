/* שער: לכל שורה בטבלת ההוכחות שטוענת "נחלת הכלל / CC0", בודק אם הרישיון שנשלף
 * בפועל מ-Sefaria עבור *הגרסה הספציפית* שמצוטטת (attest/sefaria-licenses.json,
 * שמפתחו הוא מחרוזת הרפרנס+הגרסה המדויקת כפי שמופיעה בעמודת "רפרנס") באמת
 * Public Domain/CC0. אם המפתח מוחזר "unknown"/"שגיאה"/רישיון אחר — זו התאמה-לא-תואמת:
 * השורה טוענת רישיון נקי, אבל הבדיקה הפר-גרסה לא מאשרת זאת.
 *
 * ⭐ בקרה חיובית מובנית: שורת-בדיקה מזויפת עם רפרנס שידוע כ-unknown בקאש עצמו
 * (Machatzit... זה לא קיים – במקום זאת מזריקים שורה סינתטית עם מפתח קיים שערכו
 * "unknown"/"שגיאה", כדי להוכיח שהשער באמת תופס אי-התאמה ולא רק מחזיר 0 כי אין לו שיניים).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const read = f => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);

function loadTsv(f) {
  const lines = read(f);
  const header = lines[0].split('\t');
  return lines.slice(1).map(l => {
    const c = l.split('\t');
    return { word: c[0], unit: c[1], claimed: c[2], ref: c[3], note: c[4] || '' };
  });
}

const LIC = JSON.parse(fs.readFileSync(path.join(dir, 'sefaria-licenses.json'), 'utf8'));
const CLEAN = /Public Domain|^PD$|CC0/i;

function checkRows(rows, label) {
  const mismatches = [];
  let checked = 0, notInCache = 0;
  for (const r of rows) {
    if (!/נחלת הכלל|CC0/.test(r.claimed)) continue; // רק שורות שטוענות רישיון נקי
    if (!(r.ref in LIC)) { notInCache++; continue; }
    checked++;
    const actual = LIC[r.ref];
    if (!CLEAN.test(actual)) {
      mismatches.push({ word: r.word, ref: r.ref, claimed: r.claimed, actual });
    }
  }
  console.log(`\n== ${label} ==`);
  console.log(`שורות שטוענות "נחלת הכלל/CC0": נבדקו מול קאש הרישיונות ${checked}, לא נמצא מפתח בקאש ${notInCache}`);
  console.log(`אי-התאמות (טוען נקי, הקאש חולק): ${mismatches.length}`);
  mismatches.forEach(m => console.log(`  ${m.word} · "${m.ref}" · טוען: ${m.claimed} · בפועל: ${m.actual}`));
  return mismatches;
}

const rows299 = loadTsv('attestation-299-worth.tsv');
const before = checkRows(rows299, 'attestation-299-worth.tsv · לפני');

// ⭐ בקרה חיובית: שורה סינתטית עם מפתח קיים בקאש שערכו הידוע אינו נקי,
// כדי להוכיח שהשער מסוגל להחזיר יותר מ-0 ולא רק "0" כברירת מחדל שקטה.
const knownBadKey = Object.keys(LIC).find(k => LIC[k] === 'שגיאה' || LIC[k] === 'unknown');
if (!knownBadKey) {
  console.error('\n⛔ בקרה נכשלה: לא נמצא אף מפתח "שגיאה"/"unknown" בקאש לצורך הבקרה');
  process.exit(1);
}
const control = checkRows(
  [...rows299, { word: '⭐בקרה-סינתטית', unit: '0', claimed: 'נחלת הכלל / CC0 (לפי ספריא)', ref: knownBadKey, note: '' }],
  'עם שורת-בקרה סינתטית מוזרקת'
);
console.log(`\n⭐ בקרה: לפני ${before.length}, עם שורת-בקרה ${control.length} — ${control.length > before.length ? 'הבקרה תפסה, השער מבחין' : 'הבקרה נכשלה'}`);
