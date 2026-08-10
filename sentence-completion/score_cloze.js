/* מנקד את שער כיסוי ההקשר (דרישת חגי 1).
 *
 *   node sentence-completion/score_cloze.js run1.txt run2.txt [run3.txt ...]
 *
 * כל קובץ ריצה הוא שורה לפריט:  `12: impose, introduce, enforce`
 * מותר גם הפורמט של שופט הכיסוי:  `12: FORCED | impose, introduce, enforce`
 *
 * ההכרעה
 * -------
 * ⭐ פריט תקין הוא פריט שבו כותב שקיבל **רק את המשפט** מייצר את מילת המפתח.
 * אם הוא מייצר משהו אחר, ההקשר אינו מכריע את המפתח — לא משנה ש-100% מהבוטים
 * ענו נכון ברב-ברירה, כי שם היו מסיחים אבסורדיים ואפשר היה לפתור באלימינציה.
 *
 * שלוש דרגות:
 *   TOP1  · מילת המפתח היא הבחירה הראשונה של הרוב — ההקשר מכריע והצירוף טבעי.
 *   TOP3  · המפתח מופיע ברשימה אך אינו ראשון — עובד, אך יש ניסוח טבעי ממנו.
 *   MISS  · המפתח אינו מופיע אצל אף פותר — ⛔ הפריט נפסל.
 *
 * ⚠ מה השער הזה **אינו** מודד: קושי. הוא מודד רק אם ההקשר מכריע. פריט TOP1
 *   יכול להיות קל מדי, וזה נמדד על משתמשים אמיתיים.
 */
const fs = require('fs'), path = require('path');

const TAG = process.env.TAG || '';
const key = fs.readFileSync(path.join(__dirname, `cloze.key${TAG}.tsv`), 'utf8')
  .trim().split('\n').slice(1).map(l => l.split('\t'))
  .map(([q, level, n, words, blanks]) => ({ q: +q, level, n: +n, words: words.split('|'), blanks: +blanks }));

const norm = s => String(s).toLowerCase().trim().replace(/[^a-z+ ]/g, '');
/* התאמת נטייה שמרנית: אותו גזע אחרי הסרת סיומת נפוצה. cell/cells כן, cell/cellar לא.
   ⚠ תוקן ב-10.8: הכתיב הבריטי נחשב פספוס. שופט הכיסוי כתב `analyse` והמפתח היה
   `analyze`, והשער דיווח MISS על התאמה מלאה. בדיקת נאותות שנופלת על s/z אינה
   בדיקת נאותות. אותו טיפול ל-ise/ize ול-yse/yze. */
const brit = w => w.replace(/ise$/, 'ize').replace(/yse$/, 'yze').replace(/isation$/, 'ization');
/* ⚠ פער שני שנתפס ב-10.8: נטיות לא-רגולריות. פותר כתב `withdrew` והמפתח `withdraw`,
   וכלל סיומות אינו יכול לגשר על זה — הגה משתנה בתוך המילה. המיפוי הוא לשמות שכבר
   הופיעו בפועל, ולא ניסיון לכסות את האנגלית.
   ⭐ התיקון האמיתי הוא במקור ולא כאן: לבקש מהפותר **צורת בסיס**. במחזור של 450
   פריטים טלאי במנקד ימשיך לפספס, והבקשה בפרומט סוגרת את המחלקה כולה. */
const IRREG = { withdrew: 'withdraw', withdrawn: 'withdraw', broke: 'break', broken: 'break',
  forsook: 'forsake', forsaken: 'forsake', bore: 'bear', borne: 'bear', chose: 'choose',
  arose: 'arise', beheld: 'behold', overcame: 'overcome', undertook: 'undertake' };
const stem = w => { const b = brit(IRREG[w] || w); return b.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, ''); };
const same = (a, b) => { a = norm(a); b = norm(b); return a === b || (a.length > 3 && b.length > 3 && stem(a) === stem(b)); };

const runs = process.argv.slice(2).map(f => {
  const map = new Map();
  fs.readFileSync(f, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*(\d+)\s*:\s*(.*)$/); if (!m) return;
    let rest = m[2].trim(), rating = null;
    const r = rest.match(/^(FORCED|LOOSE|OPEN)\s*\|\s*(.*)$/i);
    if (r) { rating = r[1].toUpperCase(); rest = r[2]; }
    map.set(+m[1], { rating, cands: rest.split(',').map(s => s.trim()).filter(Boolean) });
  });
  return { file: path.basename(f), map };
});
if (!runs.length) { console.error('אין קובצי ריצה.'); process.exit(2); }

