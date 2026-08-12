/* פותר את הרישיון של כל הוכחה מספריא — מול ה-API של ספריא עצמו.
 *
 * ⚠ הגרסה הראשונה שאלה את `/api/v2/index/<book>` והחזירה "לא צוין" ב-249 מתוך 249.
 * זה לא אומר שאין רישיון, זה אומר ששאלתי את הנתיב הלא נכון: הרישיון יושב על
 * **גרסת הטקסט** ולא על החיבור, ומוחזר מ-`/api/v3/texts/<ref>`. תשובה אחידה
 * לחלוטין מ-API היא סימן מובהק לשאילתה שגויה, לא לנתון אמיתי.
 */
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const hits = fs.readFileSync('attest/round3-hits.tsv', 'utf8').split('\n')
  .filter(Boolean).map(l => l.split('\t'));
const refOf = h => String(h[2]).replace(/^ספריא:\s*/, '').trim();

/* קיבוץ לפי רפרנס ייחודי, כדי לא לשאול פעמיים על אותו מקום */
const refs = [...new Set(hits.map(refOf))];
console.log(`${refs.length} רפרנסים ייחודיים`);

(async () => {
  const lic = {};
  let n = 0;
  for (const ref of refs) {
    try {
      const r = await fetch('https://www.sefaria.org/api/v3/texts/' +
        encodeURIComponent(ref.replace(/ /g, '_')),
        { headers: { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' } });
      if (r.ok) {
        const j = await r.json();
        const ls = (j.versions || []).map(v => v.license).filter(Boolean);
        lic[ref] = ls.length ? [...new Set(ls)].join(' | ') : 'לא צוין';
      } else lic[ref] = 'שגיאה ' + r.status;
    } catch (e) { lic[ref] = 'שגיאת רשת'; }
    await sleep(120);
    if (++n % 50 === 0) console.log(`  ${n}/${refs.length}`);
  }
  fs.writeFileSync('attest/sefaria-licenses.json', JSON.stringify(lic, null, 1), 'utf8');
  const tally = {};
  Object.values(lic).forEach(v => tally[v] = (tally[v] || 0) + 1);
  console.log('\nרישיונות שהוחזרו:');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
})();
