'use strict';
/* שלב 0b · ניקוד/כתיב מלא · האם הצורה שהלומד מקליד בכלל נגישה, ו-FPR לפי אורך */
const path = require('path');
const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');
const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys, acceptsToday, acceptsLive } = require('./lib/keys.js');
const { appCtx, HE_LETTERS, LEX } = require('./he_search_probe.js');

const ctx = getCtx('he');
const app = appCtx('he');
const cards = Array.from(ctx.BANK);

/* 1 · heForms · האם הכתיב המלא נכלל */
say('=== 1 · heForms · מה הכרטיס מקבל בלי שום סובלנות ===');
const sample = ['מְגֻבָּב', 'שָׁוְא', 'אָמִיר', 'מִכְמוֹרֶת', 'תֻּכִּי'];
for (const t of sample) {
  const card = cards.find(c => c.term === t);
  if (!card) { say(`   (${t} אינו במאגר)`); continue; }
  const ks = Array.from(acceptedKeys(card, ctx)).sort();
  say(`   ${t} → [${ks.join(' , ')}]`);
}

/* 2 · הפער הכללי · כמה מונחים שהמפתח שלהם חסר-י/ו מקבלים גם את הכתיב המלא */
say('');
say('=== 2 · כמה מהמאגר מקבל היום את הכתיב המלא ===');
const plene = s => s;                 // נבנה למטה
let nNeed = 0, nHave = 0;
const missing = [];
for (const card of cards) {
  const k = app.K(card.term);
  const forms = Array.from(acceptedKeys(card, ctx));
  /* מועמדי כתיב מלא · הוספת ו אחרי עיצור עם חולם/קובוץ, י אחרי חיריק — לא ניתן
     לגזור בלי הניקוד, ולכן נשאלת השאלה הרזה: האם קיימת צורה בקבוצה שיש בה יותר
     ו/י מאשר במפתח הבסיסי. */
  const maxVI = Math.max(...forms.map(f => (String(f).match(/[וי]/g) || []).length));
  const baseVI = (String(k).match(/[וי]/g) || []).length;
  if (maxVI > baseVI) nHave++;
  nNeed++;
}
say(`   ${nHave} / ${nNeed} מונחים שיש להם צורה קבילה עם יותר ו/י מהמפתח הבסיסי (${(100 * nHave / nNeed).toFixed(1)}%)`);

/* 3 · הפוך · מונחים שהמפתח שלהם **מלא** והלומד עלול לכתוב **חסר** */
let nFull = 0, nDefAccepted = 0;
const defMiss = [];
for (const card of cards) {
  const k = String(app.K(card.term));
  if (!/[וי]/.test(k)) continue;
  nFull++;
  // הסרת ו/י אחת אחת · האם מתקבל היום
  let anyAcc = false, anyTried = false;
  for (let i = 0; i < k.length; i++) {
    if (k[i] !== 'ו' && k[i] !== 'י') continue;
    const d = k.slice(0, i) + k.slice(i + 1);
    if (!d) continue;
    anyTried = true;
    if (acceptsToday(ctx, d, card)) { anyAcc = true; break; }
  }
  if (anyTried && anyAcc) nDefAccepted++;
  else if (anyTried && defMiss.length < 8) defMiss.push(`${card.term} (${k})`);
}
say(`   ${nDefAccepted} / ${nFull} מונחים שהמפתח שלהם מכיל ו/י ושהצורה החסרה מתקבלת **היום** (${(100 * nDefAccepted / nFull).toFixed(1)}%)`);
say(`   דוגמאות שלא: ${defMiss.join(' · ')}`);

/* 4 · FPR של הלקסיקון לפי אורך · המספר הזה קובע כמה "לא-מילה" בכלל ניתן לסמוך עליו */
say('');
say('=== 3 · הלקסיקון · FPR לפי אורך על מחרוזות אקראיות ===');
let s = 987654321;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
for (let L = 2; L <= 9; L++) {
  let fp = 0, n = 20000;
  for (let i = 0; i < n; i++) {
    let w = '';
    for (let j = 0; j < L; j++) w += HE_LETTERS[Math.floor(rnd() * HE_LETTERS.length)];
    if (LEX.lookup(w, 'he')) fp++;
  }
  say(`   אורך ${L}: ${(100 * fp / n).toFixed(2)}%  (${fp}/${n})`);
}

/* 5 · הלקסיקון · כמה מהוריאציות של המאגר הוא מסמן כמילה */
say('');
say('=== 4 · הלקסיקון על וריאציות אמיתיות · לפי מחלקת אופרטור ===');
const { variantsOf } = require('./he_search_probe.js');
const HOMO = app.TYPO_HOMO, ADJ = app.TYPO_ADJ_HE;
const byOp = new Map();
let tot = 0;
for (let ci = 0; ci < cards.length; ci += 4) {   // דגימה 1:4 · זה רק אומדן צפיפות
  const card = cards[ci];
  const k = String(app.K(card.term));
  if (k.includes(' ')) continue;
  const forms = new Set(Array.from(acceptedKeys(card, ctx)));
  for (const { v, op } of variantsOf(k, HOMO, ADJ)) {
    if (forms.has(v)) continue;
    let e = byOp.get(op); if (!e) { e = { n: 0, word: 0 }; byOp.set(op, e); }
    e.n++; tot++;
    if (LEX.lookup(v, 'he') || app.TERM_VETO.has(v)) e.word++;
  }
}
say(`   (דגימה 1:4 · ${tot} וריאציות)`);
for (const [op, e] of Array.from(byOp).sort((a, b) => b[1].n - a[1].n))
  say(`   ${op.padEnd(14)} ${String(e.n).padStart(7)} וריאציות · ${String(e.word).padStart(6)} מסומנות מילה (${(100 * e.word / e.n).toFixed(1)}%)`);
