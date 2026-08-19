'use strict';
/* שער שלב ב' · typo-lab/selfcheck2.js · הדאטהסט אינו נאמן, הוא נבדק.
 *
 * חמש הוכחות, פסק דין אחד:
 *   א. **דטרמיניזם** · הרצה שנייה לתיקייה זמנית מפיקה קבצים זהים ביט-אחר-ביט (SHA-256).
 *      בלי זה כל מספר בדוח הוא צילום מצב של ריצה אחת ואינו ניתן לביקורת.
 *   ב. **השורות החיוביות אינן פתורות מראש** · כל שורה שתויגה "ראוי-לקבל" נבדקת מול
 *      הפונקציה האמיתית (isCorrect / meaningMatch) וחייבת להידחות היום. שורה שכבר
 *      מתקבלת אינה נתון אימון אלא ניפוח recall: היא "נפתרת" גם בגנום אפס-סובלנות.
 *   ג. **אפס קבלות-שווא בדאטהסט עצמו** · אין אף שורה "ראוי-לקבל" שהיא מילת מאגר של ערך
 *      אחר, וכל שורת "חובה-לדחות" שהיא מילת מאגר אכן נמצאת בווטו. אם התיוג עצמו מדליף,
 *      ה-GA ילמד להדליף · והעונש שלו על קבלת-שווא לא יופעל לעולם.
 *   ד. **אין דליפה בין הקפלים** · כל השורות שנגזרו מאותה מילה חולקות fold ו-holdout.
 *      חלוקה ברמת השורה נראית זהה בטבלה ומוליכה ל-CV שמדווח דיוק על מה שכבר ראה.
 *   ה. **שפיות תוויות** · אין typed ריק, אין typed שזהה למפתח (אינה השחתה), אין ערכי
 *      שדות מחוץ לתחום.
 *
 * ואחרי כולן · **שיניים**. שער שמדווח "עבר" בלי להוכיח שהוא יודע להיכשל אינו עדות
 * (זה קרה שלוש פעמים בפרויקט הזה). לכן מורצות כאן שתי תצורות שבורות בכוונה · מחולל עם
 * אופרטור זהות, ומחולל שמחלק folds לפי מספר השורה במקום לפי המילה · והשער חייב לתפוס
 * את שתיהן. "לשער יש שיניים" מודפס רק אם שתיהן נתפסו.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto, isVetoedTerm, isVetoedSeg } = require('./lib/veto.js');
const { acceptsToday } = require('./lib/keys.js');
const G = require('./gen_dataset.js');

const LANGS = ['he', 'en'];
const log = s => process.stdout.write(s + '\n');
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass });
  log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readRows = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

/* אינדקס כרטיסים לפי (יחידה, מפתח) · בדיוק המזהה של האפליקציה (card.id הוא
   `unit:K(term)`), ולכן שתי מילים זהות ביחידות שונות אינן מתמזגות. */
function cardIndex(ctx) {
  const m = new Map();
  for (const c of Array.from(ctx.BANK)) m.set(String(c.unit) + ':' + ctx.K(c.term), c);
  return m;
}
const rowCard = (idx, ctx, row) => idx.get(String(row.unit) + ':' + ctx.K(row.term));

/* ===== הבדיקות · כל אחת מחזירה מערך הפרות ===== */

function checkAlreadyAccepted(rows, ctx, lang) {
  const bad = [];
  const idx = cardIndex(ctx);
  const altCache = new Map();
  for (const r of rows) {
    if (r.lang !== lang || r.label !== 'accept') continue;
    const card = rowCard(idx, ctx, r);
    if (!card) { bad.push(`${r.term} · כרטיס לא נמצא`); continue; }
    let hit;
    if (r.dir === 'gloss') hit = ctx.meaningMatch(r.typed, card.meaning);
    else {
      let alts = altCache.get(card);
      if (!alts) { alts = Array.from(ctx.glossAlts(card)); altCache.set(card, alts); }
      hit = ctx.isCorrect(r.typed, card.term) || alts.some(t => ctx.isCorrect(r.typed, t));
    }
    if (hit) bad.push(`${r.term} <- "${r.typed}" (${r.dir})`);
  }
  return bad;
}

function checkVetoConsistency(rows, ctx, lang) {
  const veto = buildVeto(ctx, lang);
  const idx = cardIndex(ctx);
  const falseAccept = [], missedVeto = [];
  for (const r of rows) {
    if (r.lang !== lang) continue;
    const card = rowCard(idx, ctx, r);
    if (!card) continue;
    const index = r.dir === 'gloss' ? veto.segKeys : veto.termKeys;
    if (!index.has(r.typed)) continue;                       // אינה מילת/מקטע מאגר כלל
    const vetoed = r.dir === 'gloss'
      ? isVetoedSeg(r.typed, card, veto, ctx)
      : isVetoedTerm(r.typed, card, veto, ctx);
    if (r.label === 'accept' && vetoed) falseAccept.push(`${r.term} <- "${r.typed}"`);
    if (r.label === 'reject' && !vetoed) {
      /* פטור הנרדפות · מקטע שכל בעליו הם הכרטיס עצמו או נרדפת שלו אינו התנגשות.
         כל השאר חייב להיות בווטו, אחרת התיוג והווטו אינם מסכימים. */
      const allowed = new Set([ctx.K(card.term)]);
      if (r.dir === 'gloss') for (const t of Array.from(ctx.glossAlts(card))) allowed.add(ctx.K(t));
      let foreign = false;
      for (const o of index.get(r.typed)) if (!allowed.has(o)) foreign = true;
      if (foreign) missedVeto.push(`${r.term} <- "${r.typed}"`);
    }
  }
  return { falseAccept, missedVeto };
}

