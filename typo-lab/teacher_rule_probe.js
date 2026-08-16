'use strict';
/* ⭐ בדיקת חוקי-הכרעה חלופיים למורה · typo-lab/teacher_rule_probe.js
 *
 *   node typo-lab/teacher_rule_probe.js
 *
 * ===== למה הקובץ הזה קיים =====
 *
 * ‏`teacher.js` מכויל ומדווח **אפס קבלות-שווא** על ארבעה סטים · וזה נכון. אבל אותה
 * מדידה בדיוק, כשמפצלים אותה לפי **כיוון**, מראה חור:
 *
 *   ‏en40 · כיוון `gloss` · דיוק 100.0% · recall 100.0%
 *   ‏en40 · כיוון `word`  · דיוק  50.0% · recall  25.0%
 *   ‏en2  · כיוון `word`  · דיוק  34.8% · recall   0.0%
 *
 * והמנגנון גלוי בפנקס: על **כל** שגיאת הקלדה אנגלית (`abacus`→`abavus`) שתי העדשות
 * שהשאלה שלהן מוגדרת אומרות `כ` — ‏T2 (אין מילה שגויה) ו-T3 (הטקסט מוביל למילה) —
 * ואילו ‏T5 ("האם זו מילה קיימת") אומרת `ל`, כי `abavus` **באמת** אינה מילה. חוק
 * פה-אחד הופך כל `ל` לדחייה, ולכן המורה דוחה ‏12 מתוך 12.
 *
 * ⭐ **זה אינו ממצא חדש — זה כתוב ב-`teacher.js` עצמו**, בהערה שמעל `decide`:
 * *"בכיוון `word` ... שם T5 מצביעה **הפוך**. מחרוזת שאינה מילה היא שגיאת הקלדה ⇒
 * הלומד ידע."* הקובץ ניסח את העיקרון, בנה עליו את `decideWordDir`, וב-16.8 **הסיר
 * את `decideWordDir`** אחרי ש-`en-blind2` הראה שהיא עושה 3 קבלות-שווא. ‏T5 נשארה
 * מצביעה בכיוון `word` — ולזה אין נימוק כתוב בשום מקום.
 *
 * ===== מה נבדק כאן, ומה **לא** =====
 *
 * ‏`teacher.js` **לא נגעו בו.** הקובץ הזה קורא את אותו פנקס ומחשב חוקי הכרעה
 * חלופיים מעליו, כדי שאפשר יהיה למדוד אותם מול אותה אמת מידה בדיוק.
 *
 *   R0 · החוק הנעול · כמו ש-`teacher.js` מכריע היום
 *   R1 · ‏T5 אינה חלה בכיוון `word` · שאר החוק זהה (כולל מכסת 3 עדשות)
 *   R2 · ‏R1 + מכסה של 2 עדשות בכיוון `word` בלבד
 *
 * ⛔⛔ **הסייג שאסור לבלוע · שלוש שכבות שלו:**
 *
 *   ‏1. ‏R1/R2 נמדדים על סטים ש**כבר נראו**. ‏`teacher.js` כותב את זה במפורש על
 *      עצמו: *"תיקון שנעשה על סמך סט שכבר נראה הופך אותו לבתוך-מדגם."* המספרים
 *      למטה הם **בתוך-מדגם** ואינם הכללה.
 *   ‏2. מה שכן מחזיק מחוץ למדגם הוא ה**מבנה**: ‏R1 אינו עוקף את הפאנל. ‏`decideWordDir`
 *      החזירה `accept` בענף `if (notWord)` **בלי להתייעץ באף עדשה**, ולכן היא קיבלה
 *      ‏3 שורות שבהן כל שלוש העדשות אמרו `ל`. ‏R1 רק **מוציא עדשה אחת מההצבעה**;
 *      כל `ל` של T2 או T3 עדיין דוחה. הבדיקה הזאת רצה למטה במפורש.
 *   ‏3. ⚠ ‏R1 **מוותר על הבטיחות ש-T5 קונה בכיוון `word`**. בפנקס: ‏E13–E18
 *      (`blend`→`bend` · `curve`→`cure`) הן מילים אמיתיות אחרות, ושם T5=`כ`
 *      **ואינה** מה שדוחה אותן — T2 ו-T3 דוחות. כלומר במדגם הזה T5 לא קנתה אף
 *      דחייה בכיוון `word`. זה נספר למטה ולא מוצהר.
 */

