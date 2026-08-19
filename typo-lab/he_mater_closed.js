'use strict';
/* he_mater_closed.js · ⭐ העולם הסגור של אם קריאה · מנייה מלאה, לא דגימה
 *
 * הרעיון שמחליף את השערה 1: אין צורך בלקסיקון עברי כללי. הפלטים האפשריים של מתקן
 * ו/י על מאגר סופי הם **סט חסום שאפשר למנות עד הסוף**. מי שרע בו — נחסם ברשימה
 * מפורשת. מה שנשאר בטוח **מבנית**, לא סטטיסטית.
 *
 * ⚠ שלוש מלכודות שהמדידה חייבת לכבד:
 *   1. הלקסיקון הפנימי אינו משוחזר מהבנאי (‏667 מילים עודפות). לכן "מילה אמיתית"
 *      נמדד כאן בשלושה אורקלים נפרדים ומדווח בנפרד · לא בעירוב.
 *   2. "אינה מילה לפי הלקסיקון" אינו "אינה מילה". זה בדיוק פער ה-zngry.
 *      הסט הסגור נכתב לקובץ כדי שפאנל LLM יוכל לתייג אותו במלואו.
 *   3. הסט תלוי במאגר · נבנה מחדש בפקודה אחת.
 *
 *   node typo-lab/he_mater_closed.js [--ops 1|2|3] [--emit]
 */
const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const { appCtx, LEX } = require('./he_search_probe.js');
const say = s => process.stdout.write(s + '\n');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OPS = parseInt(val('--ops', '1'), 10);
const EMIT = argv.includes('--emit');

const ctx = getCtx('he'), app = appCtx('he');
const cards = Array.from(ctx.BANK);

/* ===== 1 · אינדקס הבעלים · מפתח → מונחים ===== */
const keyOwners = new Map();
for (const c of cards) for (const k of acceptedKeys(c, ctx)) {
  let s = keyOwners.get(k); if (!s) { s = new Set(); keyOwners.set(k, s); }
  s.add(c.term);
}
say(`מאגר · ${cards.length} ערכים · ${keyOwners.size} מפתחות קבילים`);

/* ===== 2 · הסט הסגור · כל פלט של עריכת ו/י בעד OPS פעולות ===== */
function materEdits(s) {
  const out = new Set();
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'ו' || s[i] === 'י') { const d = s.slice(0, i) + s.slice(i + 1); if (d.replace(/ /g, '')) out.add(d); }
  }
  for (let i = 0; i <= s.length; i++) for (const x of ['ו', 'י']) out.add(s.slice(0, i) + x + s.slice(i));
  return out;
}
function closure(seed, n) {
  let cur = new Set([seed]); const all = new Set();
  for (let k = 0; k < n; k++) {
    const nx = new Set();
    for (const s of cur) for (const e of materEdits(s)) if (!all.has(e) && e !== seed) { all.add(e); nx.add(e); }
    cur = nx;
  }
  return all;
}

const setByString = new Map();   // string -> {owners:Set(term), minOps}
for (const card of cards) {
  const forms = Array.from(acceptedKeys(card, ctx));
  const fset = new Set(forms);
  for (const f of forms) {
    for (const v of closure(f, OPS)) {
      if (fset.has(v)) continue;                       // כבר צורה קבילה של הכרטיס
      let e = setByString.get(v); if (!e) { e = { owners: new Set() }; setByString.set(v, e); }
      e.owners.add(card.term);
    }
  }
}
say(`הסט הסגור · ${setByString.size.toLocaleString()} מחרוזות (‏${OPS} עריכות ו/י)`);

/* ===== 3 · סיווג · שלושה אורקלים, מדווחים בנפרד ===== */
let cBank = 0, cAmbig = 0, cLex = 0, cSafe = 0;
const bankEx = [], lexEx = [], safeEx = [];
const blocklist = [];
const safelist = [];
for (const [v, e] of setByString) {
  const owners = keyOwners.get(v);
  const isBank = !!owners;
  const ambiguous = e.owners.size > 1;                 // אותה מחרוזת נגזרת משני כרטיסים
  const isLex = LEX.lookup(v, 'he');
  if (isBank) { cBank++; if (bankEx.length < 10) bankEx.push(`${v} (מפתח של ${Array.from(owners)[0]}, נגזר מ-${Array.from(e.owners)[0]})`); }
  if (ambiguous) cAmbig++;
  if (!isBank && isLex) { cLex++; if (lexEx.length < 10) lexEx.push(`${v} ← ${Array.from(e.owners)[0]}`); }
  if (isBank || isLex || ambiguous) blocklist.push(v);
  else { cSafe++; safelist.push(v); if (safeEx.length < 10) safeEx.push(`${v} ← ${Array.from(e.owners)[0]}`); }
}
say('');
say('| דלי | מספר | % |');
say(`| מפתח של ערך אחר במאגר       | ${String(cBank).padStart(6)} | ${(100 * cBank / setByString.size).toFixed(2)}% |`);
say(`| דו-משמעי · נגזר משני כרטיסים | ${String(cAmbig).padStart(6)} | ${(100 * cAmbig / setByString.size).toFixed(2)}% |`);
say(`| מילה בלקסיקון הפנימי        | ${String(cLex).padStart(6)} | ${(100 * cLex / setByString.size).toFixed(2)}% |`);
say(`| ⭐ נשאר בטוח                 | ${String(cSafe).padStart(6)} | ${(100 * cSafe / setByString.size).toFixed(2)}% |`);
say('');
say(`רשימת החסימה: ${blocklist.length.toLocaleString()} מחרוזות`);
const raw = blocklist.join('\n');
const gz = require('zlib').gzipSync(Buffer.from(raw, 'utf8'));
say(`   גולמי ${(Buffer.byteLength(raw, 'utf8') / 1024).toFixed(1)}KB · gzip ${(gz.length / 1024).toFixed(1)}KB`);
say('');
say('דוגמאות · התנגשות מאגר: ' + bankEx.slice(0, 5).join(' | '));
say('דוגמאות · מילה בלקסיקון: ' + lexEx.slice(0, 6).join(' | '));
say('דוגמאות · בטוח: ' + safeEx.slice(0, 6).join(' | '));

if (EMIT) {
  const OUT = path.join(__dirname, 'out');
  fs.writeFileSync(path.join(OUT, `he-mater-closed.ops${OPS}.json`), JSON.stringify({
    ops: OPS, total: setByString.size, bank: cBank, ambiguous: cAmbig, lex: cLex, safe: cSafe,
    blocklist, safelist,
  }, null, 0));
  /* דגימה לפאנל · דווקא מדלי ה"בטוח", כי שם נמצא הפער שהרג שלושה סבבים */
  let s = 20250815;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pick = safelist.slice(); const samp = [];
  for (let i = 0; i < 400 && pick.length; i++) samp.push(pick.splice(Math.floor(rnd() * pick.length), 1)[0]);
  fs.writeFileSync(path.join(OUT, `he-mater-sample.ops${OPS}.txt`), samp.join('\n'));
  say(`\nנכתבו · out/he-mater-closed.ops${OPS}.json · out/he-mater-sample.ops${OPS}.txt (${samp.length} לפאנל)`);
}
