'use strict';
/* ⭐ כריית סטי כיול · typo-lab/calib_mine.js
 *
 *   node typo-lab/calib_mine.js --near-neg   → out/near-neg-blind.tsv   (‏24 · עברית · שלילי קרוב)
 *   node typo-lab/calib_mine.js --en         → out/en-blind.tsv         (‏40 · אנגלית · שני כיוונים)
 *   node typo-lab/calib_mine.js --selftest   → שיניים
 *
 * ===== למה קובץ נפרד מ-teacher.js =====
 * ‏`teacher.js` הוא מנגנון השיפוט. הקובץ הזה **בונה את מה שנשפט**, והוא תלוי
 * בדברים שהמנגנון אינו תלוי בהם: המאגר החי דרך `lib/ctx.js`, וטקסונומיית
 * הטעויות. הפרדה אומרת שאפשר להחליף את הסטים בלי לגעת בשופט, ולהפך.
 *
 * ===== שני כללי ברזל של הקובץ הזה =====
 *
 * ‏1 ⛔ **הקובץ שיוצא הוא עיוור.** אין בו תווית, אין שם מחלקה, אין פסק. מי
 *   שמתייג רואה בדיוק מה שהשופט יראה. המחלקות נשמרות ב-`*.design.json` נפרד
 *   ש**אינו נשלח לאיש** — בדיוק כמו `_cat` בסט 24 המקרים.
 *
 * ‏2 ⛔ **שלילי קרוב אינו נרדפת.** הבור שקל ליפול אליו: שני כרטיסים עם פירוש
 *   **זהה** (`הדיר רגליו` / `הוקיר רגליו`) נראים כמו זוג קרוב מצוין — והם
 *   ההפך הגמור. מי שכתב את הפירוש של האחד **כן** ידע את השני. הסינון למטה
 *   פוסל אותם במפורש (`JACCARD_MAX`), וה-selftest מוודא שהוא עדיין פוסל.
 *
 * ===== חוקיות =====
 * הכול נגזר מ**המאגר של האפליקציה עצמה** (`data.js` / `data-en.js`) ומחישוב
 * מחרוזות. אין כאן לקסיקון חיצוני, אין ויקימילון, אין WordNet, אין רשימת
 * תדירות. השורות שנכתבו ביד נכתבו על ידי LLM — מותר במפורש (`METHODOLOGY.md`).
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');

const OUT = path.join(__dirname, 'out');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const say = s => process.stdout.write(s + '\n');
const has = f => argv.includes(f);

/* ===================== עזרים ===================== */

const STOP = new Set(['של', 'את', 'על', 'אל', 'עמ', 'עם', 'מנ', 'מן', 'או', 'אכ', 'אך', 'כי', 'לא',
  'זה', 'מה', 'כל', 'יותר', 'בו', 'בה', 'שהוא', 'היא', 'הוא', 'אינו', 'למשהו', 'משהו', 'מישהו',
  'בדרכ', 'מאוד', 'כדי', 'אחרי', 'לפני', 'ולא', 'גמ', 'גם', 'אבל', 'כמו', 'כזה', 'שבו', 'שבה']);

const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const ov = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i; };

/* שלד עיצורי · הסרת ניקוד ואם-קריאה. **מניפולציית מחרוזת בלבד** — אין כאן
   ניתוח מורפולוגי ואין לקסיקון. משמש רק לאיתור זוגות מאותה משפחה. */
const skel = s => String(s).replace(/[֑-ׇ]/g, '').replace(/[אוהי]/g, '').replace(/[^א-ת]/g, '');

const TSV_HDR = 'id\tמילה בכרטיס\tהפירוש המקורי\tמה כתוב במאגר\tמה הלומד כתב\tהאם הלומד ידע את המילה? כ / ל / ?';
const EN_HDR = 'id\tכיוון\tמילה בכרטיס\tהפירוש המקורי\tמה כתוב במאגר\tמה הלומד כתב\tהאם הלומד ידע את המילה? כ / ל / ?';