const fs = require('fs');
const path = require('path');
const T = require('./teacher.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

/* ===== חוקי ההכרעה · R0 הוא עותק מדויק של `decide` ב-teacher.js =====
 * ⚠ העותק אינו "בערך". השן למטה מאמתת אותו מול `T.decide` על כל שורה בכל סט,
 * וזורקת על אי-התאמה אחת. בלי זה, R0 היה יכול להיות חוק אחר שמתחזה לבסיס.
 */
const RULES = {
  R0: { name: 'נעול · כמו teacher.js', drops: () => false, quorum: () => 3 },
  R1: { name: 'T5 אינה חלה ב-word', drops: (l, it) => l === 'T5' && it.direction === 'word', quorum: () => 3 },
  R2: { name: 'T5 יוצאת + מכסה 2 ב-word', drops: (l, it) => l === 'T5' && it.direction === 'word', quorum: it => (it.direction === 'word' ? 2 : 3) },
};

function decideBy(rule, it, v) {
  if (!v) return 'unsure';
  if (T.isTautology(it)) return 'reject';
  if (it.direction === 'word' && T.isNominalization(it.term, it.typed)) return 'reject';
  const app = T.applicable(it).filter(l => !rule.drops(l, it));
  const got = app.filter(l => v[l]);
  if (app.some(l => v[l] === 'ל')) return 'reject';
  if (got.length < rule.quorum(it)) return 'unsure';
  if (got.length !== app.length) return 'unsure';
  return app.every(l => v[l] === 'כ') ? 'accept' : 'unsure';
}

/* ===== אמת המידה · בדיוק זו של `teacher.js --score` ===== */
const RULING_Q = it => (it.direction === 'gloss' ? 'כ' : 'ל');

function rowsOf(set) {
  const items = T.loadSet(set);
  const raw = fs.readFileSync(path.join(OUT, 'teacher', set + '.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  if (raw.length !== items.length) throw new Error(`${set}: ${raw.length} גולמיות מול ${items.length} פריטים`);
  const led = T.loadLedger(set);
  const { t: human } = T.humanTruth();
  return items.map((it, i) => {
    const r = raw[i];
    let lab = r.label != null ? r.label : human.get(r.id);
    if (lab === '?') lab = RULING_Q(it);
    return { it, id: r.id, truth: lab, v: led.get(it.h) || {} };
  }).filter(r => r.truth === 'כ' || r.truth === 'ל');
}

const SETS = ['en40', 'en2', 'nearneg24', 'neg24', 'calib'];

function score(rows, rule) {
  let tp = 0, fa = 0, fr = 0, tn = 0;
  for (const r of rows) {
    const d = decideBy(rule, r.it, r.v) === 'accept';
    if (r.truth === 'כ') { if (d) tp++; else fr++; } else { if (d) fa++; else tn++; }
  }
  const n = tp + fa + fr + tn;
  return { tp, fa, fr, tn, n, acc: n ? (tp + tn) / n : 0, recall: (tp + fr) ? tp / (tp + fr) : null };
}

function main() {
  /* ===== שן 0 · ‏R0 חייב להיות זהה ל-`teacher.js` על כל שורה ===== */
  let checked = 0;
  for (const set of SETS) {
    for (const r of rowsOf(set)) {
      const mine = decideBy(RULES.R0, r.it, r.v);
      const theirs = T.decide(r.it, r.v);
      if (mine !== theirs) throw new Error(`⛔ R0 סוטה מ-teacher.decide · ${set}/${r.id} · "${mine}" מול "${theirs}"`);
      checked++;
    }
  }
  say(`✅ שן · ‏R0 זהה ל-\`teacher.decide\` על ${checked} שורות בחמישה סטים`);
  /* ושן הפוכה · חוק שהוזז חייב **להיבדל**, אחרת ההשוואה ריקה */
  let differs = 0;
  for (const set of SETS) for (const r of rowsOf(set)) {
    if (decideBy(RULES.R0, r.it, r.v) !== decideBy(RULES.R2, r.it, r.v)) differs++;
  }
  if (!differs) throw new Error('⛔ R2 מכריע בדיוק כמו R0 על כל השורות · אין מה להשוות');
  say(`✅ שן · ‏R2 נבדל מ-R0 ב-${differs} שורות · ההשוואה אינה ריקה`);
  say('');

  say('# חוקי הכרעה חלופיים · כולם על אותו פנקס, בלי פסק חדש');
  say('');
  say('| סט | כיוון | n | חוק | דיוק | recall | ⛔ קבלות-שווא | דחיות-שווא |');
  say('|---|---|---:|---|---:|---:|---:|---:|');
  const totals = {};
  for (const set of SETS) {
    const all = rowsOf(set);
    for (const dir of ['word', 'gloss']) {
      const rows = all.filter(r => r.it.direction === dir);
      if (!rows.length) continue;
      for (const k of ['R0', 'R1', 'R2']) {
        const s = score(rows, RULES[k]);
        const t = totals[k] || (totals[k] = { tp: 0, fa: 0, fr: 0, tn: 0 });
        t.tp += s.tp; t.fa += s.fa; t.fr += s.fr; t.tn += s.tn;
        say(`| ${set} | ${dir} | ${s.n} | ${k} · ${RULES[k].name} | ${(100 * s.acc).toFixed(1)}% | ${s.recall == null ? '—' : (100 * s.recall).toFixed(1) + '%'} | ${s.fa === 0 ? '**0** ✅' : '**' + s.fa + '** ⛔'} | ${s.fr} |`);
      }
    }
  }
  say('');
  say('| חוק | דיוק כולל | recall כולל | ⛔ קבלות-שווא | דחיות-שווא |');
  say('|---|---:|---:|---:|---:|');
  for (const k of ['R0', 'R1', 'R2']) {
    const t = totals[k], n = t.tp + t.fa + t.fr + t.tn;
    say(`| ${k} · ${RULES[k].name} | ${(100 * (t.tp + t.tn) / n).toFixed(1)}% | ${(100 * t.tp / (t.tp + t.fr)).toFixed(1)}% | ${t.fa === 0 ? '**0** ✅' : '**' + t.fa + '** ⛔'} | ${t.fr} |`);
  }

  /* ===== ⭐ הבדיקה שקובעת · האם R1 מחזיר את כשל `decideWordDir` ===== */
  say('');
  say('## ⭐ האם ‏R1 מחזיר את שלוש קבלות-השווא של `decideWordDir`');
  say('');
  const en2 = rowsOf('en2');
  const bad = ['X20', 'X21', 'X27'];
  say('| מזהה | אמת | ‏R0 | ‏R1 | ‏R2 | העדשות |');
  say('|---|---|---|---|---|---|');
  for (const id of bad) {
    const r = en2.find(x => x.id === id);
    if (!r) { say(`| ${id} | — | — | — | — | ⚠ אינו בסט המתויג |`); continue; }
    const ls = T.applicable(r.it).map(l => `${l}=${r.v[l] || '—'}`).join(' ');
    say(`| ${id} | ${r.truth} | ${decideBy(RULES.R0, r.it, r.v)} | ${decideBy(RULES.R1, r.it, r.v)} | ${decideBy(RULES.R2, r.it, r.v)} | ${ls} |`);
  }

  /* ===== ⚠ מה T5 קונה בכיוון `word` · הצד שמאבדים ===== */
  say('');
  say('## ⚠ מה ‏T5 קונה בכיוון `word` · הדחיות שרק היא תפסה');
  let onlyT5 = 0, t5Rej = 0, wordN = 0;
  for (const set of SETS) for (const r of rowsOf(set)) {
    if (r.it.direction !== 'word') continue;
    wordN++;
    if (r.v.T5 !== 'ל') continue;
    t5Rej++;
    const others = T.applicable(r.it).filter(l => l !== 'T5');
    if (!others.some(l => r.v[l] === 'ל')) onlyT5++;
  }
  say('');
  say(`‏${wordN} שורות בכיוון \`word\` בחמשת הסטים · ‏T5 אמרה \`ל\` על ${t5Rej} מהן · ומתוכן **${onlyT5}** שאף עדשה אחרת לא דחתה.`);
  say(`כלומר ‏R1 משנה את הפסק על **${onlyT5}** שורות בדיוק, וכל השאר נדחות ממילא.`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ⛔⛔ **‏`isNominalization` יורה על שגיאות הקלדה רגילות** · `--nominal`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node typo-lab/teacher_rule_probe.js --nominal
 *
 * וטו שם-הפעולה הוא המימוש המבני של **הכרעת חגי מ-16.8**: בכיוון `word` הלומד
 * צריך את הצורה המדויקת, ולכן `decide`→`decision` נדחה. ההכרעה נכונה. ⛔ **המימוש
 * תופס גם דבר אחר לגמרי.**
 *
 * ‏`isNominalization` משווה את **הזנבות הנבדלים** ושואל אם בדיוק אחד מהם "נראה
 * נומינלי". שגיאת הקלדה ש**פוגעת בסיומת נומינלית** מהפכת בדיוק צד אחד:
 *
 *   ‏`accomplishment`→`accomplishent`  זנבות ‎[ment|ent]‎  ⇒ ⛔ נחשב גזירה
 *   ‏`explanation`   →`explanaion`     זנבות ‎[tion|ion]‎  ⇒ ⛔ נחשב גזירה
 *   ‏`leisure`       →`leisre`         זנבות ‎[ure|re]‎    ⇒ ⛔ נחשב גזירה
 *
 * ⚠ ‏`teacher.js` כבר מתעד **קבלת-שווא אחת** ידועה מהמשפחה הזאת (`advantage`→
 * `advantwge` · X32) וכותב "הבאג מתועד וממתין לסט השלישי". **הסט השלישי הגיע.**
 * המנייה למטה היא על כל `en-word`, ממחולל אחר לגמרי.
 *
 * ⭐ **השומר המוצע · חסר-לקסיקון, ולכן נקי משפטית** (‏`CLAUDE.md` אוסר לקסיקון
 * חיצוני, ו-`typo-lex.js` אינו מילון אנגלי אלא רשימת ווטו ממוקדת — נבדק:
 * ‏`animal` · `leisure` · `advantage` כולן מחזירות `false`):
 *
 *   בגזירה אמיתית שני הזנבות **אינם דומים** — ‎[de|sion]‎ · ‎[|ment]‎ · ‎[oy|uction]‎.
 *   בשגיאת הקלדה שפגעה בסיומת הם רחוקים **עריכה אחת** — ‎[ment|ent]‎ · ‎[ure|re]‎.
 *
 * ⚠ הסייג: `animal`→`animla` הוא **שיכול** (מרחק 2) ועדיין חומק. שומר שמוסיף
 * בדיקת שיכול היה תופס אותו בלי לפגוע ב-`arrive`→`arrival` (גם הוא מרחק 2, אבל
 * אינו שיכול). לא נמדד כאן.
 */
function editDist(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function diffTails(a, b) {
  const x = String(a).toLowerCase(), y = String(b).toLowerCase();
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return [x.slice(i), y.slice(i)];
}
const typoGuard = (a, b) => { const [x, y] = diffTails(a, b); return editDist(x, y) <= 1; };

function nominal() {
  const rows = fs.readFileSync(path.join(OUT, 'dataset-en.jsonl'), 'utf8').split('\n')
    .filter(Boolean).map(l => JSON.parse(l)).filter(r => r.set === 'en-word');

  say('# ⛔ וטו שם-הפעולה · מנייה מלאה על `en-word`');
  say('');
  say('| זוג | זנבות | מרחק | `isNominalization` | השומר המוצע |');
  say('|---|---|---:|---|---|');
  const probe = [['decide', 'decision'], ['arrive', 'arrival'], ['govern', 'government'], ['destroy', 'destruction'],
    ['accomplishment', 'accomplishent'], ['explanation', 'explanaion'], ['leisure', 'leisre'],
    ['advantage', 'advantwge'], ['animal', 'animla']];
  for (const [a, b] of probe) {
    const [x, y] = diffTails(a, b);
    say(`| \`${a}\` → \`${b}\` | ‎[${x || '∅'}|${y || '∅'}]‎ | ${editDist(x, y)} | ${T.isNominalization(a, b) ? '⛔ גזירה' : '✅ לא'} | ${typoGuard(a, b) ? 'שגיאת הקלדה' : 'גזירה'} |`);
  }

  let fire = 0, fireAcc = 0, sup = 0, supAcc = 0, keptAcc = 0;
  const ex = [];
  for (const r of rows) {
    if (!T.isNominalization(r.term, r.typed)) continue;
    fire++;
    const isAcc = r.label === 'accept';
    if (isAcc) { fireAcc++; if (ex.length < 8) ex.push(`\`${r.typed}\`~${r.term}`); }
    if (typoGuard(r.term, r.typed)) { sup++; if (isAcc) supAcc++; }
    else if (isAcc) keptAcc++;
  }
  say('');
  say(`‏${rows.length} שורות \`en-word\`. הווטו יורה על **${fire}** מהן, ומתוכן **${fireAcc}** (‏${(100 * fireAcc / fire).toFixed(1)}%) מתויגות \`accept\` בדאטהסט.`);
  say('');
  say(`דוגמאות: ${ex.join(' · ')}`);
  say('');
  say('| | ירי | מהן `accept` |');
  say('|---|---:|---:|');
  say(`| היום | ${fire} | **${fireAcc}** ⛔ |`);
  say(`| עם השומר | ${fire - sup} | **${keptAcc}** |`);
  say('');
  say(`⭐ השומר מדכא ${sup} ירי, מהם **${supAcc}** על שורות \`accept\` · הירי השגוי יורד מ-${fireAcc} ל-${keptAcc}.`);
  say(`⚠ ומחירו: ${sup - supAcc} שורות \`reject\` שהוא מפסיק לדחות דרך הווטו הזה (הן עדיין עוברות את שאר הפאנל).`);
}

if (require.main === module) { if (process.argv.includes('--nominal')) nominal(); else main(); }
module.exports = { decideBy, RULES, rowsOf, score, typoGuard, diffTails, editDist };
