'use strict';
/* ⭐ פירוש מול משפט הדוגמה · typo-lab/gloss_vs_example.js
 *
 *   node typo-lab/gloss_vs_example.js --pairs             → out/gloss/pairs.tsv
 *   node typo-lab/gloss_vs_example.js --emit --lens L1    → out/gloss/batch/L1-NN.tsv
 *   node typo-lab/gloss_vs_example.js --ingest --lens L1  → קורא out/gloss/verdict/L1-*.tsv
 *   node typo-lab/gloss_vs_example.js --decide            → out/gloss/contradictions.tsv
 *   node typo-lab/gloss_vs_example.js --agree             → הסכמה בין העדשות
 *   node typo-lab/gloss_vs_example.js --selftest          → ⛔ שיניים · יוצא 1 כשקלט שאמור להיפסל עובר
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * מה זה בודק · והראיה היא **פנימית**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * לכל אחת מ-3,946 המילים ב-`data-en.js` יש פירוש בעברית, ולכל אחת יש משפט
 * דוגמה מתורגם ב-`data-en-sentences.js` שבו המילה הנלמדת **מודגשת ב-`<b>`**.
 * שני הנכסים נכתבו בנפרד. אם המילה המודגשת בתרגום אינה מופיעה בפירוש — המאגר
 * סותר את עצמו, ואחד משני הצדדים שגוי.
 *
 * זה מה שתפס את `session` = "מושב" · משפט הדוגמה של האפליקציה עצמה תרגם אותו
 * "פגישת הטיפול". הראיה הייתה במאגר כל הזמן.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔⛔ מה **לא** עובד כאן · שתי גרסאות שנמדדו ונזרקו
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * | ניסיון | תוצאה |
 * |---|---|
 * | התאמת מחרוזות עם קילוף תחילית/סיומת | **808 דגלים (20.5%)** · כמעט כולם שקר |
 * | שיתוף רצף 3 אותיות אחרי הסרת אם קריאה | **165 דגלים (4.2%)** · עדיין רובם שקר |
 *
 * ⭐ **הכשל בשתיהן זהה, והוא לא בכיול:** גלאי מחרוזות אינו יודע להפריד **נטייה**
 * (`לשתות`/`שותה` · `כועס`/`כעס` — אותה מילה) מ**מילה אחרת** (`זמן`/`שעה` —
 * סתירה אמיתית). ההפרדה הזאת היא ידע לקסיקלי, ואין לה פתרון מחרוזות.
 * ⛔ **אל תבנה כאן מטריקת דמיון שלישית.** הקובץ הזה מסנן **רק בהתאמה מדויקת**
 * ומעביר את כל השאר לשיפוט לקסיקלי.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ למה השאלה לשופט צרה · הלקח מ-`teacher.js` מוחל כאן ישירות
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `teacher.js` מתעד שתי עדשות שנשאלו את **שאלת המטרה** ("האם הלומד ידע את
 * המילה") ושתיהן הפכו לחותמת גומי — 51.9% ו-46.9%, האחרונה עם 33 קבלות-שווא
 * מתוך 33. השאלה **הדקדוקית** באותו קובץ יצאה 95.3%.
 *
 * ⛔ ולכן **אין** כאן עדשה ששואלת "האם הפירוש טוב" או "האם הפירוש מתאים למשפט".
 * זו שאלת המטרה, והיא נשאלת רק על ידי קוד ההכרעה. השופט נשאל **שאלה לקסיקלית**:
 *
 *     "A ו-B — האם הן אותה מילה עברית בצורה אחרת (נטייה, זמן, מין, מספר,
 *      תחילית), או שתי מילים שונות?"
 *
 * ⭐ והשופט **עיוור למטרה**: האצווה אינה אומרת לו מאיזה כרטיס זה בא, מי מהשניים
 * הפירוש ומי המשפט, ואפילו לא שמדובר במאגר אנגלי. הוא רואה שתי עמודות עבריות.
 * מי שיודע מה התשובה ה"רצויה" מייצר אותה.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * חוק ההכרעה · נקבע מראש · ⭐ "עדיף להשאיר טעות מלתקן לא נכון"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   סתירה ⟺ **כל** העדשות אמרו `ל` (מילים שונות)
 *   תקין  ⟺ כל השאר — ולו עדשה אחת אמרה `כ` או `?`
 *
 * ⛔ אסימטרי בכוונה. דגל שקרי עולה תיקון שגוי בתוכן שלומדים לומדים ממנו;
 * דגל שהוחמץ עולה עוד סבב. המחיר אינו סימטרי ולכן גם השער אינו.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'gloss');
const BATCH = path.join(OUT, 'batch');
const VERD = path.join(OUT, 'verdict');
for (const d of [OUT, BATCH, VERD]) fs.mkdirSync(d, { recursive: true });

const argv = process.argv.slice(2);
const say = s => process.stdout.write(s + '\n');
const has = f => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const num = (f, d) => { const v = arg(f, null); return v === null ? d : Number(v); };

/* ===================== 1 · טעינת הנכסים ===================== */

