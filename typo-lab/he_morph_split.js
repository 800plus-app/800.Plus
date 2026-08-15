'use strict';
/* פיצול נטייה/גזירה · typo-lab/he_morph_split.js
 *
 *   node typo-lab/he_morph_split.js               → הטבלה, על **כל** המאגר העברי
 *   node typo-lab/he_morph_split.js --pool        → + out/morph-pool.json (מאגר המועמדים לפאנל)
 *   node typo-lab/he_morph_split.js --blind 40    → + out/semantic-blind.tsv (סט כיול עיוור)
 *   node typo-lab/he_morph_split.js --selftest    → שיניים
 *
 * ===== מה זה מודד, ובמה זה שונה מ-he_morph_30.js =====
 *
 * `he_morph_30.js` שאל "כמה מההטיות נדחות, וכמה מהדחיות פנויות" ומיזג את **כל 11
 * משפחות המשקלים** לשורה אחת. התשובה שם הייתה 96.7% פנויות · כלומר "התנגשות אינה
 * החסם". אבל דגימה ידנית מצאה שכ-60% מהפנויות **משנות משמעות**, ושער ההתנגשויות
 * עיוור לזה מהגדרתו: הוא שואל "האם זו תשובה של כרטיס אחר", לא "האם זו אותה משמעות".
 *
 * הקובץ הזה מפרק את אותה מדידה בדיוק ל**מחלקות טרנספורמציה**, כדי לבדוק אם הנזק
 * מרוכז בתת-קבוצה שאפשר לחתוך אותה. ההשערה שנבחנת:
 *
 *     ‏11 המשפחות מערבבות **נטייה** (אותה לקסמה, צורה אחרת · כעס↔לכעוס) עם
 *     **גזירה** (לקסמה אחרת · חלק→התחלק). אם מפצלים, תת-קבוצת הנטייה בטוחה.
 *
 * ⚠ ההשערה **אינה** מונחת. הקובץ מודד; הפאנל הסמנטי (שלב 3) מכריע.
 *
 * ===== שתי הבחנות שהקובץ מוסיף, וכל אחת שינתה מספר =====
 *
 * 1. **מחלקת הטרנספורמציה** · שבע מחלקות, ולא 11 משפחות ולא "שמרני/לא שמרני".
 *    ‏`CONSERVATIVE` של `morphrules.js` **אינה** הפיצול הזה: היא כוללת `pa-hit`
 *    (‏חלק→התחלק · שינוי בניין = לקסמה אחרת) ומוציאה `pa-inf` (‏כעס↔לכעוס · נטייה
 *    טהורה). כלומר היא מסננת לפי אינטואיציה אחרת, וההצלבה כאן מראה את זה במספרים.
 *
 * 2. **מקטע בן מילה אחת מול מקטע רב-מילי** · חוק `M3` שנמדד בסבב הקודם דורש
 *    ‏`wordsOf(typed).length === 1` בשני הצדדים. ‏`he_morph_30` לא הבחין, ולכן חלק
 *    מ-384 ה"פנויות" שלו הן מחרוזות ש-M3 **לעולם לא היה מקבל**. שתי השאלות נפרדות:
 *    "כמה פעמים התופעה קורית" (‏כל המקטעים) מול "מה חוק היה פותח" (‏מילה אחת).
 *
 * ===== למה זה שריד להחלפת המאגר בספטמבר =====
 *
 * אין כאן שום רשימה כתובה ביד. הקלט הוא `data.js` דרך ארגז החול, והפלט נבנה מחדש
 * בפקודה אחת. מה שכן יפוג: עמודת **תפוס** (צפיפות המאגר) ומאגר המועמדים עצמו.
 * מה שלא יפוג: **מחלקת הטרנספורמציה** ופסק הפאנל עליה · הם תכונה של העברית.
 */

const fs = require('fs');
const path = require('path');

