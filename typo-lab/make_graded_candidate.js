'use strict';
/* בניית המועמד המדורג · typo-lab/make_graded_candidate.js
 *
 * מחליף **רק** את params['en-word'] בארטיפקט הנשלח, בהשתלה טקסטואלית ולא בכתיבה מחדש
 * של הקובץ: כך he-word ו-gloss (ובעצם כל שאר הקובץ) נשארים ביט-אחר-ביט כפי שהם, וזה
 * נבדק בסוף ולא מוצהר. הפלט · out/graded-candidate-rules.json
 */

const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');

const SRC = path.join(OUT, 'typo-rules.json');
const DST = path.join(OUT, 'graded-candidate-rules.json');

const text = fs.readFileSync(SRC, 'utf8');
const SHORT = JSON.parse(fs.readFileSync(path.join(OUT, 'shortword.json'), 'utf8'));
const GR = SHORT.stages.gradedRefined;

/* סדר המפתחות · מה שהארטיפקט הנשלח כותב, ואז הגנים החדשים אחריו. */
const cand = {
  minLen: GR.params.minLen,
  vetoMargin: GR.params.vetoMargin,
  useLexicon: GR.params.useLexicon !== false,
  bands: GR.params.bands,
  W: GR.params.W,
  marginHard: GR.params.marginHard,
  marginSoft: GR.params.marginSoft,
  bandsTight: GR.params.bandsTight,
  WTight: GR.W
};

/* איתור הבלוק · "params" ברמה העליונה (הזחה של רווח אחד), ובתוכו "en-word". */
const pAt = text.indexOf('\n "params": {');
if (pAt < 0) throw new Error('לא נמצא בלוק params ברמה העליונה');
const eAt = text.indexOf('\n  "en-word": {', pAt);
if (eAt < 0) throw new Error('לא נמצא params["en-word"]');

const open = text.indexOf('{', eAt);
let depth = 0, i = open, inStr = false, esc = false, close = -1;
for (; i < text.length; i++) {
  const c = text[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (!depth) { close = i; break; } }
}
if (close < 0) throw new Error('לא נמצאה סוגר תואם ל-en-word');

/* אותה הזחה בדיוק · רווח אחד לרמה, והבלוק יושב ברמה 2. */
const body = JSON.stringify(cand, null, 1).split('\n').map((l, n) => (n === 0 ? l : '  ' + l)).join('\n');
const outText = text.slice(0, open) + body + text.slice(close + 1);
fs.writeFileSync(DST, outText, 'utf8');

/* ===== אימות · לא הצהרה ===== */
const A = JSON.parse(text), B = JSON.parse(outText);
const s = o => JSON.stringify(o);
const problems = [];
for (const k of ['he-word', 'gloss']) if (s(A.params[k]) !== s(B.params[k])) problems.push(`params.${k} השתנה`);
for (const k of Object.keys(A)) if (k !== 'params' && s(A[k]) !== s(B[k])) problems.push(`${k} השתנה`);
if (s(B.params['en-word']) !== s(cand)) problems.push('en-word אינו המועמד');

/* ביט-אחר-ביט · הטקסט שלפני ואחרי בלוק ה-en-word חייב להיות זהה למקור. */
const preOK = text.slice(0, open) === outText.slice(0, open);
const postOK = text.slice(close + 1) === outText.slice(open + body.length);
if (!preOK) problems.push('הטקסט שלפני הבלוק אינו זהה');
if (!postOK) problems.push('הטקסט שאחרי הבלוק אינו זהה');

/* והמעבר דרך normalizeParams · אם הבודק לא בולע את זה, אין ארטיפקט. */
const CH = require('./lib/checker.js');
const P = CH.normalizeParams(B.params['en-word']);
if (!(P.marginSoft > P.marginHard)) problems.push('המשטר הצר אינו נדלק על המועמד');
if (P.bandsTight === P.bands) problems.push('bandsTight לא נטען');
if (P.WTight === P.W) problems.push('WTight לא נטען');

process.stdout.write(problems.length ? '⛔ ' + problems.join(' · ') + '\n' : `✅ נכתב ${DST}\n   he-word ו-gloss ביט-אחר-ביט · marginHard=${P.marginHard} marginSoft=${P.marginSoft} · WTight.sub=${P.WTight.sub}\n`);
process.exit(problems.length ? 1 : 0);
