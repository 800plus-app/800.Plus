'use strict';
/* תור מדורג למורה · typo-lab/teacher_queue.js
 *
 *   node typo-lab/teacher_queue.js            · בונה את התור → out/teacher-queue.jsonl + .md
 *   node typo-lab/teacher_queue.js --selftest · שיניים
 *
 * ===== למה תור ולא אצווה =====
 *
 * המורה עולה **791 טוקנים לפסק-עדשה** (מדידת הסוכן שמריץ אותו), כלומר 289M טוקנים
 * ו-52 שעות ל-50,000 פריטים. אצווה מלאה על 115,881 השורות **אינה על הפרק**.
 * המסקנה אינה "לדגום פחות" אלא **לסדר**: אם הסוכן שמריץ יעצור בכל נקודה, מה שכבר
 * שולם עליו חייב להיות המלמד ביותר שאפשר היה לקנות בכסף הזה.
 *
 * ===== חמש המדרגות =====
 *
 *   T0  ⛔ שורות שהאפליקציה החיה מקבלת **דרך השכבה שלנו** (`out/probe-ours.json`).
 *       ‏186 שורות. כל פסק כאן או מנקה את השכבה או נוקב בקבלת-שווא בשמה — אין
 *       פריט יקר מזה. אפס מהן חוצות כרטיסים, ולכן זו שאלה למורה ולא חירום.
 *   T1  ⭐ גרעין הגבול · `edgeStrict` (E1/E3) · ההכרעה מתהפכת משינוי זעיר, או
 *       שרק וטו מפריד בין קבלה לדחייה. ממוין לפי ‎|margin|‎ **עולה** — הקרוב לסף ראשון.
 *   T2  שאר רצועת הגבול · E2/E4/E5 · שערי המשטר, התקרה והדו-משמעות.
 *   T3  המחלקות הסמנטיות שמנגנון המרחק **אינו יכול להגיע אליהן בשום כיול**
 *       (נרדפות · תשובה חלקית · מילה עודפת · סדר מילים · מורפולוגיה). הן לעולם
 *       אינן "בגבול" כי ‎dOwn‎ שלהן 6 עד 17, וזה בדיוק מה שהופך אותן ליקרות: שם
 *       האלגוריתם של היום מוכרע לחלוטין, והפסק מגדיר **מנגנון חדש** ולא סף.
 *   T4  השאר.
 *
 * ⛔ **שורות שכבר מתקבלות היום אינן בתור בכלל.** אין מה ללמוד מפסק על מחרוזת
 * שהאפליקציה כבר מקבלת · הן נשארות בקורפוס כעוגני רגרסיה, לא כפריטי מורה.
 *
 * ===== ⭐ השזירה · הדבר היחיד שהופך "לעצור מוקדם" למשהו שווה =====
 *
 * מיון לפי ציון בלבד היה נותן 2,000 פריטים ראשונים שכולם `sp-adj` באנגלית —
 * כלומר עצירה מוקדמת קונה **לקח אחד** במקום מפה. לכן בתוך כל מדרגה התור נשזר
 * round-robin על פני ‎(מחלקה × שפה × כיוון)‎, וכל דלי תורם לפי הסדר הפנימי שלו.
 * כך כל קידומת של התור היא **מדגם מייצג** ולא פינה אחת.
 *
 * ⚠ **התור אינו נושא את הכרעת האלגוריתם.** `rank` ו-`tier` הם סדר עבודה ולא פסק,
 * ואין בשורה `margin`, `today` או `edge` — הם ב-`answers-dx-*.jsonl` בלבד, ואין
 * להגישם למורה. מורה שרואה מה האלגוריתם חושב מעגן את עצמו במה שאנחנו משפרים.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fnv1a } = require('./lib/rng.js');

const OUT = path.join(__dirname, 'out');

/* מדידות הסוכן שמריץ את המורה · לא שלי. משמשות לתמחור בלבד. */
const TOKENS_PER_VERDICT = 791;
const ITEMS_PER_HOUR = 50000 / 52;

/* המחלקות שמנגנון המרחק אינו יכול להגיע אליהן · ראה T3 למעלה. */
const SEMANTIC = new Set([
  'synonym', 'partial-head', 'partial-cut', 'extra-word', 'word-order', 'morph-pair',
  'neg-synonym-rejected', 'neg-gloss-swap', 'neg-morph-overreach',
]);

