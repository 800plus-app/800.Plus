'use strict';
/* he_residue.js · השארית המלאה של גנום עברי · הסעיף שהפיל שלושה סבבים
 *
 * לכל גנום מועמד, מנייה **מלאה** (לא דגימה) של כל מה שהוא מקבל על כל יקום ההקלדות
 * בעריכה אחת מכל צורה קבילה של כל כרטיס עברי, מסווג לשלושה דליים:
 *
 *   bank      · המחרוזת היא מפתח של ערך אחר במאגר   ← שער המאגר אמור לתפוס
 *   real-word · הלקסיקון מסמן אותה כמילה עברית      ← הדלי המסוכן
 *   non-word  · אינה אף אחד מהם                     ← דלי ה-zngry
 *
 * ובנוסף · recall על שורות ה-holdout של out/dataset-he.jsonl, בדיוק כמו שהמעבדה
 * מודדת, כדי שהמספר יהיה בר-השוואה ל-23.73% שנשלח.
 *
 *   node typo-lab/he_residue.js --rules <path|SHIPPED> [--tag NAME] [--variant KEY]
 */

const fs = require('fs');
const path = require('path');
const ROOTD = path.join(__dirname, '..');
const say = s => process.stdout.write(s + '\n');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = f => argv.includes(f);

const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys } = require('./lib/keys.js');
const { appCtx, variantsOf, LEX } = require('./he_search_probe.js');

const ctx = getCtx('he');
const app = appCtx('he');
const cards = Array.from(ctx.BANK);
const HOMO = app.TYPO_HOMO, ADJ = app.TYPO_ADJ_HE;
const SHIPPED = JSON.parse(JSON.stringify(app.TYPO_PARAMS['he-word']));

/* ===== וריאנטים · כל אחד הוא פונקציה על עותק של הגנום הנשלח ===== */
const VARIANTS = {
  SHIPPED: P => P,
  /* H1 · סף רחב כשהמחרוזת אינה מילה · ממומש כאן כ"פי k על כל הרצועות במשטר הצר",
     והמימוש בריצה יהיה דגל nonWordBands. כאן זה רק תמחור. */
  'H1-x2': P => { P.__nonWordScale = 2; return P; },
  'H1-x3': P => { P.__nonWordScale = 3; return P; },
  'H1-open': P => { P.__nonWordScale = 99; return P; },
  /* H2/operator · פתיחת אופרטור אחד במשטר הצר, במחיר שווה ל-transpose הפתוח */
  'OP-ins': P => { P.WTight.ins = 1.7; return P; },
  'OP-mater': P => { P.WTight.materVI = 1.7; return P; },
  'OP-mater-1.4': P => { P.WTight.materVI = 1.4; return P; },
  'OP-homo': P => { P.WTight.homophone = 1.7; return P; },
  'OP-adjSub': P => { P.WTight.adjSub = 1.7; return P; },
  'OP-del': P => { P.WTight.del = 1.7; return P; },
  'OP-ins+mater': P => { P.WTight.ins = 1.7; P.WTight.materVI = 1.7; return P; },
  /* H4 · משטר לפי אורך · פתיחת רצועות קצרות בלבד */
  'LEN-short': P => { P.bandsTight = P.bandsTight.map(b => (b.maxLen <= 5 ? { maxLen: b.maxLen, t: 2.2 } : b)); return P; },
  'LEN-long': P => { P.bandsTight = P.bandsTight.map(b => (b.maxLen >= 12 ? { maxLen: b.maxLen, t: 1.7 } : b)); return P; },
  /* ⭐ רצועות האפס · 2,113 מתוך 9,382 הדחיות נופלות ברצועה שסִפָּהּ 0 במשטר הראשי
     (אורכים 6, 8, 12, 13). זו אינה הכרעת בטיחות אלא רצועה שאף שורה לא הגבילה —
     בדיוק הליקוי ש-clamp תפס בצד ה-gloss, בכיוון ההפוך. */
  'BAND0-safe': P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 0.65 } : b)); return P; },
  'BAND0-mater': P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 1.8 } : b)); return P; },
  'BAND-mater-all': P => { P.bands = P.bands.map(b => (b.maxLen >= 4 && b.t < 1.8 ? { maxLen: b.maxLen, t: 1.8 } : b)); return P; },
  'BAND0-safe+OPhomo': P => { P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 0.65 } : b)); P.WTight.homophone = 1.7; return P; },
  'OP-mater+homo': P => { P.WTight.materVI = 1.7; P.WTight.homophone = 1.7; return P; },
  'OP-tight-all': P => { P.WTight = { sub: 99, adjSub: 1.7, transpose: 1.695, ins: 1.7, del: 1.7, doubleLetter: 1.333, materVI: 1.7, homophone: 1.7 }; return P; },
  /* ⭐ הצירוף · רצועות האפס + הומופון במשטר הצר + materVI ראשי */
  COMBO: P => {
    P.bands = P.bands.map(b => (b.t === 0 && b.maxLen >= 4 ? { maxLen: b.maxLen, t: 1.8 } : b));
    P.WTight.homophone = 1.7; P.WTight.materVI = 1.7;
    return P;
  },
};

