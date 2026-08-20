'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐⛔ **הכרזה מראש · חוק ההכרעה שייבחן על `en-blind3`** · 19.8.2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node typo-lab/blind3_verdict.js            · הפסק · דורש תיוגים ופנקס
 *   node typo-lab/blind3_verdict.js --declare  · מדפיס את ההכרזה בלבד · לא מודד
 *
 * ⛔⛔ **הקובץ הזה נכתב ונכנס לקומיט לפני שהורצה שורה אחת על `en-blind3`,
 * ולפני שקיים לו פנקס פסקים בכלל.** זו כל הנקודה שלו. הקריטריון יושב **בקוד**
 * ולא בפרוזה, כדי ששינוי שלו אחרי שנראתה התוצאה יופיע ב-diff ולא ייבלע.
 *
 * ═══ למה הכרזה, ולמה דווקא כאן ═══
 *
 * ‏`en-blind2` נשרף בדיוק ככה: חוק (`decideWordDir`) נבחר, נמדד עליו, ואז
 * נשפט לפיו. ‏`teacher.js` כותב את זה על עצמו — *"תיקון שנעשה על סמך סט שכבר
 * נראה הופך אותו לבתוך-מדגם"* — ובכל זאת ‏R1/R2 נמדדו על `en40` ו-`en2`
 * **אחרי** שנראו. המספרים שם (‏`en40/word` 25%→100% · `en2/word` 0%→100%)
 * הם בתוך-מדגם ואינם ראיה.
 *
 * ‏`en-blind3` הוא הסט היחיד שנשאר נקי: ננעל על `7ad6c35` לפני שנדגמה שורה,
 * ‏40 שורות, ואיש לא הריץ עליו כלום. הוא נשרף ברגע שמישהו יריץ עליו חוק
 * ואז יחליט מה הקריטריון. לכן הקריטריון מוכרז **עכשיו**.
 *
 * ═══ ⭐ המתמודד · בדיוק אחד ═══
 *
 *   **R2** · ‏`T5` **אינה מצביעה** בכיוון `word` · והמכסה שם יורדת ל-2 עדשות.
 *
 * ⚠ **המכסה היא חלק מהמתמודד ואינה תוספת.** נמדד: ‏R1 (מוציא את T5 ומשאיר
 * מכסת 3) הוא **no-op מוחלט** — 0 שורות משתנות בחמשת הסטים — כי בכיוון `word`
 * נשארות רק T2 ו-T3, ומכסת 3 מפילה אותן ל-`unsure`. חוק שמוציא עדשה חייב
 * להוריד את המכסה, אחרת הוא לא חוק אלא השבתה.
 *
 * ⛔ **מה **לא** משתנה ב-R2**, ובכוונה:
 *   · וטו הטאוטולוגיה · כשהיה, בכיוון `gloss`.
 *   · וטו שם-הפעולה (הכרעת חגי 16.8) · כשהיה, בכיוון `word`.
 *   · **כל `ל` של עדשה חלה עדיין דוחה.** ‏R2 אינו עוקף את הפאנל — הוא מוציא
 *     עדשה אחת מההצבעה. זה ההבדל מ-`decideWordDir`, שהחזירה `accept` בענף
 *     ‏`if (notWord)` בלי להתייעץ באף עדשה וקיבלה 3 שורות שכולן אמרו `ל`.
 *   · כיוון `gloss` · לא נגוע כלל. ‏R2 ו-R0 מכריעים שם זהה, בהגדרה.
 *
 * ═══ ⭐⛔ הקריטריון · שני התנאים · שניהם חייבים להתקיים ═══
 *
 *   על שורות `en-blind3` בכיוון **`word`** שתויגו במפורש `כ` או `ל`:
 *   ⚠⚠ **התיוג נעשה על ידי הסשן הראשי · לא על ידי חגי.** חגי לא תייג אף סט —
 *   לא את זה, לא את `en40` ולא את `en2`. זה עדיין ground truth תקף, כי הוא
 *   נקבע לפני שנראה פסק כלשהו — אבל לקרוא לו "חגי" מנפח את מעמדו, וזה תוקן
 *   כבר פעם אחת בכל `teacher.js`.
 *
 *     ‏(א)  ‏R2 עושה **אפס קבלות-שווא**   (‏FA = 0)
 *     ‏(ב)  ‏recall של R2 **גבוה** מזה של R0   (חד-משמעי · שוויון אינו עובר)
 *
 *   ‏**שניהם ⇒ R2 נבחר** ונכנס ל-`teacher.js` כחוק הנעול.
 *   ‏**אחרת ⇒ `T5` נשארת** ו-`teacher.js` אינו משתנה. אין תנאי שלישי, אין
 *   «כמעט», ואין הרצה שנייה עם חוק אחר על אותו סט.
 *
 * ⚠ **מה שנקבע כאן מראש כדי שלא ייבחר אחר כך:**
 *   ‏1. **כל 16 שורות ה-`word` נספרות.** אין סינון, אין הוצאת מקרה קשה.
 *   ‏2. שורות שסומנו `?` **אינן** בקריטריון. הן מדווחות בנפרד תחת המוסכמה
 *      של `RULING_Q` (‏`word` ⇒ `ל`), כי המוסכמה הזאת היא הכרעת מוצר ולא תיוג,
 *      ולתת לה להכריע פסק סטטיסטי זה לתת למוסכמה להוכיח את עצמה.
 *   ‏3. ‏24 שורות ה-`gloss` מדווחות כ**בקרה**: ‏R0 ו-R2 חייבים לצאת שם זהים.
 *      הפרש שם = באג בקוד, לא ממצא — והוא זורק.
 *   ‏4. ⛔ **הרצה אחת.** אם הפנקס חסר עדשה, הריצה **זורקת** ולא משלימה. סט
 *      עיוור שנמדד על פנקס חלקי כבר אינו עיוור בהרצה השנייה.
 *
 * ⚠⚠ **ומה שההכרזה הזאת אינה מכסה, ויש לומר:** ‏`en-blind3` הוא 16 שורות
 * `word`. גם פסק מושלם שם הוא ‏n=16, ואינו הופך את R2 לחוק מוכח — הוא רק
 * מסיר את הפסילה המתודולוגית שרובצת על המספרים בתוך-המדגם. */