const { loadApp } = require(path.join(__dirname, '..', 'tests', '_harness', 'sandbox.js'));
const { BINYAN_PAIRS, CONSERVATIVE, matchTemplate, fillTemplate } = require('./lib/morphrules.js');
const { rngFor, sample } = require('./lib/rng.js');

const ROOTD = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const LEX_PATH = path.join(ROOTD, 'typo-lex.js');
const LEX = fs.existsSync(LEX_PATH) ? require(LEX_PATH) : null;

const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');
const POOL = argv.includes('--pool');
const bi = argv.indexOf('--blind');
const BLIND = bi >= 0 ? Number(argv[bi + 1] || 40) : 0;
const say = s => process.stdout.write(s + '\n');

/* ===== מחלקות הטרנספורמציה =====
 * כל משפחת משקלים מקבלת מחלקה אחת. המחלקה מתארת **מה הטרנספורמציה עושה למשמעות**,
 * ולא איך היא נראית. שלוש הקבוצות למעלה הן ההשערה שנבחנת.
 *
 * ⛔ מקור: נכתב כאן, מהידע שלנו על העברית. לא ויקימילון, לא WordNet עברי, לא
 *    האקדמיה · הכלל העומד ב-CLAUDE.md אוסר את כולם.
 */
const XFORM = {
  /* קבוצה A · נטייה · אותה לקסמה בדיוק, צורה דקדוקית אחרת */
  'pa-inf':    { cls: 'INF',     grp: 'A', he: 'שם פועל ↔ פועל · אותו בניין', ex: 'כעס ↔ לכעוס' },
  'hit-inf':   { cls: 'INF',     grp: 'A', he: 'שם פועל ↔ פועל · אותו בניין', ex: 'התפשט ↔ להתפשט' },
  'pa-act':    { cls: 'PART',    grp: 'A', he: 'עבר ↔ בינוני · אותו בניין',   ex: 'רטן ↔ רוטן' },
  /* קבוצה B · גזירה שמשמרת תוכן · לקסמה אחרת, אותו אירוע/תכונה */
  'act-pa':    { cls: 'ACTNOUN', grp: 'B', he: 'שם פעולה ↔ הפועל',            ex: 'מרידה ↔ מרד' },
  'act-inf':   { cls: 'ACTNOUN', grp: 'B', he: 'שם פעולה ↔ שם הפועל',         ex: 'פשיטה ↔ לפשוט' },
  'hif-act':   { cls: 'ACTNOUN', grp: 'B', he: 'הפעיל ↔ הפעלה',               ex: 'השקיט ↔ השקטה' },
  'adj-abs':   { cls: 'ABSNOUN', grp: 'B', he: 'תואר ↔ שם מופשט',             ex: 'עייף ↔ עייפות' },
  /* קבוצה C · גזירה שמחליפה לקסמה · דיאתזה, סבילות, או תפקיד תחבירי אחר */
  'act-agent': { cls: 'AGENT',   grp: 'C', he: 'בינוני ↔ שם עושה (קטלן)',     ex: 'מורד ↔ מרדן' },
  'act-pass':  { cls: 'VOICE',   grp: 'C', he: 'בינוני פעיל ↔ סביל',          ex: 'שומר ↔ שמור' },
  'pa-hit':    { cls: 'BINYAN',  grp: 'C', he: 'שינוי בניין · פעל ↔ התפעל',   ex: 'חלק → התחלק' },
  'nif-pa':    { cls: 'BINYAN',  grp: 'C', he: 'שינוי בניין · נפעל ↔ פעל',    ex: 'דבר → נדבר' },
};
const GRP_HE = { A: 'נטייה · אותה לקסמה', B: 'גזירה משמרת-תוכן', C: 'גזירה מחליפת-לקסמה' };

/* שער השפיות · כל זוג בטבלה חייב מחלקה, אחרת המדידה מדווחת על תת-קבוצה בשקט. */
for (const pr of BINYAN_PAIRS) if (!XFORM[pr.id]) throw new Error('he_morph_split: זוג בלי מחלקה · ' + pr.id);

