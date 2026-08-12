/* ⛔ "התאמה מדויקת" עדיין יכולה להיות מילה אחרת: הסרת הניקוד מאחדת הומוגרפים.
 * `בְּחוּבּוֹ` (בחיקו) ו-`בְּחוֹבוֹ` (בחוב שלו) הם אותה מחרוזת בלי ניקוד, ו-
 * `הַגָּדֵר` (הגדר, שם עצם) מול `הַגְדֵּר` (צווי של הגדיר). לכן כל התאמה נבדקת כאן
 * מול **המשמעות** של הישות, ולא רק מול האיות.
 */
const UA = { 'User-Agent': '800plus-attestation/1.0 (+https://800-plus.com)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IDS = {
  'פורס (פורס מז\'ור)': 'L217323',
  'מזור (פורס מז\'ור)': 'L212964',
  'זב (זב חוטם)': 'L210335',
  'חוטם (זב חוטם)': 'L65164',
  'יושב (יושב על הגדר)': 'L220480',
  'הגדר (יושב על הגדר)': 'L207046',
  'עבותות': 'L215880',
  'נוטר (נוטר טינה)': 'L214250',
  'טינה (נוטר טינה)': 'L211390',
  'שובב (שובב את נפשו)': 'L219261',
  'נפשו (שובב את נפשו)': 'L214889',
  'נכמר (נכמר לבו)': 'L214647',
  'לבו (נכמר לבו)': 'L212400',
};
(async () => {
  for (const [label, id] of Object.entries(IDS)) {
    const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, { headers: UA });
    if (!r.ok) { console.log(`net ${label}`); continue; }
    const e = (await r.json()).entities[id];
    const lemma = Object.values(e.lemmas || {}).map(x => x.value).join(' / ');
    const cat = e.lexicalCategory || '';
    /* המשמעויות (glosses) של הישות */
    const senses = (e.senses || []).flatMap(s => Object.values(s.glosses || {}).map(g => g.value));
    console.log(`${label}\n   למה="${lemma}" · קטגוריה=${cat}\n   משמעויות: ${senses.length ? senses.join(' | ') : '(אין gloss)'}`);
    await sleep(220);
  }
  /* וההקשר בספריא ל-בחובו */
  const s = await fetch('https://www.sefaria.org/api/v3/texts/' +
    encodeURIComponent('Chidushei_Halachot_on_Bava_Batra_138b:1'), { headers: UA });
  if (s.ok) {
    const j = await s.json();
    const t = String((j.versions || []).map(v => v.text).join(' ')).replace(/<[^>]+>/g, '');
    const i = t.indexOf('בחובו');
    console.log(`\nבְּחוּבּוֹ · ההקשר בספריא:\n   ...${t.slice(Math.max(0, i - 90), i + 90).replace(/\s+/g, ' ')}...`);
  }
})();
