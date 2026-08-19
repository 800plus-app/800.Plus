'use strict';
/* טבלת זהב ייעודית לגן `segConcat` · typo-lab/make_golden_segconcat.js
 *
 *   node typo-lab/make_golden_segconcat.js            → out/golden.segconcat.jsonl
 *   node typo-lab/make_golden_segconcat.js --selftest → שיניים
 *
 * ===== למה טבלה שנייה ולא הרחבת הראשונה =====
 * ‏`golden.SEGCONCAT.jsonl` שהופק מהזהב הראשי יצא **זהה ביט-אחר-ביט** לזהב
 * הנשלח: הזהב נדגם מ-`dataset-*.jsonl`, ואין בו אף שורה שהיא צירוף חלקי של שני
 * מקטעים. כלומר הגן היה נשלח **בלי שומר התנהגותי**.
 * ⛔ והתיקון אינו לייצר מחדש את הדאטהסט: זה מזיז 10,000 החלטות שאין להן קשר
 * למועמד, מפיל את `tests/71` על כל הקו, ומערבב את השינוי עם רעש — והתלמיד גם
 * אומן על הדאטהסט הזה. לכן טבלה **שנייה, קטנה וייעודית**.
 *
 * ===== שתי עמודות, ולמה =====
 * כל שורה נושאת `off` ו-`on`:
 *   `off` · הפסק של `app.js` **היום** · `meaningMatch(typed, meaning, card)`
 *   `on`  · הפסק **אחרי ההדבקה** · בדיוק השורה שבמפרט:
 *           ‏`off || (typoSegConcat(segs, card).has(a) && !blocked)`
 * ‏`tests/71` בוחרת את העמודה לפי מצב הדגל ב-`app.js` בפועל, ודורשת התאמה
 * מדויקת. כך הבדיקה **חיה בשני המצבים** ואינה מדלגת אף פעם — לפני ההדבקה היא
 * מקבעת את התנהגות היום, ואחריה את התנהגות המועמד.
 *
 * ⚠ והשן שמחזיקה את הכל: שתי העמודות חייבות **להיבדל**. אם הן זהות, הטבלה אינה
 * שומר — וזה בדיוק מה שקרה לזהב הראשי.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { fnv1a } = require('./lib/rng.js');
const { isVetoedSeg } = require('./lib/veto.js');
const { buildVeto } = require('./lib/veto.js');

const OUT = path.join(__dirname, 'out');
const FILE = path.join(OUT, 'golden.segconcat.jsonl');
const N_ACCEPT = 200;             // צירופים חלקיים שהגן מקבל
const N_REJECT = 100;             // מחרוזות בצורת צירוף שנשארות דחויות
const N_TODAY = 40;               // צירוף מלא · כבר מתקבל היום · עוגן רגרסיה
const SEG_CONCAT_MAX = 5;         // זהה ל-lib/checker.js ול-מפרט

/* שיקוף מדויק של `typoSegConcat` מהמפרט · רצופים ובסדרם, בלי הצירוף המלא. */
function concatForms(segs, card, ctx) {
  const use = segs.slice(0, SEG_CONCAT_MAX);
  const out = new Set();
  if (use.length < 2) return out;
  const full = segs.join(' ');
  for (let i = 0; i < use.length; i++) {
    for (let j = i + 1; j < use.length; j++) {
      const s = use.slice(i, j + 1).join(' ');
      if (s !== full) out.add(s);
    }
  }
  const own = ctx.K(card && card.term);
  for (const e of EXCEPT) if (ctx.K(e.term) === own) out.delete(ctx.norm(e.typed));
  return out;
}
const EXCEPT = [{ term: 'tie', typed: 'לקשור קשר' }];