function ctx() {
  const c = loadApp({ lang: 'he' });
  if (LEX) c.window.TYPO_LEX = LEX;
  else throw new Error('typo-lex.js חסר · בלעדיו שכבת הסובלנות כבויה והמדידה חסרת משמעות');
  return c;
}

const strip = s => String(s).replace(/[֑-ׇ]/g, '');

/* ===== המנייה ===== */
function enumerate(c) {
  const bank = Array.from(c.BANK);

  /* יקום התשובות · מקטע מנורמל → הכרטיסים שהוא תשובה קבילה שלהם */
  const claim = new Map();
  for (const w of bank) for (const s of Array.from(c.meaningSegs(w.meaning))) {
    if (!s) continue;
    if (!claim.has(s)) claim.set(s, []);
    claim.get(s).push(w);
  }
  const allowOf = w => { const s = new Set([c.K(w.term)]); for (const t of Array.from(c.glossAlts(w))) s.add(c.K(t)); return s; };

  const glossWords = new Set();
  for (const s of claim.keys()) for (const w of s.split(' ')) if (w) glossWords.add(w);

  const lex = c.typoLex && c.typoLex();
  if (!lex) throw new Error('לקסיקון הריצה לא נטען · בלעדיו אין בוחן סבירות והמדידה חסרת ערך');
  const plausible = w => glossWords.has(w) || c.lexHit(w, 'he');

  const rows = [];
  let ctrl = 0, ctrlOk = 0;

  for (let ci = 0; ci < bank.length; ci++) {
    const card = bank[ci];
    const segs = Array.from(c.meaningSegs(card.meaning)).filter(Boolean);
    const allow = allowOf(card);
    const seen = new Set();
    for (const seg of segs) { ctrl++; if (c.meaningMatch(seg, card.meaning)) ctrlOk++; }
    for (const seg of segs) {
      const words = seg.split(' ').filter(Boolean);
      for (let wi = 0; wi < words.length; wi++) {
        for (const pr of BINYAN_PAIRS) {
          for (const [fromK, toK] of [['a', 'b'], ['b', 'a']]) {
            /* matchTemplate/fillTemplate של morphrules · לא מימוש שני. strictRoot=false
               כדי לשחזר בדיוק את מרחב he_morph_30 (שם fit() לא בדק אמות קריאה). */
            const root = matchTemplate(words[wi], pr[fromK], false);
            if (!root) continue;
            const alt = fillTemplate(pr[toK], root);
            if (!alt || alt === words[wi]) continue;
            if (!plausible(alt)) continue;
            const variant = words.slice(0, wi).concat([alt], words.slice(wi + 1)).join(' ');
            const dedup = variant + ' ' + pr.id;
            if (seen.has(dedup)) continue;
            seen.add(dedup);

            const live = c.meaningMatch(variant, card.meaning);
            const owners = live ? [] : (claim.get(variant) || []).filter(o => o !== card && !allow.has(c.K(o.term)));
            rows.push({
              id: 'M' + ci + '.' + rows.length,
              cardIdx: ci,
              term: strip(card.term),
              meaning: String(card.meaning),
              seg,
              segTokens: words.length,
              wordFrom: words[wi],
              wordTo: alt,
              variant,
              pair: pr.id,
              dir: fromK + '>' + toK,
              cls: XFORM[pr.id].cls,
              grp: XFORM[pr.id].grp,
              conservative: CONSERVATIVE.has(pr.id),
              status: live ? 'live' : (owners.length ? 'taken' : 'free'),
              owner: owners.length ? strip(owners[0].term) : '',
            });
          }
        }
      }
    }
  }
  return { rows, ctrl, ctrlOk, claimSize: claim.size, bankSize: bank.length };
}

