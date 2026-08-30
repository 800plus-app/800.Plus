'use strict';
/* צמדים שחולקים פירוש · מיפוי · הצעה · החלה  ·  typo-lab/gloss_pairs.js
 *
 * ⛔ למה הכלי הזה קיים
 * --------------------
 * במאגר הנשלח (`data.js`) יש ערכים שונים שנושאים **בדיוק אותו פירוש**. הלומד
 * שרואה את הפירוש אינו יכול לדעת איזו מילה נדרשת, ושתי התשובות מתקבלות.
 * המאגר הממתין (`units_output/unit-*-hebrew.md`) כבר הפריד חלק מהם.
 *
 * ⭐ **הכלל שהכלי אוכף: קבוצה מוחלפת שלמה או בכלל לא.** החלפה של איבר אחד
 * משאירה את השני על הפירוש המשותף — ואת ההתנגשות במקום.
 *
 * ⚠ **אפס התנגשויות גולמיות אינו אפס נזק.** `meaningSegs` מפרק פסיקים ומסיר
 * סוגריים, ו-`typoCanon` מקנוננת. «עני מרוד, חסר כול» ו«עני מרוד (כבשת הרש)»
 * הן מחרוזות שונות ואותה מחלקה קנונית. לכן כל הצעה נבדקת **מקנוננת**, מול
 * המאגר כולו, לפני שהיא מוצעת.
 *
 * ⛔ **הכלי אינו ממציא פירוש.** מה שאין לו חלופה מוכנה בעץ — מסומן ולא נוגעים בו.
 *
 * שימוש:
 *   node typo-lab/gloss_pairs.js              דוח בלבד (ברירת מחדל · לא כותב)
 *   node typo-lab/gloss_pairs.js --manifest   כותב out/gloss-pairs.json
 *   node typo-lab/gloss_pairs.js --apply      מחליף ב-data.js + כותב מניפסט
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data.js');
const OUT = path.join(__dirname, 'out');
const MANIFEST = path.join(OUT, 'gloss-pairs.json');
const UNITS = path.join(ROOT, 'units_output');

/* ---- הקשר זמן-הריצה · מורם מ-tests/71 בדיוק כמו check_canon_clash.js ---- */
function heCtx() {
  const T = path.join(ROOT, 'tests', '71-typo-tolerance.test.js');
  const src = fs.readFileSync(T, 'utf8');
  const head = src.slice(0, src.indexOf('const HE = ctxFor'))
    .replace(/^const \{ test, describe \}.*$/m, 'const { test, describe } = { test(){}, describe(){} };');
  const m = new Module(T, null);
  m.filename = T; m.paths = Module._nodeModulePaths(path.dirname(T));
  m._compile(head + '\nmodule.exports = { ctxFor };\n', T);
  return m.exports.ctxFor('he');
}

/* ---- המאגר הנשלח ---- */
function loadShipped() {
  const win = {};
  new Function('window', fs.readFileSync(DATA, 'utf8'))(win);
  const rows = [];
  for (const unit of Object.keys(win.UNIT_DATA))
    for (const [term, gloss] of win.UNIT_DATA[unit]) rows.push({ unit, term, gloss });
  return rows;
}

/* ---- המאגר הממתין · units_output/unit-N-hebrew.md + unit-1-flat.md ---- */
const stripNiqqud = s => s.normalize('NFC')
  .replace(/[\u0591-\u05C7]/g, '').replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim();

function loadPending() {
  const map = new Map();
  for (const f of fs.readdirSync(UNITS).filter(f => /^unit-\d+-hebrew\.md$|^unit-1-flat\.md$/.test(f))) {
    for (const L of fs.readFileSync(path.join(UNITS, f), 'utf8').split(/\r?\n/)) {
      const m = L.match(/^\|\s*\d+\s*\|([^|]+)\|([^|]+)\|\s*$/);
      if (!m) continue;
      const k = stripNiqqud(m[1]);
      if (!map.has(k)) map.set(k, { gloss: m[2].trim(), src: f });
    }
  }
  return map;
}

