'use strict';
/* ⛔ מחלקת `zngry` כשליליות מבניות · typo-lab/zngry_negatives.js
 *
 *   node --max-old-space-size=6144 typo-lab/zngry_negatives.js
 *     → out/cache/en-word.zngry.json
 *
 * ===== מה נמדד, ולמה זה שינה את ההמלצה =====
 *
 * ‏`zngry_probe` מדד שהמועמד עושה את המחלקה הזאת **גרוע יותר**: ‏46.48% → 63.38%
 * מהכרטיסים. ההשערה שלי הייתה ש-`aFirst`/`aShare` יקנסו אותה — הם לא. ‏`WTight`
 * שהותאם יחד איתם רפוי בהרבה מ-99, והמקדמים אינם מפצים על מחרוזות ש**אינן בקורפוס
 * בכלל**. זו בדיוק צורת הכשל ש-`app.js:847` מתאר: אילוץ אפס-הקבלות רואה מילות מאגר
 * ומילים אמיתיות, ו-`zngry` אינו אף אחד מהם.
 *
 * ===== התיקון · אותו עיקרון שכבר הוכח על הקבוצה חוצת-הכרטיסים =====
 *
 * אילוץ שאפשר **למנות אותו במלואו offline** חייב להיאכף מבנית, ולא להישאב לדגימה.
 * המחלקה סופית וזולה למנייה, ולכן היא נכנסת ל-`negIdx` של ההתאמה בדיוק כמו
 * השליליות חוצות-הכרטיסים · ובלי לעלות פסק מורה אחד.
 *
 * ⚠ **ומה שהיא *אינה*: אילוץ קשיח.** ‏`qgainst` על *against* הוא שכן מקלדת ויכול
 * בהחלט להיות טעות אמיתית. דחייה גורפת של המחלקה הייתה הורגת recall לגיטימי, וזו
 * הסיבה שההכרעה הקודמת בפרויקט **לא** הורידה אותה לאפס אלא ל-25.4% (`app.js:851`).
 * לכן האילוץ כאן הוא **אי-רגרסיה** ולא אפס: נכנסות רק המחרוזות שהבסיס **כבר דוחה**.
 * מה שהבסיס כבר מקבל נשאר כפי שהוא — החשיפה הקיימת אינה גדלה, ואינה מוצגת כאילו
 * נפתרה.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptsToday } = require('./lib/keys.js');
const { makeChecker, indexesFor, nearestOther, lexVetoed, letters } = require('./lib/checker.js');
const F = require('./features.js');

const OUT = path.join(__dirname, 'out');
const CACHE = path.join(OUT, 'cache');
const say = s => process.stdout.write(s + '\n');
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

function main() {
  const ctx = getCtx('en');
  const veto = buildVeto(ctx, 'en');
  const IX = indexesFor(veto);
  let LEX = null;
  try { LEX = require('./out/runtime-lexicon.js'); } catch (e) { LEX = null; }
  if (!LEX) throw new Error('zngry_negatives: אין לקסיקון ריצה');

  const shipped = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8')).params['en-word'];
  const ck = makeChecker(shipped, ctx, veto, 'en');

  const isBank = k => veto.termKeys.has(k) || veto.segKeys.has(k);
  const isReal = k => k.length >= 2 && LEX.lookup(k, 'en');

  const recs = [];
  let generated = 0, kept = 0, baselineAccepts = 0;
  for (const card of Array.from(ctx.BANK)) {
    const keys = Array.from(acceptedKeys(card, ctx)).filter(k => k && /^[a-z]+$/.test(k) && k.length >= 3);
    if (!keys.length) continue;
    const cands = Array.from(acceptedKeys(card, ctx)).filter(Boolean);
    const allow = new Set([ctx.K(card.term)]);
    const seen = new Set();
    for (const k of keys) {
      for (const pos of [0, k.length - 1]) {
        for (const c of ALPHA) {
          if (c === k[pos]) continue;
          const s = k.slice(0, pos) + c + k.slice(pos + 1);
          generated++;
          if (seen.has(s) || isBank(s) || isReal(s) || acceptsToday(ctx, s, card)) continue;
          seen.add(s);
          /* ⭐ רק מה שהבסיס **דוחה**. מה שהוא כבר מקבל אינו נכנס לאילוץ — האילוץ הוא
             אי-רגרסיה, ולא הבטחה לפתור חשיפה שקיימת ממילא. */
          if (ck.acceptWord(s, card).ok) { baselineAccepts++; continue; }

          let dOwn = 99;
          const scored = [];
          for (const q of cands) {
            const raw = ctx.editDist(s, q);
            if (raw < dOwn) dOwn = raw;
            if (raw > 3) continue;
            scored.push({ key: q, raw, len: letters(q) });
          }
          if (!scored.length) continue;
          scored.sort((a, b) => a.raw - b.raw || a.len - b.len || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
          const top = scored.slice(0, 8);
          const dOtherRaw = nearestOther(s, IX.term, allow, ctx);

          const row = F.rowFeatures({
            dOther: isFinite(dOtherRaw) ? dOtherRaw : 9,
            dOwn: Math.min(dOwn, 9),
            lexVetoed: lexVetoed(s, cands, 'en', veto),
            vetoed: false, inflect: false,
            nCands: top.length, typedKey: s, term: card.term,
            tLen: letters(s), nearestCandLen: top[0].len,
          });
          const pairs = [];
          for (const t of top) for (const q of F.pairFeatures(s, t.key)) pairs.push(q);
          recs.push({
            set: 'en-word', lang: 'en', term: card.term, unit: card.unit, key: k,
            typed: s, typedKey: s, op: 'zngry/' + (pos === 0 ? 'first' : 'last'),
            label: 'reject', why: 'zngry', trusted: true, fold: -1, holdout: false,
            today: false, kLen: letters(k), cross: true,
            row, pairs,
          });
          kept++;
        }
      }
    }
  }

  const file = path.join(CACHE, 'en-word.zngry.json');
  fs.writeFileSync(file, JSON.stringify(recs));
  say(`נוצרו ${generated} · המחלקה אחרי סינון · הבסיס כבר מקבל ${baselineAccepts} (נשארות מחוץ לאילוץ)`);
  say(`שליליות מבניות שנכתבו · ${kept} · ${(fs.statSync(file).size / 1e6).toFixed(1)}MB → out/cache/en-word.zngry.json`);
  return { generated, kept, baselineAccepts };
}

if (require.main === module) main();
module.exports = { main };