function checkFolds(rows, ctx, lang) {
  const seen = new Map();
  const bad = [];
  for (const r of rows) {
    if (r.lang !== lang) continue;
    const tk = ctx.K(r.term);
    const want = seen.get(tk);
    if (!want) { seen.set(tk, { fold: r.fold, holdout: r.holdout }); continue; }
    if (want.fold !== r.fold) bad.push(`${r.term} · fold ${want.fold} מול ${r.fold}`);
    else if (want.holdout !== r.holdout) bad.push(`${r.term} · holdout ${want.holdout} מול ${r.holdout}`);
  }
  /* ולא רק עקביות פנימית · גם התאמה לנוסחה המוצהרת, אחרת "כולן שגויות באותה צורה" עובר. */
  for (const [tk, v] of seen) {
    if (v.fold !== G.foldOf(tk)) bad.push(`${tk} · fold ${v.fold} אינו ${G.foldOf(tk)}`);
    else if (v.holdout !== G.holdoutOf(tk)) bad.push(`${tk} · holdout אינו לפי הנוסחה`);
  }
  return { bad, words: seen.size };
}

const SETS = new Set(['he-word', 'en-word', 'gloss']);
function checkSanity(rows) {
  const bad = [];
  for (const r of rows) {
    if (!r.typed) { bad.push(`${r.term} · typed ריק`); continue; }
    if (!r.key) { bad.push(`${r.term} · key ריק`); continue; }
    if (r.typed === r.key) { bad.push(`${r.term} · typed === key ("${r.typed}")`); continue; }
    if (r.label !== 'accept' && r.label !== 'reject') { bad.push(`${r.term} · label "${r.label}"`); continue; }
    if (!SETS.has(r.set)) { bad.push(`${r.term} · set "${r.set}"`); continue; }
    if (!(r.fold >= 0 && r.fold < G.FOLDS)) { bad.push(`${r.term} · fold ${r.fold}`); continue; }
    if (typeof r.holdout !== 'boolean') bad.push(`${r.term} · holdout אינו בוליאני`);
  }
  return bad;
}

/* ===== ריצה ===== */
const t0 = Date.now();
log('שער שלב ב · typo-lab/selfcheck2.js');
log('');

const outFiles = LANGS.map(l => path.join(G.OUT_DIR, `dataset-${l}.jsonl`));
for (const f of outFiles) if (!fs.existsSync(f)) { log(`חסר ${f} · יש להריץ קודם node typo-lab/gen_dataset.js`); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(G.OUT_DIR, 'manifest.json'), 'utf8'));

/* ---- א · דטרמיניזם ---- */
log('א · דטרמיניזם · הרצה חוזרת לתיקייה זמנית');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typo-lab-det-'));
G.generate({ outDir: tmp, quiet: true });
for (let i = 0; i < LANGS.length; i++) {
  const a = sha(outFiles[i]), b = sha(path.join(tmp, `dataset-${LANGS[i]}.jsonl`));
  ok(`[${LANGS[i]}] SHA-256 זהה בין שתי ריצות`, a === b, `· ${a.slice(0, 16)}… מול ${b.slice(0, 16)}…`);
  const declared = (manifest.files.find(f => f.name === `dataset-${LANGS[i]}.jsonl`) || {}).sha256;
  ok(`[${LANGS[i]}] המניפסט מצהיר על ה-SHA הנכון`, declared === a, `· ${String(declared).slice(0, 16)}…`);
}
fs.rmSync(tmp, { recursive: true, force: true });
log('');

/* ---- ב..ה · על הדאטהסט שב-out/ ---- */
const rowsByLang = {};
for (let i = 0; i < LANGS.length; i++) rowsByLang[LANGS[i]] = readRows(outFiles[i]);
const allRows = LANGS.flatMap(l => rowsByLang[l]);

log('ב · שורות "ראוי-לקבל" אינן מתקבלות היום');
for (const lang of LANGS) {
  const rows = rowsByLang[lang];
  const n = rows.filter(r => r.label === 'accept').length;
  const bad = checkAlreadyAccepted(rows, getCtx(lang), lang);
  ok(`[${lang}] אף שורה חיובית אינה פתורה מראש`, bad.length === 0,
    `· ${n} שורות נבדקו מול הפונקציה האמיתית${bad.length ? ' · ' + bad.slice(0, 4).join(' , ') : ''}`);
}
log('');

