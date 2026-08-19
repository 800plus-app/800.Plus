/* השכבה האחרונה: **כל מילת תוכן בנפרד.**
 *
 * למה זו השכבה הנכונה לניבים, ולא עוד ניסיון למצוא את המחרוזת: 25 מ-26 שנשארו
 * הם צירופים, והם נופלים לא מפני שהמילים שבהם נדירות אלא מפני שהניב עצמו מופיע
 * בטקסט בנטייה אחרת (`כרה אזנו` מול `כָּרָה אָזְנִי`). המטרה שהוגדרה היא **שאין
 * מילה שהמקור שלה לא בטוח** — ולכן ההוכחה הנכונה לצירוף היא הוכחה לכל מילה בו.
 *
 * ⛔ פריט נחשב מאומת רק כאשר **כל** מילות התוכן שבו אומתו. מילה אחת שלא אומתה
 * משאירה את הפריט ברשימת החוסר, ואינה נבלעת ב"רוב הצירוף נמצא".
 *
 * סדר המקורות לכל מילה: צורה בוויקינתונים (CC0) → למה בוויקינתונים (CC0) →
 * חיפוש לקסמה ברשת (CC0) → ויקיטקסט (נחלת הכלל) → ויקימילון (CC BY-SA).
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = s => norm(s).replace(/[וי]/g, '');
const PART = /^(את|אל|על|של|עם|ב|ל|מ|ה|ו|כ|אינו|אין|לא)$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };

/* מפות מקומיות: צורות ולמות, שתיהן CC0 */
const exact = new Map(), folded = new Map();
for (const f of fs.readdirSync('forms'))
  for (const line of fs.readFileSync('forms/' + f, 'utf8').split('\n')) {
    const m = line.match(/entity\/(L\d+)(?:-F\d+)?>\t"?(.+?)"?(?:@he)?\s*$/);
    if (!m) continue;
    const k = norm(m[2]); if (!k) continue;
    if (!exact.has(k)) exact.set(k, m[1]);
    const g = fold(m[2]); if (g && !folded.has(g)) folded.set(g, m[1]);
  }
for (let i = 0; i < 5; i++)
  for (const line of fs.readFileSync('attest/lex-' + i + '.tsv', 'utf8').split('\n')) {
    const m = line.match(/entity\/(L\d+)>\t"?(.+?)"?(?:@he)?\s*$/);
    if (!m) continue;
    const k = norm(m[2]); if (k && !exact.has(k)) exact.set(k, m[1]);
    const g = fold(m[2]); if (g && !folded.has(g)) folded.set(g, m[1]);
  }
console.log(`מפת CC0: ${exact.size} מדויקות · ${folded.size} מקופלות`);

const cache = new Map();
async function attestWord(w) {
  if (cache.has(w)) return cache.get(w);
  let r = null;
  if (exact.has(w)) r = ['ויקינתונים · צורה (CC0)', exact.get(w)];
  else if (folded.has(fold(w))) r = ['ויקינתונים · כתיב מלא/חסר (CC0)', folded.get(fold(w))];
  if (!r) {                                   /* חיפוש לקסמה ברשת */
    try {
      const res = await fetch('https://www.wikidata.org/w/api.php?action=wbsearchentities' +
        '&type=lexeme&language=he&uselang=he&limit=10&format=json&search=' + encodeURIComponent(w),
        { headers: UA });
      if (res.ok) for (const x of (await res.json()).search || []) {
        const lem = norm(x.label || '');
        if (lem === w || fold(lem) === fold(w)) { r = ['ויקינתונים · חיפוש (CC0)', x.id]; break; }
      }
    } catch (e) {}
    await sleep(110);
  }
  for (const [host, label] of [['he.wikisource.org', 'ויקיטקסט · נחלת הכלל'],
                               ['he.wiktionary.org', 'ויקימילון · CC BY-SA']]) {
    if (r) break;
    try {
      const res = await fetch(`https://${host}/w/api.php?action=query&titles=` +
        encodeURIComponent(w) + '&format=json', { headers: UA });
      if (res.ok) {
        const j = await res.json();
        if (Object.values(j.query.pages).some(p => p && !('missing' in p))) r = [label, 'ערך: ' + w];
      }
      if (!r) {
        const s = await fetch(`https://${host}/w/api.php?action=query&list=search&srsearch=` +
          encodeURIComponent('"' + w + '"') + '&srlimit=1&format=json', { headers: UA });
        if (s.ok) {
          const j = await s.json();
          if (j.query.searchinfo.totalhits > 0) r = [label, j.query.search[0].title];
        }
      }
    } catch (e) {}
    await sleep(120);
  }
  cache.set(w, r);
  return r;
}

(async () => {
  const todo = fs.readFileSync('attest2/r3-miss.tsv', 'utf8').split('\n')
    .filter(Boolean).map(l => l.split('\t'));
  const done = [], open = [];
  for (const [term, unit, origin] of todo) {
    const words = norm(term).replace(/[()]/g, '').split(' ')
      .filter(w => w.length >= 2 && !PART.test(w));
    const per = [];
    for (const w of words) per.push([w, await attestWord(w)]);
    const missing = per.filter(([, r]) => !r).map(([w]) => w);
    const licenses = [...new Set(per.filter(([, r]) => r).map(([, r]) => r[0]))];
    const refs = per.filter(([, r]) => r).map(([w, r]) => `${w}=${r[1]}`).join(' ');
    if (!missing.length) done.push([term, unit, 'לפי מילה: ' + licenses.join(' + '), refs, '', origin]);
    else open.push([term, unit, origin, 'חסר: ' + missing.join(' ')]);
    console.log(`${missing.length ? '⛔' : '✅'} ${term} · ${words.length} מילים${missing.length ? ' · חסר: ' + missing.join(' ') : ''}`);
  }
  fs.writeFileSync('attest2/r4-hits.tsv', done.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync('attest2/r4-miss.tsv', open.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
  console.log(`\nכל מילות התוכן אומתו ב-${done.length} פריטים · ${open.length} עדיין פתוחים`);
})();