function loadWindowFile(rel, key) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = { window: {} };
  new Function('window', src).call(sandbox, sandbox.window);
  const v = sandbox.window[key];
  if (!v) throw new Error('לא נטען ' + key + ' מ-' + rel);
  return v;
}

function loadBank() {
  const units = loadWindowFile('data-en.js', 'UNIT_DATA_EN');
  const rows = [];
  for (const u of Object.keys(units)) for (const pair of units[u]) rows.push({ unit: u, term: pair[0], gloss: pair[1] });
  return rows;
}

/* ===================== 2 · קנוניזציה · ⛔ לקסיקלית בלבד =====================
 *
 * ⛔ **מה שהפונקציה הזאת אינה עושה, ולא תעשה:** היא אינה מקלפת תחיליות
 * (`ה`,`ו`,`ב`,`ל`,`מ`,`ש`,`כ`), אינה מקלפת סיומות, ואינה מסירה אימות קריאה.
 * זה בדיוק מה ששתי הגרסאות שנזרקו עשו, וזה מה שייצר 808 ו-165 דגלי שקר.
 * כאן מסירים **ניקוד ופיסוק בלבד** — כלומר רק מה שאינו נושא משמעות. */

const NIQQUD = /[֑-ׇ]/g;
const PUNCT = /[.,;:!?"'`()\[\]{}״׳“”‘’…·]/g;

/* ⚠ **פגם ידוע ותחום · 10 כניסות מתוך 3,946.** `PUNCT` מפיל גם גרש וגרשיים
 * **בתוך** מילה עברית, ולכן `תנ"כי` נקרא `תנ כי` ו-`ג'ונגל` נקרא `ג ונגל`.
 * הכניסות: jungle · chief · genre · horn · major · redhead · abroad · biblical ·
 * jog · cockroach.
 * ⭐ **ולמה זה לא תוקן כאן:** הקילוף **סימטרי** — הוא חל על הפירוש ועל המודגש
 * גם יחד — ולכן בכל עשר הפסק הוא `כ` בין כה וכה (`בחו ל` מול `חו ל`,
 * `תנ כיים` מול `תנ כי`). תיקון ה-regex משנה את המחרוזת המקונונת ולכן משנה את
 * **מפתחות** הפריטים, ומבטל פסקים ששולמו עליהם. זה מדווח ולא מוסתר.
 * ⛔ מי שמתקן — חייב להריץ מחדש את כל העדשות על עשרת המפתחות שישתנו. */

const canon = s => String(s == null ? '' : s)
  .replace(NIQQUD, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ')
  .replace(PUNCT, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const toks = s => canon(s).split(' ').filter(Boolean);

/* פיצול הפירוש למובנים · הפירוש כתוב בפורמט `מובן, מובן; מובן צר` */
function senses(gloss) {
  return String(gloss).split(/[;,]/).map(x => canon(x)).filter(Boolean);
}

/* ⭐ **הסינון היחיד שמותר · התאמה מדויקת.**
 * המודגש עובר אם ורק אם רצף הטוקנים שלו מופיע **כמו שהוא** ברצף טוקני הפירוש.
 * אין קילוף, אין דמיון, אין מרחק עריכה. */
function exactIn(bold, gloss) {
  const b = toks(bold), g = toks(gloss);
  if (!b.length) return false;
  for (let i = 0; i + b.length <= g.length; i++) {
    let ok = true;
    for (let j = 0; j < b.length; j++) if (g[i + j] !== b[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/* ===================== 3 · חילוץ המודגש ===================== */

function bolds(html) {
  const out = [];
  const re = /<b>([\s\S]*?)<\/b>/g;
  let m;
  while ((m = re.exec(String(html))) !== null) { const t = canon(m[1]); if (t) out.push(t); }
  return out;
}

/* ===================== 4 · בניית קבוצת המועמדים ===================== */

function buildPairs() {
  const bank = loadBank();
  const sent = loadWindowFile('data-en-sentences.js', 'EX_SENT_EN');
  const stat = { total: 0, noSent: 0, noBold: 0, multiBold: 0, exact: 0, cand: 0 };
  const rows = [];
  for (const w of bank) {
    stat.total++;
    const pair = sent[w.term];
    if (!pair || !pair[1]) { stat.noSent++; continue; }
    const he = pair[1], en = pair[0];
    const bs = bolds(he);
    if (!bs.length) { stat.noBold++; continue; }
    if (bs.length > 1) stat.multiBold++;
    /* ⭐ כמה `<b>` בתרגום = ביטוי אחד שנשבר · בודקים גם את האיחוד וגם כל חלק */
    const joined = bs.join(' ');
    const cands = bs.length > 1 ? [joined].concat(bs) : [joined];
    /* התאמה מדויקת של **אחד** מהם מספיקה כדי לצאת מהמועמדות */
    if (cands.some(b => exactIn(b, w.gloss))) { stat.exact++; continue; }
    stat.cand++;
    const key = crypto.createHash('sha256')
      .update(['gloss-ex', w.term, w.gloss, joined].join('|')).digest('hex').slice(0, 12);
    rows.push({ k: key, unit: w.unit, term: w.term, gloss: w.gloss, bold: joined, en, he });
  }
  return { rows, stat };
}

/* ===================== 5 · TSV ===================== */

const TAB = '\t';
const esc = s => String(s).replace(/[\t\r\n]/g, ' ');
function writeTsv(file, header, rows, cols) {
  const lines = [header.join(TAB)];
  for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(TAB));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

/* ===================== 6 · דגימה דטרמיניסטית ===================== */

/* ⛔ לא `Math.random`. הדגימה חייבת להיות ניתנת לשחזור מילה במילה בסבב הבא,
   אחרת "דגמנו 900" אינו מספר שאפשר לחזור אליו. */
function sampleDet(rows, n, seed) {
  if (!n || n >= rows.length) return rows.slice();
  const scored = rows.map(r => ({
    r, h: crypto.createHash('sha256').update(seed + '|' + r.k).digest('hex')
  }));
  scored.sort((a, b) => a.h < b.h ? -1 : a.h > b.h ? 1 : 0);
  return scored.slice(0, n).map(x => x.r);
}

/* ===================== 7 · הפנקס ===================== */

const LEDGER = path.join(OUT, 'ledger.json');
const loadLedger = () => fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : {};
const saveLedger = l => fs.writeFileSync(LEDGER, JSON.stringify(l, null, 1), 'utf8');

/* פנקס הלמות · מחרוזת → צורת יסוד. משותף לכל הפריטים ולכן נחסך שוב ושוב. */
const LEMMAS = path.join(OUT, 'lemmas.json');
const loadLemmas = () => fs.existsSync(LEMMAS) ? JSON.parse(fs.readFileSync(LEMMAS, 'utf8')) : {};
const saveLemmas = l => fs.writeFileSync(LEMMAS, JSON.stringify(l, null, 1), 'utf8');
const skey = s => crypto.createHash('sha256').update('lemma|' + canon(s)).digest('hex').slice(0, 10);

const LENSES = ['L1', 'L2', 'L3'];

/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐ שלוש עדשות · ולמה **לא** אותה שאלה שלוש פעמים
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   L1 · צורה  — ישירה · "אותה מילה בצורה אחרת, או שתי מילים?"
 *   L2 · שורש  — צרה יותר · "אותו שורש עברי, או שורשים שונים?"
 *   L3 · הפוך  — ⭐ **השופט אינו רואה השוואה בכלל.** הוא מקבל מחרוזת אחת
 *                וכותב את **צורת היסוד** שלה. הקוד משווה למות בהתאמה מדויקת.
 *
 * ‏L3 היא האנלוג של `T3` ב-`teacher.js` — העדשה ההפוכה. שופט שאינו יודע מה
 * מושווה למה אינו יכול לייצר את התשובה הרצויה, גם לא בלי כוונה.
 *
 * ⚠⚠ **ומה שנמדד בפועל · L3 לא קנתה אף החלטה בשער.**
 *
 *   | שלב | נותרו | נחתכו |
 *   |---|---|---|
 *   | מועמדים | 2,371 | |
 *   | אחרי L1 · צורה | 141 | 2,230 |
 *   | אחרי L2 · שורש | 50 | **91** |
 *   | אחרי L3 · למה | 50 | **0** |
 *
 * כל 50 ששרדו "מילה אחרת" **וגם** "שורש אחר" קיבלו גם "למה אחרת" — כי למה זהה
 * מחייבת שורש זהה. ⭐ **L3 כפופה ל-L2 מבחינה לוגית**, וזה היה ניתן לחיזוי מראש
 * ולא נחזה. זהו בדיוק מה ש-`teacher.js` מתעד על `T5` (‏0 תרומה שולית).
 *
 * ⭐ **ולמה היא בכל זאת נשארת:** היא **סט הבקרה**. היא זו שנתנה את המספר
 * שמצדיק את היציאה המוקדמת (‏0 החמצות מתוך 189) ואת ההסכמה הבלתי-מוטה (‏86%).
 * בלעדיה "L1 ראשונה" הוא ניחוש. ⛔ **מי שמייעל אותה החוצה — מוחק את המדידה,
 * לא את העלות.** על הסט הבא היא צריכה לרוץ שוב על **מדגם מלא**, לא על השורדים.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ יציאה מוקדמת · **אינה** קיצור דרך שמשנה את התשובה
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * סתירה דורשת ש**כל השלוש** יאמרו `ל`. לכן ברגע ש-L1 אמרה `כ` או `?`, הפסק
 * הסופי הוא `תקין` **ולא משנה** מה יאמרו L2 ו-L3. הרצתן שם היא תשלום על מידע
 * שאינו יכול לשנות החלטה. מכאן השרשרת: `L1` על הכול → `L2` רק על `ל` של L1 →
 * `L3` רק על `ל∧ל`. הפסקים הסופיים **זהים** לכיסוי מלא.
 *
 * ⚠ **ומה שזה כן עולה, ואסור לבלוע:** ההסכמה בין העדשות נמדדת אז רק על
 * האוכלוסייה ש-L1 דגלה, והיא מוטה מהגדרתה. לכן רץ **סט בקרה** — מדגם
 * דטרמיניסטי מכל המועמדים שמקבל את שלוש העדשות בלי קשר ל-L1. הוא זה שנותן
 * גם את ההסכמה הבלתי-מוטה וגם את **שיעור ההחמצה** של L1. בלעדיו "כיסוי מלא"
 * הוא טענה שאין לה מדידה. */

/* ===================== 8 · emit ===================== */

/* ⭐ מה השופט **לא** רואה: `term` (המילה האנגלית), `en` (המשפט), ואיזה צד הוא
   הפירוש. הוא רואה שתי עמודות עבריות — `a` המודגש, `b` רשימת המובנים. */
function targetSet(after, quota, seed) {
  const built = buildPairs();
  const led = loadLedger();
  let rows = built.rows;
  /* `--after L1` · רק מה ש-L1 דגלה · וכן הלאה בשרשרת */
  if (after) for (const l of after.split(',')) rows = rows.filter(r => led[r.k] && led[r.k][l] && led[r.k][l].v === 'ל');
  const pool = sampleDet(rows, quota, seed);
  return { pool: pool, all: built.rows, stat: built.stat, led: led };
}

function emit(lens, size, quota, seed, after, tag) {
  const t = targetSet(after, quota, seed);
  const pre = (tag ? tag + '-' : '') + lens + '-';
  if (lens === 'L3') return emitL3(t, size, pre);
  const todo = t.pool.filter(r => !(t.led[r.k] && t.led[r.k][lens]));
  fs.readdirSync(BATCH).filter(f => f.indexOf(pre) === 0).forEach(f => fs.unlinkSync(path.join(BATCH, f)));
  const files = [];
  for (let i = 0; i < todo.length; i += size) {
    const chunk = todo.slice(i, i + size).map(r => ({ k: r.k, a: r.bold, b: senses(r.gloss).join(' | ') }));
    const f = path.join(BATCH, pre + String(files.length + 1).padStart(2, '0') + '.tsv');
    writeTsv(f, ['k', 'a', 'b'], chunk, ['k', 'a', 'b']);
    files.push(f);
  }
  say('סה"כ במאגר: ' + t.stat.total + ' · התאמה מדויקת (סוננו): ' + t.stat.exact + ' · מועמדים: ' + t.stat.cand);
  say('קבוצת היעד' + (after ? ' (אחרי ' + after + ')' : '') + ': ' + t.pool.length +
    (quota ? ('  · מכסה ' + quota + ' · זרע "' + seed + '"') : ''));
  say('נותרו לעדשה ' + lens + ': ' + todo.length + ' ב-' + files.length + ' אצוות');
  files.forEach(f => say('  ' + f));
}

/* ⭐ L3 · המחרוזות בלבד · ⛔ בלי שום רמז מה מושווה למה, ובסדר ערבוב דטרמיניסטי
   כדי שגם הסמיכות בקובץ לא תסגיר את הצמד. */
function emitL3(t, size, pre) {
  const lem = loadLemmas();
  const need = {};
  for (const r of t.pool) {
    for (const s of [r.bold].concat(senses(r.gloss))) { const k = skey(s); if (!lem[k]) need[k] = canon(s); }
  }
  let list = Object.keys(need).map(k => ({ k: k, s: need[k] }));
  list.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
  fs.readdirSync(BATCH).filter(f => f.indexOf(pre) === 0).forEach(f => fs.unlinkSync(path.join(BATCH, f)));
  const files = [];
  for (let i = 0; i < list.length; i += size) {
    const f = path.join(BATCH, pre + String(files.length + 1).padStart(2, '0') + '.tsv');
    writeTsv(f, ['k', 's'], list.slice(i, i + size), ['k', 's']);
    files.push(f);
  }
  say('קבוצת היעד ל-L3: ' + t.pool.length + ' פריטים → ' + list.length + ' מחרוזות ייחודיות שחסרות למה');
  say('ב-' + files.length + ' אצוות');
  files.forEach(f => say('  ' + f));
}

/* ===================== 9 · ingest · ⛔ שער קשיח ===================== */

/* ⛔ זורק על שורה פגומה ואינו בולע. פסק סותר על אותו מפתח **זורק** ולא דורס —
   זה הבאג שהפיל את `semantic_panel.js` (הריקול השתנה פי שלושה לפי סדר קריאת
   התיקייה). */
function ingest(lens) {
  if (lens === 'L3') return ingestL3();
  const rows = buildPairs().rows;
  const known = {};
  rows.forEach(r => { known[r.k] = 1; });
  const led = loadLedger();
  let added = 0, dup = 0;
  const files = fs.readdirSync(VERD).filter(f => /(^|-)L\d-\d+\.tsv$/.test(f) && f.indexOf(lens + '-') >= 0).sort();
  if (!files.length) throw new Error('אין קובצי פסק ל-' + lens + ' ב-' + VERD);
  for (const f of files) {
    const txt = fs.readFileSync(path.join(VERD, f), 'utf8').replace(/^﻿/, '');
    for (const line of txt.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const c = line.split(TAB);
      if (c.length < 2) throw new Error(f + ': שורה בלי TAB → ' + line.slice(0, 60));
      const k = c[0].trim(), lab = c[1].trim(), why = (c[2] || '').trim();
      if (k === 'k') continue;
      if (!known[k]) throw new Error(f + ': מפתח שאינו בקבוצת המועמדים → ' + k);
      if (['כ', 'ל', '?'].indexOf(lab) < 0) throw new Error(f + ': תווית לא חוקית "' + lab + '" בשורה ' + k);
      led[k] = led[k] || {};
      if (led[k][lens]) {
        if (led[k][lens].v !== lab) throw new Error(f + ': פסק סותר על ' + k + ' · ' + led[k][lens].v + ' מול ' + lab);
        dup++; continue;
      }
      led[k][lens] = { v: lab, why: why };
      added++;
    }
  }
  saveLedger(led);
  say('עדשה ' + lens + ': נקלטו ' + added + ' · חוזרים ' + dup + ' · סה"כ בפנקס ' + Object.keys(led).length);
}

/* ⛔ אותו שער קשיח, על הלמות. פסק סותר על אותה מחרוזת זורק ולא דורס. */
function ingestL3() {
  const lem = loadLemmas();
  let added = 0, dup = 0;
  const files = fs.readdirSync(VERD).filter(f => /(^|-)L3-\d+\.tsv$/.test(f)).sort();
  if (!files.length) throw new Error('אין קובצי פסק ל-L3 ב-' + VERD);
  for (const f of files) {
    const txt = fs.readFileSync(path.join(VERD, f), 'utf8').replace(/^﻿/, '');
    for (const line of txt.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      const c = line.split(TAB);
      if (c.length < 2) throw new Error(f + ': שורה בלי TAB → ' + line.slice(0, 60));
      const k = c[0].trim(), v = canon(c[1]);
      if (k === 'k') continue;
      if (!/^[0-9a-f]{10}$/.test(k)) throw new Error(f + ': מפתח פגום → ' + k);
      if (!v) throw new Error(f + ': למה ריקה על ' + k);
      if (lem[k]) { if (lem[k] !== v) throw new Error(f + ': למה סותרת על ' + k + ' · ' + lem[k] + ' מול ' + v); dup++; continue; }
      lem[k] = v; added++;
    }
  }
  saveLemmas(lem);
  say('L3: נקלטו ' + added + ' למות · חוזרות ' + dup + ' · סה"כ ' + Object.keys(lem).length);
}

/* ===================== 10 · הכרעה ===================== */

/* ⭐ L3 מחושבת בקוד ולא נמסרת על ידי שופט · הוא נתן למה אחת לכל מחרוזת, בלי
   לדעת מה מושווה למה. ההשוואה עצמה היא **התאמה מדויקת** בין למות. */
function l3Of(r, lem) {
  const a = lem[skey(r.bold)];
  const bs = senses(r.gloss).map(s => lem[skey(s)]);
  if (!a || bs.some(x => !x)) return null;
  return { v: bs.indexOf(a) >= 0 ? 'כ' : 'ל', why: 'למה ' + a + ' מול ' + bs.join('|') };
}

function decide(k, led, r, lem) {
  const e = Object.assign({}, led[k] || {});
  if (!e.L3 && r && lem) { const x = l3Of(r, lem); if (x) e.L3 = x; }
  const seen = LENSES.filter(l => e[l]);
  if (seen.length < 3) return { verdict: 'חסר', seen: seen, e: e };
  const v = seen.map(l => e[l].v);
  return { verdict: v.every(x => x === 'ל') ? 'סתירה' : 'תקין', seen: seen, v: v, e: e };
}

function report() {
  const built = buildPairs();
  const rows = built.rows, stat = built.stat;
  const led = loadLedger(), lem = loadLemmas();
  const out = [];
  const tally = { 'סתירה': 0, 'תקין': 0, 'חסר': 0 };
  /* ⭐ יציאה מוקדמת · פריט ש-L1 אמרה עליו `כ`/`?` הוא `תקין` סופית · אין מה
     לחכות ל-L2/L3 כי הן אינן יכולות להפוך אותו. זה **הפסק**, לא "חסר". */
  for (const r of rows) {
    const e = led[r.k] || {};
    if (e.L1 && e.L1.v !== 'ל') { tally['תקין']++; continue; }
    if (e.L2 && e.L2.v !== 'ל') { tally['תקין']++; continue; }
    const d = decide(r.k, led, r, lem);
    tally[d.verdict]++;
    if (d.verdict === 'סתירה') out.push(r);
  }
  writeTsv(path.join(OUT, 'contradictions.tsv'),
    ['k', 'unit', 'term', 'gloss', 'bold', 'en', 'he'], out,
    ['k', 'unit', 'term', 'gloss', 'bold', 'en', 'he']);
  say('| מדד | מספר |');
  say('|---|---|');
  say('| סה"כ במאגר | ' + stat.total + ' |');
  say('| התאמה מדויקת · סוננו | ' + stat.exact + ' |');
  say('| מועמדים | ' + stat.cand + ' |');
  say('| נשפטו ב-3 עדשות | ' + (tally['סתירה'] + tally['תקין']) + ' |');
  say('| **סתירה** | **' + tally['סתירה'] + '** |');
  say('| תקין (נטייה/ספק) | ' + tally['תקין'] + ' |');
  say('| חסר פסקים | ' + tally['חסר'] + ' |');
  const judged = tally['סתירה'] + tally['תקין'];
  if (judged) say('\nאחוז שסונן כנטייה/ספק מתוך שנשפטו: ' + (100 * tally['תקין'] / judged).toFixed(1) + '%');
  say('\n→ ' + path.join(OUT, 'contradictions.tsv'));
}

/* ===================== 11 · הסכמה בין עדשות ===================== */

/* ⚠ `--agree` ללא `--quota` מודד על האוכלוסייה ש-L1 דגלה, והיא **מוטה**.
   המספר הבלתי-מוטה מגיע מסט הבקרה: `--agree --quota N --seed <זרע>`. */
function agree(quota, seed) {
  const built = buildPairs();
  const led = loadLedger(), lem = loadLemmas();
  const pool = quota ? sampleDet(built.rows, quota, seed) : built.rows;
  const full = [];
  for (const r of pool) {
    const d = decide(r.k, led, r, lem);
    if (d.seen.length === 3) full.push({ r: r, e: d.e });
  }
  let unan = 0;
  const pairAgree = {};
  for (let i = 0; i < LENSES.length; i++) for (let j = i + 1; j < LENSES.length; j++) pairAgree[LENSES[i] + '·' + LENSES[j]] = 0;
  for (const x of full) {
    const v = LENSES.map(l => x.e[l].v);
    if (v.every(y => y === v[0])) unan++;
    for (let i = 0; i < LENSES.length; i++) for (let j = i + 1; j < LENSES.length; j++)
      if (x.e[LENSES[i]].v === x.e[LENSES[j]].v) pairAgree[LENSES[i] + '·' + LENSES[j]]++;
  }
  say((quota ? 'סט בקרה (זרע "' + seed + '") · ' : '⚠ אוכלוסיית L1=ל · מוטה · ') + 'פריטים עם 3 פסקים: ' + full.length);
  if (!full.length) return;
  say('הסכמה פה-אחד: ' + unan + ' (' + (100 * unan / full.length).toFixed(1) + '%)');
  say('| זוג | הסכמה |');
  say('|---|---|');
  for (const p of Object.keys(pairAgree)) say('| ' + p + ' | ' + (100 * pairAgree[p] / full.length).toFixed(1) + '% |');
  const dist = {};
  for (const l of LENSES) { dist[l] = { 'כ': 0, 'ל': 0, '?': 0 }; for (const x of full) dist[l][x.e[l].v]++; }
  say('');
  say('| עדשה | כ | ל | ? |');
  say('|---|---|---|---|');
  for (const l of LENSES) say('| ' + l + ' | ' + dist[l]['כ'] + ' | ' + dist[l]['ל'] + ' | ' + dist[l]['?'] + ' |');
  /* ⭐ **המספר שמצדיק את היציאה המוקדמת**: כמה פעמים L2 ו-L3 אמרו שתיהן `ל`
     דווקא איפה ש-L1 אמרה `כ`. אלה בדיוק ההחמצות שהשרשרת עלולה לייצר. */
  let miss = 0, l1ok = 0;
  for (const x of full) if (x.e.L1.v !== 'ל') { l1ok++; if (x.e.L2.v === 'ל' && x.e.L3.v === 'ל') miss++; }
  say('');
  say('⭐ שיעור החמצה של היציאה המוקדמת: ' + miss + ' מתוך ' + l1ok +
    ' שבהם L1 לא דגלה, גם L2 וגם L3 אמרו `ל`' + (l1ok ? ' (' + (100 * miss / l1ok).toFixed(1) + '%)' : ''));
}

/* ===================== 12 · ⛔ שיניים ===================== */

/* ⛔ שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות · `CLAUDE.md`.
   כל טענה כאן מגיעה עם קלט שאמור להיפסל, והפונקציה יוצאת 1 כשהוא עבר. */
function selftest() {
  const bad = [];
  let n = 0;
  const T = (name, cond) => { n++; if (!cond) bad.push(name); };

  /* המסנן חייב לתפוס התאמה מדויקת */
  T('exact · זהה', exactIn('פגישה', 'מפגש, פגישה; מושב'));
  T('exact · רב-מילי', exactIn('הכי טוב', 'הכי טוב'));
  /* ⛔ והוא **חייב לפספס** נטייה — אחרת חזרנו למטריקת הדמיון שנזרקה */
  T('exact · נטייה לא עוברת', !exactIn('פגישת', 'מפגש, פגישה'));
  T('exact · תחילית לא עוברת', !exactIn('השני', 'שני'));
  T('exact · תת-מחרוזת אינה טוקן', !exactIn('שיר', 'שירות'));
  T('exact · מילה אחרת', !exactIn('שעה', 'זמן'));

  /* חילוץ המודגש */
  T('bold · יחיד', bolds('היא <b>ראשונה</b> במרוץ')[0] === 'ראשונה');
  T('bold · כפול', bolds('<b>א</b> ו<b>ב</b>').length === 2);
  T('bold · אין', bolds('אין כאן כלום').length === 0);

  /* קנוניזציה · פיסוק יורד, אותיות נשארות */
  T('canon · פיסוק', canon('  שלום,  עולם! ') === 'שלום עולם');
  T('canon · לא מקלף ה"א', canon('השני') === 'השני');

  /* פיצול מובנים */
  T('senses · נקודה-פסיק ופסיק', senses('מפגש, פגישה; מושב').join('|') === 'מפגש|פגישה|מושב');

  /* ⛔ חוק ההכרעה · אסימטרי. שלוש `ל` ⇒ סתירה · כל השאר ⇒ תקין */
  const L = {
    a: { L1: { v: 'ל' }, L2: { v: 'ל' }, L3: { v: 'ל' } },
    b: { L1: { v: 'ל' }, L2: { v: 'ל' }, L3: { v: '?' } },
    c: { L1: { v: 'ל' }, L2: { v: 'כ' }, L3: { v: 'ל' } },
    d: { L1: { v: 'ל' }, L2: { v: 'ל' } }
  };
  T('decide · 3×ל ⇒ סתירה', decide('a', L).verdict === 'סתירה');
  T('decide · ספק אינו סתירה', decide('b', L).verdict === 'תקין');
  T('decide · כ אחד מבטל', decide('c', L).verdict === 'תקין');
  T('decide · פחות מ-3 ⇒ חסר', decide('d', L).verdict === 'חסר');

  /* ⛔ L3 · ההשוואה בקוד היא **התאמה מדויקת בין למות** ולא דמיון */
  const rr = { bold: 'פגישת', gloss: 'מפגש, פגישה' };
  const lm = {}; lm[skey('פגישת')] = 'פגישה'; lm[skey('מפגש')] = 'מפגש'; lm[skey('פגישה')] = 'פגישה';
  T('L3 · למה זהה ⇒ כ', l3Of(rr, lm).v === 'כ');
  const lm2 = {}; lm2[skey('שעה')] = 'שעה'; lm2[skey('זמן')] = 'זמן';
  T('L3 · למה שונה ⇒ ל', l3Of({ bold: 'שעה', gloss: 'זמן' }, lm2).v === 'ל');
  T('L3 · למה חסרה ⇒ null ולא ניחוש', l3Of({ bold: 'אין', gloss: 'זמן' }, lm2) === null);
  /* ⛔ והשער המרכזי: L3=ל לבדה **אינה** סתירה */
  const L5 = { z: { L1: { v: 'כ' }, L2: { v: 'ל' } } };
  T('decide · L3=ל עם L1=כ ⇒ תקין', decide('z', L5, { bold: 'שעה', gloss: 'זמן' }, lm2).verdict === 'תקין');

  /* דגימה דטרמיניסטית · אותו זרע ⇒ אותה קבוצה */
  const fake = [];
  for (let i = 0; i < 100; i++) fake.push({ k: 'k' + i });
  const s1 = sampleDet(fake, 10, 'z').map(r => r.k).join(',');
  const s2 = sampleDet(fake, 10, 'z').map(r => r.k).join(',');
  const s3 = sampleDet(fake, 10, 'y').map(r => r.k).join(',');
  T('sample · יציב', s1 === s2);
  T('sample · זרע שונה ⇒ קבוצה שונה', s1 !== s3);

  if (bad.length) { say('⛔ נכשל:'); bad.forEach(b => say('  · ' + b)); process.exit(1); }
  say('✅ selftest · ' + n + ' טענות עברו · כולל 4 קלטים שחייבים להיפסל ו-2 חוקי הכרעה שחייבים לא לדגול');
}

/* ===================== main ===================== */

if (require.main === module) {
  try {
    if (has('--selftest')) selftest();
    else if (has('--pairs')) {
      const built = buildPairs();
      writeTsv(path.join(OUT, 'pairs.tsv'), ['k', 'unit', 'term', 'gloss', 'bold', 'en', 'he'], built.rows,
        ['k', 'unit', 'term', 'gloss', 'bold', 'en', 'he']);
      say(JSON.stringify(built.stat));
      say('→ ' + path.join(OUT, 'pairs.tsv'));
    }
    else if (has('--emit')) emit(arg('--lens', 'L1'), num('--size', 200), num('--quota', 0), arg('--seed', 'gloss-2026-08-18'), arg('--after', ''), arg('--tag', ''));
    else if (has('--ingest')) ingest(arg('--lens', 'L1'));
    else if (has('--decide')) report();
    else if (has('--agree')) agree(num('--quota', 0), arg('--seed', 'gloss-2026-08-18'));
    else say('ראה את הכותרת של הקובץ לדגלים.');
  } catch (e) { say('⛔ ' + e.message); process.exit(1); }
}

module.exports = { buildPairs: buildPairs, exactIn: exactIn, bolds: bolds, canon: canon, senses: senses, decide: decide, sampleDet: sampleDet, loadLedger: loadLedger, LENSES: LENSES };