log('ג · הווטו והתיוג מסכימים');
for (const lang of LANGS) {
  const { falseAccept, missedVeto } = checkVetoConsistency(rowsByLang[lang], getCtx(lang), lang);
  ok(`[${lang}] אפס שורות "ראוי-לקבל" שהן ערך אחר במאגר`, falseAccept.length === 0,
    falseAccept.length ? '· ' + falseAccept.slice(0, 4).join(' , ') : '');
  ok(`[${lang}] כל שורת "חובה-לדחות" שהיא ערך אחר נמצאת בווטו`, missedVeto.length === 0,
    missedVeto.length ? '· ' + missedVeto.slice(0, 4).join(' , ') : '');
}
log('');

log('ד · חלוקת folds ברמת המילה · הוכחת אי-דליפה');
for (const lang of LANGS) {
  const { bad, words } = checkFolds(rowsByLang[lang], getCtx(lang), lang);
  ok(`[${lang}] כל שורות אותה מילה חולקות fold ו-holdout`, bad.length === 0,
    `· ${words} מילים${bad.length ? ' · ' + bad.slice(0, 4).join(' , ') : ''}`);
}
{
  const hold = allRows.filter(r => r.holdout).length;
  const pct = (100 * hold / allRows.length).toFixed(1);
  ok('שיעור ה-holdout בטווח הצפוי', hold > 0 && Math.abs(hold / allRows.length - G.HOLDOUT_RATE) < 0.05,
    `· ${pct}% (יעד ${(100 * G.HOLDOUT_RATE).toFixed(0)}%)`);
}
log('');

log('ה · שפיות תוויות');
{
  const bad = checkSanity(allRows);
  ok('אין typed ריק, typed===key, או ערך שדה מחוץ לתחום', bad.length === 0,
    `· ${allRows.length} שורות${bad.length ? ' · ' + bad.slice(0, 4).join(' , ') : ''}`);
}
log('');

/* ---- שיניים ---- */
log('ו · שיניים · שתי תצורות שבורות בכוונה');
const TEETH_CARDS = 250;
let teethOp = false, teethFold = false;
{
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'typo-lab-op-'));
  G.generate({ outDir: d1, quiet: true, brokenOp: true, limitCards: TEETH_CARDS });
  const rows = LANGS.flatMap(l => readRows(path.join(d1, `dataset-${l}.jsonl`)));
  const bad = checkSanity(rows).filter(s => s.includes('typed === key'));
  teethOp = bad.length > 0;
  ok('אופרטור זהות שתול · נתפס בבדיקת typed !== key', teethOp,
    `· ${bad.length} הפרות מתוך ${rows.length} שורות שתולות`);
  fs.rmSync(d1, { recursive: true, force: true });
}
{
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'typo-lab-fold-'));
  G.generate({ outDir: d2, quiet: true, brokenFold: true, limitCards: TEETH_CARDS });
  let bad = 0;
  for (const lang of LANGS) {
    const rows = readRows(path.join(d2, `dataset-${lang}.jsonl`));
    bad += checkFolds(rows, getCtx(lang), lang).bad.length;
  }
  teethFold = bad > 0;
  ok('חלוקת folds לפי מספר השורה · נתפסת בבדיקת אי-הדליפה', teethFold, `· ${bad} הפרות`);
  fs.rmSync(d2, { recursive: true, force: true });
}
log('');

/* ---- טבלת ההתפלגות ---- */
function table(title, bag, total) {
  log(title);
  const keys = Object.keys(bag).sort((a, b) => bag[b] - bag[a] || (a < b ? -1 : 1));
  const w = Math.max.apply(null, keys.map(k => k.length).concat([4]));
  for (const k of keys) {
    const n = bag[k];
    log(`  ${k.padEnd(w)}  ${String(n).padStart(7)}  ${(100 * n / total).toFixed(1).padStart(5)}%`);
  }
  log('');
}
log('התפלגות הדאטהסט');
log('');
table('לפי סט', manifest.counts.set, manifest.total);
table('לפי תווית', manifest.counts.label, manifest.total);
table('לפי סט ותווית', manifest.counts.setLabel, manifest.total);
table('לפי אופרטור', manifest.counts.op, manifest.total);
table('לפי סיבת התווית', manifest.counts.why, manifest.total);

const failed = results.filter(r => !r.pass);
log(`${results.length - failed.length}/${results.length} בדיקות עברו · ${manifest.total} שורות · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
if (teethOp && teethFold) log('לשער יש שיניים');
else log('אזהרה · לפחות אחת מהתקלות השתולות לא נתפסה, ולכן השער אינו עדות');
log(failed.length === 0 && teethOp && teethFold ? 'פסק דין: ירוק' : 'פסק דין: אדום');
process.exit(failed.length === 0 && teethOp && teethFold ? 0 : 1);
