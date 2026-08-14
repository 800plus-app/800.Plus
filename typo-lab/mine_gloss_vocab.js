'use strict';
/* מחלקה E · שלב אפס: מה אוצר המילים שהפירושים של המאגר עצמו כתובים בו.
 *
 * הלקסיקון של הנרדפות אינו תזאורוס עברי כללי, וגם לא יכול להיות אחד: כל תזאורוס
 * זמין הוא מקור אסור (ויקימילון CC BY-SA, WordNet עברי, האקדמיה). מה שמותר הוא
 * מה שאנחנו כותבים בעצמנו, וכדי לכתוב אותו ממוקד ולא באוויר צריך לדעת מראש אילו
 * מילים בכלל מופיעות בפירושים · אלה ורק אלה המילים שהחלפה שלהן יכולה להשפיע על
 * החלטת קבלה. מילה שאינה מופיעה באף פירוש היא קבוצה מתה בלקסיקון.
 *
 * הפירושים עבריים בשני המאגרים (meaningSegs מנרמלת ב-norm העברי גם באנגלית), ולכן
 * שני המאגרים נספרים יחד לתוך אוצר מילים אחד.
 *
 * הנרמול הוא של האפליקציה. meaningSegs כבר מחזירה norm על כל מקטע, ולכן המילים
 * שיוצאות מכאן הן בדיוק המחרוזות שהריצה משווה עליהן · לא תעתיק משוחזר.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');

const OUT_DIR = path.join(__dirname, 'out');

/* מילות פונקציה. הגרעין הוא PARTICLE_STOP של app.js עצמו (:1277) ולא רשימה מקבילה,
   כי זו הרשימה שהריצה כבר מתעלמת ממנה ב-particleMatch. סביבה: מילות יחס, כינויים
   וקישורים שאין להם משמעות עצמאית בתוך פירוש · החלפה שלהן אינה "נרדפת" אלא רעש. */
const EXTRA_STOP = [
  'אשר', 'כי', 'אך', 'אם', 'אבל', 'אז', 'כך', 'כדי', 'בין', 'אצל', 'ליד',
  'מתוך', 'לתוך', 'בתוך', 'עד', 'גבי', 'ידי', 'פי', 'מפני', 'בגלל', 'לכן',
  'הם', 'הן', 'אלה', 'אלו', 'אותו', 'אותה', 'אותם', 'אותן', 'שלו', 'שלה',
  'שלהם', 'שלנו', 'בו', 'בה', 'בהם', 'לו', 'לה', 'להם', 'עליו', 'עליה',
  'ממנו', 'ממנה', 'איתו', 'איתה', 'אני', 'אתה', 'אנחנו', 'מי', 'מה', 'כאשר',
  'כמו', 'כפי', 'יותר', 'פחות', 'רק', 'כבר', 'עוד', 'שוב', 'תמיד', 'אף',
  'יש', 'אין', 'אינו', 'אינה', 'היה', 'הייתה', 'להיות', 'נמצא', 'נמצאת',
  'כלשהו', 'כלשהי', 'כלשהם', 'מסוים', 'מסוימת', 'מסוימים',
];

function buildStop(ctx) {
  const s = new Set(EXTRA_STOP.map(w => ctx.norm(w)).filter(Boolean));
  for (const w of Array.from(ctx.PARTICLE_STOP)) { const n = ctx.norm(w); if (n) s.add(n); }
  return s;
}

/* מקטע מנורמל -> מילות תוכן. מילה באות אחת נזרקת תמיד: אחרי norm היא תמיד תחילית
   שנשארה תלושה, לעולם לא מילת תוכן. */
function contentWords(seg, stop) {
  return String(seg).split(/\s+/).filter(w => w && w.length > 1 && !stop.has(w));
}

function snippet(s, n) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function mine() {
  const words = new Map();   // מילה מנורמלת -> {count, examples:Set, entries:Set}
  let totalOcc = 0;
  const perLang = {};

  for (const lang of ['he', 'en']) {
    const ctx = getCtx(lang);
    const stop = buildStop(ctx);
    let occ = 0, entries = 0;

    for (const w of Array.from(ctx.BANK)) {
      const owner = ctx.K(w.term);
      if (!owner) continue;
      entries++;
      const segs = Array.from(ctx.meaningSegs(w.meaning));
      const raws = Array.from(ctx.meaningSegsRaw(w.meaning));
      for (let i = 0; i < segs.length; i++) {
        const raw = raws[i] != null ? raws[i] : segs[i];
        for (const cw of contentWords(segs[i], stop)) {
          occ++; totalOcc++;
          let e = words.get(cw);
          if (!e) { e = { count: 0, examples: new Set(), entries: new Set() }; words.set(cw, e); }
          e.count++;
          if (e.examples.size < 3) e.examples.add(snippet(raw, 48));
          e.entries.add(owner);
        }
      }
    }
    perLang[lang] = { entries, occurrences: occ };
  }

  const rows = Array.from(words.entries())
    .map(([word, e]) => ({
      word,
      count: e.count,
      examples: Array.from(e.examples),
      entries: Array.from(e.entries).sort(),
    }))
    /* מיון דטרמיניסטי מלא: תדירות יורדת, ואז לקסיקוגרפי · שתי מילים באותה תדירות
       לא יתחלפו בין הרצות. */
    .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));

  return { rows, totalOcc, perLang };
}

function coverage(rows, totalOcc, frac) {
  let acc = 0;
  for (let i = 0; i < rows.length; i++) {
    acc += rows[i].count;
    if (acc >= totalOcc * frac) return i + 1;
  }
  return rows.length;
}

function main() {
  const { rows, totalOcc, perLang } = mine();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'gloss-vocab.json'), JSON.stringify(rows, null, 1), 'utf8');

  const c80 = coverage(rows, totalOcc, 0.80);
  const c95 = coverage(rows, totalOcc, 0.95);
  const hapax = rows.filter(r => r.count === 1).length;

  console.log('# אוצר המילים של הפירושים · מחלקה E');
  console.log('');
  console.log(`ערכים שנקראו: he=${perLang.he.entries} · en=${perLang.en.entries} · סה"כ ${perLang.he.entries + perLang.en.entries}`);
  console.log(`מופעים של מילות תוכן: he=${perLang.he.occurrences} · en=${perLang.en.occurrences} · סה"כ ${totalOcc}`);
  console.log(`מילות תוכן נבדלות: ${rows.length}`);
  console.log(`מילים שמכסות 80% מהמופעים: ${c80}`);
  console.log(`מילים שמכסות 95% מהמופעים: ${c95}`);
  console.log(`מילים שמופיעות פעם אחת בלבד: ${hapax} (${(hapax / rows.length * 100).toFixed(1)}%)`);
  console.log('');
  console.log('50 הראשונות:');
  for (let i = 0; i < Math.min(50, rows.length); i++) {
    console.log(`${String(i + 1).padStart(3)}. ${rows[i].word}  ×${rows[i].count}`);
  }
  console.log('');
  console.log(`נכתב: ${path.join(OUT_DIR, 'gloss-vocab.json')}`);
}

if (require.main === module) main();
module.exports = { mine, contentWords, buildStop, EXTRA_STOP };