const fs = require('fs');
const path = require('path');
const T = require('./teacher.js');
const { decideBy, RULES } = require('./teacher_rule_probe.js');

const OUT = path.join(__dirname, 'out');
const SET = 'en3';
const say = s => process.stdout.write(s + '\n');

/* ⛔ הקריטריון כקוד · לא כפרוזה. שינוי שלו חייב להופיע ב-diff. */
const CRITERION = {
  challenger: 'R2',
  baseline: 'R0',
  set: 'en-blind3',
  direction: 'word',
  requires: [
    { id: 'א', text: 'R2 עושה אפס קבלות-שווא', test: (r0, r2) => r2.fa === 0 },
    { id: 'ב', text: 'recall של R2 גבוה מזה של R0', test: (r0, r2) => r2.recall != null && r0.recall != null && r2.recall > r0.recall },
  ],
  onPass: 'R2 נבחר · נכנס ל-teacher.js כחוק הנעול',
  onFail: 'T5 נשארת · teacher.js אינו משתנה',
  declaredAt: '2026-08-19',
  declaredBefore: 'לפני שהורצה שורה אחת על en-blind3 · לפני שקיים לו פנקס',
};

function declare() {
  say('# ⭐ הכרזה מראש · `en-blind3`');
  say('');
  say(`| שדה | ערך |`);
  say(`|---|---|`);
  say(`| מתמודד | **${CRITERION.challenger}** · T5 אינה מצביעה ב-\`word\` + מכסה 2 שם |`);
  say(`| בסיס | ${CRITERION.baseline} · החוק הנעול היום |`);
  say(`| סט | \`${CRITERION.set}\` · כיוון \`${CRITERION.direction}\` · כל השורות המתויגות |`);
  for (const c of CRITERION.requires) say(`| תנאי ${c.id} | ${c.text} |`);
  say(`| שניהם ⇒ | ${CRITERION.onPass} |`);
  say(`| אחרת ⇒ | ${CRITERION.onFail} |`);
  say(`| הוכרז | ${CRITERION.declaredAt} · ${CRITERION.declaredBefore} |`);
  say('');
  say('⛔ שורות `?` אינן בקריטריון · 24 שורות ה-`gloss` הן בקרה ש-R0=R2 · הרצה אחת.');
}

/* ===== שערי מוכנות · כל אחד זורק ואינו משלים ===== */