/* ===== הדיווח ===== */
function tableBy(rows, keyOf, order, labelOf) {
  const g = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!g.has(k)) g.set(k, { n: 0, live: 0, free: 0, taken: 0, one: 0, oneFree: 0 });
    const b = g.get(k);
    b.n++; b[r.status]++;
    if (r.segTokens === 1) { b.one++; if (r.status === 'free') b.oneFree++; }
  }
  const keys = order ? order.filter(k => g.has(k)) : Array.from(g.keys()).sort();
  const lines = [];
  lines.push('| מחלקה | הטיות סבירות | מתקבלות היום | **פנויות** | תפוסות | מקטע מילה-אחת | מילה-אחת ופנויות |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const b = g.get(k);
    lines.push(`| ${labelOf ? labelOf(k) : k} | ${b.n} | ${b.live} | **${b.free}** | ${b.taken} | ${b.one} | ${b.oneFree} |`);
  }
  return lines.join('\n');
}

function main() {
  const c = ctx();
  const { rows, ctrl, ctrlOk, claimSize, bankSize } = enumerate(c);

  say('# פיצול נטייה/גזירה · כל המאגר העברי');
  say('');
  say(`מאגר · ${bankSize} כרטיסים · ${claimSize} מקטעי פירוש · ${rows.length} הטיות סבירות`);
  say('');
  say('## לפי קבוצת ההשערה');
  say('');
  say(tableBy(rows, r => r.grp, ['A', 'B', 'C'], k => `**${k}** · ${GRP_HE[k]}`));
  say('');
  say('## לפי מחלקת טרנספורמציה');
  say('');
  say(tableBy(rows, r => r.cls, ['INF', 'PART', 'ACTNOUN', 'ABSNOUN', 'AGENT', 'VOICE', 'BINYAN']));
  say('');
  say('## לפי משפחת משקלים');
  say('');
  say(tableBy(rows, r => r.pair, BINYAN_PAIRS.map(p => p.id),
    k => `${k} · ${XFORM[k].he}${CONSERVATIVE.has(k) ? ' · *CONSERVATIVE*' : ''}`));
  say('');
  say('## ההצלבה שמפריכה את `CONSERVATIVE`');
  say('');
  say('| | קבוצה A+B (‏ההשערה) | קבוצה C |');
  say('|---|---|---|');
  for (const flag of [true, false]) {
    const ab = rows.filter(r => r.conservative === flag && r.grp !== 'C').length;
    const cc = rows.filter(r => r.conservative === flag && r.grp === 'C').length;
    say(`| ‏\`CONSERVATIVE\` = ${flag} | ${ab} | ${cc} |`);
  }
  say('');
  say('אם השתיים היו אותה הבחנה, האלכסון היה מתאפס. הוא לא · ‏`CONSERVATIVE` כוללת');
  say('שינוי בניין (‏pa-hit) ומוציאה נטייה טהורה (‏pa-inf).');

  if (POOL || BLIND) {
    fs.mkdirSync(OUT, { recursive: true });
  }
  if (POOL) {
    const p = path.join(OUT, 'morph-pool.json');
    fs.writeFileSync(p, JSON.stringify({
      generated: 'typo-lab/he_morph_split.js --pool',
      bankSize, claimSize, nRows: rows.length, rows,
    }, null, 0), 'utf8');
    say('');
    say(`מאגר המועמדים נכתב · ${path.relative(ROOTD, p)} · ${rows.length} שורות`);
  }
  if (BLIND) {
    /* דגימה דטרמיניסטית · זרע קבוע, שם קבוע. שתי ריצות מפיקות אותו קובץ.
       הדגימה היא מ**כל** הפנויות ולא רק מקבוצה אחת · סט שדוגם רק ממה שאני מצפה
       שיהיה נקי אינו סט כיול אלא אישור עצמי. */
    const free = rows.filter(r => r.status === 'free');
    const picked = sample(rngFor('semantic-blind', 'he', 'v1'), free, BLIND)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    /* כותרת עמודת התווית נושאת את השאלה עצמה · בלעדיה המתייג אינו יודע מה לכתוב,
       ושורת הוראות נפרדת הייתה שוברת את הפירסור. אין בקובץ פסק של הפאנל ואין בו
       מחלקה · שניהם היו מזהמים את התיוג. */
    const tsv = ['id\tמילה בכרטיס\tהפירוש המקורי\tמה כתוב במאגר\tמה הלומד כתב\tהאם הלומד ידע את המילה? כ / ל / ?']
      .concat(picked.map(r => [r.id, r.term, r.meaning.replace(/[\t\n]/g, ' '), r.seg, r.variant, ''].join('\t')));
    const p = path.join(OUT, 'semantic-blind.tsv');
    fs.writeFileSync(p, '﻿' + tsv.join('\r\n') + '\r\n', 'utf8');
    say('');
    say(`סט הכיול העיוור נכתב · ${path.relative(ROOTD, p)} · ${picked.length} זוגות · בלי פסק ובלי מחלקה`);
  }

  if (SELFTEST) {
    say('');
    say('## שיניים');
    const ok1 = ctrl > 0 && ctrlOk === ctrl;
    say(`  ${ok1 ? '✅' : '⛔'} בקרה חיובית · ${ctrlOk}/${ctrl} מהפירושים המקוריים מתקבלים`);
    /* המחולל מייצר את הזוג המתועד של מקרה 4 */
    const r2 = matchTemplate('מורד', '1ו23', false);
    const ok2 = r2 && fillTemplate('123נ', r2) === 'מרדנ';
    say(`  ${ok2 ? '✅' : '⛔'} המחולל מייצר מורד → מרדנ (‏act-agent · קבוצה C)`);
    /* כל מחלקה מיוצגת · מחלקה ריקה פירושה שהמדידה עליה היא היעדר-מדידה */
    let t2 = true;
    const seenCls = new Set(rows.map(r => r.cls));
    const missing = ['INF', 'PART', 'ACTNOUN', 'ABSNOUN', 'AGENT', 'VOICE', 'BINYAN'].filter(x => !seenCls.has(x));
    say(`  ${missing.length ? '⛔' : '✅'} כל שבע המחלקות מיוצגות${missing.length ? ' · חסרות: ' + missing.join(',') : ''}`);
    /* שקילות מול he_morph_30 · אותו מרחב, מדגם 300 באותו צעד */
    const step = Math.max(1, Math.floor(bankSize / 300));
    const idx = new Set(); for (let i = 0; i < bankSize && idx.size < 300; i += step) idx.add(i);
    const sub = rows.filter(r => idx.has(r.cardIdx));
    const dedup = new Set(sub.map(r => r.cardIdx + ' ' + r.variant));
    /* ⛔ היה כאן `ℹ` ולכן לא יכל להאדים · המבקר תפס. ‏397 הוא פין שאומת
       מול הרצה חיה של `he_morph_30.js --n 300`, ומול הפרש סימטרי ריק
       שהמבקר חישב בעצמו. עכשיו הוא נופל בשמו אם המרחב ייסחף. */
    const PIN30 = 397;
    t2 = dedup.size === PIN30;
    say(`  ${t2 ? '✅' : '⛔'} שחזור מדגם 300 · ${dedup.size} ווריאציות נבדלות · פין ${PIN30} מ-he_morph_30`);
    /* דטרמיניזם · אותו זרע, אותה דגימה */
    const f = rows.filter(r => r.status === 'free');
    const s1 = sample(rngFor('semantic-blind', 'he', 'v1'), f, 40).map(r => r.id).join(',');
    const s2 = sample(rngFor('semantic-blind', 'he', 'v1'), f, 40).map(r => r.id).join(',');
    say(`  ${s1 === s2 ? '✅' : '⛔'} הדגימה דטרמיניסטית · אותו זרע ⇒ אותם 40 זוגות`);
    if (!(ok1 && ok2 && t2 && !missing.length && s1 === s2)) process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { XFORM, GRP_HE, enumerate, ctx };