const STOPS = [250, 500, 1000, 2000, 5000, 10000, 25000, 50000];

function readJsonl(f) {
  const p = path.join(OUT, f);
  if (!fs.existsSync(p)) throw new Error(`teacher_queue: ${f} חסר · הרץ קודם node typo-lab/gen_answers.js`);
  return fs.readFileSync(p, 'utf8').trim().split('\n').map(l => JSON.parse(l));
}

/* ציון בתוך המדרגה · קטן = קרוב יותר לגבול = יקר יותר.
   כל מדרגה והסקלר הטבעי שלה · אין המרה מזויפת ליחידה משותפת. */
function scoreOf(tier, d) {
  if (tier === 'T1') return Math.abs(d.margin == null ? 99 : d.margin);
  if (tier === 'T2') {
    const g = d.gap == null ? 99 : d.gap;
    const m = d.margin == null ? 99 : Math.abs(d.margin);
    return Math.min(Math.abs(g), m);
  }
  return d.margin == null ? 99 : Math.abs(d.margin);
}

function build(opts) {
  const o = opts || {};
  const rows = readJsonl('answers-he.jsonl').concat(readJsonl('answers-en.jsonl'));
  const dx = new Map(readJsonl('answers-dx-he.jsonl').concat(readJsonl('answers-dx-en.jsonl')).map(r => [r.id, r]));

  let oursIds = new Set();
  const op = path.join(OUT, 'probe-ours.json');
  if (fs.existsSync(op)) for (const e of JSON.parse(fs.readFileSync(op, 'utf8')).ids) oursIds.add(e.id);
  else if (!o.allowNoProbe) throw new Error('teacher_queue: out/probe-ours.json חסר · הרץ קודם node typo-lab/probe_accepts.js');
  if (o.noOurs) oursIds = new Set();

  const dropped = { today: 0, noDx: 0 };
  const tiers = { T0: [], T1: [], T2: [], T3: [], T4: [] };

  for (const r of rows) {
    const d = dx.get(r.id);
    if (!d) { dropped.noDx++; continue; }
    /* ⚠ ‏T0 גובר על סינון "מתקבל היום", ולא במקרה. הדגל `today` נגזר מ-`acceptsToday`
       שמוריד `TYPO_PARAMS.enabled` — וזה **אינו** מכבה את `TYPO_GLOSS_RULES.synonyms`
       (app.js:1772). לכן 7 שורות שהשכבה שלנו מקבלת דרך `typoCanon` נושאות
       `today=true`, והסינון היה מוציא אותן מהתור — כלומר **דווקא את השורות שבגללן
       התור קיים**. נמדד: ‏T0 יצא 179 במקום 186. */
    if (!oursIds.has(r.id) && d.today) { dropped.today++; continue; }
    let tier;
    if (oursIds.has(r.id)) tier = 'T0';
    else if (d.edgeStrict) tier = 'T1';
    else if (d.edge) tier = 'T2';
    else if (SEMANTIC.has(r.source_class)) tier = 'T3';
    else tier = 'T4';
    tiers[tier].push({ r, d, score: scoreOf(tier, d), bucket: `${r.source_class}|${r.lang}|${r.direction}` });
  }

  /* שזירה · round-robin על הדליים, כל דלי בסדר הפנימי שלו.
     שובר-שוויון דטרמיניסטי: הציון, ואז fnv1a של ה-id (לא סדר הקריאה). */
  const weave = list => {
    const buckets = new Map();
    for (const e of list) {
      let b = buckets.get(e.bucket); if (!b) { b = []; buckets.set(e.bucket, b); }
      b.push(e);
    }
    const names = Array.from(buckets.keys()).sort();
    for (const n of names) {
      buckets.get(n).sort((a, b) => a.score - b.score || (fnv1a(a.r.id) - fnv1a(b.r.id)) || (a.r.id < b.r.id ? -1 : 1));
    }
    const out = [];
    for (let i = 0; ; i++) {
      let any = false;
      for (const n of names) {
        const b = buckets.get(n);
        if (i >= b.length) continue;
        any = true; out.push(b[i]);
      }
      if (!any) break;
    }
    return out;
  };

  const woven = {};
  for (const t of ['T0', 'T1', 'T2', 'T3', 'T4']) {
    woven[t] = o.noWeave
      ? tiers[t].slice().sort((a, b) => a.score - b.score || (a.r.id < b.r.id ? -1 : 1))
      : weave(tiers[t]);
  }

  /* ===== ⭐ EXT · חמשת המקרים האמיתיים של חגי · מעל הכול =====
   * ‏`out/cases-hagai-16.8.tsv` · ראיה אמיתית מהתרגול, לא סינתטית. מעמדם זהה
   * ל-24 המקרים: **benchmark חיצוני**. לא מתאמנים עליהם ולא מכיילים לפיהם —
   * מדווחים כמה נפתרים. לכן `purpose:"external"`, שאינו `train` ואינו `ceiling`.
   * ⚠ ‏H16-1 הוא **דחייה נכונה** ומוחזק כעוגן שלילי: כל שינוי שיגרום לו להתקבל
   * הוא רגרסיה, ולא שיפור. */
  const ext = [];
  const extPath = path.join(OUT, 'cases-hagai-16.8.tsv');
  if (fs.existsSync(extPath) && !o.noExt) {
    const lines = fs.readFileSync(extPath, 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
    const hdr = lines.shift().split('\t');
    for (const line of lines) {
      const c = line.split('\t'); const r = {};
      hdr.forEach((h, i) => r[h] = c[i]);
      if (!r.id) continue;
      ext.push({
        id: r.id, lang: r.lang, direction: r.direction,
        card_term: r.term, card_gloss: r.bank, typed: r.typed,
        source_class: 'hagai16/' + r.class, seed: 'cases-hagai-16.8.tsv|' + r.id, split: 'external',
      });
    }
  }

  /* ‏24 המקרים · ה-benchmark החיצוני הוותיק. שני הסטים נמדדים באותה הרצה, אחרת
     "כמה נפתרים" הוא שני מספרים משתי נקודות זמן. */
  const c24 = path.join(OUT, 'answers-cases24.jsonl');
  if (fs.existsSync(c24) && !o.noExt) {
    for (const line of fs.readFileSync(c24, 'utf8').trim().split('\n')) {
      const r = JSON.parse(line);
      ext.push({
        id: r.id, lang: r.lang, direction: r.direction,
        card_term: r.card_term, card_gloss: r.card_gloss, typed: r.typed,
        source_class: r.source_class, seed: r.seed, split: 'external',
      });
    }
  }

  const order = [];
  if (o.mix) {
    /* ===== מצב `--mix` · **ברירת המחדל** · מכסה שמורה למדרגות הסמנטיות =====
     * הסדר המדורג הקפדני (`--strict`) משאיר את T3 **בלתי נגיש**: הוא מתחיל רק
     * אחרי T0+T1+T2 במלואם, כלומר אחרי כ-48,000 פריטים ≈ 50 שעות. וזו בעיה
     * אמיתית — 18 מתוך 24 המקרים הם סמנטיים, כלומר בדיוק מה שנשאר בחוץ.
     * כאן T0 ראשון (אחרי EXT), ואז מכסה קבועה של ‎5:2:3‎ בין T1/T2/T3, ו-T4 בסוף. */
    for (const e of woven.T0) order.push({ tier: 'T0', e });
    const q = { T1: 5, T2: 2, T3: 3 };
    const at = { T1: 0, T2: 0, T3: 0 };
    let left = woven.T1.length + woven.T2.length + woven.T3.length;
    while (left > 0) {
      for (const t of ['T1', 'T2', 'T3']) {
        for (let k = 0; k < q[t] && at[t] < woven[t].length; k++) { order.push({ tier: t, e: woven[t][at[t]++] }); left--; }
      }
    }
    for (const e of woven.T4) order.push({ tier: 'T4', e });
  } else {
    for (const t of ['T0', 'T1', 'T2', 'T3', 'T4']) for (const e of woven[t]) order.push({ tier: t, e });
  }

  /* ===== ⭐ `purpose` · ההבחנה שמונעת מהתלמיד ללמוד מרעש =====
   * התלמיד הוא אלגוריתם **מבוסס מרחק**. לשורות T3 — סמנטיות ורחוקות מכל סף — אין
   * לו בכלל תכונה שיכולה לבטא אותן, ולכן פסק מורה עליהן אינו נכנס לשום מקום.
   * אימון עליהן אינו רק בזבוז תקציב · הוא בזבוז ש**נראה כמו למידה**.
   * לכן הן נושאות `purpose:"ceiling"` והן עונות על שאלה אחרת לגמרי:
   * **כמה נשאר על השולחן שמרחק לעולם לא יגיע אליו.** זה ההבדל בין "האלגוריתם עוד
   * לא מספיק טוב" לבין "שום אלגוריתם מהסוג הזה לא יפתור את זה".
   * ⛔ מי שמאמן חייב לסנן `purpose === 'train'`. שתי הקבוצות מדווחות בנפרד. */
  const queue = ext.map((r, i) => ({
    rank: i + 1, tier: 'EXT', purpose: 'external',
    id: r.id, lang: r.lang, direction: r.direction,
    card_term: r.card_term, card_gloss: r.card_gloss,
    typed: r.typed, source_class: r.source_class, seed: r.seed, split: r.split,
  })).concat(order.map((x, i) => ({
    rank: ext.length + i + 1, tier: x.tier, purpose: x.tier === 'T3' ? 'ceiling' : 'train',
    id: x.e.r.id, lang: x.e.r.lang, direction: x.e.r.direction,
    card_term: x.e.r.card_term, card_gloss: x.e.r.card_gloss,
    typed: x.e.r.typed, source_class: x.e.r.source_class, seed: x.e.r.seed, split: x.e.r.split,
  })));

  const text = queue.map(r => JSON.stringify(r)).join('\n') + (queue.length ? '\n' : '');
  const sha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  if (!o.dryRun) fs.writeFileSync(path.join(OUT, 'teacher-queue.jsonl'), text, 'utf8');

  const tierCount = {};
  for (const t of Object.keys(tiers)) tierCount[t] = tiers[t].length;
  tierCount.EXT = ext.length;
  const classesInQueue = new Set(queue.map(r => r.source_class)).size;
  const purposeCount = { external: 0, train: 0, ceiling: 0 };
  for (const r of queue) purposeCount[r.purpose]++;
  return { queue, sha, bytes: Buffer.byteLength(text, 'utf8'), tierCount, dropped, oursIds: oursIds.size, totalRows: rows.length, classesInQueue, purposeCount, extCount: ext.length, mix: !!o.mix };
}

/* כיסוי בקידומת · כמה מחלקות, שפות וכיוונים נקנו עד נקודת העצירה. */
function coverageAt(queue, n) {
  const cls = new Set(), ld = new Set(), tier = {};
  let train = 0, ceiling = 0;
  for (let i = 0; i < Math.min(n, queue.length); i++) {
    const r = queue[i];
    cls.add(r.source_class); ld.add(r.lang + '/' + r.direction);
    tier[r.tier] = (tier[r.tier] || 0) + 1;
    if (r.purpose === 'ceiling') ceiling++; else train++;
  }
  return { classes: cls.size, langDir: ld.size, tier, train, ceiling };
}

function md(res) {
  const L = [];
  const n = x => Number(x || 0).toLocaleString('en-US');
  const q = res.queue;
  L.push('# תור מדורג למורה · `teacher-queue.jsonl`', '');
  L.push(`\`node typo-lab/teacher_queue.js\` · **${n(q.length)}** פריטים · SHA-256 \`${res.sha}\``, '');
  L.push('**התמחור אינו שלי** — 791 טוקנים לפסק-עדשה ו-50,000 פריטים ב-52 שעות הן');
  L.push('מדידות הסוכן שמריץ את המורה. הטבלה מתרגמת אותן לנקודות עצירה.', '');
  L.push('| מדרגה | פריטים | מה זה |', '|---|---:|---|');
  const what = {
    T0: '⛔ האפליקציה החיה מקבלת אותן **דרך השכבה שלנו** · אפס חוצות כרטיסים',
    T1: '⭐ גרעין הגבול · ‎E1/E3‎ · ההכרעה מתהפכת משינוי זעיר, או שרק וטו עוצר',
    T2: 'שאר הגבול · ‎E2/E4/E5‎ · שער המשטר, תקרת הפעולות, שער הדו-משמעות',
    T3: 'מחלקות סמנטיות שמנגנון המרחק אינו יכול להגיע אליהן בשום כיול',
    T4: 'השאר',
  };
  for (const t of ['T0', 'T1', 'T2', 'T3', 'T4']) L.push(`| **${t}** | ${n(res.tierCount[t])} | ${what[t]} |`);
  L.push(`| | **${n(q.length)}** | |`, '');
  L.push(`⛔ **${n(res.dropped.today)} שורות שכבר מתקבלות היום הוצאו מהתור.** פסק עליהן אינו מלמד דבר;`);
  L.push('הן נשארות בקורפוס כעוגני רגרסיה.', '');
  L.push('## ⭐ שני מספרים נפרדים · `train` מול `ceiling`', '');
  L.push('התלמיד הוא אלגוריתם **מבוסס מרחק**. לשורות T3 — סמנטיות ורחוקות מכל סף —');
  L.push('אין לו תכונה שיכולה לבטא אותן, ולכן פסק עליהן **לא ייכנס לשום מקום**. זה לא');
  L.push('בזבוז תקציב בלבד; זה בזבוז ש**נראה כמו למידה**. לכן הן מסומנות בשדה מפורש.', '');
  L.push('| `purpose` | פריטים | מה זה עונה |', '|---|---:|---|');
  L.push(`| ⭐ **\`train\`** | **${n(res.purposeCount.train)}** | מה שהתלמיד יכול ללמוד · יש לו תכונה שמבטאת את זה |`);
  L.push(`| 📏 **\`ceiling\`** | **${n(res.purposeCount.ceiling)}** | **כמה נשאר על השולחן שמרחק לעולם לא יגיע אליו** |`, '');
  L.push('‏`ceiling` אינו דאטת אימון אלא **מדידת תקרה**, והוא המספר שמבדיל בין');
  L.push('"האלגוריתם עוד לא מספיק טוב" לבין "שום אלגוריתם מהסוג הזה לא יפתור את זה,');
  L.push('וצריך מנגנון אחר". ⛔ **מי שמאמן חייב לסנן `purpose === "train"`.**', '');

  L.push('## נקודות עצירה · מה נקנה בכל תקציב', '');
  L.push('| עוצרים אחרי | טוקנים | שעות | מחלקות | שפה×כיוון | ⭐ `train` | 📏 `ceiling` |');
  L.push('|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of STOPS.concat([q.length]).filter((v, i, a) => v <= q.length && a.indexOf(v) === i)) {
    const c = coverageAt(q, s);
    L.push(`| ${n(s)} | ${n(s * TOKENS_PER_VERDICT)} | ${(s / ITEMS_PER_HOUR).toFixed(1)} | ${c.classes}/${res.classesInQueue} | ${c.langDir}/4 | ${n(c.train)} | ${n(c.ceiling)} |`);
  }
  L.push('');
  L.push(`⚠ המכנה הוא **${res.classesInQueue}** ולא 29 · חמש מחלקות (`);
  L.push('`synonym` · `word-order` · שלוש מחלקות הניקוד) מתקבלות היום ב-100% ולכן');
  L.push('אינן בתור כלל. מכנה 29 היה מדווח כיסוי חסר שאינו קיים.', '');
  {
    /* ⚠ המספרים כאן **נגזרים מהתור שנבנה עכשיו** ואינם מוקלדים. הגרסה הקודמת
       כתבה "21 מחלקות" כמחרוזת קשיחה, ומעבר ברירת המחדל ל-`--mix` הפך אותה
       ל-18 בלי שאיש ישים לב. טענה מספרית בדוח חייבת לבוא מהמדידה. */
    const c250 = coverageAt(q, 250), c500 = coverageAt(q, 500);
    L.push(`⭐ **‏250 פריטים · ${(250 / ITEMS_PER_HOUR).toFixed(1)} שעות · ${n(250 * TOKENS_PER_VERDICT)} טוקנים** קונים את **כל** ${res.tierCount.T0} שורות T0`);
    L.push(`ואת ראש הגרעין, ובזכות השזירה הם פרושים על **${c250.classes} מתוך ${res.classesInQueue}** המחלקות ועל **${c250.langDir}/4**`);
    L.push(`הצירופים שפה×כיוון. ב-500 פריטים (${(500 / ITEMS_PER_HOUR).toFixed(1)} שעות) הכיסוי כבר **${c500.classes}/${res.classesInQueue}**.`);
    L.push('עצירה שם אינה "רבע עבודה" אלא מפה גסה של כל המרחב — וזה מה שהופך את');
    L.push('הארכיטקטורה הזאת למעשית בתקציב אמיתי.', '');
  }
  if (!res.mix) {
    L.push('## ⚠ מה שהסדר המדורג הקפדני משאיר בחוץ · והוא צריך הכרעה', '');
    L.push(`‏**T3 מתחיל רק אחרי ${n(res.tierCount.T1 + res.tierCount.T2 + res.tierCount.T0)} פריטים ≈ ${((res.tierCount.T1 + res.tierCount.T2 + res.tierCount.T0) / ITEMS_PER_HOUR).toFixed(0)} שעות.** כלומר בכל תקציב מציאותי,`);
    L.push('השורות הסמנטיות ש**רחוקות מכל סף** אינן נקנות בכלל.');
    L.push('');
    L.push('⚠ **ובדיוק · לא "אין מחלקות סמנטיות בראש התור".** נמדד: ‏240 מתוך 2,000');
    L.push('הפריטים הראשונים כבר שייכים למחלקות סמנטיות — הן נכנסות דרך T1/T2, כי שורה');
    L.push('סמנטית יכולה גם היא לשבת על הגבול. מה שחסר הוא המדרגה שבה האלגוריתם מוכרע');
    L.push('לחלוטין, וזו בדיוק הצורה שבה 24 המקרים נראים.', '');
    L.push('⛔ וזו אינה פינה זניחה: **18 מתוך 24 המקרים האמיתיים של חגי הם סמנטיים**,');
    L.push('ו-`STATE.md` כבר מדד שאף חוק מרחק בטוח אינו מגיע אליהם. תור שלא קונה מהם');
    L.push('אף פסק ילמד את התלמיד לכייל ספים, ולא ייתן לו מנגנון לבעיה שבגללה התחלנו.');
    L.push('');
    L.push('הסדר הזה הוא **מה שהתבקש** (גרעין קודם), ולכן הוא ברירת המחדל ולא שיניתי אותו.');
    L.push('החלופה מוכנה ורצה בדגל אחד:', '', '```', 'node typo-lab/teacher_queue.js --mix', '```', '');
    L.push('‏`--mix` שומר את T0 בראש, ואז מכסה קבועה **5:2:3** בין T1/T2/T3 — כלומר');
    L.push('כ-30% מכל תקציב הולך למחלקות הסמנטיות מהפריט הראשון. **ההכרעה אינה שלי.**', '');
  } else {
    L.push('## ⭐ מצב `--mix` · ברירת המחדל, וההכרעה שמאחוריה', '');
    L.push('‏T0 בראש, ואז מכסה קבועה **5:2:3** בין T1/T2/T3, ו-T4 בסוף.', '');
    L.push('**למה זו ברירת המחדל:** בסדר המדורג הקפדני, T3 מתחיל רק אחרי');
    L.push(`‏${n(res.tierCount.T0 + res.tierCount.T1 + res.tierCount.T2)} פריטים ≈ ${((res.tierCount.T0 + res.tierCount.T1 + res.tierCount.T2) / ITEMS_PER_HOUR).toFixed(0)} שעות — כלומר בכל תקציב מציאותי לא נקנה ממנו אף פסק,`);
    L.push('ו-18 מתוך 24 המקרים האמיתיים הם בדיוק הצורה הזאת.', '');
    L.push('⚠ **ובדיוק · לא "אין מחלקות סמנטיות בראש התור".** נמדד: גם בסדר הקפדני,');
    L.push('‏240 מ-2,000 הראשונים כבר שייכים למחלקות סמנטיות — הן נכנסות דרך T1/T2, כי');
    L.push('שורה סמנטית יכולה גם היא לשבת על הגבול. מה שחסר שם הוא **המדרגה** שבה');
    L.push('האלגוריתם מוכרע לחלוטין.', '');
    L.push('‏`--strict` משחזר את הסדר המדורג הקפדני, אם צריך אותו להשוואה.', '');
  }

  L.push('## מה יש בשורה, ומה בכוונה אין', '');
  L.push('| שדה | |', '|---|---|');
  L.push('| `rank` · `tier` | סדר עבודה · **אינם פסק** |');
  L.push('| `id` `lang` `direction` `card_term` `card_gloss` `typed` `source_class` `seed` `split` | מה שמוגש למורה |');
  L.push('| ⛔ `margin` `today` `edge` `dOwn` `dOther` | **אינם כאן** · `answers-dx-*.jsonl` בלבד |', '');
  L.push('⚠ `source_class` הוא **מוצא ולא פסק**. שורה `neg-` היא השערת-קושי של המחולל,');
  L.push('לא הכרעה שהתשובה שגויה — וכבר נמצא בפועל שחלק מהן נכונות. אין להזין אותה');
  L.push('למורה כרמז.', '');
  return L.join('\n');
}

function selftest() {
  const out = [];
  let all = true;
  const ok = (name, pass, note) => { all = all && pass; out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? '  · ' + note : ''}`); };

  /* ברירת המחדל היא `--mix` · השערים בודקים את שני המצבים במפורש. */
  const res = build({ dryRun: true, mix: true });
  const strict = build({ dryRun: true });
  const q = res.queue;
  const inQueue = new Set(q.map(r => r.id));
  const dxHas = id => inQueue.has(id);
  ok('א · התור אינו ריק', q.length > 50000, `${q.length}`);
  ok('ב · דירוג רציף ועולה', q.every((r, i) => r.rank === i + 1));

  const dx = new Map(readJsonl('answers-dx-he.jsonl').concat(readJsonl('answers-dx-en.jsonl')).map(r => [r.id, r]));
  /* הכלל המדויק · "מתקבל היום" מוצא מהתור **חוץ מ-T0**. שבע שורות `synonyms`
     נושאות `today=true` מפני ש-`acceptsToday` אינו מכבה את `TYPO_GLOSS_RULES`,
     והן דווקא השורות שבגללן התור קיים. */
  /* ⚠ שורות EXT מגיעות מ-TSV חיצוני ואין להן שורת dx · הן אינן חלק מהקורפוס. */
  const todayOut = q.filter(r => r.tier !== 'T0' && r.tier !== 'EXT' && dx.get(r.id).today);
  const todayIn = q.filter(r => r.tier === 'T0' && dx.get(r.id).today);
  ok('ג · "מתקבל היום" מוצא מהתור · חוץ מ-T0',
    todayOut.length === 0, `${res.dropped.today} הוצאו · ${todayIn.length} נשמרו ב-T0`);

  /* ⛔ הספירה מושווית ל**קובץ הפרובה**, לא למונה של הבנייה עצמה · השוואה עצמית
     עוברת גם כשהתור איבד שורות. זה בדיוק מה שקרה: ‏179 במקום 186. */
  const probe = JSON.parse(fs.readFileSync(path.join(OUT, 'probe-ours.json'), 'utf8'));
  const t0 = q.filter(r => r.tier === 'T0');
  const t0ids = new Set(t0.map(r => r.id));
  ok('ד · ‏T0 הוא בדיוק קבוצת ה-`ours` של הפרובה, והוא מיד אחרי EXT',
    t0.length === probe.ids.length && probe.ids.every(e => t0ids.has(e.id)) && t0.every(r => r.rank <= res.extCount + probe.ids.length),
    `${t0.length}/${probe.ids.length}`);
  ok('ד2 · ‏T0 שורד את סינון "מתקבל היום"',
    probe.ids.filter(e => dxHas(e.id)).length === probe.ids.length, 'כל שורות ours בתור');

  const order = ['EXT', 'T0', 'T1', 'T2', 'T3', 'T4'];
  let mono = true, last = 0;
  for (const r of strict.queue) { const i = order.indexOf(r.tier); if (i < last) mono = false; last = Math.max(last, i); }
  ok('ה · במצב `--strict` המדרגות אינן מתערבבות', mono);
  ok('ה2 · ‏EXT ראשון, T0 אחריו, T4 אחרון',
    q.slice(0, res.extCount).every(r => r.tier === 'EXT') &&
    q.slice(res.extCount, res.extCount + res.tierCount.T0).every(r => r.tier === 'T0') &&
    q.slice(-res.tierCount.T4).every(r => r.tier === 'T4'));

  const banned = ['margin', 'today', 'edge', 'edgeStrict', 'dOwn', 'dOther', 'wdist', 'gap', 'regime'];
  ok('ו · ⛔ אין דליפה של הכרעת האלגוריתם לתור', q.slice(0, 5000).every(r => banned.every(b => r[b] === undefined)));

  /* ⛔ שן · בלי השזירה, קידומת התור מאבדת כיסוי. אם המספרים זהים — השזירה no-op. */
  const naive = build({ dryRun: true, noWeave: true });
  const cW = coverageAt(q, 250), cN = coverageAt(naive.queue, 250);
  ok('ז · ⛔ שן · השזירה מגדילה את הכיסוי ב-250 הראשונים',
    cW.classes > cN.classes, `שזור ${cW.classes} מחלקות · נאיבי ${cN.classes}`);

  /* ⛔ שן · בלי probe-ours התור חייב להשתנות (T0 מתרוקן). */
  const noOurs = build({ dryRun: true, noOurs: true });
  ok('ח · ⛔ שן · בלי קבוצת ה-`ours` התור שונה', noOurs.sha !== res.sha && noOurs.tierCount.T0 === 0);

  /* אותן אפשרויות בדיוק · השוואה מול בנייה במצב אחר הייתה נכשלת מסיבה נכונה
     ולא מדידה. שני המצבים נבדקים לדטרמיניזם בנפרד. */
  const again = build({ dryRun: true, mix: true });
  const againStrict = build({ dryRun: true });
  ok('ט · דטרמיניזם · שתי בניות, אותו SHA', again.sha === res.sha, res.sha.slice(0, 16));
  ok('ט2 · דטרמיניזם גם ב-`--strict`', againStrict.sha === strict.sha, strict.sha.slice(0, 16));
  ok('ט3 · שני המצבים מפיקים תור שונה', strict.sha !== res.sha);

  /* ⚠ נמדד ולא הונח: מחלקות סמנטיות **כן** מופיעות מוקדם דרך T1/T2 (‏240 מתוך
     2,000 הראשונים), כי שורה סמנטית יכולה גם היא לשבת על הגבול. מה שחסר בסדר
     הקפדני הוא **מדרגת T3** — השורות הסמנטיות שרחוקות מכל סף. הגרסה הראשונה של
     השער בדקה מחלקות ולא מדרגה, ולכן היא נכשלה — וזה תפס ניסוח מוגזם בדוח. */
  const t3Strict = strict.queue.slice(0, 2000).filter(r => r.tier === 'T3').length;
  const t3Mixed = q.slice(0, 2000).filter(r => r.tier === 'T3').length;
  ok('י · ⛔ שן · ברירת המחדל מכניסה את מדרגת T3 ל-2,000 הראשונים',
    t3Strict === 0 && t3Mixed > 400, `strict ${t3Strict} · ברירת מחדל ${t3Mixed}`);

  /* ⛔ `purpose` · הסימון חייב לחפוף **בדיוק** ל-T3. אם לא, מי שמסנן `train`
     יאמן את התלמיד על שורות שאין לו תכונה לבטא אותן — בזבוז שנראה כמו למידה. */
  const badPurpose = q.filter(r => (r.purpose === 'ceiling') !== (r.tier === 'T3')).length;
  ok('י2 · `purpose=ceiling` חופף בדיוק ל-T3', badPurpose === 0,
    `train ${res.purposeCount.train} · ceiling ${res.purposeCount.ceiling}`);
  ok('י3 · שלוש קבוצות ה-purpose מסתכמות לתור',
    res.purposeCount.train + res.purposeCount.ceiling + res.purposeCount.external === q.length,
    JSON.stringify(res.purposeCount));
  ok('י4 · ⭐ שני הסטים החיצוניים בראש · 5 של חגי ואז 24',
    res.extCount === 29 && q.slice(0, 5).every(r => r.purpose === 'external' && r.tier === 'EXT' && r.id.startsWith('H16-')) && q.slice(5, 29).every(r => r.tier === 'EXT' && r.id.startsWith('case-')),
    q.slice(0, 5).map(r => r.id).join(' '));

  process.stdout.write(out.join('\n') + '\n' + (all ? '\n✅ כל השערים עברו\n' : '\n⛔ שער נכשל\n'));
  return all;
}

module.exports = { build, coverageAt, md, selftest, SEMANTIC, TOKENS_PER_VERDICT, STOPS };

if (require.main === module) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  /* ⭐ ברירת המחדל היא  · ההכרעה שהתקבלה אחרי שנמדד ש-T3 אינו נגיש בסדר
     המדורג הקפדני.  משחזר את הסדר הקודם. */
  const res = build({ mix: !process.argv.includes('--strict') });
  fs.writeFileSync(path.join(OUT, 'teacher-queue.md'), md(res), 'utf8');
  process.stdout.write(`תור ${res.queue.length} פריטים · ${(res.bytes / 1048576).toFixed(1)}MB · ${res.sha.slice(0, 16)}…\n`);
  process.stdout.write(`מדרגות · ${['T0', 'T1', 'T2', 'T3', 'T4'].map(t => t + '=' + res.tierCount[t]).join(' · ')}\n`);
  process.stdout.write(`הוצאו · מתקבל היום ${res.dropped.today}\n`);
  process.stdout.write('נכתב ל-out/teacher-queue.jsonl · out/teacher-queue.md\n');
}