function paramsFor(tag) {
  const P = JSON.parse(JSON.stringify(SHIPPED));
  const f = VARIANTS[tag];
  if (!f) { say(`⛔ וריאנט לא מוכר: ${tag} · ${Object.keys(VARIANTS).join(', ')}`); process.exit(2); }
  return f(P);
}

/* ===== יקום ההקלדות · נבנה פעם אחת, משותף לכל הווריאנטים ===== */
let UNIV = null;
function universe() {
  if (UNIV) return UNIV;
  const rows = [];
  const termKeys = new Map();      // key -> Set(owner term keys)  (וטו המאגר, לסיווג)
  for (const c of cards) for (const k of acceptedKeys(c, ctx)) {
    let s = termKeys.get(k); if (!s) { s = new Set(); termKeys.set(k, s); }
    s.add(app.K(c.term));
  }
  for (const card of cards) {
    const forms = Array.from(acceptedKeys(card, ctx));
    const fset = new Set(forms);
    const own = new Set([app.K(card.term)]);
    const seen = new Set();
    for (const f of forms) {
      if (String(f).includes(' ')) continue;      // רב-מילים · יקום אחר, לא נמדד כאן
      for (const { v, op } of variantsOf(f, HOMO, ADJ)) {
        if (fset.has(v) || seen.has(v)) continue;
        seen.add(v);
        rows.push({ card, v, op, forms, own, fset });
      }
    }
  }
  UNIV = { rows, termKeys };
  return UNIV;
}

/* ===== סיווג שארית ===== */
function bucket(v, card, termKeys) {
  const owners = termKeys.get(v);
  if (owners) { for (const o of owners) if (o !== app.K(card.term)) return 'bank'; }
  if (LEX.lookup(v, 'he')) return 'real-word';
  return 'non-word';
}

/* ===== קבלה · דרך nearMatch האמיתית, עם וו-של-H1 אם קיים ===== */
function makeAccept(P) {
  const scale = P.__nonWordScale;
  if (!scale) {
    return (v, forms, own) => app.nearMatch(v, forms, 'he', P, app.TERM_VETO, own);
  }
  /* H1 · שני גנומים · הרגיל, ואחד עם רצועות-צר מוכפלות. הבחירה לפי הלקסיקון:
     "אינה מילה" (‏Bloom · אין false-negative) → הגנום הרחב. */
  const wide = JSON.parse(JSON.stringify(P));
  delete wide.__nonWordScale;
  wide.bandsTight = wide.bandsTight.map(b => ({ maxLen: b.maxLen, t: b.t > 0 ? b.t * scale : (scale >= 99 ? 1.7 : 0) }));
  if (scale >= 99) { wide.WTight = Object.assign({}, wide.W); }
  const plain = JSON.parse(JSON.stringify(P)); delete plain.__nonWordScale;
  return (v, forms, own) => {
    const isWord = LEX.lookup(v, 'he') || app.TERM_VETO.has(v);
    return app.nearMatch(v, forms, 'he', isWord ? plain : wide, app.TERM_VETO, own);
  };
}