function writeSet(file, hdr, rows, cols, design) {
  const clean = s => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').trim();
  fs.writeFileSync(path.join(OUT, file + '.tsv'),
    [hdr].concat(rows.map(r => cols.map(c => clean(r[c])).join('\t') + '\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, file + '.design.json'), JSON.stringify(design, null, 1), 'utf8');
  /* ⛔ שער · אם תווית או שם מחלקה דלפו לקובץ העיוור, עצור. */
  const txt = fs.readFileSync(path.join(OUT, file + '.tsv'), 'utf8');
  for (const bad of design.rows.map(r => r.cls).filter((v, i, a) => a.indexOf(v) === i)) {
    if (txt.includes(bad)) throw new Error(`⛔ שם המחלקה «${bad}» דלף לקובץ העיוור ${file}.tsv`);
  }
  say(`נכתב · out/${file}.tsv · ${rows.length} שורות · עיוור (עמודת תווית ריקה)`);
  say(`נכתב · out/${file}.design.json · ⛔ **לא לשלוח לשופט ולא למתייג**`);
}

/* ===================== 1 · שליליים קרובים · עברית ===================== */

/* ⛔ הפרמטרים האלה **הם** ההגדרה של "קרוב". שינוי שלהם משנה את הסט.
 * ‏JACCARD_MAX פוסל נרדפות אמיתיות · JACCARD_MIN פוסל זרים גמורים. */
const JACCARD_MIN = 0.18;
const JACCARD_MAX = 0.62;

function nearNeg() {
  const c = getCtx('he');
  const B = c.BANK;
  const wl = s => c.norm(s).split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const setOf = new Map(); B.forEach((r, i) => setOf.set(i, new Set(wl(r.meaning))));
  const segsOf = new Map(); B.forEach((r, i) => segsOf.set(i, c.meaningSegs(r.meaning)));

  const idx = new Map();
  B.forEach((r, i) => { for (const w of setOf.get(i)) { if (!idx.has(w)) idx.set(w, []); idx.get(w).push(i); } });

  /* --- מאגר זוגות · שדה משותף, רפרנט שונה --- */
  const seen = new Set(); const cand = [];
  for (const [, list] of idx) {
    if (list.length > 14) continue;                      /* מילה גנרית · לא אות לקרבה */
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const [i, j] = [list[a], list[b]]; const k = i + ':' + j;
      if (seen.has(k)) continue; seen.add(k);
      const si = setOf.get(i), sj = setOf.get(j);
      if (si.size < 2 || sj.size < 2) continue;
      const o = ov(si, sj), J = jac(si, sj);
      if (o < 2) continue;
      /* ⛔ הפסילה החשובה · נרדפות אמיתיות אינן שליליים */
      if (J > JACCARD_MAX || J < JACCARD_MIN) continue;
      if (c.norm(B[i].meaning) === c.norm(B[j].meaning)) continue;
      if (skel(B[i].term) === skel(B[j].term)) continue; /* שמור לדלי D */
      cand.push({ i, j, o, J });
    }
  }
  cand.sort((x, y) => y.o - x.o || x.J - y.J || x.i - y.i || x.j - y.j);

  const rows = [], design = [], used = new Set();
  /* ⛔ הסינון ברמת ה**מקטע**, לא רק ברמת הפירוש המלא.
   * הבאג שזה תופס · `חושכ מצרימ` «אפלה כבדה» מול `מאפליה` «אפלה גדולה».
   * הז'קארד על הפירוש המלא היה 0.44 ועבר את השער — אבל **המקטעים שנשלחים
   * בפועל** נבדלים במילה אחת ונרדפים זה לזה. שורה כזאת אינה שלילי קרוב אלא
   * נרדפת, והיא מדללת בדיוק את מה שהסט אמור למדוד. */
  const SEG_JACCARD_MAX = 0.5;
  const push = (i, j, cls, why, typedSeg) => {
    if (used.has(i)) return false;
    const segs = segsOf.get(i);
    const written = segs[0];
    const typed = typedSeg !== undefined ? typedSeg : segsOf.get(j)[0];
    if (!typed || c.norm(typed) === c.norm(written)) return false;
    const sw = new Set(wl(written)), st = new Set(wl(typed));
    if (sw.size && st.size && jac(sw, st) >= SEG_JACCARD_MAX) return false;
    used.add(i);
    const id = 'NN' + String(rows.length + 1).padStart(2, '0');
    rows.push({ id, term: B[i].term, gloss: B[i].meaning, written, typed });
    design.push({ id, cls, why, cardA: B[i].id, cardB: j >= 0 ? B[j].id : null, termB: j >= 0 ? B[j].term : null });
    return true;
  };

  /* דלי A · נרדפת של מילה שכנה — חפיפה גבוהה, ז'קארד באמצע */
  for (const p of cand) { if (design.filter(d => d.cls.startsWith('A')).length >= 8) break; if (p.o >= 3) push(p.i, p.j, 'A·נרדפת-שכנה', `חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }

  /* דלי B · מילת-על — הפירוש של כרטיס אחר הוא **מילה בודדת** שמופיעה בתוך הפירוש
     של הכרטיס הזה. זה בדיוק המקרה האמיתי R18: `כובע` נכתב על `מצנפת`. */
  const shortCards = B.map((r, i) => ({ i, segs: segsOf.get(i) }))
    .filter(x => x.segs.length && wl(x.segs[0]).length === 1)
    .map(x => ({ i: x.i, w: c.norm(x.segs[0]) }));
  const byWord = new Map(); for (const s of shortCards) if (!byWord.has(s.w)) byWord.set(s.w, s.i);
  const bCand = [];
  B.forEach((r, i) => {
    for (const w of setOf.get(i)) {
      const j = byWord.get(w);
      if (j === undefined || j === i) continue;
      if (wl(r.meaning).length < 2) continue;
      bCand.push({ i, j, w });
    }
  });
  bCand.sort((x, y) => x.i - y.i);
  for (const p of bCand) { if (design.filter(d => d.cls.startsWith('B')).length >= 6) break; push(p.i, p.j, 'B·מילת-על', `«${p.w}» היא הפירוש המלא של כרטיס אחר`, B[p.j].meaning); }

  /* דלי C · אותו שדה, רפרנט אחר — חפיפה 2, ז'קארד נמוך */
  for (const p of cand) { if (design.filter(d => d.cls.startsWith('C')).length >= 6) break; if (p.J <= 0.34) push(p.i, p.j, 'C·שדה-משותף', `חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }

  /* דלי D · אותה משפחה שהמאגר מבחין ביניהן — שלד עיצורי זהה, פירוש שונה */
  const bySkel = new Map();
  B.forEach((r, i) => { const s = skel(r.term); if (s.length >= 3) { if (!bySkel.has(s)) bySkel.set(s, []); bySkel.get(s).push(i); } });
  const dCand = [];
  for (const [, list] of bySkel) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const [i, j] = [list[a], list[b]];
      if (c.norm(B[i].meaning) === c.norm(B[j].meaning)) continue;
      if (jac(setOf.get(i), setOf.get(j)) > JACCARD_MAX) continue;
      dCand.push({ i, j });
    }
  }
  dCand.sort((x, y) => x.i - y.i);
  for (const p of dCand) { if (design.filter(d => d.cls.startsWith('D')).length >= 4) break; push(p.i, p.j, 'D·אותה-משפחה', `שלד עיצורי זהה · ${B[p.i].term} / ${B[p.j].term}`); }

  /* השלמה ל-24 מדלי A אם דלי כלשהו לא התמלא */
  for (const p of cand) { if (rows.length >= 24) break; push(p.i, p.j, 'A·נרדפת-שכנה', `מילוי · חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }
  if (rows.length !== 24) throw new Error(`נכרו ${rows.length} שורות ולא 24 · הרחב את הפרמטרים`);

  writeSet('near-neg-blind', TSV_HDR, rows, ['id', 'term', 'gloss', 'written', 'typed'], {
    generated: 'typo-lab/calib_mine.js --near-neg',
    what: 'שליליים קרובים · התשובה קרובה סמנטית אך שייכת למילה אחרת',
    truth: 'לא ידועה · דורש תיוג אנושי. הציפייה היא ל, אבל שורה שהיא נרדפת אמיתית ראויה ל-כ או ?',
    params: { JACCARD_MIN, JACCARD_MAX, SEG_JACCARD_MAX },
    buckets: Object.fromEntries(['A', 'B', 'C', 'D'].map(k => [k, design.filter(d => d.cls.startsWith(k)).length])),
    rows: design,
  });
  say('');
  say('| דלי | מה זה | שורות |');
  say('|---|---|---|');
  for (const [k, n] of [['A', 'נרדפת של מילה שכנה'], ['B', 'מילת-על'], ['C', 'אותו שדה רפרנט אחר'], ['D', 'אותה משפחה שהמאגר מבחין']]
    .map(([k, n]) => [k + ' · ' + n, design.filter(d => d.cls.startsWith(k)).length])) say(`| ${k} | ${n} |`);
  say('');
  say('⚠ **אמת המידה כאן אינה ידועה מראש** — בניגוד לבקרה השלילית המבנית.');
  say('הכרייה מייצרת *מועמדים* לשלילי קרוב; רק תיוג אנושי קובע אם הם באמת שליליים.');
}

/* ===================== 2 · אנגלית · שני כיוונים ===================== */

/* הרכב הסט · מוצהר מראש ולא נגזר ממה שנוח.
 * כיוון `word` נדגם **פרופורציונלית למשקלי הטקסונומיה** (`lib/taxonomy-en.js`:
 * adj 2 · drop 2 · transpose 1 · double 1 · pattern 1 · סכום 7) — כי זו
 * האוכלוסייה ש-`en-word 69.09%` נמדד עליה, וסט כיול שאינו באותו הרכב מודד
 * משהו אחר. שתי מחלקות **נוספות בכוונה** מעליה, כי הן קיימות אצל לומדים
 * ואינן בטקסונומיה כלל: שלילי קרוב ומורפולוגיה. זה מוצהר, לא מוסתר. */
const EN_PLAN = {
  word: { typo: 12, nearneg: 6, morph: 6 },
  gloss: { syn: 5, partial: 4, nearneg: 4, morph: 3 },
};

/* מורפולוגיה אנגלית · חוקי כתיב בסיסיים, מחרוזות בלבד */
function inflect(w) {
  const out = [];
  if (/[^aeiou]y$/.test(w)) { out.push(w.slice(0, -1) + 'ies', w.slice(0, -1) + 'ied'); }
  else if (/(s|x|z|ch|sh)$/.test(w)) out.push(w + 'es');
  else out.push(w + 's');
  if (/e$/.test(w)) out.push(w.slice(0, -1) + 'ing', w + 'd');
  else out.push(w + 'ing', w + 'ed');
  return out.filter(x => x !== w);
}

/* ⛔ **שלילי קרוב אינו הטיה.** הבאג שזה תופס · חיפוש "מוטציה שנוחתת על מילת
 * מאגר אחרת" החזיר `dealt→deal`, `generated→generate`, `occasions→occasion`.
 * שלושתם נוחתים על מילת מאגר — ובכל זאת אינם שליליים בכלל: מי שכתב `generate`
 * על הכרטיס `generated` **ידע את המילה**. זו מחלקת המורפולוגיה, יש לה דלי משלה,
 * וערבוב שלה לתוך דלי השליליים היה מזהם את שתי המדידות בבת אחת. */
function isMorphPair(a, b) {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l === s + 's' || l === s + 'es' || l === s + 'ed' || l === s + 'd' || l === s + 'ing') return true;
  if (/e$/.test(s) && l === s.slice(0, -1) + 'ing') return true;
  if (/[^aeiou]y$/.test(s) && (l === s.slice(0, -1) + 'ies' || l === s.slice(0, -1) + 'ied')) return true;
  return false;
}

function enSet() {
  const e = getCtx('en');
  const B = e.BANK;
  const nk = w => (e.normEn ? e.normEn(w) : String(w).toLowerCase()).trim();
  const single = B.filter(r => /^[A-Za-z]+$/.test(r.term) && r.term.length >= 4);
  const keyMap = new Map(); for (const r of single) if (!keyMap.has(nk(r.term))) keyMap.set(nk(r.term), r);
  const keys = [...keyMap.keys()].filter(k => /^[a-z]{4,}$/.test(k));
  const inBank = new Set(keys);

  const rows = [], design = [];
  const add = (dir, r, typed, cls, why) => {
    const segs = e.meaningSegs(r.meaning);
    const id = 'E' + String(rows.length + 1).padStart(2, '0');
    rows.push({
      id, dir, term: r.term, gloss: r.meaning,
      written: dir === 'word' ? r.term : segs[0],
      typed,
    });
    design.push({ id, dir, cls, why, card: r.id });
  };

  /* דגימה דטרמיניסטית · פריסה אחידה על המאגר הממוין, בלי RNG */
  const spread = (arr, n, off = 0) => {
    const out = []; if (!arr.length) return out;
    for (let i = 0; i < n; i++) out.push(arr[Math.floor((i + 0.5) * arr.length / n + off) % arr.length]);
    return out;
  };

  /* ---- כיוון word · שגיאות כתיב פרופורציונליות ---- */
  const ROWS_Q = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['z', 'x', 'c', 'v', 'b', 'n', 'm']];
  const adjOf = ch => { for (const R of ROWS_Q) { const i = R.indexOf(ch); if (i >= 0) return [R[i - 1], R[i + 1]].filter(Boolean); } return []; };
  const opGen = {
    adj: w => { const o = []; for (let i = 0; i < w.length; i++) for (const c of adjOf(w[i])) o.push(w.slice(0, i) + c + w.slice(i + 1)); return o; },
    drop: w => { const o = []; for (let i = 0; i < w.length; i++) o.push(w.slice(0, i) + w.slice(i + 1)); return o; },
    transpose: w => { const o = []; for (let i = 0; i + 1 < w.length; i++) if (w[i] !== w[i + 1]) o.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)); return o; },
    double: w => { const o = []; for (let i = 0; i < w.length; i++) o.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1)); return o; },
    pattern: w => [w.replace(/ie/, 'ei'), w.replace(/ei/, 'ie'), w.replace(/c/, 's'), w.replace(/ph/, 'f'), w.replace(/^(.*)e$/, '$1')].filter(x => x && x !== w),
  };
  /* משקלי הטקסונומיה · adj 2 · drop 2 · transpose 1 · double 1 · pattern 1 */
  const WEIGHTS = [['adj', 4], ['drop', 3], ['transpose', 2], ['double', 2], ['pattern', 1]];
  const longKeys = keys.filter(k => k.length >= 6).sort();
  let ki = 0;
  for (const [opName, count] of WEIGHTS) {
    let made = 0;
    while (made < count && ki < longKeys.length * 3) {
      const k = longKeys[(ki * 37) % longKeys.length]; ki++;
      const outs = opGen[opName](k).filter(x => x !== k && !inBank.has(x));   /* **לא** מילת מאגר · זו שגיאה טהורה */
      if (!outs.length) continue;
      add('word', keyMap.get(k), outs[Math.floor(outs.length / 2)], 'word·typo·' + opName, `אופרטור ${opName} · לא נחת על מילת מאגר`);
      made++;
    }
  }

  /* ---- כיוון word · שליליים קרובים · המוטציה נוחתת על **מילת מאגר אחרת** ---- */
  const collide = [];
  for (const w of keys) {
    for (const opName of ['adj', 'drop', 'transpose']) {
      for (const v of opGen[opName](w)) {
        if (!inBank.has(v) || v === w) continue;
        if (isMorphPair(w, v)) continue;                 /* ⛔ הטיה אינה שלילי · ראה isMorphPair */
        collide.push({ w, v, opName });
      }
    }
  }
  collide.sort((a, b) => a.w.localeCompare(b.w) || a.v.localeCompare(b.v));
  for (const p of spread(collide.filter(p => p.w.length >= 5), EN_PLAN.word.nearneg, 3)) {
    add('word', keyMap.get(p.w), keyMap.get(p.v).term, 'word·nearneg', `${p.opName} · נחת על מילת המאגר «${p.v}» (${keyMap.get(p.v).meaning.slice(0, 30)})`);
  }

  /* ---- כיוון word · מורפולוגיה ----
     ⚠ מסובבים את סוג ההטיה (‏s / ing / ed) ולא לוקחים תמיד את הראשונה. שש שורות
     שכולן "+s" מודדות חוק אחד ומדווחות אותו כשש. */
  let mi = 0;
  for (const k of spread(longKeys.filter(k => !/(s|ed|ing)$/.test(k)), EN_PLAN.word.morph, 11)) {
    const all = inflect(k);
    const pool = all.filter(x => !inBank.has(x));
    const use = pool.length ? pool : all;
    const f = use[mi++ % use.length];
    add('word', keyMap.get(k), f, 'word·morph', `הטיה · ${k} → ${f}`);
  }

  /* ---- כיוון gloss · תשובה חלקית · מקטע אחד מתוך פירוש רב-מקטעי ---- */
  const multi = B.filter(r => e.meaningSegs(r.meaning).length >= 2).sort((a, b) => a.id.localeCompare(b.id));
  for (const r of spread(multi, EN_PLAN.gloss.partial, 5)) {
    const s = e.meaningSegs(r.meaning);
    add('gloss', r, s[s.length - 1], 'gloss·partial', `מקטע אחרון מתוך ${s.length}`);
  }

  /* ---- כיוון gloss · שלילי קרוב · הפירוש של מילה אנגלית שכנה ---- */
  for (const p of spread(collide.filter(p => p.w.length >= 5), EN_PLAN.gloss.nearneg, 29)) {
    const A = keyMap.get(p.w), C = keyMap.get(p.v);
    if (e.norm(A.meaning) === e.norm(C.meaning)) continue;
    add('gloss', A, e.meaningSegs(C.meaning)[0], 'gloss·nearneg', `הפירוש של «${p.v}» · שכנה במרחק 1`);
  }

  /* ---- כיוון gloss · נרדפות ומורפולוגיה עברית · **נכתבו ביד** ----
     ⚠ אלה 8 השורות היחידות בקובץ שאינן נגזרות מהמאגר. נרדפת עברית אינה קיימת
     במאגר ואי אפשר לכרות אותה, ולקסיקון עברי חיצוני אסור (‏AGPL · ראה
     `המשך-מכאן.md §1`). ‏LLM שכותב — מותר במפורש. הן כתובות כאן בקוד ולא
     בקובץ צדדי, כדי שהסט יישאר משוחזר בפקודה אחת. */
  const HAND = [
    { t: 'brave', ty: 'אמיץ לב', cls: 'gloss·syn', why: 'הרחבה כבולה של אמיץ' },
    { t: 'enormous', ty: 'ענק', cls: 'gloss·syn', why: 'נרדפת של עצום' },
    { t: 'silent', ty: 'חרישי', cls: 'gloss·syn', why: 'נרדפת של שקט/דומם' },
    { t: 'rapid', ty: 'זריז', cls: 'gloss·syn', why: 'נרדפת של מהיר' },
    { t: 'ancient', ty: 'עתיק יומינ', cls: 'gloss·syn', why: 'נרדפת של קדום/עתיק' },
    { t: 'decide', ty: 'החלטה', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
    { t: 'destroy', ty: 'הרס', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
    { t: 'arrive', ty: 'הגעה', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
  ];
  /* ⛔ שער · נרדפת שכבר נמצאת בתוך הפירוש **אינה בודקת כלום**.
   * הבאג שזה תופס · `enormous` פירושו "עצום" ונכתב `עצום` כנרדפת. אחרי הנרמול
   * שני הצדדים זהים, השורה מתקבלת טריוויאלית, ומחלקת "נרדפות" מדווחת הצלחה
   * שלא נבחנה. שלוש מתוך חמש שורות הנרדפות נפלו בזה. */
  for (const h of HAND) {
    const r = keyMap.get(nk(h.t));
    if (!r) throw new Error(`⛔ «${h.t}» אינה במאגר האנגלי · תקן את הטבלה`);
    if (h.cls === 'gloss·syn' && e.norm(r.meaning).split(/[\s,;]+/).includes(e.norm(h.ty))) {
      throw new Error(`⛔ «${h.ty}» כבר מופיעה בפירוש של «${h.t}» («${r.meaning}») · נרדפת שאינה בודקת כלום`);
    }
    add('gloss', r, h.ty, h.cls, h.why);
  }

  const byCls = {};
  for (const d of design) { const k = d.cls.split('·').slice(0, 2).join('·'); byCls[k] = (byCls[k] || 0) + 1; }
  writeSet('en-blind', EN_HDR, rows, ['id', 'dir', 'term', 'gloss', 'written', 'typed'], {
    generated: 'typo-lab/calib_mine.js --en',
    what: 'כיול אנגלית · שני כיוונים · אין לו קודם, המורה היה בלי כיול אנגלי בכלל',
    truth: 'לא ידועה · דורש תיוג אנושי',
    sampling: 'כיוון word · פרופורציונלי למשקלי lib/taxonomy-en.js (adj2 drop2 transpose1 double1 pattern1). שלילי קרוב ומורפולוגיה נוספו מעליה בכוונה ואינם בטקסונומיה.',
    hand_written: HAND.length,
    plan: EN_PLAN, byCls, rows: design,
  });
  say('');
  say('| מחלקה | שורות |');
  say('|---|---|');
  for (const k of Object.keys(byCls).sort()) say(`| ${k} | ${byCls[k]} |`);
  say('');
  say(`| כיוון word | ${design.filter(d => d.dir === 'word').length} |`);
  say(`| כיוון gloss | ${design.filter(d => d.dir === 'gloss').length} |`);
  say('');
  say(`⚠ ${HAND.length} שורות **נכתבו ביד** (נרדפת/מורפולוגיה עברית) · אי אפשר לכרות אותן`);
  say('  מהמאגר, ולקסיקון עברי חיצוני אסור משפטית. הן בקוד ולכן משוחזרות.');
  say('⚠ הפירוש במאגר האנגלי הוא **עברית** · כיוון gloss שופט טקסט עברי מול מילה אנגלית.');
}

/* ===================== שיניים ===================== */

function selftest() {
  let ok = true;
  const t = (c, m) => { say(`  ${c ? '✅' : '⛔'} ${m}`); if (!c) ok = false; };
  const c = getCtx('he');

  say('## א · הפסילה שמגדירה את הסט · נרדפות אינן שליליים');
  const A = new Set(c.norm('נמנע מלבקר, הגיע לעתים רחוקות').split(/\s+/));
  t(jac(A, A) === 1, 'פירוש זהה ⇒ ז\'קארד 1');
  t(jac(A, A) > JACCARD_MAX, `⛔ ז'קארד 1 חורג מ-${JACCARD_MAX} ⇒ **נפסל** · הדיר/הוקיר רגליו לא ייכנס`);
  const far = new Set(c.norm('מתקנ מסתובב להכנת כלי חרס').split(/\s+/));
  t(jac(A, far) < JACCARD_MIN, '⛔ שני פירושים זרים ⇒ נפסלים גם הם · הסט אינו "כל זוג"');

  say('## ב · הקובץ העיוור נשאר עיוור');
  for (const f of ['near-neg-blind', 'en-blind']) {
    const p = path.join(OUT, f + '.tsv');
    if (!fs.existsSync(p)) { say(`  · ${f}.tsv טרם נוצר · דילוג`); continue; }
    const txt = fs.readFileSync(p, 'utf8');
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f + '.design.json'), 'utf8'));
    const classes = [...new Set(d.rows.map(r => r.cls))];
    t(!classes.some(x => txt.includes(x)), `${f}.tsv · אין בו אף שם מחלקה (${classes.length} מחלקות נבדקו)`);
    const lines = txt.split(/\r?\n/).filter(Boolean).slice(1);
    const nCol = txt.split(/\r?\n/)[0].split('\t').length;
    t(lines.every(l => l.split('\t').length === nCol), `${f}.tsv · לכל שורה ${nCol} עמודות`);
    t(lines.every(l => l.split('\t')[nCol - 1].trim() === ''), `${f}.tsv · **עמודת התווית ריקה בכל השורות**`);
    t(lines.length === d.rows.length, `${f}.tsv · ${lines.length} שורות = ${d.rows.length} ברישום התכן`);
  }

  say('## ג · דטרמיניזם');
  t(skel('גַּנָּב') === skel('גְּנֵבָה').slice(0, skel('גַּנָּב').length) || skel('גַּנָּב') !== '', 'שלד עיצורי מחזיר מחרוזת');
  t(skel('אָבְנַיִים') === skel('אָבְנַיִים'), 'שלד יציב');

  say('');
  say(ok ? '✅ כל השיניים נשכו' : '⛔ שן שבורה · יציאה 1');
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    if (has('--near-neg')) nearNeg();
    else if (has('--en')) enSet();
    else if (has('--selftest')) { say('# שיניים · calib_mine.js'); say(''); selftest(); }
    else say('שימוש: --near-neg | --en | --selftest');
  } catch (e) { say('⛔ ' + e.message); process.exitCode = 1; }
}

module.exports = { nearNeg, enSet, skel, jac, JACCARD_MIN, JACCARD_MAX };