/* ---- קבוצות שחולקות פירוש · הגדרה: מחרוזת הפירוש זהה בדיוק ---- */
/* ⛔ עצורות ביד · קבוצות שהחלופה שלהן מוכנה ובכל זאת לא נוגעים בהן.
   ⚠ הסיבה אינה איכות הפירוש — היא תלות חיצונית שהחלפה שוברת. */
const HOLD = {
  'אור, זוהר': 'טבלאות הזהב של tests/71 נשענות על הפירוש הזה · המקטע «אור» ו-segConcat על נְהָרָה. '
    + 'החלפה מפילה שתי בדיקות שקילות שאינן נוגעות לצמד. ⛔ הזהב אינו נדרס כאן '
    + '(regen_golden.js §שלב 1) — הקבוצה ממתינה לרגנרציה מסודרת של הזהב.'
};

function groupsOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = String(r.gloss).trim();
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return [...by.entries()].filter(([, v]) => v.length > 1)
    .map(([gloss, members]) => ({ gloss, members }))
    .sort((a, b) => b.members.length - a.members.length || a.gloss.localeCompare(b.gloss, 'he'));
}

function main() {
  const mode = process.argv[2] || '--report';
  const ctx = heCtx();
  const rows = loadShipped();
  const pending = loadPending();
  const groups = groupsOf(rows);

  /* אינדקס קנוני של המאגר **לפני** כל שינוי · canon → בעלי המחלקה */
  const idx = new Map();
  for (const r of rows)
    for (const s of Array.from(ctx.meaningSegs(r.gloss))) {
      const k = ctx.typoCanon(s);
      if (!idx.has(k)) idx.set(k, new Set());
      idx.get(k).add(ctx.K(r.term));
    }

  const plan = [];
  for (const g of groups) {
    const own = new Set(g.members.map(m => ctx.K(m.term)));
    const members = g.members.map(m => {
      const p = pending.get(stripNiqqud(m.term));
      return { unit: m.unit, term: m.term, from: m.gloss, to: p ? p.gloss : null, src: p ? p.src : null };
    });
    const missing = members.filter(m => !m.to).map(m => m.term);
    let block = missing.length ? 'אין חלופה מוכנה בבנק הממתין: ' + missing.join(' · ') : null;
    if (!block && HOLD[g.gloss]) block = 'עצורה ביד: ' + HOLD[g.gloss];

    if (!block) {
      /* התנגשות **מקנוננת** · בתוך הקבוצה ומול שאר המאגר */
      const seen = new Map();
      const clashes = [];
      for (const m of members) {
        for (const s of Array.from(ctx.meaningSegs(m.to))) {
          const k = ctx.typoCanon(s);
          if (seen.has(k) && seen.get(k) !== m.term)
            clashes.push(`«${s}» משותפת ל-${seen.get(k)} ול-${m.term}`);
          seen.set(k, m.term);
          const holders = [...(idx.get(k) || [])].filter(x => !own.has(x));
          if (holders.length) clashes.push(`«${s}» נכנסת למחלקה תפוסה · ${holders.slice(0, 3).join(' · ')}`);
        }
      }
      if (clashes.length) block = 'התנגשות מקנוננת: ' + clashes.join(' | ');
    }

    /* ⚠ אזהרה · לא חסימה. שתי מחרוזות יכולות להיות מחלקות קנוניות שונות ועדיין
       לא להפריד לאדם: «סיכן חייו ביודעין» מוכל במילותיו של «סיכן את חייו ביודעין».
       הכלי מסמן את זה ומשאיר את ההכרעה לאדם — הוא אינו ממציא ניסוח חלופי. */
    const near = [];
    if (!block) {
      const bag = members.map(m => ({
        term: m.term,
        set: new Set(Array.from(ctx.meaningSegs(m.to)).flatMap(s => ctx.typoCanon(s).split(/\s+/)).filter(Boolean))
      }));
      for (let i = 0; i < bag.length; i++) for (let j = i + 1; j < bag.length; j++) {
        const a = bag[i], b = bag[j];
        const sub = x => [...x.set].every(t => (a === x ? b : a).set.has(t));
        if (a.set.size && b.set.size && (sub(a) || sub(b)))
          near.push(`${a.term} ⟷ ${b.term} · מילות פירוש אחת מוכלות בשנייה`);
      }
    }
    plan.push({ gloss: g.gloss, size: g.members.length, members, block, near });
  }

  const ready = plan.filter(p => !p.block);
  const held = plan.filter(p => p.block);
  for (const p of plan) {
    const mark = p.block ? '⛔' : (p.near.length ? '⚠' : '✅');
    console.log(`${mark} [${p.size}] «${p.gloss}»${p.block ? '  — ' + p.block : ''}` +
      (p.near.length ? '  — הופרד קנונית אך עדיין קרוב: ' + p.near.join(' | ') : ''));
    for (const m of p.members)
      console.log(`      ${m.term} (יח' ${m.unit})  ⟶  ${m.to ? '«' + m.to + '» [' + m.src + ']' : '— אין'}`);
  }
  const pairs = plan.filter(p => p.size === 2).length;
  console.log(`\nקבוצות חולקות-פירוש: ${plan.length} (${pairs} צמדים · ${plan.length - pairs} שלשות)` +
    ` · מילים מעורבות: ${plan.reduce((a, p) => a + p.size, 0)}`);
  console.log(`מוכנות להחלפה שלמה: ${ready.length} (מהן ${ready.filter(p => p.near.length).length} עדיין קרובות) · נעצרו: ${held.length}`);

  if (mode === '--report') return 0;

  fs.mkdirSync(OUT, { recursive: true });
  if (mode === '--apply') {
    let src = fs.readFileSync(DATA, 'utf8');
    /* ⚠ `data.js` בעץ הזה הוא CRLF. תפירה עם `\n` קשיח נותנת 0 התאמות ונראית
       כמו «המילה לא נמצאה». סוף השורה נגזר מהקובץ עצמו ולא מניחים אותו. */
    const EOL = src.includes('\r\n') ? '\r\n' : '\n';
    let n = 0;
    for (const p of ready) for (const m of p.members) {
      const needle = JSON.stringify(m.term) + ',' + EOL + '   ' + JSON.stringify(m.from);
      const hits = src.split(needle).length - 1;
      if (hits !== 1) { console.error(`⛔ ${m.term}: ${hits} התאמות — לא נגעתי`); return 1; }
      src = src.replace(needle, JSON.stringify(m.term) + ',' + EOL + '   ' + JSON.stringify(m.to));
      n++;
    }
    fs.writeFileSync(DATA, src);
    console.log(`\n⭐ הוחלפו ${n} פירושים ב-data.js (${ready.length} קבוצות שלמות)`);
  }

  /* המניפסט · מקור האמת של השער. גם הקבוצות שנעצרו נרשמות — הן
     עדיין חולקות פירוש, והשער חייב לדעת שהן קיימות.
     ⚠ **מיזוג, לא דריסה.** אחרי החלה, קבוצה שהוחלפה כבר אינה חולקת
     פירוש ולכן לא תימצא במיפוי הבא. כתיבה דורסת הייתה מוחקת אותה
     מהמניפסט — ומכבה את השער על בדיוק הקבוצות שהוא נועד לשמור. */
  const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).groups : [];
  const keep = new Map(prev.map(g => [g.shared, g]));
  for (const p of plan) keep.set(p.gloss, {
    shared: p.gloss, blocked: p.block || null, near: p.near.length ? p.near : undefined,
    applied: (mode === '--apply' && !p.block) || (keep.get(p.gloss) || {}).applied === true,
    members: p.members.map(m => ({ unit: m.unit, term: m.term, from: m.from, to: m.to }))
  });
  fs.writeFileSync(MANIFEST, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    note: 'קבוצה מוחלפת שלמה או בכלל לא · השער: typo-lab/gate_gloss_pairs.js',
    groups: [...keep.values()]
  }, null, 1) + '\n');
  console.log(`מניפסט: ${path.relative(ROOT, MANIFEST)}`);
  return 0;
}
process.exit(main());