function build() {
  const CTX = { he: getCtx('he'), en: getCtx('en') };
  const VET = { he: buildVeto(CTX.he, 'he'), en: buildVeto(CTX.en, 'en') };

  const verdicts = (ctx, veto, card, typed) => {
    const off = !!ctx.meaningMatch(typed, card.meaning, card);
    const a = ctx.norm(typed);
    const segs = Array.from(ctx.meaningSegs(card.meaning));
    const hit = !!a && concatForms(segs, card, ctx).has(a) && !isVetoedSeg(a, card, veto, ctx);
    return { off, on: off || hit, by: (!off && hit) ? 'seg-concat' : null };
  };

  /* המקור · שורות ה-`seg-concat` שכבר קיימות בקורפוס, ולא ייצור חדש */
  const pool = [];
  for (const f of ['answers-he.jsonl', 'answers-en.jsonl']) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) throw new Error(`make_golden_segconcat: ${f} חסר · הרץ קודם gen_answers.js`);
    for (const l of fs.readFileSync(p, 'utf8').trim().split('\n')) {
      const r = JSON.parse(l);
      if (r.source_class === 'seg-concat') pool.push(r);
    }
  }
  const byCard = new Map();
  for (const L of ['he', 'en']) for (const w of Array.from(CTX[L].BANK)) byCard.set(L + '' + String(w.term) + '' + String(w.meaning), w);

  const acc = [], rej = [], today = [];
  for (const r of pool) {
    const ctx = CTX[r.lang];
    const card = byCard.get(r.lang + '' + String(r.card_term) + '' + String(r.card_gloss));
    if (!card) continue;
    const v = verdicts(ctx, VET[r.lang], card, r.typed);
    const row = {
      set: 'gloss-segconcat', lang: r.lang, term: String(card.term), unit: String(card.unit == null ? '' : card.unit),
      meaning: String(card.meaning), typed: r.typed,
      /* ⚠ שלוש קבוצות ולא שתיים · שורה שכבר מתקבלת היום (צירוף **מלא** · norm
         מסירה את הפסיק ולכן היא שווה ל-norm(meaning)) אינה "נדחית", והכללתה
         תחת `reject` הייתה תווית שקרית. השער ה' תפס את זה. */
      group: v.off ? 'accept-today' : (v.on ? 'accept-partial' : 'reject'),
      off: { ok: v.off }, on: { ok: v.on, by: v.by },
    };
    (row.group === 'accept-partial' ? acc : row.group === 'reject' ? rej : today).push(row);
  }
  /* דגימה דטרמיניסטית · מיון לפי fnv של החתימה, בלי Math.random */
  const key = r => fnv1a(r.lang + '' + r.term + '' + r.typed);
  const pick = (arr, n) => arr.slice().sort((a, b) => key(a) - key(b) || (a.typed < b.typed ? -1 : 1)).slice(0, n);
  const rows = pick(acc, N_ACCEPT).concat(pick(rej, N_REJECT)).concat(pick(today, N_TODAY));

  /* ⭐ הקבוצה השלישית · החריג. בלי השורה הזאת החריג עצמו חסר שומר. */
  const en = CTX.en;
  const tie = Array.from(en.BANK).find(w => en.K(w.term) === en.K('tie'));
  if (!tie) throw new Error('make_golden_segconcat: הכרטיס tie לא אותר · החריג חסר שומר');
  const tv = verdicts(en, VET.en, tie, 'לקשור קשר');
  if (tv.on) throw new Error('make_golden_segconcat: החריג אינו חוסם · "לקשור קשר" מתקבל על tie');
  rows.push({
    set: 'gloss-segconcat', lang: 'en', term: String(tie.term), unit: String(tie.unit == null ? '' : tie.unit),
    meaning: String(tie.meaning), typed: 'לקשור קשר', group: 'exception',
    off: { ok: tv.off }, on: { ok: tv.on, by: tv.by },
  });

  rows.sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : 0) || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0) || (a.typed < b.typed ? -1 : 1));
  const text = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
  const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  const diff = rows.filter(r => r.off.ok !== r.on.ok).length;
  return { rows, text, sha, diff, pool: pool.length, acc: acc.length, rej: rej.length, today: today.length };
}

function selftest() {
  const out = [];
  let all = true;
  const ok = (n, p, note) => { all = all && p; out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${note ? '  · ' + note : ''}`); };

  const b = build();
  ok('א · הטבלה אינה ריקה', b.rows.length > 100, `${b.rows.length} שורות · מאגר ${b.pool}`);
  const g = k => b.rows.filter(r => r.group === k).length;
  ok('ב · ארבע הקבוצות מיוצגות', g('accept-partial') > 0 && g('reject') > 0 && g('exception') === 1 && g('accept-today') > 0,
    `accept-partial=${g('accept-partial')} reject=${g('reject')} accept-today=${g('accept-today')} exception=${g('exception')}`);
  /* ⭐ השן המרכזית · שתי העמודות חייבות להיבדל, אחרת הטבלה אינה שומר */
  ok('ג · ⛔ שן · העמודות `off` ו-`on` נבדלות', b.diff > 0, `${b.diff} שורות מתהפכות`);
  ok('ד · כל שורות `accept-partial` מתהפכות', b.rows.filter(r => r.group === 'accept-partial').every(r => !r.off.ok && r.on.ok));
  ok('ה · כל שורות `reject` נשארות דחויות בשתי העמודות', b.rows.filter(r => r.group === 'reject').every(r => !r.off.ok && !r.on.ok));
  ok('ה2 · כל שורות `accept-today` מתקבלות בשתי העמודות', b.rows.filter(r => r.group === 'accept-today').every(r => r.off.ok && r.on.ok));
  const ex = b.rows.find(r => r.group === 'exception');
  ok('ו · ⭐ החריג · `tie` ← "לקשור קשר" דחוי בשתי העמודות', ex && !ex.off.ok && !ex.on.ok, ex ? ex.term : '—');
  const b2 = build();
  ok('ז · דטרמיניזם · שתי בניות, אותו SHA', b2.sha === b.sha, b.sha.slice(0, 16));

  process.stdout.write(out.join('\n') + '\n' + (all ? '\n✅ כל השערים עברו\n' : '\n⛔ שער נכשל\n'));
  return all;
}

module.exports = { build, concatForms, selftest, FILE };

if (require.main === module) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const b = build();
  fs.writeFileSync(FILE, b.text, 'utf8');
  const g = k => b.rows.filter(r => r.group === k).length;
  process.stdout.write(`golden.segconcat.jsonl · ${b.rows.length} שורות · ${b.sha.slice(0, 16)}…\n`);
  process.stdout.write(`  accept-partial ${g('accept-partial')} · reject ${g('reject')} · exception ${g('exception')}\n`);
  process.stdout.write(`  ⭐ ${b.diff} שורות מתהפכות בין off ל-on · זה מה שהופך את הטבלה לשומר\n`);
}
