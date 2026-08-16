'use strict';
/* ⛔ מחלקת `zngry` · typo-lab/zngry_probe.js
 *
 *   node --max-old-space-size=6144 typo-lab/zngry_probe.js
 *
 * ===== למה הקובץ הזה קיים =====
 *
 * ‏`zngry` התקבל על *angry* ב-43.2% מהמאגר האנגלי, ו**שום שער לא תפס את זה** — הוא
 * נמצא רק כשסוכן ישב והקליד באתר. הסיבה מבנית ומתועדת ב-`app.js:847`: אילוץ
 * אפס-הקבלות-שווא קונס קבלה של **מילת מאגר אחרת** (הווטו) ושל **מילה אמיתית**
 * (הלקסיקון). ‏`zngry` אינו אף אחד מהשניים — הוא אינו מילה כלל — ולכן הוא **בלתי נראה
 * לכל שכבת מדידה שנשענת על הקורפוס**, כולל זו שבניתי. הפער היה בפונקציית המטרה.
 *
 * לכן המדידה כאן היא **מנייה מלאה על המאגר** ולא דגימה מהקורפוס.
 *
 * ===== ההגדרה · מפורשת, כי אין דרך לשחזר את המחולל המקורי =====
 *
 * מחרוזת שייכת למחלקה כאשר, ביחס לצורה קבילה K של כרטיס:
 *   1. היא נוצרת מ-K בהחלפת **אות אחת**;
 *   2. היא **אינה** מתקבלת היום בשכבה המדויקת;
 *   3. היא **אינה** צורה קבילה של שום כרטיס במאגר (אחרת זו מחלקת הווטו);
 *   4. היא **אינה** מילה אמיתית לפי לקסיקון הריצה (אחרת זו מחלקת הלקסיקון).
 * מה שנשאר אינו מילה, אינו במאגר, ואף שכבה קיימת אינה רואה אותו.
 *
 * ‏`FIRST` · ההחלפה במקום 0 · זו `zngry` עצמה.
 * ‏`LAST`  · אותה החלפה באות האחרונה · **בקרה**. אם המנגנון שלי אמיתי, ההפרש בין
 *            שתי העמדות חייב לגדול אצל המועמד ולא אצל הבסיס.
 *
 * ⚠ **המספר 25.4% ב-`app.js:851` נמדד במחולל שאינו בידי**, ולכן הוא מובא כהקשר ולא
 * כבסיס להשוואה. ההשוואה התקפה כאן היא בסיס-מול-מועמד **באותו מחולל בדיוק**.
 * ⚠ שכבות 3 ו-4 יורשות את פער 667 המילים של הלקסיקון · מחרוזת שהיא מילה אמיתית
 * שהלקסיקון אינו מכיר תיספר כאן כ"אינה מילה", והמספר הוא לכן **חסם עליון**.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { makeChecker } = require('./lib/checker.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const rules = f => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).params['en-word'];

function main() {
  const ctx = getCtx('en');
  const veto = buildVeto(ctx, 'en');
  let LEX = null;
  try { LEX = require('./out/runtime-lexicon.js'); } catch (e) { LEX = null; }
  if (!LEX) throw new Error('zngry_probe: אין לקסיקון ריצה · בלעדיו שכבה 4 שקטה והמדידה חסרת ערך');

  const cards = Array.from(ctx.BANK);
  const isBank = k => veto.termKeys.has(k) || veto.segKeys.has(k);
  const isReal = k => k.length >= 2 && LEX.lookup(k, 'en');

  /* ===== המנייה · פעם אחת, משותפת לכל הפרמטרים ===== */
  const universe = { FIRST: [], LAST: [] };
  let generated = 0, dropBank = 0, dropReal = 0, dropToday = 0;
  for (const card of cards) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= 3);
    for (const k of keys) {
      for (const [mode, pos] of [['FIRST', 0], ['LAST', k.length - 1]]) {
        for (const c of ALPHA) {
          if (c === k[pos]) continue;
          const s = k.slice(0, pos) + c + k.slice(pos + 1);
          generated++;
          if (isBank(s)) { dropBank++; continue; }
          if (isReal(s)) { dropReal++; continue; }
          if (acceptsToday(ctx, s, card)) { dropToday++; continue; }
          universe[mode].push({ card, typed: s, key: k });
        }
      }
    }
  }
  say(`מנייה · ${generated} מחרוזות נוצרו · ${dropBank} מילות מאגר · ${dropReal} מילים אמיתיות · ${dropToday} מתקבלות היום`);
  say(`מחלקת zngry · FIRST ${universe.FIRST.length} · LAST ${universe.LAST.length}\n`);

  const variants = [
    { tag: 'בסיס · מה שנשלח היום', P: rules('typo-rules.json') },
    { tag: 'מועמד · התלמיד', P: rules('typo-rules.STUDENT.json') },
    { tag: 'שבור בכוונה · בלי המקדמים', P: rules('typo-rules.STUDENT-RED.json') },
  ];

  const results = [];
  for (const v of variants) {
    const ck = makeChecker(v.P, ctx, veto, 'en');
    const row = { tag: v.tag };
    for (const mode of ['FIRST', 'LAST']) {
      let acc = 0;
      const hitCards = new Set();
      const sample = [];
      for (const u of universe[mode]) {
        if (!ck.acceptWord(u.typed, u.card).ok) continue;
        acc++;
        hitCards.add(String(u.card.term) + '|' + u.card.unit);
        if (sample.length < 8) sample.push(`${u.typed}~${u.key}`);
      }
      row[mode] = { accepted: acc, cards: hitCards.size, pctCards: hitCards.size / cards.length, sample };
    }
    results.push(row);
    say(`${v.tag}`);
    for (const mode of ['FIRST', 'LAST']) {
      const r = row[mode];
      say(`   ${mode.padEnd(6)} · ${String(r.accepted).padStart(6)} מחרוזות מתקבלות · ${String(r.cards).padStart(5)} כרטיסים (${(100 * r.pctCards).toFixed(2)}%)`);
      if (r.sample.length) say(`            ${r.sample.join(' · ')}`);
    }
    say('');
  }

  const b = results[0], c = results[1];
  const rel = (x, y) => (y.accepted === 0 ? '—' : (x.accepted / y.accepted).toFixed(2));
  say('⭐ ההפרש בין העמדות · זו הבדיקה שאומרת אם המנגנון אמיתי');
  say(`   בסיס   · FIRST/LAST = ${rel(b.FIRST, b.LAST)}`);
  say(`   מועמד  · FIRST/LAST = ${rel(c.FIRST, c.LAST)}`);
  say(`   ‏FIRST · בסיס ${b.FIRST.accepted} → מועמד ${c.FIRST.accepted}`);
  say(`   ‏LAST  · בסיס ${b.LAST.accepted} → מועמד ${c.LAST.accepted}`);

  fs.writeFileSync(path.join(OUT, 'zngry-probe.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    definition: 'החלפת אות אחת · לא מתקבלת היום · לא מילת מאגר · לא מילה בלקסיקון',
    caveat: 'יורש את פער 667 המילים של הלקסיקון · המספר הוא חסם עליון',
    cards: cards.length, universe: { FIRST: universe.FIRST.length, LAST: universe.LAST.length },
    results,
  }, null, 1));
  say('\nנכתב · out/zngry-probe.json');
  return results;
}

if (require.main === module) main();
module.exports = { main };