function rows() {
  const setFile = path.join(OUT, 'teacher', SET + '.jsonl');
  if (!fs.existsSync(setFile)) throw new Error(`חסר ${path.relative(__dirname, setFile)} · הרץ  node typo-lab/teacher.js --build-blind --set en3`);
  const items = T.loadSet(SET);
  const raw = fs.readFileSync(setFile, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  const led = T.loadLedger(SET);

  const unlabeled = raw.filter(r => !['כ', 'ל', '?'].includes((r.label || '').trim()));
  if (unlabeled.length) {
    throw new Error(`⛔ ${unlabeled.length}/${raw.length} שורות ב-en-blind3.tsv עדיין ללא תיוג (${unlabeled.slice(0, 5).map(r => r.id).join(' ')}…)\n`
      + '   הסט ממתין לתיוג · `en-blind3.labeled.tsv` · id · תווית · הערה\n'
      + '   אחרי התיוג:  node typo-lab/teacher.js --build-blind --set en3');
  }
  /* ⛔ פנקס חלקי · לא מודדים ומשלימים. סט עיוור נשרף בהרצה הראשונה. */
  const missing = [];
  for (const it of items) {
    const v = led.get(it.h) || {};
    const app = T.applicable(it);
    const gap = app.filter(l => !v[l]);
    if (gap.length) missing.push(`${it.id || '?'}:${gap.join(',')}`);
  }
  if (missing.length) {
    throw new Error(`⛔ פנקס חסר · ${missing.length} פריטים בלי פסק מלא (${missing.slice(0, 6).join(' · ')}…)\n`
      + '   הרץ:  node typo-lab/teacher.js --emit --set en3   → שופטים → --ingest --set en3\n'
      + '   ⛔ ולא מודדים על פנקס חלקי · ההרצה השנייה כבר אינה עיוורת.');
  }
  return items.map((it, i) => ({ it, id: raw[i].id, truth: (raw[i].label || '').trim(), v: led.get(it.h) || {} }));
}

function score(rs, rule) {
  let tp = 0, fa = 0, fr = 0, tn = 0;
  for (const r of rs) {
    const acc = decideBy(rule, r.it, r.v) === 'accept';
    if (r.truth === 'כ') { if (acc) tp++; else fr++; } else { if (acc) fa++; else tn++; }
  }
  const n = tp + fa + fr + tn;
  return { tp, fa, fr, tn, n, acc: n ? (tp + tn) / n : 0, recall: (tp + fr) ? tp / (tp + fr) : null };
}

function verdict() {
  declare();
  say('');
  const all = rows();
  const word = all.filter(r => r.it.direction === 'word');
  const gloss = all.filter(r => r.it.direction === 'gloss');
  const scored = word.filter(r => r.truth === 'כ' || r.truth === 'ל');
  const q = word.filter(r => r.truth === '?');

  /* בקרה · כיוון gloss חייב לצאת זהה · הפרש = באג */
  let gdiff = 0;
  for (const r of gloss) if (decideBy(RULES.R0, r.it, r.v) !== decideBy(RULES.R2, r.it, r.v)) gdiff++;
  if (gdiff) throw new Error(`⛔ ${gdiff} שורות \`gloss\` נבדלות בין R0 ל-R2 · זה באג בקוד ולא ממצא · R2 אינו אמור לגעת ב-gloss`);
  say(`✅ בקרה · ${gloss.length} שורות \`gloss\` · ‏R0 ו-R2 זהים בכולן`);
  say('');

  const r0 = score(scored, RULES.R0), r2 = score(scored, RULES.R2);
  say(`# הפסק · \`en-blind3\` · כיוון \`word\` · ${scored.length} שורות מתויגות (מתוך ${word.length})`);
  say('');
  say('| חוק | n | דיוק | recall | ⛔ קבלות-שווא | דחיות-שווא |');
  say('|---|---:|---:|---:|---:|---:|');
  for (const [k, s] of [['R0 · נעול', r0], ['R2 · מתמודד', r2]]) {
    say(`| ${k} | ${s.n} | ${(100 * s.acc).toFixed(1)}% | ${s.recall == null ? '—' : (100 * s.recall).toFixed(1) + '%'} | ${s.fa === 0 ? '**0** ✅' : '**' + s.fa + '** ⛔'} | ${s.fr} |`);
  }
  say('');
  say('| שורה | אמת | ‏R0 | ‏R2 | העדשות |');
  say('|---|---|---|---|---|');
  for (const r of word) {
    const ls = T.applicable(r.it).map(l => `${l}=${r.v[l] || '—'}`).join(' ');
    say(`| ${r.id} \`${r.it.term}\`→\`${r.it.typed}\` | ${r.truth} | ${decideBy(RULES.R0, r.it, r.v)} | ${decideBy(RULES.R2, r.it, r.v)} | ${ls} |`);
  }
  say('');

  /* ⭐ פילוח לשלוש מחלקות · **דיווח בלבד** · נוסף אחרי שהגיעו התיוגים, לבקשת
     הסשן הראשי. ⛔ `CRITERION` לא נגע — הפילוח אינו משנה מי עובר, רק **היכן**
     החוק נופל, כי "זבל רחוק" ו"מילה אחרת" הם שני תיקונים שונים לגמרי.
     ⚠ המחלקות נגזרות מהנתונים ולא מרשימה שהודבקה: אות הלקסיקליות היא **פסק
     T5** (זו בדיוק השאלה שלו), והקרבה היא מרחק דמראו מ-`written`. ⚠ שימוש
     ב-T5 לפילוח לגיטימי לדיווח, אבל הוא **לא** ראיה עצמאית — הוא אותו פסק
     ש-R2 מתעלם ממנו. */
  const dam = (a, b) => {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  };
  const bucketOf = r => {
    if (r.v.T5 === 'כ') return 'מילה אחרת אמיתית';
    return dam(String(r.it.written).toLowerCase(), String(r.it.typed).toLowerCase()) <= 2
      ? 'אינה מילה · קרובה' : 'זבל רחוק';
  };
  const BUCKETS = ['אינה מילה · קרובה', 'מילה אחרת אמיתית', 'זבל רחוק'];
  say('## ⭐ פילוח לפי מחלקה · היכן כל חוק נופל');
  say('');
  say('| מחלקה | n | תיוג כ | ‏R0 מקבל | ‏R2 מקבל | ⛔ ‏R0 שגה | ⛔ ‏R2 שגה |');
  say('|---|---:|---:|---:|---:|---:|---:|');
  for (const b of BUCKETS) {
    const rs = scored.filter(r => bucketOf(r) === b);
    if (!rs.length) { say(`| ${b} | 0 | — | — | — | — | — |`); continue; }
    const yes = rs.filter(r => r.truth === 'כ').length;
    const a0 = rs.filter(r => decideBy(RULES.R0, r.it, r.v) === 'accept').length;
    const a2 = rs.filter(r => decideBy(RULES.R2, r.it, r.v) === 'accept').length;
    const e0 = rs.filter(r => (decideBy(RULES.R0, r.it, r.v) === 'accept') !== (r.truth === 'כ')).length;
    const e2 = rs.filter(r => (decideBy(RULES.R2, r.it, r.v) === 'accept') !== (r.truth === 'כ')).length;
    say(`| ${b} | ${rs.length} | ${yes} | ${a0} | ${a2} | ${e0 === 0 ? '**0** ✅' : '**' + e0 + '** ⛔'} | ${e2 === 0 ? '**0** ✅' : '**' + e2 + '** ⛔'} |`);
  }
  say('');
  say('⚠ «זבל רחוק» היא המלכודת: המחרוזות **אינן מילים** ובכל זאת תויגו `ל`.');
  say('כלומר «אינה מילה ⇒ הלומד ידע» שגוי בלי תנאי קרבה — וזה בדיוק מה שהפיל את `decideWordDir` (X20/X21).');
  say('');

  const results = CRITERION.requires.map(c => ({ ...c, ok: c.test(r0, r2) }));
  for (const c of results) say(`${c.ok ? '✅' : '⛔'} תנאי ${c.id} · ${c.text}`);
  const pass = results.every(c => c.ok);
  say('');
  say(pass ? `# ⭐ ‏R2 עבר · ${CRITERION.onPass}` : `# ⛔ ‏R2 נכשל · ${CRITERION.onFail}`);
  if (q.length) {
    say('');
    const rq = q.filter(r => decideBy(RULES.R2, r.it, r.v) === 'accept').length;
    say(`⚠ בנוסף · ${q.length} שורות \`?\` **מחוץ לקריטריון** · ‏R2 מקבל ${rq} מהן · תחת \`RULING_Q\` (word⇒\`ל\`) אלה ${rq} קבלות-שווא.`);
  }
  say('');
  say('⚠ ‏n קטן. פסק נקי כאן מסיר את הפסילה המתודולוגית · הוא אינו הופך את R2 לחוק מוכח.');
  return pass;
}

if (require.main === module) {
  try {
    if (process.argv.includes('--declare')) declare();
    else verdict();
  } catch (e) { say('⛔ ' + e.message); process.exitCode = 1; }
}
module.exports = { CRITERION, score, rows };