/* ===== recall על ה-dataset · בר-השוואה ל-23.73% ===== */
function datasetRecall(accept) {
  const file = path.join(__dirname, 'out', 'dataset-he.jsonl');
  const txt = fs.readFileSync(file, 'utf8');
  const byTerm = new Map();
  for (const c of cards) byTerm.set(c.term, c);
  /* ⚠ ההגדרה מכוילת · "סט מלא, שורות trusted בלבד" מחזירה בדיוק 22.93% על הפרמטרים
     הנשלחים, שזה המספר שרשום ב-STATE.md. כל הגדרה אחרת נותנת מספר אחר ואינה
     בת-השוואה למה שנשלח. */
  let hoN = 0, hoTP = 0, allN = 0, allTP = 0;
  for (const line of txt.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    if (r.set !== 'he-word' || r.label !== 'accept' || !r.trusted) continue;
    const card = byTerm.get(r.term); if (!card) continue;
    const forms = Array.from(acceptedKeys(card, ctx));
    if (forms.includes(r.typed)) continue;             // שכבה 1 · מתקבל ממילא
    const own = new Set([app.K(card.term)]);
    const ok = accept(r.typed, forms, own).ok;
    allN++; if (ok) allTP++;
    if (r.holdout) { hoN++; if (ok) hoTP++; }
  }
  return { hoN, hoTP, allN, allTP };
}

function run(tag) {
  const P = paramsFor(tag);
  const accept = makeAccept(P);
  const { rows, termKeys } = universe();
  const t0 = Date.now();
  const cnt = { bank: 0, 'real-word': 0, 'non-word': 0 };
  const byOp = new Map();
  const samples = { bank: [], 'real-word': [], 'non-word': [] };
  let nAcc = 0;
  for (const r of rows) {
    const res = accept(r.v, r.forms, r.own);
    if (!res.ok) continue;
    nAcc++;
    const b = bucket(r.v, r.card, termKeys);
    cnt[b]++;
    let e = byOp.get(r.op); if (!e) { e = { bank: 0, 'real-word': 0, 'non-word': 0 }; byOp.set(r.op, e); }
    e[b]++;
    if (samples[b].length < 25) samples[b].push(`${r.v} ← ${r.card.term} [${r.op}]`);
  }
  const rec = datasetRecall(accept);
  return { tag, rows: rows.length, nAcc, cnt, byOp, samples, rec, ms: Date.now() - t0 };
}

function report(R) {
  say('');
  say(`━━ ${R.tag} ━━`);
  say(`יקום: ${R.rows.toLocaleString()} וריאציות · התקבלו ${R.nAcc.toLocaleString()} · ${(R.ms / 1000).toFixed(0)}ש`);
  say(`recall · holdout ${(100 * R.rec.hoTP / R.rec.hoN).toFixed(2)}% (${R.rec.hoTP}/${R.rec.hoN}) · סט מלא ${(100 * R.rec.allTP / R.rec.allN).toFixed(2)}% (${R.rec.allTP}/${R.rec.allN})`);
  say(`שארית · bank ${R.cnt.bank} · real-word ${R.cnt['real-word']} · non-word ${R.cnt['non-word']}`);
  const ops = Array.from(R.byOp).sort((a, b) => (b[1].bank + b[1]['real-word'] + b[1]['non-word']) - (a[1].bank + a[1]['real-word'] + a[1]['non-word']));
  for (const [op, e] of ops) say(`   ${op.padEnd(13)} bank ${String(e.bank).padStart(4)} · real ${String(e['real-word']).padStart(5)} · non ${String(e['non-word']).padStart(6)}`);
  for (const k of ['bank', 'real-word']) if (R.samples[k].length) say(`   דוגמאות ${k}: ${R.samples[k].slice(0, 8).join(' | ')}`);
  if (R.samples['non-word'].length) say(`   דוגמאות non-word: ${R.samples['non-word'].slice(0, 8).join(' | ')}`);
}

const TAGS = (val('--tag', 'SHIPPED')).split(',');
const out = [];
for (const t of TAGS) { const R = run(t.trim()); report(R); out.push({ tag: R.tag, rows: R.rows, nAcc: R.nAcc, cnt: R.cnt, rec: R.rec, byOp: Object.fromEntries(R.byOp), samples: R.samples }); }
if (has('--json')) fs.writeFileSync(path.join(__dirname, 'out', 'he-residue.' + TAGS.join('_') + '.json'), JSON.stringify(out, null, 1));
