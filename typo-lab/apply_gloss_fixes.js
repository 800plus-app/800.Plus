'use strict';
/* החלת הצעות תיקון פירוש על `data-en.js` · typo-lab/apply_gloss_fixes.js
 *
 *   node typo-lab/apply_gloss_fixes.js              דריי־ראן
 *   node typo-lab/apply_gloss_fixes.js --write      כתיבה
 *   node typo-lab/apply_gloss_fixes.js --selftest   הוכחת שיניים
 *
 * ⛔ **למה הקובץ הזה קיים בכלל.** ב-19.8 הוחלו 140 "תיקונים" בהנחה ששני קובצי
 * ההצעות באותו פורמט. הם לא: ב-`gloss-fixes.tsv` עמודת «ההצעה» היא **הפירוש
 * החדש**, וב-`gloss-audit.tsv` היא **מה לעשות**. התוצאה הייתה `lie` שפירושו
 * "להסיר ניקוד". ‏4 בדיקות האדימו לפני קומיט והכול שוחזר — אבל שום דבר בקוד
 * לא מנע את זה. הקובץ הזה הוא המניעה.
 *
 * ארבעה שערים, כל אחד נגזר מכשל שקרה בפועל:
 *
 *   1 · גזירה לפי סוג · כל מחלקה והמקור שלה לפירוש החדש. אין "עמודה 4".
 *   2 · שער־הוראה · מחרוזת שהיא הוראה נפסלת ואינה נכתבת לעולם.
 *       ⚠ הניסיון הראשון השתמש ב-`\b` והיה **מת**: אות עברית אינה `\w`, ולכן
 *       `/^להסיר\b/` מחזיר false על "להסיר ניקוד". נתפס רק כי הרצתי מקרה מורעל.
 *       ⚠ הניסיון השני פסל רשימת פעלים והיה **רחב מדי**: הוא הפיל את
 *       `transform` → "לשנות צורה", פירוש תקין. פועל אינו הוראה; הביטוי המדויק הוא.
 *   3 · יעד יחיד למילה · 6 מילים מופיעות ביותר מרשימה אחת עם יעדים שונים.
 *       בלי זה המנצח הוא מי שרץ אחרון, בשקט.
 *   4 · אימות מקום ב-NFC · לכל מילה התאמה **יחידה**, והפירוש בקובץ חייב להיות
 *       זהה ל«פירוש היום». ⚠ ו-NFC אינו קישוט: `incidence` נכשל כי בקובץ יושב
 *       ק+דגש+קמץ ובהצעה ק+קמץ+דגש. אותה גליפה, סדר מקפים אחר.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data-en.js');
const OUT = path.join(__dirname, 'out');

const NIQQUD = /[\u0591-\u05C7]/g;
const nfc = s => String(s).normalize('NFC');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ⛔ הביטויים המדויקים שמופיעים בעמודת «ההצעה», לא רשימת פעלים. */
const INSTRUCTION = /^(להסיר ניקוד|להחליף במילה|להצר ל:)/;
const INSTR_WORDS = /(ניקוד|במילה|מכני|חוסר עקביות)/;
function gateFail(g) {
  if (!g || !String(g).trim()) return 'ריק';
  if (INSTRUCTION.test(String(g).trim())) return 'ביטוי־הוראה';
  if (INSTR_WORDS.test(g)) return 'מילת־הוראה';
  if (!/[\u05D0-\u05EA]/.test(g)) return 'אין אות עברית';
  if (/["\\]/.test(g)) return 'תו ששובר JSON';
  return null;
}

function tsv(file) {
  const lines = fs.readFileSync(path.join(OUT, file), 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
  const head = lines[0].split('\t');
  return lines.slice(1).map(l => { const c = l.split('\t'), o = {}; head.forEach((h, i) => o[h] = (c[i] || '').trim()); return o; });
}

/* שלב 1 · גזירה. כל מחלקה ומאיפה מגיע אצלה הפירוש החדש. */
function derive() {
  const out = [];
  for (const r of tsv('gloss-fixes.tsv')) {
    if (r['מי צריך להשתנות'] !== 'פירוש') continue;
    out.push({ cls: 'fixes', term: r['מילה'], cur: r['פירוש היום'], neu: r['ההצעה'] });
  }
  for (const r of tsv('gloss-audit.tsv')) {
    const p = r['ההצעה'], cur = r['פירוש היום'];
    if (/^להסיר ניקוד/.test(p))      out.push({ cls: 'ניקוד', term: r['מילה'], cur, neu: cur.replace(NIQQUD, '') });
    else if (/^להצר ל:/.test(p))      out.push({ cls: 'הצרה', term: r['מילה'], cur, neu: p.replace(/^להצר ל:\s*/, '') });
    /* ⛔ «להחליף במילה» אינו מוחל כאן. נמדד: 41 מתוך 48 **מאבדים מובן קיים**
       (`account` מאבד "take into account", `built` מאבד את צורת העבר כולה).
       הפעולה הנכונה שם היא מיזוג ידני, לא החלפה. */
    else out.push({ cls: 'החלפה', term: r['מילה'], cur, neu: r['מה השופט העיוור כתב'], skip: true });
  }
  for (const o of out) o.fail = gateFail(o.neu);
  return out;
}

/* שלב 2 · יעד יחיד לכל מילה. הסדר: fixes ואז הצרה; ניקוד הוא שכבת עיצוב
   שמופעלת על התוצאה, ולכן אינו מתחרה על היעד אלא מנקה אותו. */
function resolve(derived, classes) {
  const target = new Map();
  for (const o of derived) {
    if (o.fail || o.skip || o.cls === 'ניקוד' || !classes.includes(o.cls)) continue;
    if (!target.has(o.term)) target.set(o.term, { cur: o.cur, neu: o.neu, from: [o.cls] });
    else target.get(o.term).from.push(o.cls);
  }
  if (classes.includes('ניקוד')) {
    for (const o of derived.filter(o => o.cls === 'ניקוד' && !o.fail)) {
      const t = target.get(o.term);
      if (t) { t.neu = t.neu.replace(NIQQUD, ''); t.from.push('ניקוד'); }
      else target.set(o.term, { cur: o.cur, neu: o.cur.replace(NIQQUD, ''), from: ['ניקוד'] });
    }
  }
  return target;
}

function apply(target, write) {
  let src = fs.readFileSync(DATA, 'utf8');
  const ok = [], bad = [], noop = [], done = [];
  for (const [term, t] of target) {
    if (nfc(t.neu) === nfc(t.cur)) { noop.push(term); continue; }
    const rx = '(\\[\\s*"' + esc(term) + '",\\s*")([^"]*)(")';
    const all = [...src.matchAll(new RegExp(rx, 'g'))];
    if (all.length !== 1) { bad.push({ term, why: all.length + ' התאמות במקום 1' }); continue; }
    /* כבר הוחל · ריצה חוזרת היא no-op ולא 64 דחיות. בלי זה הכלי נראה שבור
       ביום שאחרי, וזה בדיוק היום שבו מישהו "מתקן" אותו. */
    if (nfc(all[0][2]) === nfc(t.neu)) { done.push(term); continue; }
    if (nfc(all[0][2]) !== nfc(t.cur)) { bad.push({ term, why: 'הפירוש בקובץ ≠ «פירוש היום»', file: all[0][2], prop: t.cur }); continue; }
    src = src.replace(new RegExp(rx), (m, a, cur, b) => a + t.neu + b);
    ok.push({ term, cur: t.cur, neu: t.neu, from: t.from.join('+') });
  }
  if (write && !bad.length && ok.length) fs.writeFileSync(DATA, src, 'utf8');
  return { ok, bad, noop, done, wrote: write && !bad.length && !!ok.length };
}

/* ⭐ הוכחת שיניים · בלי זה השער הזה כבר היה מת פעם אחת בלי שאיש ידע. */
function selftest() {
  let pass = 0, fail = 0;
  const t = (name, cond) => { if (cond) { pass++; console.log('PASS  ' + name); } else { fail++; console.log('FAIL  ⛔ ' + name); } };

  t('א · «להסיר ניקוד» נפסל', !!gateFail('להסיר ניקוד'));
  t('ב · «להחליף במילה» נפסל', !!gateFail('להחליף במילה'));
  t('ג · «להצר ל: מ» נפסל', !!gateFail('להצר ל: מ'));
  t('ד · ⭐ פירוש תקין שמתחיל בפועל **עובר** · transform', !gateFail('לשנות צורה, להפוך ל-'));
  t('ה · פירוש תקין שמתחיל ב«להוסיף» עובר', !gateFail('להוסיף, לצרף'));
  t('ו · מחרוזת בלי עברית נפסלת', !!gateFail('replace with word'));
  t('ז · מחרוזת ריקה נפסלת', !!gateFail(''));
  t('ח · גרש כפול נפסל', !!gateFail('פירוש עם " בפנים'));

  /* השוואת NFC · אותה גליפה בשני סדרי מקפים */
  const a = 'ק' + '\u05BC' + '\u05B8', b = 'ק' + '\u05B8' + '\u05BC';
  t('ט · ⭐ NFC · שני סדרי מקפים נחשבים זהים', a !== b && nfc(a) === nfc(b));

  const d = derive();
  /* ⛔ תוקן 24.8.2026. הבדיקה דרשה **שלוש** מחלקות מ-derive(), ונפלה · לא בגלל
     שהכלי נשבר, אלא כי `gloss-audit.tsv` **נכתב מחדש** בקומיט be05791 (445
     התיקונים מהביקורת העיוורת). בפורמט החדש אין אף שורה שמתחילה ב«להסיר ניקוד»
     או ב«להצר ל:», ולכן שתי המחלקות האלה אינן קיימות עוד · כל 550 השורות
     נופלות ל«החלפה».
     ⚠ בדיקה שקובעת מספר קשיח של מחלקות מתארת **קובץ**, לא **חוזה**. מה שחייב
     להחזיק הוא שכל מחלקה שנגזרת מוכרת ומטופלת · וזה מה שנבדק כאן עכשיו. */
  const KNOWN = new Set(['fixes', 'ניקוד', 'הצרה', 'החלפה']);
  t('י · כל מחלקה שנגזרת מוכרת', d.every(x => KNOWN.has(x.cls)));
  t('י2 · ⭐ fixes תמיד קיימת · היא המקור של gloss-fixes.tsv',
    d.some(x => x.cls === 'fixes'));
  t('יא · אף פירוש שנגזר אינו נפסל בשער', d.filter(x => !x.skip && x.fail).length === 0);
  t('יב · «החלפה» מסומן skip · הוא מאבד מובן קיים', d.filter(x => x.cls === 'החלפה').every(x => x.skip));

  console.log('\n' + (fail ? '⛔ ' + fail + ' נכשלו' : '✅ ' + pass + ' עברו'));
  return fail === 0;
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const write = process.argv.includes('--write');
  const classes = (process.argv.find(a => a.startsWith('--classes=')) || '--classes=fixes,ניקוד').slice(10).split(',');
  const d = derive();
  const target = resolve(d, classes);
  const r = apply(target, write);

  console.log('=== ' + (write ? 'כתיבה' : 'דריי־ראן') + ' · מחלקות: ' + classes.join(', ') + ' ===');
  console.log('  מילים ייחודיות : ' + target.size);
  console.log('  להחלה          : ' + r.ok.length);
  console.log('  no-op          : ' + r.noop.length);
  console.log('  כבר מוחל       : ' + r.done.length);
  console.log('  נדחו           : ' + r.bad.length);
  for (const b of r.bad) console.log('    ⛔ ' + b.term + ' · ' + b.why + (b.file ? '\n        קובץ: ' + b.file + '\n        הצעה: ' + b.prop : ''));
  const skipped = d.filter(x => x.skip).length;
  if (skipped) console.log('\n  ⚠ ' + skipped + ' הצעות «להחליף במילה» **לא הוחלו** · דורשות מיזוג ידני, לא החלפה');
  if (r.wrote) console.log('\n✅ נכתב · ' + r.ok.length + ' פירושים');
  else if (write) { console.log('\n⛔ לא נכתב — יש דחיות'); process.exit(1); }
}

if (require.main === module) main();
module.exports = { derive, resolve, apply, gateFail, selftest };