const ORDER = ['בסיס', 'בינוני', 'מתקדם', 'אקדמי'];
const per = {}; ORDER.forEach(l => per[l] = { n: 0, top1: 0, top3: 0, miss: 0 });
const rows = [], ratings = {};

for (const k of key) {
  /* לפריט דו-חסר המועמד הוא `word+word`; משווים חסר-חסר. */
  const posPerRun = runs.map(({ map }) => {
    const e = map.get(k.q); if (!e) return { pos: -1, first: '—', rating: null };
    if (e.rating) ratings[e.rating] = (ratings[e.rating] || 0) + 1;
    let pos = -1;
    e.cands.forEach((c, i) => {
      const parts = norm(c).split('+').map(s => s.trim());
      const hit = k.blanks === 1 ? same(parts[0], k.words[0])
        : parts.length === 2 && k.words.every((w, j) => same(parts[j] || '', w));
      if (hit && pos === -1) pos = i;
    });
    return { pos, first: e.cands[0] || '—', rating: e.rating };
  });
  const hits = posPerRun.filter(p => p.pos >= 0);
  const top1 = posPerRun.filter(p => p.pos === 0).length;
  const grade = top1 > runs.length / 2 ? 'TOP1' : hits.length ? 'TOP3' : 'MISS';
  per[k.level].n++; per[k.level][grade === 'TOP1' ? 'top1' : grade === 'TOP3' ? 'top3' : 'miss']++;
  rows.push({ ...k, grade, firsts: posPerRun.map(p => p.first), rating: posPerRun.map(p => p.rating).filter(Boolean) });
}

const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
console.log(`פותרים: ${runs.length} (${runs.map(r => r.file).join(', ')}) · פריטים: ${key.length}\n`);
console.log('רצועה    פריטים  TOP1  TOP3  MISS  אחוז-נפסל');
console.log('─'.repeat(52));
for (const l of ORDER) {
  const p = per[l]; if (!p.n) continue;
  console.log(pad(l, 9) + pad(p.n, 8) + pad(p.top1, 6) + pad(p.top3, 6) + pad(p.miss, 6) +
    (p.miss / p.n * 100).toFixed(0) + '%');
}
const T = Object.values(per).reduce((a, p) => ({ n: a.n + p.n, top1: a.top1 + p.top1, top3: a.top3 + p.top3, miss: a.miss + p.miss }), { n: 0, top1: 0, top3: 0, miss: 0 });
console.log('─'.repeat(52));
console.log(pad('סה"כ', 9) + pad(T.n, 8) + pad(T.top1, 6) + pad(T.top3, 6) + pad(T.miss, 6) + (T.miss / T.n * 100).toFixed(0) + '%');
if (Object.keys(ratings).length)
  console.log('\nדירוג הידוק ההקשר (שופט הכיסוי): ' + Object.entries(ratings).map(([k, v]) => `${k} ${v}`).join(' · '));

const miss = rows.filter(r => r.grade === 'MISS');
if (miss.length) {
  console.log(`\n⛔ ${miss.length} פריטים נפסלים — ההקשר אינו מכריע את המפתח:`);
  miss.forEach(r => console.log(`  ${pad(r.q, 4)}${pad(r.level + '#' + r.n, 12)}מפתח: ${pad(r.words.join('+'), 30)}הפותרים: ${r.firsts.join(' / ')}`));
}
const t3 = rows.filter(r => r.grade === 'TOP3');
if (t3.length) {
  console.log(`\n⚠ ${t3.length} פריטים גבוליים — המפתח עובד אך אינו הניסוח הטבעי:`);
  t3.forEach(r => console.log(`  ${pad(r.q, 4)}${pad(r.level + '#' + r.n, 12)}מפתח: ${pad(r.words.join('+'), 30)}טבעי יותר: ${r.firsts[0]}`));
}

console.log('\n' + '='.repeat(64));
console.log(`עובר: ${T.top1}/${T.n} (${(T.top1 / T.n * 100).toFixed(0)}%) · גבולי: ${T.top3} · נפסל: ${T.miss}`);
console.log('⚠ השער מודד הכרעת-הקשר, לא קושי. קושי נמדד על משתמשים אמיתיים.');
console.log('='.repeat(64));
